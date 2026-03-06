import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appUser: {
    update: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { enforceAppUserOtp } from "@/lib/app-auth";
import { generateTotp, generateBackupCodes, hashBackupCode } from "@/lib/otp";

describe("app user otp enforcement", () => {
  beforeEach(() => {
    prismaMock.appUser.update.mockReset();
  });

  it("requires otp when enabled", async () => {
    const state = {
      id: "u1",
      otp_enabled: true,
      otp_secret: "JBSWY3DPEHPK3PXP",
      otp_backup_codes: [],
      otp_last_used_at: null,
    };
    await expect(enforceAppUserOtp(state, {})).rejects.toThrow("otp_required");
  });

  it("accepts a valid totp and updates last used", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const now = new Date("2026-01-01T00:00:00.000Z");
    const token = generateTotp({ secret, timestamp: now.getTime() });
    const state = {
      id: "u2",
      otp_enabled: true,
      otp_secret: secret,
      otp_backup_codes: [],
      otp_last_used_at: null,
    };
    await enforceAppUserOtp(state, { otp: token }, { now });
    expect(prismaMock.appUser.update).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { otp_last_used_at: now },
    });
  });

  it("consumes backup code when provided", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const now = new Date("2026-01-02T00:00:00.000Z");
    const backup = generateBackupCodes(1, 10)[0];
    const state = {
      id: "u3",
      otp_enabled: true,
      otp_secret: secret,
      otp_backup_codes: [hashBackupCode(backup)],
      otp_last_used_at: null,
    };
    await enforceAppUserOtp(state, { otpBackup: backup }, { now });
    expect(prismaMock.appUser.update).toHaveBeenCalledWith({
      where: { id: "u3" },
      data: { otp_backup_codes: [], otp_last_used_at: now },
    });
  });
});
