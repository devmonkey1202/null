import { describe, expect, it } from "vitest";
import { isValidPassword } from "../src/lib/auth";

describe("auth password policy", () => {
  it("accepts strong passwords", () => {
    expect(isValidPassword("Password123!")).toBe(true);
    expect(isValidPassword("A1b!cdef")).toBe(true);
  });

  it("rejects weak passwords", () => {
    expect(isValidPassword("short1!")).toBe(false);
    expect(isValidPassword("password123!")).toBe(false); // missing uppercase
    expect(isValidPassword("PASSWORD123!")).toBe(false); // missing lowercase
    expect(isValidPassword("Password!!!")).toBe(false); // missing number
    expect(isValidPassword("Password123")).toBe(false); // missing symbol
  });
});
