import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluate, type EvalCase } from "./evaluate";
import type { PillFingerprint } from "./fingerprint";
import { verify } from "./verify";

const metformin = { name: "Metformin", dosage: "500 mg" };
const pill = (lab: [number, number, number], elongation = 1): PillFingerprint => ({ v: 1, lab, hue: [], neutral: 1, elongation, coverage: 0.2 });

describe("verify", () => {
  it("matches name and strength on the label", () => {
    expect(verify(metformin, undefined, { text: ["Metformin 500 mg"] })).toMatchObject({ result: "match", method: "label" });
  });

  it("flags a different strength, even when the barcode is new", () => {
    const v = verify(metformin, { barcode: "111" }, { barcode: "222", text: ["Metformin 850 mg"] });
    expect(v.result).toBe("different-strength");
    expect(v.reason).toContain("850 mg");
  });

  it("trusts a matching barcode over a misread strength", () => {
    expect(verify(metformin, { barcode: "111" }, { barcode: "111", text: ["Metformin 5O0 rng"] })).toMatchObject({
      result: "match",
      method: "barcode",
    });
  });

  it("reports a different medicine when neither name nor strength fit", () => {
    expect(verify(metformin, undefined, { text: ["Amlodipine 5 mg"] }).result).toBe("different-medicine");
  });

  it("uses the reference strength when the dose is entered as '1 tablet'", () => {
    const pred = { name: "Prednisone", dosage: "1 tablet" };
    expect(verify(pred, { strengths: ["5mg"] }, { text: ["Prednisone 5 mg"] }).result).toBe("match");
    expect(verify(pred, { strengths: ["5mg"] }, { text: ["Prednisone 20 mg"] }).result).toBe("different-strength");
  });

  it("falls back to the pill's look", () => {
    const ref = { pill: pill([95, 0, 2]) };
    expect(verify(metformin, ref, { pill: pill([93, 1, 3]) })).toMatchObject({ result: "match", method: "pill" });
    expect(verify(metformin, ref, { pill: pill([70, 10, 60], 2.6) }).result).toBe("different-pill");
    expect(verify(metformin, ref, { pill: null }).result).toBe("unsure");
  });

  it("is unsure, never a match, when nothing could be read", () => {
    expect(verify(metformin, undefined, { text: [] }).result).toBe("unsure");
    expect(verify(metformin, undefined, { text: ["Metformin"] }).result).toBe("unsure");
  });
});

describe("accuracy gate harness", () => {
  it("passes the R3 thresholds on the label fixture set", () => {
    const cases = JSON.parse(readFileSync(new URL("../fixtures/label-cases.json", import.meta.url), "utf8")) as EvalCase[];
    const r = evaluate(cases);
    expect(r.failures).toEqual([]);
    expect(r.falseAlarms).toBe(0);
    expect(r.passes).toBe(true);
  });
});
