// @vitest-environment node
import { describe, it, expect } from "vitest";
import { listStorePlugins, getStorePlugin, toManifest } from "@/lib/plugin-store";

describe("plugin store catalog", () => {
  it("lists catalog with version", () => {
    const catalog = listStorePlugins();
    expect(typeof catalog.version).toBe("string");
    expect(Array.isArray(catalog.plugins)).toBe(true);
    expect(catalog.plugins.length).toBeGreaterThan(0);
  });

  it("gets plugin by store id", () => {
    const catalog = listStorePlugins();
    const first = catalog.plugins[0];
    const found = getStorePlugin(first.storeId);
    expect(found?.id).toBe(first.id);
  });

  it("converts store plugin to manifest", () => {
    const catalog = listStorePlugins();
    const first = catalog.plugins[0];
    const manifest = toManifest(first);
    expect(manifest.storeId).toBe(first.storeId);
    expect(manifest.id).toBe(first.id);
  });
});
