import { describe, expect, it } from "vitest";
import { logSystemEvent } from "../src/lib/system-log";
import { logSecurityEvent } from "../src/lib/security-log";
import { logAvailability } from "../src/lib/availability-log";
import { POST as postClientErrors } from "../src/app/api/client-errors/route";
import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { join } from "node:path";

function findMarkerInFile(filePath: string, marker: string): boolean {
  if (!existsSync(filePath)) return false;
  const stat = statSync(filePath);
  const tailBytes = Math.min(stat.size, 1024 * 1024);
  const fd = openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(tailBytes);
  readSync(fd, buffer, 0, tailBytes, Math.max(0, stat.size - tailBytes));
  closeSync(fd);
  const raw = buffer.toString("utf8");
  const lines = raw.split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].includes(marker)) return true;
  }
  return false;
}

describe("observability logs", () => {
  it("writes system log entries", () => {
    const marker = `sys_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    logSystemEvent("error", `test_${marker}`, { marker }, "test", true);
    const filePath = join(process.cwd(), "logs", "system.log");
    expect(findMarkerInFile(filePath, marker)).toBe(true);
  });

  it("writes security log entries", () => {
    const marker = `sec_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    logSecurityEvent({ action: `test_${marker}`, meta: { marker } });
    const filePath = join(process.cwd(), "logs", "security.log");
    expect(findMarkerInFile(filePath, marker)).toBe(true);
  });

  it("writes availability log entries", () => {
    const marker = `avail_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    logAvailability({
      ts: new Date().toISOString(),
      ok: true,
      db_ok: true,
      latency_ms: 1,
      source: "ops",
      meta: { marker },
    });
    const filePath = join(process.cwd(), "logs", "availability.log");
    expect(findMarkerInFile(filePath, marker)).toBe(true);
  });

  it("accepts client error reports", async () => {
    const marker = `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const req = new Request("http://localhost/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: `client_error_${marker}`, source: "vitest" }),
    });
    const res = await postClientErrors(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    const filePath = join(process.cwd(), "logs", "system.log");
    expect(findMarkerInFile(filePath, marker)).toBe(true);
  });
});
