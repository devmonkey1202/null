import { describe, it, expect } from "vitest";
import { resolveLocaleCode, resolveLocaleMode } from "@/advanced/runtime/player";

describe("locale helpers", () => {
  it("resolves locale codes from labels", () => {
    expect(resolveLocaleCode("한국어")).toBe("ko");
    expect(resolveLocaleCode("English")).toBe("en");
    expect(resolveLocaleCode("日本語")).toBe("ja");
  });

  it("maps locale label to available modes", () => {
    expect(resolveLocaleMode("Korean", ["default", "ko", "en"])).toBe("ko");
    expect(resolveLocaleMode("English", ["default", "en-US", "ko"])).toBe("en-US");
  });
});
