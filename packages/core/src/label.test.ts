import { describe, expect, it } from "vitest";
import { displayStrength, guessFromLabel, nameFound, normaliseBarcode, normaliseOcr, parseStrengths } from "./label";

describe("normaliseOcr", () => {
  it("fixes O/l confusions in numbers and SA decimal commas", () => {
    expect(normaliseOcr("5OO mg")).toBe("500 mg");
    expect(normaliseOcr("l0 mg")).toBe("10 mg");
    expect(normaliseOcr("Warfarin l mg")).toBe("Warfarin 1 mg");
    expect(normaliseOcr("12,5 mg")).toBe("12.5 mg");
    expect(normaliseOcr("1,000 mg")).toBe("1000 mg");
  });
  it("leaves ordinary words alone", () => {
    expect(normaliseOcr("Loperamide Oral")).toBe("Loperamide Oral");
  });
});

describe("parseStrengths", () => {
  it.each([
    ["Metformin 500 mg", ["500mg"]],
    ["METFORMIN 500MG", ["500mg"]],
    ["Metformin 1 g", ["1000mg"]],
    ["Levothyroxine 100 micrograms", ["0.1mg"]],
    ["100 µg", ["0.1mg"]],
    ["Hydrochlorothiazide 12,5 mg", ["12.5mg"]],
    ["Paracetamol 120 mg/5 ml oral suspension, 100 ml", ["120mg/5ml"]],
    ["Insulin 100 units/ml", ["100iu/1ml"]],
    ["Losartan HCT 50/12.5 mg", ["50mg", "12.5mg"]],
    ["Losartan HCT 50 mg/12,5 mg", ["50mg", "12.5mg"]],
    ["60 film-coated tablets", []],
    ["Batch 23A41 Exp 03/2027", []],
  ])("%s", (text, expected) => {
    expect(parseStrengths(text).sort()).toEqual([...expected].sort());
  });
});

describe("nameFound", () => {
  it("matches names case-insensitively and tolerates a small OCR error in long names", () => {
    expect(nameFound("Metformin", "METFORMIN 500MG")).toBe(true);
    expect(nameFound("Metformin", "Metfornin 500 mg")).toBe(true);
    expect(nameFound("Paracetamol syrup", "Paracetamol 120 mg/5 ml")).toBe(true);
  });
  it("does not match a different medicine", () => {
    expect(nameFound("Metformin", "Amlodipine 5 mg")).toBe(false);
    expect(nameFound("Enalapril", "Lisinopril 10 mg")).toBe(false);
  });
});

describe("guessFromLabel", () => {
  it("pre-fills name and strength from the line that has both", () => {
    expect(guessFromLabel(["S3", "Amlodipine 5 mg", "30 tablets"])).toEqual({ name: "Amlodipine", strength: "5 mg" });
  });
  it("falls back to a name-only line and the first strength", () => {
    expect(guessFromLabel(["Simvastatin", "20 mg", "Film-coated tablets"])).toEqual({ name: "Simvastatin", strength: "20 mg" });
  });
  it("formats strengths for display", () => {
    expect(displayStrength("120mg/5ml")).toBe("120 mg/5 ml");
  });
});

describe("normaliseBarcode", () => {
  it("pads linear barcodes to GTIN-14", () => {
    expect(normaliseBarcode("6001234567890")).toBe("06001234567890");
    expect(normaliseBarcode("012345678905")).toBe("00012345678905");
  });
  it("keeps only the GTIN from a GS1 DataMatrix, ignoring the per-box serial and expiry", () => {
    const boxA = "]d2\x1d0106001234567897" + "21SERIALA1\x1d17270331" + "10LOT42";
    const boxB = "0106001234567897" + "21SERIALB9\x1d17280131" + "10LOT77";
    expect(normaliseBarcode(boxA)).toBe("06001234567897");
    expect(normaliseBarcode(boxB)).toBe("06001234567897");
    expect(normaliseBarcode("(01)06001234567897(21)XYZ")).toBe("06001234567897");
  });
  it("ignores codes that are not product numbers", () => {
    expect(normaliseBarcode("https://example.com")).toBeUndefined();
  });
});
