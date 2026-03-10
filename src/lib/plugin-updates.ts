import type { PluginManifest } from "@/lib/app-plugins";

export type PluginUpdatePolicy = {
  policy: "manual" | "auto" | "pinned";
  pinnedVersion?: string;
  lastCheckedAt?: string;
};

type StoreListResponse = {
  version: string;
  plugins: PluginManifest[];
};

async function fetchStoreCatalog() {
  const url = process.env.PLUGIN_STORE_URL ?? "";
  if (!url) return null;
  const res = await fetch(url, { method: "GET", headers: { "Content-Type": "application/json" } });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as StoreListResponse | null;
}

export async function resolveStoreUpdate(
  storeId: string,
  installed: PluginManifest,
  policy: PluginUpdatePolicy,
): Promise<{ updateAvailable: boolean; manifest?: PluginManifest; storeVersion?: string }>{
  const catalog = await fetchStoreCatalog();
  if (!catalog) return { updateAvailable: false };
  const target = catalog.plugins.find((p) => p.storeId === storeId);
  if (!target) return { updateAvailable: false };
  if (policy.policy === "pinned" && policy.pinnedVersion) {
    if (target.version !== policy.pinnedVersion) return { updateAvailable: false };
  }
  if (installed.digest && target.digest && installed.digest === target.digest) return { updateAvailable: false };
  return { updateAvailable: true, manifest: target, storeVersion: catalog.version };
}
