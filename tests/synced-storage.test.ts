// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readStorageKey, subscribeStorageKey, writeStorageKey } from "@/lib/synced-storage";

describe("synced storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads and writes through helper", () => {
    const parse = (raw: string | null) => raw ?? "default";
    const value = readStorageKey("k", parse, "fallback");
    expect(value).toBe("default");
    writeStorageKey("k", "hello", (v) => v);
    const next = readStorageKey("k", parse, "fallback");
    expect(next).toBe("hello");
  });

  it("subscribes to custom and storage events", () => {
    const handler = vi.fn();
    const parse = (raw: string | null) => raw ?? "";
    const unsubscribe = subscribeStorageKey("k", parse, handler);
    writeStorageKey("k", "one", (v) => v);
    window.dispatchEvent(new StorageEvent("storage", { key: "k", newValue: "two" }));
    unsubscribe();

    expect(handler).toHaveBeenCalledWith("one");
    expect(handler).toHaveBeenCalledWith("two");
  });
});
