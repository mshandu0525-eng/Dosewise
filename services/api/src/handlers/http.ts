/**
 * The app's API (API Gateway HTTP API, Cognito JWT authoriser). The patient id
 * always comes from the verified token, never from the request body.
 */
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { getProfile, inviteCaregiver, listCaregivers, putProfile, revokeCaregiver } from "../domain/caregivers";
import { HttpError, type Deps } from "../domain/deps";
import { syncSlots } from "../domain/doses";
import { deleteAccount, exportData } from "../domain/privacy";
import { listOutbox, runSweepNow, simulateReply } from "../domain/testMode";
import { getDeps } from "./runtime";

const json = (status: number, body?: unknown): APIGatewayProxyResultV2 => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: body === undefined ? "" : JSON.stringify(body),
});

function parseBody(event: APIGatewayProxyEventV2WithJWTAuthorizer): Record<string, unknown> {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  if (raw.length > 100_000) throw new HttpError(413, "Too large.");
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
  } catch {
    // fall through
  }
  throw new HttpError(400, "Invalid JSON.");
}

export async function route(deps: Deps, event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const patientId = event.requestContext.authorizer?.jwt?.claims?.sub;
  if (typeof patientId !== "string" || !patientId) return json(401, { error: "Not signed in." });
  // The phone number Cognito verified at sign-in, used only for the caregiver CALL reply.
  const verifiedPhone = event.requestContext.authorizer.jwt.claims.phone_number;
  try {
    switch (event.routeKey) {
      case "GET /v1/me":
        return json(200, (await getProfile(deps, patientId)) ?? {});
      case "PUT /v1/me": {
        const b = parseBody(event);
        const phone = b.sharePhoneWithFamily === true && typeof verifiedPhone === "string" ? verifiedPhone : undefined;
        return json(200, await putProfile(deps, patientId, { ...b, phone }));
      }
      case "GET /v1/caregivers":
        return json(200, { caregivers: await listCaregivers(deps, patientId), noticeVersion: deps.config.noticeVersion });
      case "POST /v1/caregivers":
        return json(201, await inviteCaregiver(deps, patientId, parseBody(event)));
      case "DELETE /v1/caregivers/{id}":
        await revokeCaregiver(deps, patientId, event.pathParameters?.id ?? "");
        return json(204);
      case "PUT /v1/slots":
        return json(200, await syncSlots(deps, patientId, parseBody(event)));
      case "GET /v1/me/export":
        return json(200, await exportData(deps, patientId));
      case "DELETE /v1/me":
        await deleteAccount(deps, patientId);
        return json(204);
      // Test messaging mode only (staging); each returns 404 otherwise.
      case "GET /v1/test/outbox":
        return json(200, await listOutbox(deps, patientId));
      case "POST /v1/test/reply":
        return json(200, await simulateReply(deps, patientId, parseBody(event)));
      case "POST /v1/test/sweep":
        return json(200, await runSweepNow(deps));
      default:
        return json(404, { error: "Not found." });
    }
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error("Request failed", { route: event.routeKey, error: (e as Error).name }); // no request data in logs
    return json(500, { error: "Something went wrong." });
  }
}

export const handler = async (event: APIGatewayProxyEventV2WithJWTAuthorizer) => route(await getDeps(), event);
