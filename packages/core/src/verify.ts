/**
 * Photo verification decision (PRD R3/R4): combine what the camera saw with
 * the prescription and the reference captured at setup.
 *
 * Order of evidence: a wrong strength on the label always wins (safety);
 * then a matching barcode; then name + strength on the label; then the pill's look.
 * The result never blocks logging: "unsure" and warnings still let the person
 * log the dose, marked unverified.
 */
import { comparePills, type PillFingerprint } from "./fingerprint";
import { displayStrength, nameFound, parseStrengths, type Strength } from "./label";

export interface Reference {
  barcode?: string;
  /** Strengths read from the box at setup. */
  strengths?: Strength[];
  pill?: PillFingerprint;
}

export interface Observation {
  barcode?: string;
  /** OCR lines from the photo. */
  text?: string[];
  pill?: PillFingerprint | null;
}

export type CheckResult = "match" | "different-strength" | "different-medicine" | "different-pill" | "unsure";

export interface Verification {
  result: CheckResult;
  /** How a match was established. */
  method?: "barcode" | "label" | "pill";
  /** Plain-language explanation for the person. */
  reason: string;
  /** Strengths seen on the label, for display. */
  seen?: string[];
}

/** The strengths the person should be taking: from the prescribed dose, else from the box scanned at setup. */
export function expectedStrengths(dosage: string, reference?: Reference): Strength[] {
  const fromDose = parseStrengths(dosage);
  return fromDose.length ? fromDose : (reference?.strengths ?? []);
}

export function verify(med: { name: string; dosage: string }, reference: Reference | undefined, seen: Observation): Verification {
  const text = (seen.text ?? []).join("\n");
  const want = expectedStrengths(med.dosage, reference);
  const got = text ? parseStrengths(text) : [];
  const hasName = text ? nameFound(med.name, text) : false;
  const shown = got.map(displayStrength);

  // 1. Safety first: a strength on the label that differs from the prescription.
  if (want.length && got.length && !want.every((s) => got.includes(s))) {
    // Only count it if the label doesn't also show the right strength (packs can list several).
    // A matching barcode means the same box as at setup, so a differing number is an OCR misread.
    const wrong = got.filter((s) => !want.includes(s));
    const sameBox = !!seen.barcode && seen.barcode === reference?.barcode;
    if (wrong.length && !sameBox && !hasName) {
      return { result: "different-medicine", reason: `This label doesn't look like ${med.name}. Check you have the right box.`, seen: shown };
    }
    if (wrong.length && !sameBox) {
      return {
        result: "different-strength",
        reason: `This box says ${shown.join(", ")}, but your medicine is ${want.map(displayStrength).join(", ")}. Check with your pharmacist before taking it.`,
        seen: shown,
      };
    }
  }

  // 2. Same barcode as the box scanned at setup.
  if (seen.barcode && reference?.barcode && seen.barcode === reference.barcode) {
    return { result: "match", method: "barcode", reason: "The barcode matches your medicine box.", seen: shown };
  }

  // 3. Name and strength on the label.
  if (hasName && want.length && want.every((s) => got.includes(s))) {
    return { result: "match", method: "label", reason: `The label shows ${med.name} ${want.map(displayStrength).join(", ")}.`, seen: shown };
  }
  if (text && !hasName && got.length && want.length && want.every((s) => got.includes(s)) && seen.barcode && reference?.barcode) {
    // Right strength, different barcode, name unreadable: likely another brand of the same medicine.
    return { result: "unsure", reason: "The strength matches, but this is a different box from the one you set up. Check the name on the box.", seen: shown };
  }
  if (text && got.length && !hasName && want.length && !got.some((s) => want.includes(s))) {
    return { result: "different-medicine", reason: `This label doesn't look like ${med.name}. Check you have the right box.`, seen: shown };
  }

  // 4. The pill itself.
  if (seen.pill && reference?.pill) {
    const { result } = comparePills(reference.pill, seen.pill);
    if (result === "same") return { result: "match", method: "pill", reason: "This looks like your usual pill." };
    if (result === "different")
      return { result: "different-pill", reason: "This doesn't look like your usual pill. Check the box before taking it." };
  }
  if (seen.pill === null) return { result: "unsure", reason: "Couldn't see a pill clearly. Put one pill on a plain surface and try again." };

  if (hasName && !want.length) return { result: "unsure", reason: `The label shows ${med.name}, but no strength was found to compare.`, seen: shown };
  if (hasName) return { result: "unsure", reason: "Found the name but couldn't read the strength. Try again in better light.", seen: shown };
  return { result: "unsure", reason: "Couldn't read the label. Try again in better light, holding the box flat." };
}
