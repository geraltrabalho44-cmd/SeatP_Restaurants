import { describe, expect, it } from "vitest";
import { codeDigits } from "./codeDigits";

describe("codeDigits", () => {
  it("keeps the six digits of a code pasted with a space, a dash or a line break", () => {
    expect(codeDigits("123 456")).toBe("123456");
    expect(codeDigits("123-456")).toBe("123456");
    expect(codeDigits(" 123456\n")).toBe("123456");
  });

  it("drops letters and stops at the length", () => {
    expect(codeDigits("12a3b4")).toBe("1234");
    expect(codeDigits("1234567890")).toBe("123456");
    expect(codeDigits("1234567890", 8)).toBe("12345678");
  });

  it("is empty when there are no digits", () => {
    expect(codeDigits("")).toBe("");
    expect(codeDigits("abc")).toBe("");
  });
});
