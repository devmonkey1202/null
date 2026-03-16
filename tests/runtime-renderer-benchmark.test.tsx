// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { addNode, createDoc, createNode } from "@/advanced/doc/scene";
import RuntimeRenderer from "@/advanced/runtime/renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function buildLargeRendererDoc(count: number) {
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

describe("runtime renderer 5k benchmark fixture", () => {
  it("mounts the 5k node canvas prototype path without throwing", async () => {
    const doc = buildLargeRendererDoc(5000);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(<RuntimeRenderer doc={doc} renderMode="auto" preferCanvasStage />);
      });

      const stage = container.querySelector('svg[data-renderer-mode="canvas-prototype"]');
      const canvas = container.querySelector('canvas[data-renderer-mode="canvas-prototype"]');
      expect(stage).toBeTruthy();
      expect(canvas).toBeTruthy();
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
