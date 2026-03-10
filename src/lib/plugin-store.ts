import type { PluginManifest } from "@/lib/app-plugins";
import { createHash } from "crypto";

export type StorePlugin = PluginManifest & {
  storeId: string;
  category: "editor" | "export" | "runtime" | "ops";
};

const STORE_VERSION = "2026.03.08";

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    const body = entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",");
    return `{${body}}`;
  }
  return JSON.stringify(String(value));
}

function computeDigest(manifest: PluginManifest) {
  const payload = {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    permissions: manifest.permissions ?? [],
    actions: manifest.actions ?? [],
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

const CATALOG: StorePlugin[] = [
  {
    storeId: "store-align-kit",
    id: "align-kit",
    name: "Align Kit",
    description: "Alignment + distribution helpers.",
    version: "1.0.0",
    minAppVersion: "0.1.0",
    permissions: ["editor", "ui"],
    category: "editor",
    actions: [
      { id: "align-left", label: "Align Left", type: "align" },
      { id: "align-right", label: "Align Right", type: "align" },
      { id: "distribute-h", label: "Distribute Horizontally", type: "distribute" },
    ],
  },
  {
    storeId: "store-export-pack",
    id: "export-pack",
    name: "Export Pack",
    description: "Token + asset export shortcuts.",
    version: "1.1.0",
    minAppVersion: "0.1.0",
    permissions: ["export", "ui"],
    category: "export",
    actions: [
      { id: "export-tokens", label: "Export Tokens", type: "exportTokens" },
      { id: "export-png", label: "Export PNG", type: "exportSelectionPng" },
      { id: "export-svg", label: "Export SVG", type: "exportSelectionSvg" },
    ],
  },
  {
    storeId: "store-performance",
    id: "performance-toggle",
    name: "Performance Toggle",
    description: "Runtime performance overlay toggles.",
    version: "1.0.0",
    minAppVersion: "0.1.0",
    permissions: ["ui"],
    category: "runtime",
    actions: [
      { id: "toggle-perf", label: "Toggle Performance Overlay", type: "togglePerformance" },
    ],
  },
];

export function listStorePlugins() {
  const plugins = CATALOG.map((plugin) => {
    const digest = computeDigest(plugin);
    return { ...plugin, digest, storeVersion: STORE_VERSION, frozen: true };
  });
  return { version: STORE_VERSION, plugins };
}

export function getStorePlugin(storeId: string) {
  const plugin = CATALOG.find((p) => p.storeId === storeId) ?? null;
  if (!plugin) return null;
  const digest = computeDigest(plugin);
  return { ...plugin, digest, storeVersion: STORE_VERSION, frozen: true };
}

export function toManifest(storePlugin: StorePlugin): PluginManifest {
  const { storeId, category: _category, ...manifest } = storePlugin;
  const digest = storePlugin.digest ?? computeDigest(manifest);
  return {
    ...manifest,
    storeId,
    storeVersion: STORE_VERSION,
    digest,
    frozen: true,
    installedAt: new Date().toISOString(),
  };
}
