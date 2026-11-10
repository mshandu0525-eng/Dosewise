import { describe, expect, it } from "vitest";
import { maskPhone, normalisePhone } from "./phone";

describe("normalisePhone", () => {
  it.each([
    ["082 123 4567", "+27821234567"],
    ["0821234567", "+27821234567"],
    ["+27 82 123 4567", "+27821234567"],
    ["27821234567", "+27821234567"],
    ["0027821234567", "+27821234567"],
    ["(082) 123-4567", "+27821234567"],
    ["+44 7700 900123", "+447700900123"],
  ])("%s → %s", (input, out) => expect(normalisePhone(input)).toBe(out));

  it.each(["", "12345", "082 123 456", "+27 82 123 45678", "hello"])("rejects %s", (input) => {
    expect(normalisePhone(input)).toBeUndefined();
  });

  it("masks for display", () => expect(maskPhone("+27821234567")).toBe("+27 82 *** 4567"));
});
