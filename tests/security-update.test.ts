import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("@/lib/security-log", () => ({
  logSecurityEvent: vi.fn(),
}));

import { recordSecurityUpdate, listSecurityUpdates } from "@/lib/security-update";
import { logSecurityEvent } from "@/lib/security-log";

describe("security update logging", () => {
  it("records security update event", () => {
    const entry = recordSecurityUpdate({
      version: "2026.03.05",
      severity: "high",
      summary: "Dependency patch",
    }, { adminId: "admin_1" });

    expect(entry.version).toBe("2026.03.05");
    expect(logSecurityEvent).toHaveBeenCalledTimes(1);
    expect((logSecurityEvent as any).mock.calls[0][0].action).toBe("security_update_applied");
  });
});

describe("security update list", () => {
  const file = join(tmpdir(), `security-log-${Date.now()}.log`);

  beforeEach(() => {
    const lines = [
      JSON.stringify({ action: "user_login", meta: { foo: "bar" } }),
      JSON.stringify({ action: "security_update_applied", meta: { version: "2026.03.04", severity: "low", summary: "Minor" } }),
      JSON.stringify({ action: "security_update_applied", meta: { version: "2026.03.05", severity: "high", summary: "Patch" } }),
    ];
    writeFileSync(file, `${lines.join("\n")}\n`, { encoding: "utf8" });
  });

  afterEach(() => {
    try {
      unlinkSync(file);
    } catch {
      // ignore
    }
  });

  it("filters security update events", () => {
    const entries = listSecurityUpdates(10, file);
    expect(entries.length).toBe(2);
    expect(entries[0].version).toBe("2026.03.04");
    expect(entries[1].version).toBe("2026.03.05");
  });
});
