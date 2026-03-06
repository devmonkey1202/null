import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Args = {
  serverUrl?: string;
  install?: boolean;
};

const ROOT = resolve(__dirname, "..", "..");
const HOST_DIR = resolve(ROOT, "mobile", "react-native-host");
const HOST_CONFIG_PATH = resolve(HOST_DIR, "host.config.json");

function parseArgs(argv: string[]): Args {
  const args: Args = { install: true };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--server-url" && argv[i + 1]) {
      args.serverUrl = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--no-install") {
      args.install = false;
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
