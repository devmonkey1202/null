import { describe, expect, it } from "vitest";
import { createDoc, createNode, addNode } from "../src/advanced/doc/scene";
import { layoutDoc, applyConstraintsOnResize } from "../src/advanced/layout/engine";

describe("L1 Auto layout 엣지 케이스", () => {
  it("자식이 없으면 layoutDoc 오류 없이 동작", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 400, h: 200, rotation: 0 },
      layout: { mode: "auto", dir: "row", gap: 8, padding: { t: 16, r: 16, b: 16, l: 16 }, align: "start", wrap: false },
    });
    addNode(doc, frame, pageId);
    expect(() => layoutDoc(doc)).not.toThrow();
    const laidOut = layoutDoc(doc);
    expect(laidOut.nodes[frame.id].children.length).toBe(0);
  });

  it("auto layout 단일 자식 시 패딩만 반영", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 400, h: 200, rotation: 0 },
      layout: { mode: "auto", dir: "row", gap: 8, padding: { t: 10, r: 20, b: 10, l: 20 }, align: "start", wrap: false },
    });
    addNode(doc, frame, pageId);
    const rect = createNode("rect", { frame: { x: 0, y: 0, w: 50, h: 30, rotation: 0 } });
    addNode(doc, rect, frame.id);
    const laidOut = layoutDoc(doc);
    const child = laidOut.nodes[rect.id];
    expect(child.frame.x).toBe(20);
    expect(child.frame.y).toBe(10);
  });

  it("auto layout row·여러 자식 시 main 방향 배치", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 300, h: 100, rotation: 0 },
      layout: { mode: "auto", dir: "row", gap: 10, padding: { t: 0, r: 0, b: 0, l: 0 }, align: "start", wrap: false },
    });
    addNode(doc, frame, pageId);
    const a = createNode("rect", { frame: { x: 0, y: 0, w: 40, h: 30, rotation: 0 } });
    const b = createNode("rect", { frame: { x: 0, y: 0, w: 50, h: 30, rotation: 0 } });
    addNode(doc, a, frame.id);
    addNode(doc, b, frame.id);
    const laidOut = layoutDoc(doc);
    expect(laidOut.nodes[a.id].frame.x).toBe(0);
    expect(laidOut.nodes[b.id].frame.x).toBe(40 + 10);
  });

  it("minWidth·maxWidth 있으면 clamp 적용", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 200, h: 80, rotation: 0 },
      layout: { mode: "auto", dir: "row", gap: 0, padding: { t: 0, r: 0, b: 0, l: 0 }, align: "start", wrap: false },
    });
    addNode(doc, frame, pageId);
    const rect = createNode("rect", {
      frame: { x: 0, y: 0, w: 500, h: 40, rotation: 0 },
      layoutSizing: { width: "fixed", height: "fixed", minWidth: 60, maxWidth: 100 },
    });
    addNode(doc, rect, frame.id);
    const laidOut = layoutDoc(doc);
    const child = laidOut.nodes[rect.id];
    expect(child.frame.w).toBeLessThanOrEqual(100);
    expect(child.frame.w).toBeGreaterThanOrEqual(60);
  });
});

