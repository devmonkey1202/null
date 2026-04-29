import { describe, expect, it } from "vitest";

import {
  summarizeAvailabilityEntries,
  summarizeSecurityEntries,
  summarizeSystemEntries,
} from "@/lib/ops-telemetry";

describe("ops telemetry summaries", () => {
  const now = new Date("2026-03-20T02:00:00.000Z");

  it("summarizes availability rates and buckets", () => {
    const result = summarizeAvailabilityEntries(
      [
        { ts: "2026-03-20T00:10:00.000Z", ok: true, db_ok: true, latency_ms: 120, source: "ops" },
        { ts: "2026-03-20T00:20:00.000Z", ok: false, db_ok: false, latency_ms: 400, source: "ops" },
        { ts: "2026-03-20T01:05:00.000Z", ok: true, db_ok: true, latency_ms: 80, source: "public" },
      ],
      24,
      now,
    );

    expect(result.total).toBe(3);
    expect(result.okCount).toBe(2);
    expect(result.okRate).toBeCloseTo(0.6666, 3);
    expect(result.dbOkRate).toBeCloseTo(0.6666, 3);
    expect(result.avgLatencyMs).toBe(200);
    expect(result.buckets).toHaveLength(2);
  });

  it("summarizes system log levels and top messages", () => {
    const result = summarizeSystemEntries(
      [
        { ts: "2026-03-20T00:10:00.000Z", level: "info", message: "ok" },
        { ts: "2026-03-20T00:20:00.000Z", level: "error", message: "db_failed", source: "db" },
        { ts: "2026-03-20T00:30:00.000Z", level: "error", message: "db_failed", source: "db" },
        { ts: "2026-03-20T00:40:00.000Z", level: "warn", message: "slow_request", source: "api" },
      ],
      24,
      now,
    );

    expect(result.byLevel.error).toBe(2);
    expect(result.byLevel.warn).toBe(1);
    expect(result.topMessages[0]).toEqual({ key: "db_failed", count: 2 });
    expect(result.latestErrors).toHaveLength(3);
  });

  it("summarizes security actions", () => {
    const result = summarizeSecurityEntries(
      [
        { ts: "2026-03-20T00:10:00.000Z", action: "admin_login_success", path: "/ops/secret" },
        { ts: "2026-03-20T00:11:00.000Z", action: "admin_login_success", path: "/ops/secret" },
        { ts: "2026-03-20T00:12:00.000Z", action: "plugin_install_blocked", path: "/api/app/x/plugins/store" },
      ],
      24,
      now,
    );

    expect(result.total).toBe(3);
    expect(result.topActions[0]).toEqual({ key: "admin_login_success", count: 2 });
    expect(result.latest[0]?.action).toBe("plugin_install_blocked");
  });
});
