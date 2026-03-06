import { describe, it, expect } from "vitest";
import { createDoc, createNode, addNode } from "@/advanced/doc/scene";
import { findLayoutConflicts } from "@/advanced/runtime/layout-conflicts";

describe("layout conflicts", () => {
  it("detects overlap area for siblings", () => {
    const doc = createDoc();
    const rootId = doc.pages[0].rootId;
    const group = createNode("group", { frame: { x: 0, y: 0, w: 300, h: 200, rotation: 0 } });
    addNode(doc, group, rootId);
    const a = createNode("rect", { frame: { x: 0, y: 0, w: 100, h: 100, rotation: 0 } });
    const b = createNode("rect", { frame: { x: 50, y: 50, w: 100, h: 100, rotation: 0 } });
    addNode(doc, a, group.id);
    addNode(doc, b, group.id);

    const conflicts = findLayoutConflicts(doc, a.id);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].id).toBe(b.id);
    expect(conflicts[0].area).toBeGreaterThan(0);
  });
});
