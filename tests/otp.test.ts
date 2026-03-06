import { describe, it, expect } from "vitest";
import { generateTotp, verifyTotp, generateBackupCodes, hashBackupCode, verifyBackupCode, consumeBackupCode } from "@/lib/otp";

describe("otp", () => {
  it("generates RFC6238 compatible totp", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const token = generateTotp({ secret, timestamp: 59_000, digits: 8 });
    expect(token).toBe("94287082");
    const verified = verifyTotp({ secret, token, timestamp: 59_000, digits: 8, window: 0 });
    expect(verified.valid).toBe(true);
  });

  it("hashes and consumes backup codes", () => {
    const codes = generateBackupCodes(3, 10);
    const hashes = codes.map(hashBackupCode);
    expect(verifyBackupCode(codes[0], hashes[0])).toBe(true);
    const consumed = consumeBackupCode(hashes, codes[0]);
    expect(consumed.ok).toBe(true);
    expect(consumed.remaining.length).toBe(2);
  });
});
