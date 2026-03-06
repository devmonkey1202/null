import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Args = {
  serverUrl?: string;
  platform?: "android" | "ios" | "all" | "none";
  install?: boolean;
  open?: boolean;
};

const ROOT = resolve(__dirname, "..", "..");
const HOST_DIR = resolve(ROOT, "mobile", "capacitor-host");
const HOST_CONFIG_PATH = resolve(HOST_DIR, "host.config.json");

function parseArgs(argv: string[]): Args {
  const args: Args = { install: true, open: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--server-url" && argv[i + 1]) {
      args.serverUrl = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--platform" && argv[i + 1]) {
      const value = argv[i + 1] as Args["platform"];
      args.platform = value;
      i += 1;
      continue;
    }
    if (token === "--no-install") {
      args.install = false;
      continue;
    }
    if (token === "--open") {
      args.open = true;
      continue;
    }
  }
  return args;
}

function run(cmd: string, args: string[], cwd: string) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed`);
  }
}

function readHostConfig(): Record<string, unknown> {
  try {
    const raw = readFileSync(HOST_CONFIG_PATH, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeHostConfig(config: Record<string, unknown>) {
  writeFileSync(HOST_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function normalizeServerUrl(value: string | undefined) {
  if (!value) return "";
  return value.trim();
}

function resolvePlatform(input?: Args["platform"]): Args["platform"] {
  if (input) return input;
  return process.platform === "win32" ? "android" : "all";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const hostConfig = readHostConfig();
  const envUrl = normalizeServerUrl(
    process.env.NULL_MOBILE_SERVER_URL || process.env.NULL_HOST_URL || process.env.NEXT_PUBLIC_NULL_HOST_URL,
  );
  const desiredUrl = normalizeServerUrl(args.serverUrl) || envUrl;
  if (desiredUrl) {
    hostConfig.serverUrl = desiredUrl;
    writeHostConfig(hostConfig);
  }

  if (args.install) {
    run("npm", ["install"], HOST_DIR);
  }

  const platform = resolvePlatform(args.platform);
  const wantsAndroid = platform === "android" || platform === "all";
  const wantsIos = platform === "ios" || platform === "all";

  if (wantsAndroid && !existsSync(resolve(HOST_DIR, "android"))) {
    run("npx", ["cap", "add", "android"], HOST_DIR);
  }
  if (wantsIos && process.platform !== "win32" && !existsSync(resolve(HOST_DIR, "ios"))) {
    run("npx", ["cap", "add", "ios"], HOST_DIR);
  }

  run("npx", ["cap", "sync"], HOST_DIR);

  if (args.open) {
    if (wantsAndroid) run("npx", ["cap", "open", "android"], HOST_DIR);
    if (wantsIos && process.platform !== "win32") run("npx", ["cap", "open", "ios"], HOST_DIR);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
