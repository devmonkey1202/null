import { describe, expect, it } from "vitest";

import { hydrateDoc, serializeDoc } from "../src/advanced/doc/scene";
import { normalizePublicWebImportUrl } from "../src/lib/webImportShared";
import { webHtmlToNullDoc } from "../src/lib/webToNull";

const SAMPLE_HTML = `
  <!doctype html>
  <html lang="en">
    <head>
      <title>Example Landing</title>
      <meta name="description" content="A simple imported landing page." />
    </head>
    <body>
      <main>
        <h1>Hello world</h1>
        <p>Build something fast with NULL.</p>
        <a class="button primary" href="/signup">Get started</a>
        <a href="/docs">Read docs</a>
        <img src="/hero.png" alt="Hero" />
        <h2>Features</h2>
        <ul>
          <li>Fast import</li>
          <li>Editable layers</li>
        </ul>
      </main>
    </body>
  </html>
`;

describe("webToNull", () => {
  it("normalizes public URLs", () => {
    expect(normalizePublicWebImportUrl("example.com")).toBe("https://example.com/");
    expect(normalizePublicWebImportUrl("https://example.com/path#hash")).toBe("https://example.com/path");
  });

  it("converts HTML into an editable document with import metadata", () => {
    const { doc, importSource, blockCount } = webHtmlToNullDoc({
      url: "https://example.com",
      html: SAMPLE_HTML,
      viewportId: "mobile",
    });

    expect(importSource.viewportId).toBe("mobile");
    expect(doc.imports?.web?.url).toBe("https://example.com/");
    expect(doc.imports?.web?.title).toBe("Example Landing");
    expect(blockCount).toBeGreaterThan(0);

    const pageRootId = doc.pages[0]!.rootId;
    const importFrame = Object.values(doc.nodes).find((node) => node.parentId === pageRootId && node.name.includes("웹 가져오기"));
    expect(importFrame?.type).toBe("frame");
    expect(importFrame?.frame.w).toBe(390);

    expect(Object.values(doc.nodes).some((node) => node.type === "text" && node.text?.value === "Hello world")).toBe(true);
    expect(Object.values(doc.nodes).some((node) => node.type === "image" && node.image?.src === "https://example.com/hero.png")).toBe(true);

    const ctaButton = Object.values(doc.nodes).find(
      (node) =>
        node.type === "frame" &&
        node.prototype?.interactions?.some((interaction) => interaction.action.type === "url" && interaction.action.url === "https://example.com/signup"),
    );
    expect(ctaButton).toBeDefined();

    const linkText = Object.values(doc.nodes).find(
      (node) =>
        node.type === "text" &&
        node.text?.value === "Read docs" &&
        node.prototype?.interactions?.some((interaction) => interaction.action.type === "url" && interaction.action.url === "https://example.com/docs"),
    );
    expect(linkText).toBeDefined();
  });

  it("preserves web import metadata through serialize and hydrate", () => {
    const imported = webHtmlToNullDoc({
      url: "https://example.com",
      html: SAMPLE_HTML,
      viewportId: "desktop",
    });

    const hydrated = hydrateDoc(serializeDoc(imported.doc));

    expect(hydrated.imports?.web?.viewportId).toBe("desktop");
    expect(hydrated.imports?.web?.url).toBe("https://example.com/");
    expect(hydrated.imports?.web?.title).toBe("Example Landing");
  });
});
