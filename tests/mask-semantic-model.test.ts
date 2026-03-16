import { describe, expect, it } from "vitest";

import { addNode, createDoc, createNode } from "../src/advanced/doc/scene";
import { buildMaskSemanticEntries } from "../src/advanced/geom/maskSemanticModel";

describe("mask semantic model", () => {
  it("builds independent mask bands in child order", () => {
    const doc = createDoc();
    const frame = createNode("frame", {
      id: "mask_frame",
      frame: { x: 0, y: 0, w: 320, h: 180, rotation: 0 },
    });
    addNode(doc, frame, doc.pages[0]!.rootId);
    const maskA = createNode("rect", { id: "mask_a", frame: { x: 0, y: 0, w: 100, h: 100, rotation: 0 }, isMask: true });
    const fillA = createNode("rect", { id: "fill_a", frame: { x: 8, y: 8, w: 96, h: 96, rotation: 0 } });
    const free = createNode("rect", { id: "free", frame: { x: 120, y: 0, w: 40, h: 40, rotation: 0 } });
    const maskB = createNode("ellipse", { id: "mask_b", frame: { x: 180, y: 0, w: 80, h: 80, rotation: 0 }, isMask: true });
    const fillB1 = createNode("rect", { id: "fill_b1", frame: { x: 188, y: 12, w: 64, h: 24, rotation: 0 } });
    const fillB2 = createNode("rect", { id: "fill_b2", frame: { x: 188, y: 44, w: 64, h: 24, rotation: 0 } });

    addNode(doc, maskA, frame.id);
    addNode(doc, fillA, frame.id);
    addNode(doc, free, frame.id);
    addNode(doc, maskB, frame.id);
    addNode(doc, fillB1, frame.id);
    addNode(doc, fillB2, frame.id);

    expect(buildMaskSemanticEntries(doc, frame.children)).toEqual([
      { kind: "mask-band", maskId: "mask_a", targetIds: ["fill_a", "free"] },
      { kind: "mask-band", maskId: "mask_b", targetIds: ["fill_b1", "fill_b2"] },
    ]);
  });

  it("renders orphan masks as regular nodes", () => {
    const doc = createDoc();
    const frame = createNode("frame", {
      id: "mask_frame",
      frame: { x: 0, y: 0, w: 200, h: 120, rotation: 0 },
    });
    addNode(doc, frame, doc.pages[0]!.rootId);
    const mask = createNode("rect", { id: "orphan_mask", frame: { x: 0, y: 0, w: 80, h: 80, rotation: 0 }, isMask: true });
    const content = createNode("rect", { id: "content", frame: { x: 96, y: 0, w: 80, h: 80, rotation: 0 } });

    addNode(doc, mask, frame.id);
    addNode(doc, content, frame.id);

    expect(buildMaskSemanticEntries(doc, [mask.id])).toEqual([{ kind: "node", nodeId: mask.id }]);
    expect(buildMaskSemanticEntries(doc, [content.id, mask.id])).toEqual([
      { kind: "node", nodeId: content.id },
      { kind: "node", nodeId: mask.id },
    ]);
  });
});
