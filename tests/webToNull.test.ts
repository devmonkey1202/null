import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { hydrateDoc, serializeDoc } from "../src/advanced/doc/scene";
import { normalizePublicWebImportUrl } from "../src/lib/webImportShared";
import {
  captureWebToNullDoc,
  htmlCodeToNullDoc,
  publicUrlBatchToNullDoc,
  publicUrlToNullDoc,
  webFileToNullDoc,
  webHtmlToNullDoc,
} from "../src/lib/webToNull";

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

const SAMPLE_MHTML = `From: <Saved by NULL>
Subject: Sample
MIME-Version: 1.0
Content-Type: multipart/related; boundary="----=_NextPart_000_0000"

------=_NextPart_000_0000
Content-Type: text/html; charset="utf-8"
Content-Location: https://example.com/archive/page.html

<!doctype html>
<html>
  <head>
    <title>MHTML Sample</title>
  </head>
  <body>
    <main>
      <h1>Imported MHTML</h1>
      <img src="cid:hero-image" alt="Hero" />
    </main>
  </body>
</html>

------=_NextPart_000_0000
Content-Type: image/png
Content-Transfer-Encoding: base64
Content-ID: <hero-image>

iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7m6n4AAAAASUVORK5CYII=
------=_NextPart_000_0000--
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

  it("converts inline HTML/CSS into an editable document", () => {
    const imported = htmlCodeToNullDoc({
      html: "<main><h1>Inline Import</h1><p>Hello</p><a href=\"https://example.com\">Read more</a></main>",
      css: "main { padding: 24px; }",
      viewportId: "tablet",
    });

    expect(imported.importSource.kind).toBe("html-code");
    expect(imported.importSource.viewportId).toBe("tablet");
    expect(imported.doc.imports?.web?.kind).toBe("html-code");
    expect(Object.values(imported.doc.nodes).some((node) => node.type === "text" && node.text?.value === "Inline Import")).toBe(true);
  });

  it("imports html files into editable frames", async () => {
    const imported = await webFileToNullDoc({
      fileName: "landing.html",
      buffer: Buffer.from(SAMPLE_HTML, "utf8"),
      viewportId: "desktop",
    });

    expect(imported.importSource.kind).toBe("html-file");
    expect(imported.importSource.fileName).toBe("landing.html");
    expect(imported.doc.imports?.web?.fileName).toBe("landing.html");
    expect(Object.values(imported.doc.nodes).some((node) => node.type === "text" && node.text?.value === "Hello world")).toBe(true);
  });

  it("imports zipped websites and preserves embedded assets", async () => {
    const zip = new JSZip();
    zip.file(
      "index.html",
      "<!doctype html><html><head><title>Zipped Site</title></head><body><main><h1>Zipped Site</h1><img src=\"assets/hero.png\" alt=\"Hero\" /></main></body></html>",
    );
    zip.file("assets/hero.png", Buffer.from("89504E470D0A1A0A", "hex"));
    const buffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));

    const imported = await webFileToNullDoc({
      fileName: "site.zip",
      buffer,
      viewportId: "mobile",
    });

    expect(imported.importSource.kind).toBe("archive-file");
    const imageNode = Object.values(imported.doc.nodes).find((node) => node.type === "image");
    expect(imageNode?.image?.src.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("imports mhtml files and resolves cid assets", async () => {
    const imported = await webFileToNullDoc({
      fileName: "sample.mhtml",
      buffer: Buffer.from(SAMPLE_MHTML, "utf8"),
      viewportId: "desktop",
    });

    expect(imported.importSource.kind).toBe("mhtml-file");
    expect(Object.values(imported.doc.nodes).some((node) => node.type === "text" && node.text?.value === "Imported MHTML")).toBe(true);
    const imageNode = Object.values(imported.doc.nodes).find((node) => node.type === "image");
    expect(imageNode?.image?.src.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("passes language and query options through public URL import", async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init });
      return new Response(SAMPLE_HTML, { status: 200, headers: { "Content-Type": "text/html" } });
    }) as typeof fetch;

    try {
      const imported = await publicUrlToNullDoc({
        url: "https://example.com",
        viewportId: "desktop",
        language: "ja-JP",
        query: "lang=ja",
        theme: "dark",
      });

      expect(fetchCalls).toHaveLength(1);
      expect(String(fetchCalls[0]!.input)).toBe("https://example.com/?lang=ja&theme=dark");
      const headers = fetchCalls[0]!.init?.headers as Record<string, string>;
      expect(headers["accept-language"]).toBe("ja-JP");
      expect(imported.importSource.language).toBe("ja-JP");
      expect(imported.importSource.query).toBe("?lang=ja");
      expect(imported.importSource.theme).toBe("dark");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("imports multiple URLs into one document with batch metadata", async () => {
    const originalFetch = globalThis.fetch;
    const htmlByUrl = new Map([
      ["https://example.com/?lang=ko", SAMPLE_HTML],
      [
        "https://example.com/pricing?lang=ko",
        "<!doctype html><html><head><title>Pricing</title></head><body><main><h1>Pricing</h1><p>Choose your plan.</p></main></body></html>",
      ],
    ]);
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const html = htmlByUrl.get(String(input));
      if (!html) return new Response("not found", { status: 404 });
      return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
    }) as typeof fetch;

    try {
      const imported = await publicUrlBatchToNullDoc({
        urls: ["https://example.com", "https://example.com/pricing"],
        viewportId: "tablet",
        language: "ko-KR",
        query: "lang=ko",
      });

      expect(imported.importSource.kind).toBe("public-url-batch");
      expect(imported.importSource.urls).toEqual([
        "https://example.com/",
        "https://example.com/pricing",
      ]);
      expect(imported.importSource.language).toBe("ko-KR");
      expect(imported.importSource.query).toBe("?lang=ko");
      expect(imported.doc.imports?.web?.kind).toBe("public-url-batch");

      const pageRootId = imported.doc.pages[0]!.rootId;
      const rootFrames = imported.doc.nodes[pageRootId]!.children
        .map((id) => imported.doc.nodes[id])
        .filter((node) => node?.type === "frame");
      expect(rootFrames.length).toBe(2);
      expect(Object.values(imported.doc.nodes).some((node) => node.type === "text" && node.text?.value === "Pricing")).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("imports private and local page capture payloads into editable documents", () => {
    const payload = {
      url: "https://private.example.com/dashboard",
      title: "Private Dashboard",
      html: SAMPLE_HTML,
      css: "body { background: #fafafa; }",
    };
    const payloadText = JSON.stringify(payload);

    const privateImported = captureWebToNullDoc({
      payloadText,
      captureKind: "private-page-capture",
      viewportId: "desktop",
    });

    expect(privateImported.importSource.kind).toBe("private-page-capture");
    expect(privateImported.importSource.url).toBe(payload.url);
    expect(privateImported.importSource.title).toBe("Private Dashboard");
    expect(privateImported.importSource.viewportId).toBe("desktop");
    expect(privateImported.blockCount).toBeGreaterThan(0);
    expect(
      Object.values(privateImported.doc.nodes).some(
        (node) => node.type === "text" && node.text?.value === "Hello world",
      ),
    ).toBe(true);

    const localImported = captureWebToNullDoc({
      payloadText,
      captureKind: "local-page-capture",
      viewportId: "mobile",
    });

    expect(localImported.importSource.kind).toBe("local-page-capture");
    expect(localImported.importSource.url).toBe(payload.url);
    expect(localImported.importSource.viewportId).toBe("mobile");
    expect(localImported.blockCount).toBeGreaterThan(0);
  });
});
