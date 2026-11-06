import { createHmac } from "node:crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { describe, expect, it } from "vitest";
import { route } from "../src/handlers/http";
import { processWebhook } from "../src/handlers/webhook";
import { LocalFieldCipher } from "../src/lib/cipher";
import { metaSubmission, parseReply, render, renderSms, TEMPLATES } from "@dosewise/core";
import { CAREGIVER_E164, PATIENT, makeDeps } from "./helpers";

const SECRETS = { appSecret: "app-secret", verifyToken: "verify-me" };

function api(routeKey: string, body?: unknown, sub: string | null = PATIENT, pathParameters?: Record<string, string>) {
  return {
    routeKey,
    body: body === undefined ? undefined : JSON.stringify(body),
    isBase64Encoded: false,
    pathParameters,
    requestContext: { authorizer: { jwt: { claims: sub ? { sub, phone_number: "+27720001111" } : {}, scopes: [] } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

function hook(method: "GET" | "POST", body = "", headers: Record<string, string> = {}, query?: Record<string, string>) {
  return { requestContext: { http: { method } }, body, headers, isBase64Encoded: false, queryStringParameters: query } as unknown as APIGatewayProxyEventV2;
}
const sign = (raw: string) => `sha256=${createHmac("sha256", SECRETS.appSecret).update(raw).digest("hex")}`;

describe("HTTP API", () => {
  it("requires a signed-in patient", async () => {
    const { deps } = makeDeps();
    expect(await route(deps, api("GET /v1/me", undefined, null))).toMatchObject({ statusCode: 401 });
  });

  it("runs the invite flow end to end and never trusts ids from the body", async () => {
    const t = makeDeps();
    await route(t.deps, api("PUT /v1/me", { displayName: "Thandi", tz: "Africa/Johannesburg", sharePhoneWithFamily: true }));
    const list = JSON.parse(((await route(t.deps, api("GET /v1/caregivers"))) as { body: string }).body);
    const res = (await route(
      t.deps,
      api("POST /v1/caregivers", { name: "Sipho", phone: "0825550101", agreed: true, noticeVersion: list.noticeVersion, patientId: "someone-else" }),
    )) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(201);
    const rows = (await t.deps.db.query("SELECT patient_id FROM caregivers")).rows;
    expect(rows).toEqual([{ patient_id: PATIENT }]);
  });

  it("returns clear 4xx errors and hides internal ones", async () => {
    const t = makeDeps();
    const bad = (await route(t.deps, { ...api("PUT /v1/slots"), body: "{not json" } as APIGatewayProxyEventV2WithJWTAuthorizer)) as { statusCode: number };
    expect(bad.statusCode).toBe(400);
    t.deps.db = { query: async () => Promise.reject(new Error("connection refused to 10.0.0.5")) };
    const res = (await route(t.deps, api("GET /v1/me"))) as { statusCode: number; body: string };
    expect(res).toMatchObject({ statusCode: 500 });
    expect(res.body).not.toContain("10.0.0.5");
  });
});

describe("WhatsApp webhook", () => {
  it("answers Meta's verification challenge only with the right token", async () => {
    const { deps } = makeDeps();
    const ok = await processWebhook(deps, SECRETS, hook("GET", "", {}, { "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "42" }));
    expect(ok).toMatchObject({ statusCode: 200, body: "42" });
    const no = await processWebhook(deps, SECRETS, hook("GET", "", {}, { "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "42" }));
    expect(no).toMatchObject({ statusCode: 403 });
  });

  it("rejects unsigned or tampered posts before reading them", async () => {
    const { deps } = makeDeps();
    expect(await processWebhook(deps, SECRETS, hook("POST", "{}"))).toMatchObject({ statusCode: 401 });
    expect(await processWebhook(deps, SECRETS, hook("POST", '{"entry":[]}', { "x-hub-signature-256": sign("{}") }))).toMatchObject({ statusCode: 401 });
  });

  it("applies a signed button reply", async () => {
    const t = makeDeps();
    await route(t.deps, api("PUT /v1/me", { displayName: "Thandi" }));
    const created = (await route(
      t.deps,
      api("POST /v1/caregivers", { name: "Sipho", phone: "0825550101", agreed: true, noticeVersion: t.deps.config.noticeVersion }),
    )) as { body: string };
    const id = JSON.parse(created.body).id;
    const raw = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ from: "27825550101", type: "button", button: { payload: `ALERTS:${id}`, text: "Alerts" } }], statuses: [{ id: "wamid.1", status: "delivered" }] } }] }],
    });
    expect(await processWebhook(t.deps, SECRETS, hook("POST", raw, { "x-hub-signature-256": sign(raw) }))).toMatchObject({ statusCode: 200 });
    const cg = (await t.deps.db.query("SELECT status, wants_alerts FROM caregivers")).rows[0];
    expect(cg).toEqual({ status: "active", wants_alerts: true });
    expect(t.sent.at(-1)).toMatchObject({ to: CAREGIVER_E164 });
    expect((await t.deps.db.query("SELECT status FROM messages WHERE id = 'wamid.1'")).rows[0].status).toBe("delivered");
  });
});

describe("templates", () => {
  it("follow Meta's rules: no variable at the start or end, sequential placeholders, examples for each", () => {
    for (const t of Object.values(TEMPLATES)) {
      expect(t.body.trim()).not.toMatch(/^\{\{|\}\}$/);
      const vars = [...new Set([...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort();
      expect(vars).toEqual(vars.map((_, i) => i + 1));
      expect(t.example).toHaveLength(vars.length);
      expect(t.body.length).toBeLessThan(1024);
    }
    expect(metaSubmission()).toHaveLength(Object.keys(TEMPLATES).length);
  });

  it("never put medicine names in the default alert", () => {
    expect(render("dosewise_dose_not_confirmed", ["Thandi", "08:00"])).toBe(
      "DoseWise: Thandi has not yet confirmed their 08:00 medication. Reply STOP to stop these updates.",
    );
    expect(renderSms("dosewise_caregiver_invite", ["Thandi"])).toContain("Reply ALERTS, SUMMARY or BOTH");
  });

  it("parses buttons and common free-text replies", () => {
    expect(parseReply({ payload: "BOTH:abc" })).toEqual({ action: "BOTH", caregiverId: "abc" });
    expect(parseReply({ text: " stop please " })).toEqual({ action: "STOP" });
    expect(parseReply({ text: "Yes!" })).toEqual({ action: "BOTH" });
    expect(parseReply({ text: "who is this" })).toEqual({ action: "HELP" });
    expect(parseReply({ payload: "DROP:abc" })).toEqual({ action: "HELP" });
  });
});

describe("field cipher", () => {
  it("round-trips, uses a fresh IV each time, and indexes deterministically", async () => {
    const c = new LocalFieldCipher("k");
    const a = await c.encrypt("+27825550101");
    const b = await c.encrypt("+27825550101");
    expect(a).not.toBe(b);
    expect(await c.decrypt(a)).toBe("+27825550101");
    expect(await c.index("+27825550101")).toBe(await c.index("+27825550101"));
    expect(await c.index("+27825550101")).not.toBe(await new LocalFieldCipher("other").index("+27825550101"));
  });

  it("detects tampering", async () => {
    const c = new LocalFieldCipher("k");
    const parts = (await c.encrypt("secret")).split(".");
    parts[3] = Buffer.from("SECRET").toString("base64");
    await expect(c.decrypt(parts.join("."))).rejects.toThrow();
  });
});
