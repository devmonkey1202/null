import { describe, expect, it } from "vitest";

import { addNode, createDoc, createNode } from "../src/advanced/doc/scene";
import { buildMinimapModel, getNextDeepSelectionId, getNodeIdsAtPoint, minimapPointToCanvas, projectRectToMinimap } from "../src/advanced/ui/canvasChrome";

describe("canvas chrome helpers", () => {
  it("builds minimap model from page bounds and selection", () => {
    const doc = createDoc();
    const pageRoot = doc.pages[0].rootId;
    doc.nodes[pageRoot].frame = { x: 0, y: 0, w: 1200, h: 800, rotation: 0 };
    const node = createNode("rect", { frame: { x: 120, y: 80, w: 240, h: 120, rotation: 0 } });
    addNode(doc, node, pageRoot);
    doc.selection = new Set([node.id]);

    const model = buildMinimapModel(doc, pageRoot, { x: 0, y: 0, w: 400, h: 300 }, doc.selection);

    expect(model).not.toBeNull();
    expect(model?.bounds).toMatchObject({ x: 0, y: 0, w: 1200, h: 800 });
    expect(model?.nodes).toHaveLength(1);
    expect(model?.selectionBounds).toMatchObject({ x: 120, y: 80, w: 240, h: 120 });
  });

  it("projects minimap rectangles and maps local pointer back to canvas coordinates", () => {
    const bounds = { x: 0, y: 0, w: 1000, h: 500 };
    const rect = projectRectToMinimap({ x: 100, y: 50, w: 200, h: 100 }, bounds, 200, 120);
    const point = minimapPointToCanvas({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, bounds, 200, 120);

    expect(Math.round(point.x)).toBe(200);
    expect(Math.round(point.y)).toBe(100);
  });

  it("skips hidden and locked nodes when collecting deep selection hits", () => {
    const doc = createDoc();
    const pageRoot = doc.pages[0].rootId;
    const back = createNode("rect", { frame: { x: 0, y: 0, w: 200, h: 200, rotation: 0 } });
    const front = createNode("rect", { frame: { x: 40, y: 40, w: 120, h: 120, rotation: 0 } });
    const hidden = createNode("rect", { frame: { x: 40, y: 40, w: 120, h: 120, rotation: 0 } });
    hidden.hidden = true;
    const locked = createNode("rect", { frame: { x: 40, y: 40, w: 120, h: 120, rotation: 0 } });
    locked.locked = true;
    addNode(doc, back, pageRoot);
    addNode(doc, front, pageRoot);
    addNode(doc, hidden, pageRoot);
    addNode(doc, locked, pageRoot);

    const hits = getNodeIdsAtPoint(doc, pageRoot, { x: 80, y: 80 });

    expect(hits).toEqual([front.id, back.id]);
    expect(getNextDeepSelectionId(hits, front.id)).toBe(back.id);
    expect(getNextDeepSelectionId(hits, back.id)).toBe(front.id);
  });
});
