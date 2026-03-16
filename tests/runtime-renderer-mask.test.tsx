// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { addNode, createDoc, createNode } from "../src/advanced/doc/scene";
import RuntimeRenderer from "../src/advanced/runtime/renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("runtime renderer mask bands", () => {
  it("renders multiple mask bands for ordered mask/content children", async () => {
    const doc = createDoc();
    const frame = createNode("frame", {
      id: "mask_frame",
      name: "Mask Frame",
      frame: { x: 0, y: 0, w: 320, h: 200, rotation: 0 },
    });
    addNode(doc, frame, doc.pages[0]!.rootId);

    const maskA = createNode("rect", {
      id: "mask_a",
      name: "Mask A",
      frame: { x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      isMask: true,
    });
    const fillA = createNode("rect", {
      id: "fill_a",
      name: "Fill A",
      frame: { x: 4, y: 4, w: 96, h: 96, rotation: 0 },
    });
    const maskB = createNode("ellipse", {
      id: "mask_b",
      name: "Mask B",
      frame: { x: 140, y: 0, w: 80, h: 80, rotation: 0 },
      isMask: true,
    });
    const fillB = createNode("rect", {
      id: "fill_b",
      name: "Fill B",
      frame: { x: 148, y: 8, w: 64, h: 64, rotation: 0 },
    });

    addNode(doc, maskA, frame.id);
    addNode(doc, fillA, frame.id);
    addNode(doc, maskB, frame.id);
    addNode(doc, fillB, frame.id);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(<RuntimeRenderer doc={doc} />);
      });

      const svg = container.querySelector("svg");
      expect(svg?.querySelectorAll("mask")).toHaveLength(2);
      expect(svg?.querySelectorAll('g[mask^="url(#rt-mask-"]')).toHaveLength(2);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
