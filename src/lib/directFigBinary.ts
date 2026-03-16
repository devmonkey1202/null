import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";

export type DirectFigBinaryParseKind = "bundle" | "payload" | "file";

export type DirectFigBinaryParseResult = {
  adapterName: string;
  kind: DirectFigBinaryParseKind;
  data: unknown;
  warnings?: string[];
};

export type DirectFigBinaryWriteResult = {
  adapterName: string;
  bytes: Uint8Array;
};

export type DirectFigBinaryWriteInput = {
  bundle: unknown;
  bundleJson: string;
  bundleBytes: Uint8Array;
};

export interface DirectFigBinaryAdapter {
  name: string;
  canRead(buffer: Uint8Array): boolean;
  parse(buffer: Uint8Array): DirectFigBinaryParseResult | null;
  write?(input: DirectFigBinaryWriteInput): Uint8Array | null;
}

const adapters = new Map<string, DirectFigBinaryAdapter>();
let defaultsInitialized = false;

function normalizeEnvArgs(raw: string | undefined) {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
}

function createCliAdapter(command: string, args: string[]): DirectFigBinaryAdapter {
  const run = (mode: "read" | "write", input: Uint8Array | string) => {
    const result = mode === "read"
      ? spawnSync(command, [...args, mode], {
          input: typeof input === "string" ? input : Buffer.from(input),
          encoding: "utf8",
          maxBuffer: 32 * 1024 * 1024,
          windowsHide: true,
        })
      : spawnSync(command, [...args, mode], {
          input: typeof input === "string" ? input : Buffer.from(input),
          maxBuffer: 32 * 1024 * 1024,
          windowsHide: true,
        });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const stderr = typeof result.stderr === "string" ? result.stderr.trim() : Buffer.from(result.stderr ?? []).toString("utf8").trim();
      throw new Error(stderr || `direct_fig_cli_failed:${result.status}`);
    }
    return result.stdout;
  };

  return {
    name: `cli:${command}`,
    canRead() {
      return true;
    },
    parse(buffer) {
      const stdout = run("read", buffer);
      const parsed = JSON.parse(String(stdout)) as DirectFigBinaryParseResult;
      if (!parsed || typeof parsed !== "object" || !parsed.kind) return null;
      return {
        adapterName: parsed.adapterName || `cli:${command}`,
        kind: parsed.kind,
        data: parsed.data,
        warnings: parsed.warnings,
      };
    },
    write(input) {
      const payload = JSON.stringify({
        bundle: input.bundle,
        bundleJson: input.bundleJson,
        bundleBase64: Buffer.from(input.bundleBytes).toString("base64"),
      });
      const stdout = run("write", payload);
      if (typeof stdout === "string") return Buffer.from(stdout, "binary");
      return new Uint8Array(stdout);
    },
  };
}

function ensureDefaultDirectFigBinaryAdapters() {
  if (defaultsInitialized) return;
  defaultsInitialized = true;
  const command = process.env.NULL_DIRECT_FIG_ADAPTER_CMD?.trim();
  if (!command) return;
  const args = normalizeEnvArgs(process.env.NULL_DIRECT_FIG_ADAPTER_ARGS);
  registerDirectFigBinaryAdapter(createCliAdapter(command, args));
}

export function registerDirectFigBinaryAdapter(adapter: DirectFigBinaryAdapter) {
  adapters.set(adapter.name, adapter);
}

export function unregisterDirectFigBinaryAdapter(name: string) {
  adapters.delete(name);
}

export function clearDirectFigBinaryAdapters() {
  adapters.clear();
  defaultsInitialized = false;
}

export function getDirectFigBinaryAdapters() {
  ensureDefaultDirectFigBinaryAdapters();
  return Array.from(adapters.values());
}

export function hasDirectFigBinaryWriter() {
  return getDirectFigBinaryAdapters().some((adapter) => typeof adapter.write === "function");
}

export function tryParseDirectFigBinary(buffer: Uint8Array): DirectFigBinaryParseResult | null {
  for (const adapter of getDirectFigBinaryAdapters()) {
    if (!adapter.canRead(buffer)) continue;
    const parsed = adapter.parse(buffer);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

export function tryWriteDirectFigBinary(input: DirectFigBinaryWriteInput): DirectFigBinaryWriteResult | null {
  for (const adapter of getDirectFigBinaryAdapters()) {
    if (!adapter.write) continue;
    const bytes = adapter.write(input);
    if (bytes) {
      return { adapterName: adapter.name, bytes };
    }
  }
  return null;
}
