import type { PluginManifest } from "@/lib/app-plugins";
import { createHash } from "crypto";

export type StorePlugin = PluginManifest & {
  storeId: string;
  category: "editor" | "export" | "runtime" | "ops";
  tags?: string[];
  featured?: boolean;
  approvalRequired?: boolean;
  detail?: string;
  sharePath?: string;
};

export type StorePluginFilters = {
  q?: string;
  category?: StorePlugin["category"] | "all";
  storeId?: string;
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
    detail: "Fast alignment, spacing, and stack cleanup actions for dense Figma-like editor sessions.",
    version: "1.0.0",
    minAppVersion: "0.1.0",
    permissions: ["editor", "ui"],
    category: "editor",
    tags: ["align", "layout", "selection"],
    featured: true,
    sharePath: "/plugins/store/store-align-kit",
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
    detail: "One-click exports for tokens, SVG, and PNG batches when handing designs over to dev and marketing.",
    version: "1.1.0",
    minAppVersion: "0.1.0",
    permissions: ["export", "ui"],
    category: "export",
    tags: ["export", "tokens", "handoff"],
    featured: true,
    sharePath: "/plugins/store/store-export-pack",
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
    detail: "Quickly enable grid, audit, and performance overlays for large-document editing and review.",
    version: "1.0.0",
    minAppVersion: "0.1.0",
    permissions: ["ui"],
    category: "runtime",
    tags: ["performance", "overlay", "runtime"],
    approvalRequired: true,
    sharePath: "/plugins/store/store-performance",
    actions: [
      { id: "toggle-perf", label: "Toggle Performance Overlay", type: "togglePerformance" },
    ],
  },
];

function matchesPluginFilters(plugin: StorePlugin, filters: StorePluginFilters) {
  if (filters.storeId && plugin.storeId !== filters.storeId) return false;
  if (filters.category && filters.category !== "all" && plugin.category !== filters.category) return false;
  const q = filters.q?.trim().toLowerCase();
  if (!q) return true;
  return [plugin.name, plugin.description, plugin.detail, ...(plugin.tags ?? [])]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(q));
}

export function listStorePlugins(filters: StorePluginFilters = {}) {
  const plugins = CATALOG.filter((plugin) => matchesPluginFilters(plugin, filters)).map((plugin) => {
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
  const { storeId, category, ...manifest } = storePlugin;
  void category;
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
