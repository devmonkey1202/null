import { describe, expect, it } from "vitest";

import { addNode, createDoc, createNode } from "@/advanced/doc/scene";
import { buildRuntimeSceneGraph, pickRuntimeRendererMode } from "@/advanced/runtime/sceneGraph";

function buildRectDoc(count: number) {
  const doc = createDoc();
  const rootId = doc.pages[0].rootId;
  for (let index = 0; index < count; index += 1) {
    const node = createNode("rect", {
      frame: {
        x: (index % 100) * 18,
        y: Math.floor(index / 100) * 18,
        w: 16,
        h: 16,
        rotation: 0,
      },
    });
    addNode(doc, node, rootId);
  }
  return doc;
}

describe("runtime scene graph render mode", () => {
  it("keeps svg mode for small docs by default", () => {
    const scene = buildRuntimeSceneGraph(buildRectDoc(32));
    expect(scene.nodeCount).toBeGreaterThanOrEqual(32);
    expect(pickRuntimeRendererMode(scene)).toEqual({ mode: "svg", reason: "svg-default" });
  });

  it("selects canvas prototype for large simple docs when preferred", () => {
    const scene = buildRuntimeSceneGraph(buildRectDoc(5000));
    const decision = pickRuntimeRendererMode(scene, { preferCanvasStage: true });
    expect(scene.nodeCount).toBeGreaterThanOrEqual(5000);
    expect(decision).toEqual({ mode: "canvas-prototype", reason: "canvas-large-doc" });
  });

  it("falls back to svg for interactive docs even above the threshold", () => {
    const scene = buildRuntimeSceneGraph(buildRectDoc(5000));
    const decision = pickRuntimeRendererMode(scene, { preferCanvasStage: true, interactive: true });
    expect(decision).toEqual({ mode: "svg", reason: "interactive-fallback" });
  });

  it("falls back to svg when unsupported widget nodes are present", () => {
    const doc = buildRectDoc(5000);
    const rootId = doc.pages[0].rootId;
    const widgetNode = createNode("frame", {
      frame: { x: 0, y: 0, w: 120, h: 80, rotation: 0 },
    });
    widgetNode.widget = {
      kind: "sandbox",
      html: "<div>Widget</div>",
    };
    addNode(doc, widgetNode, rootId);

    const scene = buildRuntimeSceneGraph(doc);
    const decision = pickRuntimeRendererMode(scene, { preferCanvasStage: true });

    expect(scene.unsupportedCanvasNodeIds).toContain(widgetNode.id);
    expect(decision).toEqual({ mode: "svg", reason: "unsupported-node-fallback" });
  });
});
