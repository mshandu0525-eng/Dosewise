/**
 * Database access over the Aurora Data API (HTTPS), used by the "lite" staging setup.
 * The functions then need no VPC, NAT gateway or VPC endpoints, which is what makes
 * staging nearly free. Implements the same small Db interface as a pg Pool, so the
 * domain code doesn't change.
 *
 * Differences from pg it smooths over:
 *  - placeholders: $1 → :p1, with a type hint per parameter (Dates go as TIMESTAMP strings)
 *  - results: JSON-formatted records; timestamp strings are turned back into Dates as pg does
 *  - a paused (scaled-to-zero) cluster answers DatabaseResumingException for a few seconds: retry
 *  - one statement per call: see splitSql for running schema files
 */
import { ExecuteStatementCommand, type RDSDataClient, type SqlParameter } from "@aws-sdk/client-rds-data";
import type { Db } from "../domain/deps";

export interface DataApiTarget {
  resourceArn: string;
  secretArn: string;
  database: string;
}

/** "2026-11-10T07:01:00.000Z" → "2026-11-10 07:01:00.000", the Data API's TIMESTAMP format (UTC). */
const toTimestamp = (d: Date) => d.toISOString().replace("T", " ").replace("Z", "");

export function toParameters(params: unknown[] = []): SqlParameter[] {
  return params.map((v, i): SqlParameter => {
    const name = `p${i + 1}`;
    if (v === null || v === undefined) return { name, value: { isNull: true } };
    if (v instanceof Date) return { name, value: { stringValue: toTimestamp(v) }, typeHint: "TIMESTAMP" };
    if (typeof v === "boolean") return { name, value: { booleanValue: v } };
    if (typeof v === "number") return Number.isInteger(v) ? { name, value: { longValue: v } } : { name, value: { doubleValue: v } };
    if (typeof v === "string") return { name, value: { stringValue: v } };
    throw new Error(`Unsupported parameter type at $${i + 1}: ${typeof v}`);
  });
}

/** $1, $2 … → :p1, :p2 … (leaves $$ quoting and text inside single quotes alone). */
export function toNamedPlaceholders(sql: string): string {
  return sql.replace(/('(?:[^']|'')*')|\$(\d+)/g, (m, quoted: string | undefined, n: string | undefined) => (quoted ? m : `:p${n}`));
}

const TIMESTAMP_TEXT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;

/** Timestamp columns come back as UTC text; pg returns Dates, so convert to keep both paths identical. */
export function reviveRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === "string" && TIMESTAMP_TEXT.test(v) ? new Date(`${v.replace(" ", "T")}Z`) : v;
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DataApiDb implements Db {
  constructor(
    private client: RDSDataClient,
    private target: DataApiTarget,
    private resumeWaitMs = 40_000,
  ) {}

  async query<R = any>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }> {
    const command = new ExecuteStatementCommand({
      ...this.target,
      sql: toNamedPlaceholders(sql),
      parameters: toParameters(params),
      formatRecordsAs: "JSON",
    });
    const deadline = Date.now() + this.resumeWaitMs;
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await this.client.send(command);
        const rows = r.formattedRecords ? (JSON.parse(r.formattedRecords) as Record<string, unknown>[]).map(reviveRow) : [];
        return { rows: rows as R[], rowCount: r.formattedRecords ? rows.length : (r.numberOfRecordsUpdated ?? 0) };
      } catch (e) {
        // A paused cluster takes a few seconds to wake; anything else is a real error.
        if ((e as Error).name !== "DatabaseResumingException" || Date.now() > deadline) throw e;
        await sleep(Math.min(1000 * 2 ** attempt, 8000));
      }
    }
  }
}

/**
 * Splits a SQL file into single statements for the Data API, which runs one per call.
 * Semicolons inside quotes, $$-quoted function bodies and -- comments don't split.
 */
export function splitSql(source: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === "-" && source[i + 1] === "-") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end + 1;
      cur += "\n";
      continue;
    }
    if (ch === "'") {
      const end = source.indexOf("'", i + 1);
      cur += source.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    const tag = ch === "$" ? /^\$[A-Za-z_]*\$/.exec(source.slice(i))?.[0] : undefined;
    if (tag) {
      const end = source.indexOf(tag, i + tag.length);
      cur += source.slice(i, end + tag.length);
      i = end + tag.length;
      continue;
    }
    if (ch === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
