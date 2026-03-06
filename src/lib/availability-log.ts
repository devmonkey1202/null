import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type AvailabilityEntry = {
  ts: string;
  ok: boolean;
  db_ok?: boolean;
  latency_ms: number;
  source: "public" | "ops";
  meta?: Record<string, unknown>;
};

const LOG_DIR = join(process.cwd(), "logs");
const LOG_FILE = join(LOG_DIR, "availability.log");

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

export function logAvailability(entry: AvailabilityEntry) {
  try {
    ensureLogDir();
    appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
  } catch {
    // fail-safe: avoid throwing in logging path
  }
}