describe("Q6 레이아웃·렌더 엣지 (clip·overflow·극단값)", () => {
  it("clipContent·overflowScrolling 노드가 있어도 layoutDoc 오류 없이 동작", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 400, h: 200, rotation: 0 },
      clipContent: true,
      overflowScrolling: "vertical",
    });
    addNode(doc, frame, pageId);
    const rect = createNode("rect", { frame: { x: 10, y: 10, w: 100, h: 50, rotation: 0 } });
    addNode(doc, rect, frame.id);
    expect(() => layoutDoc(doc)).not.toThrow();
    const laidOut = layoutDoc(doc);
    expect(laidOut.nodes[frame.id].clipContent).toBe(true);
    expect(laidOut.nodes[frame.id].overflowScrolling).toBe("vertical");
  });

  it("auto layout column + wrap 시 layoutDoc 오류 없이 배치", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 120, h: 116, rotation: 0 },
      layout: { mode: "auto", dir: "column", gap: 8, padding: { t: 8, r: 8, b: 8, l: 8 }, align: "start", wrap: true },
    });
    addNode(doc, frame, pageId);
    const a = createNode("rect", { frame: { x: 0, y: 0, w: 40, h: 50, rotation: 0 } });
    const b = createNode("rect", { frame: { x: 0, y: 0, w: 40, h: 50, rotation: 0 } });
    const c = createNode("rect", { frame: { x: 0, y: 0, w: 40, h: 50, rotation: 0 } });
    addNode(doc, a, frame.id);
    addNode(doc, b, frame.id);
    addNode(doc, c, frame.id);
    expect(() => layoutDoc(doc)).not.toThrow();
    const laidOut = layoutDoc(doc);
    expect(laidOut.nodes[a.id].frame).toBeDefined();
    expect(laidOut.nodes[b.id].frame).toBeDefined();
    expect(laidOut.nodes[c.id].frame).toBeDefined();
  });

  it("극단 패딩·갭(0)이어도 layoutDoc 오류 없음", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 100, h: 50, rotation: 0 },
      layout: { mode: "auto", dir: "row", gap: 0, padding: { t: 0, r: 0, b: 0, l: 0 }, align: "start", wrap: false },
    });
    addNode(doc, frame, pageId);
    const rect = createNode("rect", { frame: { x: 0, y: 0, w: 30, h: 20, rotation: 0 } });
    addNode(doc, rect, frame.id);
    expect(() => layoutDoc(doc)).not.toThrow();
    const laidOut = layoutDoc(doc);
    expect(laidOut.nodes[rect.id].frame.x).toBe(0);
    expect(laidOut.nodes[rect.id].frame.y).toBe(0);
  });
});

describe("L1 auto layout wrap and align", () => {
  it("wraps items to next row when width exceeded", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 120, h: 200, rotation: 0 },
      layout: { mode: "auto", dir: "row", gap: 8, padding: { t: 0, r: 0, b: 0, l: 0 }, align: "start", wrap: true },
    });
    addNode(doc, frame, pageId);
    const a = createNode("rect", { frame: { x: 0, y: 0, w: 60, h: 30, rotation: 0 } });
    const b = createNode("rect", { frame: { x: 0, y: 0, w: 60, h: 30, rotation: 0 } });
    addNode(doc, a, frame.id);
    addNode(doc, b, frame.id);
    const laidOut = layoutDoc(doc);
    const first = laidOut.nodes[a.id].frame;
    const second = laidOut.nodes[b.id].frame;
    expect(second.y).toBeGreaterThan(first.y);
  });

  it("align center positions items on cross axis", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 200, h: 100, rotation: 0 },
      layout: { mode: "auto", dir: "row", gap: 0, padding: { t: 0, r: 0, b: 0, l: 0 }, align: "center", wrap: false },
    });
    addNode(doc, frame, pageId);
    const rect = createNode("rect", { frame: { x: 0, y: 0, w: 40, h: 20, rotation: 0 } });
    addNode(doc, rect, frame.id);
    const laidOut = layoutDoc(doc);
    const y = laidOut.nodes[rect.id].frame.y;
    expect(y).toBe(40);
  });
});

describe("L1 responsive constraints", () => {
  it("respects left+right constraints on resize", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", { frame: { x: 0, y: 0, w: 100, h: 100, rotation: 0 } });
    addNode(doc, frame, pageId);
    const rect = createNode("rect", {
      frame: { x: 10, y: 10, w: 20, h: 20, rotation: 0 },
      constraints: { left: true, right: true },
    });
    addNode(doc, rect, frame.id);
    const next = applyConstraintsOnResize(doc, frame.id, frame.frame, { ...frame.frame, w: 200, h: 100 });
    const updated = next.nodes[rect.id].frame;
    expect(updated.x).toBe(10);
    expect(updated.w).toBe(120);
  });

  it("centers nodes with hCenter/vCenter constraints", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", { frame: { x: 0, y: 0, w: 200, h: 200, rotation: 0 } });
    addNode(doc, frame, pageId);
    const rect = createNode("rect", {
      frame: { x: 70, y: 80, w: 60, h: 40, rotation: 0 },
      constraints: { hCenter: true, vCenter: true },
    });
    addNode(doc, rect, frame.id);
    const next = applyConstraintsOnResize(doc, frame.id, frame.frame, { ...frame.frame, w: 300, h: 300 });
    const updated = next.nodes[rect.id].frame;
    expect(updated.x).toBe(120);
    expect(updated.y).toBe(130);
  });
});
