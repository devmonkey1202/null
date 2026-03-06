import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildAppStoreArtifacts } from "@/lib/app-store-pipeline";

describe("app store pipeline", () => {
  it("builds metadata and package artifacts", () => {
    const base = mkdtempSync(join(tmpdir(), "null-app-store-"));
    const result = buildAppStoreArtifacts({
      platform: "ios",
      hostType: "capacitor",
      version: "1.2.3",
      buildNumber: "12",
      outputDir: base,
      settings: { appName: "NULL Test", appId: "com.null.test", serverUrl: "https://example.com" },
      dryRun: true,
    });

    expect(existsSync(result.packagePath)).toBe(true);
    expect(existsSync(result.metadataPath)).toBe(true);
    expect(existsSync(result.checklistPath)).toBe(true);
    expect(existsSync(result.signingGuidePath)).toBe(true);

    const meta = JSON.parse(readFileSync(result.metadataPath, "utf8"));
    expect(meta.version).toBe("1.2.3");
    expect(meta.buildNumber).toBe(12);
    expect(meta.appId).toBe("com.null.test");

    rmSync(base, { recursive: true, force: true });
  });
});
