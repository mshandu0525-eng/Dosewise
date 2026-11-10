import { readFileSync } from "node:fs";
import type { RDSDataClient } from "@aws-sdk/client-rds-data";
import { describe, expect, it } from "vitest";
import { DataApiDb, reviveRow, splitSql, toNamedPlaceholders, toParameters } from "../src/lib/dataApiDb";

const target = { resourceArn: "arn:cluster", secretArn: "arn:secret", database: "dosewise" };

function fakeClient(responses: (object | Error)[]) {
  const sent: any[] = [];
  const client = {
    send: async (cmd: { input: unknown }) => {
      sent.push(cmd.input);
      const r = responses.shift();
      if (r instanceof Error) throw r;
      return r ?? {};
    },
  } as unknown as RDSDataClient;
  return { client, sent };
}

describe("Data API adapter", () => {
  it("rewrites $n placeholders, leaving quoted text and $$ bodies alone", () => {
    expect(toNamedPlaceholders("SELECT * FROM t WHERE a = $1 AND b > $10 AND c = 'cost $5'")).toBe(
      "SELECT * FROM t WHERE a = :p1 AND b > :p10 AND c = 'cost $5'",
    );
    expect(toNamedPlaceholders("CREATE FUNCTION f() AS $$ BEGIN END; $$")).toBe("CREATE FUNCTION f() AS $$ BEGIN END; $$");
  });

  it("types each parameter, sending Dates as UTC TIMESTAMP text", () => {
    expect(toParameters(["x", 3, 1.5, true, null, new Date("2026-11-10T07:01:00.250Z")])).toEqual([
      { name: "p1", value: { stringValue: "x" } },
      { name: "p2", value: { longValue: 3 } },
      { name: "p3", value: { doubleValue: 1.5 } },
      { name: "p4", value: { booleanValue: true } },
      { name: "p5", value: { isNull: true } },
      { name: "p6", value: { stringValue: "2026-11-10 07:01:00.250" }, typeHint: "TIMESTAMP" },
    ]);
  });

  it("turns timestamp text back into Dates, like pg, and leaves other values alone", () => {
    const r = reviveRow({ at: "2026-11-10 07:01:00.25", key: "2026-11-10T08:00", n: 2 });
    expect((r.at as Date).toISOString()).toBe("2026-11-10T07:01:00.250Z");
    expect(r.key).toBe("2026-11-10T08:00"); // slot keys must stay strings
    expect(r.n).toBe(2);
  });

  it("returns rows for SELECT and a row count for writes", async () => {
    const { client, sent } = fakeClient([{ formattedRecords: '[{"id":"a"},{"id":"b"}]' }, { numberOfRecordsUpdated: 1 }]);
    const db = new DataApiDb(client, target);
    expect(await db.query("SELECT id FROM t WHERE x = $1", ["y"])).toEqual({ rows: [{ id: "a" }, { id: "b" }], rowCount: 2 });
    expect(await db.query("UPDATE t SET y = $1", [1])).toEqual({ rows: [], rowCount: 1 });
    expect(sent[0]).toMatchObject({ ...target, sql: "SELECT id FROM t WHERE x = :p1", formatRecordsAs: "JSON" });
  });

  it("waits while a paused cluster resumes, but not on other errors", async () => {
    const resuming = Object.assign(new Error("resuming"), { name: "DatabaseResumingException" });
    const { client } = fakeClient([resuming, { numberOfRecordsUpdated: 1 }]);
    expect((await new DataApiDb(client, target, 5_000).query("UPDATE t SET a = 1")).rowCount).toBe(1);
    const bad = Object.assign(new Error("syntax"), { name: "BadRequestException" });
    await expect(new DataApiDb(fakeClient([bad]).client, target).query("SELEC 1")).rejects.toThrow("syntax");
  });
});

describe("splitSql", () => {
  it("splits on semicolons but not inside quotes, comments or $$ bodies", () => {
    expect(splitSql("-- note; here\nCREATE TABLE a (x TEXT DEFAULT ';');\nSELECT 1;")).toEqual(["CREATE TABLE a (x TEXT DEFAULT ';')", "SELECT 1"]);
  });

  it("splits the real schema and guard files into whole statements", () => {
    const schema = splitSql(readFileSync(new URL("../src/db/schema.sql", import.meta.url), "utf8"));
    expect(schema.every((s) => /^CREATE (TABLE|INDEX)/.test(s))).toBe(true);
    expect(schema.filter((s) => s.startsWith("CREATE TABLE"))).toHaveLength(6);
    const guards = splitSql(readFileSync(new URL("../src/db/guards.sql", import.meta.url), "utf8"));
    expect(guards).toHaveLength(3);
    expect(guards[0]).toMatch(/^CREATE OR REPLACE FUNCTION[\s\S]*RAISE EXCEPTION[\s\S]*\$\$ LANGUAGE plpgsql$/);
  });
});
