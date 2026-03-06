import type { PluginManifest } from "@/lib/app-plugins";

export type StorePlugin = PluginManifest & {
  storeId: string;
  category: "editor" | "export" | "runtime" | "ops";
};

const STORE_VERSION = "2026.03.05";

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
  return { version: STORE_VERSION, plugins: CATALOG };
}

export function getStorePlugin(storeId: string) {
  return CATALOG.find((p) => p.storeId === storeId) ?? null;
}

export function toManifest(storePlugin: StorePlugin): PluginManifest {
  const { storeId: _storeId, category: _category, ...manifest } = storePlugin;
  return manifest;
}
