/**
 * Accuracy harness for the phase 2 gate (PRD R3):
 *  - correct strength recognised in at least 95% of photos of the right medicine
 *  - wrong strength flagged in at least 99% of photos of a different strength
 *
 * Feed it labelled cases: the OCR lines the phone produced for each test photo
 * (exported from the app's debug log), the prescription, and the expected outcome.
 * Run with: npm run eval --workspace @dosewise/core -- cases.json
 */
import type { CheckResult, Observation, Reference } from "./verify";
import { verify } from "./verify";

export interface EvalCase {
  id: string;
  med: { name: string; dosage: string };
  reference?: Reference;
  seen: Observation;
  /** "match" for photos of the right medicine and strength, "different-strength" for the wrong strength. */
  expected: Extract<CheckResult, "match" | "different-strength">;
}

export interface EvalReport {
  total: number;
  rightRecognised: number;
  rightTotal: number;
  wrongFlagged: number;
  wrongTotal: number;
  /** Right medicine wrongly flagged as a different strength: alarms people for no reason. */
  falseAlarms: number;
  recognitionRate: number | null;
  flagRate: number | null;
  passes: boolean;
  failures: { id: string; expected: string; got: string; reason: string }[];
}

export const GATE = { recognition: 0.95, flag: 0.99 };

/** Any red warning counts as flagged: the person is told not to take it before checking. */
const isWarning = (r: CheckResult) => r === "different-strength" || r === "different-medicine" || r === "different-pill";

export function evaluate(cases: EvalCase[]): EvalReport {
  const r: EvalReport = {
    total: cases.length, rightRecognised: 0, rightTotal: 0, wrongFlagged: 0, wrongTotal: 0, falseAlarms: 0,
    recognitionRate: null, flagRate: null, passes: false, failures: [],
  };
  for (const c of cases) {
    const v = verify(c.med, c.reference, c.seen);
    if (c.expected === "match") {
      r.rightTotal++;
      if (v.result === "match") r.rightRecognised++;
      if (isWarning(v.result)) r.falseAlarms++;
    } else {
      r.wrongTotal++;
      if (isWarning(v.result)) r.wrongFlagged++;
    }
    if (c.expected === "match" ? v.result !== "match" : !isWarning(v.result)) r.failures.push({ id: c.id, expected: c.expected, got: v.result, reason: v.reason });
  }
  r.recognitionRate = r.rightTotal ? r.rightRecognised / r.rightTotal : null;
  r.flagRate = r.wrongTotal ? r.wrongFlagged / r.wrongTotal : null;
  r.passes = (r.recognitionRate ?? 0) >= GATE.recognition && (r.flagRate ?? 0) >= GATE.flag;
  return r;
}
