import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import { addNode, createDoc, createNode, hydrateDoc } from "@/advanced/doc/scene";
import {
  clearDirectFigBinaryAdapters,
  registerDirectFigBinaryAdapter,
} from "@/lib/directFigBinary";
import {
  buildDirectFigmaFidelityReport,
  buildDirectFigmaRoundtripDiff,
  directFigmaSourceToNullDoc,
  directFigmaBundleToNullDoc,
  encodeDirectFigmaBundleBase64,
  encodeDirectFigmaPackageBase64,
  nullDocToDirectFigmaBundle,
  parseDirectFigmaBundle,
  parseDirectFigmaSourceDescriptor,
  writeDirectFigBinary,
  writeDirectFigmaPackage,
} from "@/lib/figmaBundle";
import type { FigmaNode } from "@/lib/figma";
import { DEFAULT_TEXT_STYLE } from "@/advanced/doc/scene";
import { nullDocToFigmaPayload } from "@/lib/nullToFigma";
import { buildTokenFixtureDoc } from "./figma-fixtures";

function walkFigma(node: FigmaNode, out: FigmaNode[] = []) {
  out.push(node);
  (node.children ?? []).forEach((child) => walkFigma(child, out));
  return out;
}

afterEach(() => {
  clearDirectFigBinaryAdapters();
  delete process.env.NULL_DIRECT_FIG_ADAPTER_CMD;
  delete process.env.NULL_DIRECT_FIG_ADAPTER_ARGS;
  delete process.env.NULL_DIRECT_FIG_ADAPTER_PAYLOAD_PATH;
});

