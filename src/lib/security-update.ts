import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { logSecurityEvent } from "@/lib/security-log";

export const securityUpdateSchema = z.object({
  version: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  summary: z.string().min(1).max(500),
  appliedAt: z.string().datetime().optional(),
  references: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type SecurityUpdateInput = z.infer<typeof securityUpdateSchema>;

export type SecurityUpdateEntry = SecurityUpdateInput & {
  ts: string;
  actor?: { adminId?: string | null };
};

export function recordSecurityUpdate(input: SecurityUpdateInput, actor?: { adminId?: string | null }) {
  const payload: SecurityUpdateEntry = {
    ts: new Date().toISOString(),
    ...input,
    actor,
  };
  logSecurityEvent({
    action: "security_update_applied",
    meta: payload,
  });
  return payload;
}

export function listSecurityUpdates(limit = 50, logFilePath?: string): SecurityUpdateEntry[] {
  const file = logFilePath;
  if (!file || !existsSync(file)) return [];
  const raw = readFileSync(file, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const results: SecurityUpdateEntry[] = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (results.length >= limit) break;
    try {
      const entry = JSON.parse(lines[i]);
      if (entry && entry.action === "security_update_applied" && entry.meta) {
        results.push(entry.meta as SecurityUpdateEntry);
      }
    } catch {
      // ignore malformed entries
    }
  }
  return results.reverse();
}
