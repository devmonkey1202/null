import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildAppStoreArtifacts } from "@/lib/app-store-pipeline";

type Args = {
  platform?: "ios" | "android";
  hostType?: "capacitor" | "react-native";
  version?: string;
  buildNumber?: string;
  outputDir?: string;
  notes?: string;
  configPath?: string;
  dryRun?: boolean;
};

const ROOT = resolve(__dirname, "..", "..");

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: true };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--platform" && argv[i + 1]) {
      args.platform = argv[i + 1] as Args["platform"];
      i += 1;
      continue;
    }
    if (token === "--host" && argv[i + 1]) {
      args.hostType = argv[i + 1] as Args["hostType"];
      i += 1;
      continue;
    }
    if (token === "--version" && argv[i + 1]) {
      args.version = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--build" && argv[i + 1]) {
      args.buildNumber = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--output" && argv[i + 1]) {
      args.outputDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--notes" && argv[i + 1]) {
      args.notes = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--config" && argv[i + 1]) {
      args.configPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--execute") {
      args.dryRun = false;
      continue;
    }
  }
  return args;
}

function readConfig(path?: string): Record<string, unknown> {
  if (!path) return {};
  const full = resolve(ROOT, path);
  const raw = readFileSync(full, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.version || !args.buildNumber) {
    throw new Error("version_and_build_required");
  }

  const settings = readConfig(args.configPath);
  const artifacts = buildAppStoreArtifacts({
    platform: args.platform ?? "ios",
    hostType: args.hostType ?? "capacitor",
    version: args.version,
    buildNumber: args.buildNumber,
    outputDir: args.outputDir ? resolve(ROOT, args.outputDir) : undefined,
    notes: args.notes,
    settings,
    dryRun: args.dryRun,
  });

  console.log("app-store pipeline complete");
  console.log(JSON.stringify({ outputDir: artifacts.outputDir, packagePath: artifacts.packagePath }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