describe("direct figma bundle", () => {
  it("writes and reads a compressed bundle while preserving shared metadata", () => {
    const doc = createDoc();
    const rootId = doc.pages[0]!.rootId;
    const widgetNode = createNode("frame", {
      id: "widget_host",
      name: "Widget Host",
      frame: { x: 40, y: 24, w: 320, h: 200, rotation: 0 },
    });
    widgetNode.sourceLibraryId = "library_alpha";
    widgetNode.sourceVersionId = "v12";
    widgetNode.publishedKey = "pub_alpha";
    widgetNode.instanceLibraryId = "library_runtime";
    widgetNode.sourceId = "source_component_1";
    widgetNode.variantId = "variant_primary";
    widgetNode.dev = {
      readyForDev: true,
      status: "ready",
      annotations: [{ id: "ann_1", text: "Spacing locked", status: "ready" }],
      codeLinks: [{ id: "code_1", title: "WidgetHost.tsx", kind: "react", url: "https://example.com/WidgetHost.tsx" }],
    };
    widgetNode.widget = {
      kind: "sandbox",
      storeId: "widget_store_alpha",
      storeVersion: "3",
      html: "<div>Widget</div>",
      allowedActions: ["navigate", "track"],
      allowedHosts: ["example.com"],
      version: "3.0.0",
    };
    addNode(doc, widgetNode, rootId);

    const bundle = nullDocToDirectFigmaBundle(doc, { fileName: "Meta Bundle" });
    const encoded = encodeDirectFigmaBundleBase64(bundle);
    const parsed = parseDirectFigmaBundle(encoded);
    const exportedNode = walkFigma(parsed.payload.file.document).find((node) => node.name === "Widget Host");

    expect(parsed.kind).toBe("null_figma_bundle");
    expect(parsed.compatibilityReport.summary.warnings).toBeGreaterThan(0);
    expect(exportedNode?.sharedPluginData?.NULL?.meta).toBeTruthy();

    const imported = hydrateDoc(directFigmaBundleToNullDoc(parsed));
    const importedNode = Object.values(imported.nodes).find((node) => node.name === "Widget Host");
    expect(importedNode?.sourceLibraryId).toBe("library_alpha");
    expect(importedNode?.sourceVersionId).toBe("v12");
    expect(importedNode?.publishedKey).toBe("pub_alpha");
    expect(importedNode?.instanceLibraryId).toBe("library_runtime");
    expect(importedNode?.sourceId).toBe("source_component_1");
    expect(importedNode?.variantId).toBe("variant_primary");
    expect(importedNode?.dev?.readyForDev).toBe(true);
    expect(importedNode?.dev?.annotations?.[0]?.text).toBe("Spacing locked");
    expect(importedNode?.widget?.storeId).toBe("widget_store_alpha");
    expect(importedNode?.widget?.allowedActions).toEqual(["navigate", "track"]);
  });

  it("produces a roundtrip diff report for direct bundle imports", () => {
    const doc = createDoc();
    const rootId = doc.pages[0]!.rootId;
    const card = createNode("rect", {
      id: "card_rect",
      name: "Card",
      frame: { x: 16, y: 20, w: 220, h: 140, rotation: 0 },
    });
    const title = createNode("text", {
      id: "card_title",
      name: "Title",
      frame: { x: 28, y: 36, w: 120, h: 32, rotation: 0 },
    });
    title.text = {
      value: "Launch faster",
      style: {
        fontFamily: "Space Grotesk",
        fontSize: 20,
        fontWeight: 700,
        lineHeight: 1.2,
        letterSpacing: 0,
        paragraphSpacing: 0,
        align: "left",
      },
      wrap: true,
      autoSize: false,
    };
    addNode(doc, card, rootId);
    addNode(doc, title, rootId);

    const imported = hydrateDoc(directFigmaBundleToNullDoc(nullDocToDirectFigmaBundle(doc, { fileName: "Roundtrip" })));
    const diff = buildDirectFigmaRoundtripDiff(doc, imported);

    expect(diff.sameSchema).toBe(true);
    expect(diff.pageCountDelta).toBe(0);
    expect(diff.styleCountDelta).toBe(0);
    expect(diff.variableCountDelta).toBe(0);
    expect(diff.nodeCountDelta).toBeGreaterThanOrEqual(0);
  });

  it("tracks component/style/variable/prototype fidelity categories in the bundle report", () => {
    const doc = createDoc();
    const rootId = doc.pages[0]!.rootId;
    const component = createNode("component", {
      id: "component_card",
      name: "Card Component",
      frame: { x: 40, y: 40, w: 220, h: 140, rotation: 0 },
      componentId: "card_component",
      propertyDefinitions: {
        title_text: { kind: "text", name: "Title" },
      },
    });
    addNode(doc, component, rootId);
    const label = createNode("text", {
      id: "component_card_title",
      name: "Title",
      frame: { x: 16, y: 16, w: 120, h: 24, rotation: 0 },
      sourceId: "title_text",
    });
    label.text = { value: "Launch", style: { ...DEFAULT_TEXT_STYLE, fontWeight: 700 }, wrap: false, autoSize: true };
    addNode(doc, label, component.id);
    doc.components = { card_component: component.id };

    const tokenDoc = buildTokenFixtureDoc();
    doc.styles = tokenDoc.styles;
    doc.variables = tokenDoc.variables;
    doc.variableModes = tokenDoc.variableModes;
    doc.variableMode = tokenDoc.variableMode;
    label.prototype = {
      interactions: [
        {
          id: "proto_nav",
          trigger: "click",
          action: { type: "navigate", targetPageId: doc.pages[0]!.id, transition: { type: "smart", duration: 240, easing: "ease-out" } },
        },
      ],
    };

    const bundle = nullDocToDirectFigmaBundle(doc, { fileName: "Fidelity Bundle" });
    const imported = hydrateDoc(directFigmaBundleToNullDoc(bundle));
    const fidelity = buildDirectFigmaFidelityReport(doc, imported);

    expect(bundle.fidelityReport.components.before).toBeGreaterThan(0);
    expect(bundle.fidelityReport.styles.before).toBeGreaterThan(0);
    expect(bundle.fidelityReport.variables.before).toBeGreaterThan(0);
    expect(bundle.fidelityReport.prototypeInteractions.before).toBeGreaterThan(0);
    expect(bundle.fidelityReport.components).toEqual(fidelity.components);
    expect(bundle.fidelityReport.styles).toEqual(fidelity.styles);
    expect(bundle.fidelityReport.variables).toEqual(fidelity.variables);
    expect(bundle.fidelityReport.prototypeInteractions).toEqual(fidelity.prototypeInteractions);
  });

  it("imports raw Figma REST payloads and reports their source kind", () => {
    const doc = buildTokenFixtureDoc();
    const payload = nullDocToFigmaPayload(doc, { fileName: "REST Payload" });

    const imported = hydrateDoc(directFigmaSourceToNullDoc(payload).doc);
    const descriptor = parseDirectFigmaSourceDescriptor(payload);

    expect(descriptor).toMatchObject({
      kind: "figma-rest-payload",
      encoding: "object",
      binary: false,
      compressed: false,
    });
    expect(imported.styles).toHaveLength(doc.styles.length);
    expect(imported.variables).toHaveLength(doc.variables.length);
  });

  it("sniffs raw Figma REST JSON and unsupported binary inputs separately", () => {
    const doc = buildTokenFixtureDoc();
    const payload = nullDocToFigmaPayload(doc, { fileName: "REST JSON" });
    const payloadJson = JSON.stringify(payload);
    const payloadGzip = gzipSync(Buffer.from(payloadJson, "utf8"));

    const jsonDescriptor = parseDirectFigmaSourceDescriptor(payloadJson);
    const gzipDescriptor = parseDirectFigmaSourceDescriptor(payloadGzip);
    const fileDescriptor = parseDirectFigmaSourceDescriptor(payload.file);
    const unknownBinaryDescriptor = parseDirectFigmaSourceDescriptor(new Uint8Array([0x46, 0x49, 0x47, 0x00, 0x13, 0x37]));

    expect(jsonDescriptor).toMatchObject({
      kind: "figma-rest-payload",
      encoding: "json",
      binary: false,
      compressed: false,
    });
    expect(gzipDescriptor).toMatchObject({
      kind: "figma-rest-payload",
      encoding: "gzip",
      binary: true,
      compressed: true,
    });
    expect(fileDescriptor).toMatchObject({
      kind: "figma-rest-file",
      encoding: "object",
    });
    expect(unknownBinaryDescriptor).toMatchObject({
      kind: "unknown-binary",
      encoding: "binary",
      binary: true,
      compressed: false,
    });
    expect(unknownBinaryDescriptor.warnings).toContain("binary-fig-format-unsupported");
  });

  it("writes and reads a direct fig package zip archive", () => {
    const doc = buildTokenFixtureDoc();
    const bundle = nullDocToDirectFigmaBundle(doc, { fileName: "Package Export" });
    const archive = writeDirectFigmaPackage(bundle);

    const descriptor = parseDirectFigmaSourceDescriptor(archive);
    const imported = hydrateDoc(directFigmaSourceToNullDoc(archive).doc);

    expect(descriptor).toMatchObject({
      kind: "null-package",
      encoding: "zip",
      binary: true,
      compressed: false,
    });
    expect(imported.styles).toHaveLength(doc.styles.length);
    expect(imported.variables).toHaveLength(doc.variables.length);
    expect(imported.variableModes).toEqual(doc.variableModes);
  });

  it("encodes direct fig packages as base64 zip sources", () => {
    const doc = buildTokenFixtureDoc();
    const bundle = nullDocToDirectFigmaBundle(doc, { fileName: "Package Base64" });
    const encoded = encodeDirectFigmaPackageBase64(bundle);

    const descriptor = parseDirectFigmaSourceDescriptor(encoded);
    const imported = hydrateDoc(directFigmaSourceToNullDoc(encoded).doc);

    expect(descriptor).toMatchObject({
      kind: "null-package",
      encoding: "zip",
      binary: true,
      compressed: false,
    });
    expect(imported.styles).toHaveLength(doc.styles.length);
  });

  it("uses a direct fig binary adapter when one is registered", () => {
    const doc = buildTokenFixtureDoc();
    const payload = nullDocToFigmaPayload(doc, { fileName: "Adapter Payload" });
    registerDirectFigBinaryAdapter({
      name: "fake-fig-binary",
      canRead(buffer) {
        return buffer[0] === 0x46 && buffer[1] === 0x49 && buffer[2] === 0x47;
      },
      parse() {
        return {
          adapterName: "fake-fig-binary",
          kind: "payload",
          data: payload,
          warnings: ["adapter-decoded-direct-fig"],
        };
      },
      write() {
        return Buffer.from("FIGBIN", "utf8");
      },
    });

    const descriptor = parseDirectFigmaSourceDescriptor(new Uint8Array([0x46, 0x49, 0x47, 0x01, 0x02]));
    const imported = hydrateDoc(directFigmaSourceToNullDoc(new Uint8Array([0x46, 0x49, 0x47, 0x01, 0x02])).doc);
    const bundle = nullDocToDirectFigmaBundle(doc, { fileName: "Adapter Binary" });
    const written = writeDirectFigBinary(bundle);

    expect(descriptor).toMatchObject({
      kind: "figma-rest-payload",
      encoding: "binary",
      binary: true,
      compressed: false,
      adapter: "fake-fig-binary",
    });
    expect(descriptor.warnings).toContain("adapter-decoded-direct-fig");
    expect(imported.styles).toHaveLength(doc.styles.length);
    expect(written?.adapterName).toBe("fake-fig-binary");
    expect(Buffer.from(written?.bytes ?? []).toString("utf8")).toBe("FIGBIN");
  });

  it("loads a direct fig binary cli adapter from env", () => {
    const doc = buildTokenFixtureDoc();
    const payload = nullDocToFigmaPayload(doc, { fileName: "CLI Payload" });
    const tempDir = mkdtempSync(join(tmpdir(), "null-direct-fig-"));
    const payloadPath = join(tempDir, "payload.json");
    writeFileSync(payloadPath, JSON.stringify(payload), "utf8");
    process.env.NULL_DIRECT_FIG_ADAPTER_CMD = process.execPath;
    process.env.NULL_DIRECT_FIG_ADAPTER_ARGS = JSON.stringify([join(process.cwd(), "tests/fixtures/direct-fig-adapter.mjs")]);
    process.env.NULL_DIRECT_FIG_ADAPTER_PAYLOAD_PATH = payloadPath;

    try {
      const descriptor = parseDirectFigmaSourceDescriptor(new Uint8Array([0x46, 0x49, 0x47, 0x10]));
      const imported = hydrateDoc(directFigmaSourceToNullDoc(new Uint8Array([0x46, 0x49, 0x47, 0x10])).doc);
      const bundle = nullDocToDirectFigmaBundle(doc, { fileName: "CLI Bundle" });
      const written = writeDirectFigBinary(bundle);

      expect(descriptor).toMatchObject({
        kind: "figma-rest-payload",
        encoding: "binary",
        adapter: "fixture-direct-fig-cli",
      });
      expect(descriptor.warnings).toContain("cli-adapter-decoded-direct-fig");
      expect(imported.styles).toHaveLength(doc.styles.length);
      expect(Buffer.from(written?.bytes ?? []).toString("utf8")).toBe("FIGCLI");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
