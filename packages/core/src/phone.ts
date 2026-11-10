/**
 * Phone numbers in E.164 (+27821234567). Used by the app when a patient adds a
 * caregiver and by the API when matching a WhatsApp/SMS reply to that caregiver,
 * so both sides must agree exactly.
 */
const COUNTRY_CODE: Record<string, string> = { ZA: "27", NA: "264", BW: "267", ZW: "263", LS: "266", SZ: "268", MZ: "258", GB: "44", US: "1" };

export function normalisePhone(input: string, defaultCountry = "ZA"): string | undefined {
  let s = input.trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (!s.startsWith("+")) {
    const cc = COUNTRY_CODE[defaultCountry];
    if (!cc) return undefined;
    // national format: leading trunk 0 is dropped ("082…" → "+2782…")
    s = s.startsWith(cc) && s.length > 10 ? `+${s}` : `+${cc}${s.replace(/^0/, "")}`;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return undefined;
  if (s.startsWith("+27") && s.length !== 12) return undefined; // SA numbers: +27 and 9 digits
  return s;
}

/** "+27821234567" → "+27 82 *** 4567": enough to recognise, not enough to copy. */
export function maskPhone(e164: string): string {
  return `${e164.slice(0, 3)} ${e164.slice(3, 5)} *** ${e164.slice(-4)}`;
}
