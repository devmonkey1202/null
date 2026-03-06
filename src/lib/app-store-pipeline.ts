import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MobileHostSettings } from "@/lib/mobile-host";
import { resolveMobileHostConfig } from "@/lib/mobile-host";
import { buildMobileHostPackage } from "@/lib/mobile-package";

export type AppStorePlatform = "ios" | "android";
export type AppStoreHostType = "capacitor" | "react-native";

export type AppStorePipelineInput = {
  platform: AppStorePlatform;
  hostType: AppStoreHostType;
  settings?: MobileHostSettings;
  version: string;
  buildNumber: number | string;
  outputDir?: string;
  notes?: string;
  dryRun?: boolean;
};

export type AppStoreArtifacts = {
  outputDir: string;
  packagePath: string;
  metadataPath: string;
  checklistPath: string;
  signingGuidePath: string;
  metadata: Record<string, unknown>;
};

function normalizePlatform(value: unknown): AppStorePlatform {
  return value === "android" ? "android" : "ios";
}

function normalizeHostType(value: unknown): AppStoreHostType {
  return value === "react-native" ? "react-native" : "capacitor";
}

function normalizeVersion(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) throw new Error("version_required");
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(raw)) {
    throw new Error("version_format_invalid");
  }
  return raw;
}

function normalizeBuildNumber(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("build_number_invalid");
  }
  return Math.floor(parsed);
}

function buildChecklist(platform: AppStorePlatform, appId: string) {
  return [
    `# App Store Release Checklist (${platform})`,
    "",
    `- App ID: ${appId}`,
    "- Verify signing certificates and provisioning profiles",
    "- Confirm privacy/permission strings are up to date",
    "- Validate deep link and push notification entitlements",
    "- Run smoke tests on physical device",
    "- Upload build to store console (TestFlight/Play Console)",
    "- Submit for review and monitor status",
    "",
  ].join("\n");
}

function buildSigningGuide(platform: AppStorePlatform, appId: string) {
  const title = platform === "android" ? "Android Signing Guide" : "iOS Signing Guide";
  return [
    `# ${title}`,
    "",
    `- App ID: ${appId}`,
    "- Prepare signing keys/certificates and keep them in a secure vault",
    "- Verify entitlements and permission strings before signing",
    "- Run a clean build and sign the release artifact",
    "- Store the signed artifact checksum in release notes",
    "- Re-verify signature after upload (store console or notarization)",
    "",
  ].join("\n");
}

export function buildAppStoreArtifacts(input: AppStorePipelineInput): AppStoreArtifacts {
  const platform = normalizePlatform(input.platform);
  const hostType = normalizeHostType(input.hostType);
  const version = normalizeVersion(input.version);
  const buildNumber = normalizeBuildNumber(input.buildNumber);

  const resolvedHost = resolveMobileHostConfig(input.settings ?? {});
  const hostPackage = buildMobileHostPackage(hostType, input.settings ?? {});

  const baseOut = input.outputDir ?? join(process.cwd(), "dist", "app-store");
  const outputDir = join(baseOut, platform, `${resolvedHost.appId}-${version}-${buildNumber}`);
  mkdirSync(outputDir, { recursive: true });

  const packagePath = join(outputDir, `${hostPackage.name}.zip`);
  writeFileSync(packagePath, hostPackage.zip);

  const metadata = {
    platform,
    hostType,
    appId: resolvedHost.appId,
    appName: resolvedHost.appName,
    serverUrl: resolvedHost.serverUrl,
    version,
    buildNumber,
    dryRun: Boolean(input.dryRun ?? true),
    generatedAt: new Date().toISOString(),
    notes: input.notes ?? null,
  };
  const metadataPath = join(outputDir, "app-store-metadata.json");
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  const checklistPath = join(outputDir, "RELEASE_CHECKLIST.md");
  writeFileSync(checklistPath, buildChecklist(platform, resolvedHost.appId), "utf8");

  const signingGuidePath = join(outputDir, "SIGNING_GUIDE.md");
  writeFileSync(signingGuidePath, buildSigningGuide(platform, resolvedHost.appId), "utf8");

  return { outputDir, packagePath, metadataPath, checklistPath, signingGuidePath, metadata };
}
