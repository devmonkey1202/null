import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  ipBlock: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));

import { checkWaf } from "@/lib/waf";

const ORIGINAL_ENV = { ...process.env };

describe("waf", () => {
  beforeEach(() => {
    process.env.WAF_ENABLED = "true";
    delete process.env.WAF_SKIP_PATHS;
    delete process.env.WAF_BLOCK_UA_REGEX;
    delete process.env.WAF_MAX_BODY_BYTES;
    prismaMock.ipBlock.findFirst.mockReset();
    prismaMock.ipBlock.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("blocks oversized bodies", async () => {
    process.env.WAF_MAX_BODY_BYTES = "10";
    const req = new Request("https://example.com/api/test", {
      headers: { "content-length": "20" },
    });
    const decision = await checkWaf(req);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.error).toBe("waf_body_too_large");
      expect(decision.status).toBe(413);
    }
  });

  it("blocks user agents by regex", async () => {
    process.env.WAF_BLOCK_UA_REGEX = "BadBot";
    const req = new Request("https://example.com/api/test", {
      headers: { "user-agent": "BadBot/1.0" },
    });
    const decision = await checkWaf(req);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.error).toBe("waf_ua_blocked");
    }
  });

  it("blocks IPs from blocklist", async () => {
    prismaMock.ipBlock.findFirst.mockResolvedValue({ reason: "manual", expires_at: null });
    const req = new Request("https://example.com/api/test", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    const decision = await checkWaf(req);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.error).toBe("waf_ip_blocked");
    }
  });
});
