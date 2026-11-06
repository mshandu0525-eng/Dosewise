/**
 * WhatsApp Cloud API webhook (public URL). Every POST must carry Meta's signature
 * over the raw body; anything unsigned is rejected before it is parsed.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { handleReply, handleStatus } from "../domain/caregivers";
import type { Deps } from "../domain/deps";
import { parseWebhook, verifyMetaSignature } from "../whatsapp/messenger";
import { getDeps, secret } from "./runtime";

export interface WebhookSecrets {
  appSecret: string;
  verifyToken: string;
}

export async function processWebhook(deps: Deps, s: WebhookSecrets, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === "GET") {
    const q = event.queryStringParameters ?? {};
    const ok = q["hub.mode"] === "subscribe" && q["hub.verify_token"] === s.verifyToken;
    return ok ? { statusCode: 200, body: q["hub.challenge"] ?? "" } : { statusCode: 403, body: "" };
  }
  const raw = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString("utf8") : (event.body ?? "");
  const signature = event.headers["x-hub-signature-256"];
  if (!verifyMetaSignature(raw, signature, s.appSecret)) return { statusCode: 401, body: "" };

  const { replies, statuses } = parseWebhook(JSON.parse(raw));
  for (const r of replies) await handleReply(deps, r, "whatsapp");
  for (const st of statuses) await handleStatus(deps, st);
  return { statusCode: 200, body: "" };
}

export const handler = async (event: APIGatewayProxyEventV2) => {
  const s = await secret(process.env.WHATSAPP_SECRET_ARN!);
  return processWebhook(await getDeps(), { appSecret: s.appSecret ?? "", verifyToken: s.verifyToken ?? "" }, event);
};
