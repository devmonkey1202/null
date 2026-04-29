import { describe, expect, it } from "vitest";

import { normalizePluginWebImportParams } from "@/advanced/ui/pluginWebImport";

describe("plugin web import params", () => {
  it("normalizes a single external url import", () => {
    const spec = normalizePluginWebImportParams({
      url: "https://example.com/demo ",
      viewportId: "tablet",
      language: " ko-KR ",
      query: "lang=ko ",
      theme: " dark ",
    });

    expect(spec).toEqual({
      kind: "url",
      url: "https://example.com/demo",
      viewportId: "tablet",
      language: "ko-KR",
      query: "?lang=ko",
      theme: "dark",
    });
  });

  it("normalizes bulk url imports and dedupes entries", () => {
    const spec = normalizePluginWebImportParams({
      urls: ["https://example.com/a", " https://example.com/a ", "https://example.com/b"],
      query: "lang=en",
    });

    expect(spec).toEqual({
      kind: "url-bulk",
      urls: ["https://example.com/a", "https://example.com/b"],
      viewportId: "desktop",
      language: "",
      query: "?lang=en",
      theme: "",
    });
  });

  it("falls back to opening the modal when there is no valid url", () => {
    const spec = normalizePluginWebImportParams({
      url: "javascript:alert(1)",
      viewportId: "invalid",
    });

    expect(spec).toEqual({
      kind: "open-modal",
      viewportId: "desktop",
      language: "",
      query: "",
      theme: "",
    });
  });

  it("supports modal-prefill mode", () => {
    const spec = normalizePluginWebImportParams({
      openModal: true,
      url: "https://example.com/prefill",
      language: "en-US",
      theme: "light",
    });

    expect(spec).toEqual({
      kind: "open-modal",
      url: "https://example.com/prefill",
      viewportId: "desktop",
      language: "en-US",
      query: "",
      theme: "light",
    });
  });
});
