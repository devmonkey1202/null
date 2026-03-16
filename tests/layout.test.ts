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

  it("justify center positions items on the main axis", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 200, h: 100, rotation: 0 },
      layout: {
        mode: "auto",
        dir: "row",
        gap: 0,
        padding: { t: 0, r: 0, b: 0, l: 0 },
        justify: "center",
        align: "start",
        wrap: false,
      },
    });
    addNode(doc, frame, pageId);
    const rect = createNode("rect", { frame: { x: 0, y: 0, w: 40, h: 20, rotation: 0 } });
    addNode(doc, rect, frame.id);
    const laidOut = layoutDoc(doc);
    expect(laidOut.nodes[rect.id].frame.x).toBe(80);
  });

  it("justify space-between spreads items across the main axis", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 200, h: 100, rotation: 0 },
      layout: {
        mode: "auto",
        dir: "row",
        gap: 0,
        padding: { t: 0, r: 0, b: 0, l: 0 },
        justify: "space-between",
        gapMode: "space-between",
        align: "start",
        wrap: false,
      },
    });
    addNode(doc, frame, pageId);
    const a = createNode("rect", { frame: { x: 0, y: 0, w: 40, h: 20, rotation: 0 } });
    const b = createNode("rect", { frame: { x: 0, y: 0, w: 40, h: 20, rotation: 0 } });
    addNode(doc, a, frame.id);
    addNode(doc, b, frame.id);
    const laidOut = layoutDoc(doc);
    expect(laidOut.nodes[a.id].frame.x).toBe(0);
    expect(laidOut.nodes[b.id].frame.x).toBe(160);
  });

  it("respects wrapGap and wrapAlign for wrapped lines", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 100, h: 180, rotation: 0 },
      layout: {
        mode: "auto",
        dir: "row",
        gap: 0,
        padding: { t: 0, r: 0, b: 0, l: 0 },
        align: "start",
        wrap: true,
        wrapGap: 20,
        wrapAlign: "center",
      },
    });
    addNode(doc, frame, pageId);
    const a = createNode("rect", { frame: { x: 0, y: 0, w: 60, h: 30, rotation: 0 } });
    const b = createNode("rect", { frame: { x: 0, y: 0, w: 60, h: 30, rotation: 0 } });
    addNode(doc, a, frame.id);
    addNode(doc, b, frame.id);
    const laidOut = layoutDoc(doc);
    expect(laidOut.nodes[a.id].frame.y).toBe(50);
    expect(laidOut.nodes[b.id].frame.y).toBe(100);
  });

  it("uses clamped fixed widths when placing following items", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 320, h: 120, rotation: 0 },
      layout: {
        mode: "auto",
        dir: "row",
        gap: 0,
        padding: { t: 0, r: 0, b: 0, l: 0 },
        align: "start",
        wrap: false,
      },
    });
    addNode(doc, frame, pageId);
    const wide = createNode("rect", {
      frame: { x: 0, y: 0, w: 500, h: 40, rotation: 0 },
      layoutSizing: { width: "fixed", height: "fixed", maxWidth: 100 },
    });
    const tail = createNode("rect", { frame: { x: 0, y: 0, w: 20, h: 40, rotation: 0 } });
    addNode(doc, wide, frame.id);
    addNode(doc, tail, frame.id);

    const laidOut = layoutDoc(doc);
    expect(laidOut.nodes[wide.id].frame.w).toBe(100);
    expect(laidOut.nodes[tail.id].frame.x).toBe(100);
  });

  it("uses clamped fill widths when placing following items", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 90, h: 120, rotation: 0 },
      layout: {
        mode: "auto",
        dir: "row",
        gap: 0,
        padding: { t: 0, r: 0, b: 0, l: 0 },
        align: "start",
        wrap: false,
      },
    });
    addNode(doc, frame, pageId);
    const fill = createNode("rect", {
      frame: { x: 0, y: 0, w: 20, h: 40, rotation: 0 },
      layoutSizing: { width: "fill", height: "fixed", minWidth: 80 },
    });
    const tail = createNode("rect", { frame: { x: 0, y: 0, w: 20, h: 40, rotation: 0 } });
    addNode(doc, fill, frame.id);
    addNode(doc, tail, frame.id);

    const laidOut = layoutDoc(doc);
    expect(laidOut.nodes[fill.id].frame.w).toBe(80);
    expect(laidOut.nodes[tail.id].frame.x).toBe(80);
  });

  it("updates hug height for wrapped rows", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 100, h: 10, rotation: 0 },
      layout: {
        mode: "auto",
        dir: "row",
        gap: 0,
        padding: { t: 0, r: 0, b: 0, l: 0 },
        align: "start",
        wrap: true,
        wrapGap: 20,
      },
      layoutSizing: { width: "fixed", height: "hug" },
    });
    addNode(doc, frame, pageId);
    const a = createNode("rect", { frame: { x: 0, y: 0, w: 60, h: 30, rotation: 0 } });
    const b = createNode("rect", { frame: { x: 0, y: 0, w: 60, h: 30, rotation: 0 } });
    addNode(doc, a, frame.id);
    addNode(doc, b, frame.id);

    const laidOut = layoutDoc(doc);
    expect(laidOut.nodes[frame.id].frame.h).toBe(80);
    expect(laidOut.nodes[b.id].frame.y).toBe(50);
  });

  it("keeps vertical overflow viewport height fixed while still hugging width", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 40, h: 80, rotation: 0 },
      layout: {
        mode: "auto",
        dir: "column",
        gap: 10,
        padding: { t: 0, r: 0, b: 0, l: 0 },
        align: "start",
        wrap: false,
      },
      layoutSizing: { width: "hug", height: "hug" },
      overflowScrolling: "vertical",
    });
    addNode(doc, frame, pageId);
    const a = createNode("rect", { frame: { x: 0, y: 0, w: 120, h: 50, rotation: 0 } });
    const b = createNode("rect", { frame: { x: 0, y: 0, w: 120, h: 50, rotation: 0 } });
    addNode(doc, a, frame.id);
    addNode(doc, b, frame.id);

    const laidOut = layoutDoc(doc);
    expect(laidOut.nodes[frame.id].frame.w).toBe(120);
    expect(laidOut.nodes[frame.id].frame.h).toBe(80);
    expect(laidOut.nodes[b.id].frame.y).toBe(60);
  });

  it("keeps horizontal overflow viewport width fixed while still hugging height", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 90, h: 20, rotation: 0 },
      layout: {
        mode: "auto",
        dir: "row",
        gap: 10,
        padding: { t: 0, r: 0, b: 0, l: 0 },
        align: "start",
        wrap: false,
      },
      layoutSizing: { width: "hug", height: "hug" },
      overflowScrolling: "horizontal",
    });
    addNode(doc, frame, pageId);
    const a = createNode("rect", { frame: { x: 0, y: 0, w: 60, h: 40, rotation: 0 } });
    const b = createNode("rect", { frame: { x: 0, y: 0, w: 60, h: 40, rotation: 0 } });
    addNode(doc, a, frame.id);
    addNode(doc, b, frame.id);

    const laidOut = layoutDoc(doc);
    expect(laidOut.nodes[frame.id].frame.w).toBe(90);
    expect(laidOut.nodes[frame.id].frame.h).toBe(40);
    expect(laidOut.nodes[b.id].frame.x).toBe(70);
  });

  it("aligns text baselines using text metrics instead of box height ratio", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 300, h: 120, rotation: 0 },
      layout: {
        mode: "auto",
        dir: "row",
        gap: 10,
        padding: { t: 0, r: 0, b: 0, l: 0 },
        align: "baseline",
        wrap: false,
      },
    });
    addNode(doc, frame, pageId);
    const small = createNode("text", {
      frame: { x: 0, y: 0, w: 80, h: 24, rotation: 0 },
      text: {
        value: "Small",
        style: {
          fontFamily: "Inter, sans-serif",
          fontSize: 20,
          fontWeight: 400,
          lineHeight: 1,
          letterSpacing: 0,
          align: "left",
        },
        wrap: false,
        autoSize: false,
      },
    });
    const large = createNode("text", {
      frame: { x: 0, y: 0, w: 120, h: 48, rotation: 0 },
      text: {
        value: "Large",
        style: {
          fontFamily: "Inter, sans-serif",
          fontSize: 40,
          fontWeight: 400,
          lineHeight: 1,
          letterSpacing: 0,
          align: "left",
        },
        wrap: false,
        autoSize: false,
      },
    });
    addNode(doc, small, frame.id);
    addNode(doc, large, frame.id);

    const laidOut = layoutDoc(doc);
    const smallFrame = laidOut.nodes[small.id].frame;
    const largeFrame = laidOut.nodes[large.id].frame;
    expect(smallFrame.y + 16).toBe(largeFrame.y + 32);
    expect(smallFrame.y).toBe(16);
    expect(largeFrame.y).toBe(0);
  });

  it("keeps auto-layout placement parity across frame, section, and component containers", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const types = ["frame", "section", "component"] as const;
    const containerIds = types.map((type, index) => {
      const container = createNode(type, {
        frame: { x: index * 240, y: 0, w: 200, h: 120, rotation: 0 },
        layout: { mode: "auto", dir: "row", gap: 8, padding: { t: 10, r: 20, b: 10, l: 20 }, align: "center", wrap: false },
      });
      addNode(doc, container, pageId);
      const child = createNode("rect", { frame: { x: 0, y: 0, w: 40, h: 20, rotation: 0 } });
      addNode(doc, child, container.id);
      return { containerId: container.id, childId: child.id };
    });

    const laidOut = layoutDoc(doc);
    const frames = containerIds.map(({ childId }) => laidOut.nodes[childId].frame);
    expect(frames[0]).toMatchObject({ x: 20, y: 50 });
    expect(frames[1]).toMatchObject({ x: 20, y: 50 });
    expect(frames[2]).toMatchObject({ x: 20, y: 50 });
  });

  it("ignores absolute-positioned children in auto-layout flow and hug sizing", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 10, h: 80, rotation: 0 },
      layout: { mode: "auto", dir: "row", gap: 10, padding: { t: 0, r: 0, b: 0, l: 0 }, align: "start", wrap: false },
      layoutSizing: { width: "hug", height: "fixed" },
    });
    addNode(doc, frame, pageId);

    const first = createNode("rect", { frame: { x: 0, y: 0, w: 40, h: 20, rotation: 0 } });
    const floating = createNode("rect", {
      frame: { x: 120, y: 12, w: 80, h: 40, rotation: 0 },
      layoutPositioning: "absolute",
    });
    const second = createNode("rect", { frame: { x: 0, y: 0, w: 50, h: 20, rotation: 0 } });
    addNode(doc, first, frame.id);
    addNode(doc, floating, frame.id);
    addNode(doc, second, frame.id);

    const laidOut = layoutDoc(doc);
    expect(laidOut.nodes[first.id].frame.x).toBe(0);
    expect(laidOut.nodes[second.id].frame.x).toBe(50);
    expect(laidOut.nodes[floating.id].frame).toMatchObject({ x: 120, y: 12, w: 80, h: 40 });
    expect(laidOut.nodes[frame.id].frame.w).toBe(100);
  });

  it("places grid children into cells, applies spans, and auto-grows rows for overflow", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 300, h: 10, rotation: 0 },
      layout: {
        mode: "grid",
        columns: 2,
        rows: 1,
        columnGap: 10,
        rowGap: 12,
        padding: { t: 8, r: 8, b: 8, l: 8 },
        columnsSizing: [{ type: "fixed", value: 100 }, { type: "fixed", value: 80 }],
        rowsSizing: [{ type: "fixed", value: 40 }],
      },
      layoutSizing: { width: "fixed", height: "hug" },
    });
    addNode(doc, frame, pageId);

    const centered = createNode("rect", {
      frame: { x: 0, y: 0, w: 20, h: 10, rotation: 0 },
      gridChild: { row: 0, column: 0, rowSpan: 1, columnSpan: 1, horizontalAlign: "center", verticalAlign: "end" },
    });
    const spanning = createNode("rect", {
      frame: { x: 0, y: 0, w: 30, h: 20, rotation: 0 },
      gridChild: { row: 1, column: 0, rowSpan: 1, columnSpan: 2, horizontalAlign: "auto", verticalAlign: "auto" },
      layoutSizing: { width: "fill", height: "fill" },
    });
    const autoPlaced = createNode("rect", {
      frame: { x: 0, y: 0, w: 30, h: 20, rotation: 0 },
    });
    addNode(doc, centered, frame.id);
    addNode(doc, spanning, frame.id);
    addNode(doc, autoPlaced, frame.id);

    const laidOut = layoutDoc(doc);
    const laidOutFrame = laidOut.nodes[frame.id];
    const centeredFrame = laidOut.nodes[centered.id].frame;
    const spanningFrame = laidOut.nodes[spanning.id].frame;
    const autoPlacedFrame = laidOut.nodes[autoPlaced.id].frame;

    expect(centeredFrame).toMatchObject({ x: 48, y: 38, w: 20, h: 10 });
    expect(autoPlacedFrame).toMatchObject({ x: 118, y: 8, w: 30, h: 20 });
    expect(spanningFrame).toMatchObject({ x: 8, y: 60, w: 205, h: 20 });
    expect(laidOutFrame.layout).toMatchObject({ mode: "grid", rows: 2 });
    expect(laidOutFrame.frame.h).toBe(88);
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

  it("keeps constraints editable for absolute children inside auto-layout parents", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 200, h: 100, rotation: 0 },
      layout: { mode: "auto", dir: "row", gap: 10, padding: { t: 0, r: 0, b: 0, l: 0 }, align: "start", wrap: false },
    });
    addNode(doc, frame, pageId);
    const flowChild = createNode("rect", {
      frame: { x: 0, y: 0, w: 40, h: 20, rotation: 0 },
      constraints: { right: true },
    });
    const floating = createNode("rect", {
      frame: { x: 130, y: 10, w: 40, h: 20, rotation: 0 },
      layoutPositioning: "absolute",
      constraints: { right: true, top: true },
    });
    addNode(doc, flowChild, frame.id);
    addNode(doc, floating, frame.id);

    const next = applyConstraintsOnResize(doc, frame.id, frame.frame, { ...frame.frame, w: 260, h: 100 });
    expect(next.nodes[flowChild.id].frame.x).toBe(0);
    expect(next.nodes[floating.id].frame.x).toBe(190);
  });

  it("resolves stretch layout guides before full-frame constraints", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 400, h: 200, rotation: 0 },
      layoutGrid: [
        { type: "columns", count: 2, gutter: 20, offset: 20, alignment: "stretch" },
      ],
    });
    addNode(doc, frame, pageId);
    const rect = createNode("rect", {
      frame: { x: 40, y: 20, w: 80, h: 40, rotation: 0 },
      constraints: { left: true, right: true },
    });
    addNode(doc, rect, frame.id);

    const next = applyConstraintsOnResize(doc, frame.id, frame.frame, { ...frame.frame, w: 600, h: 200 });
    expect(next.nodes[rect.id].frame).toMatchObject({ x: 40, w: 180 });
  });

  it("ignores fixed layout guides when resolving constraints", () => {
    const doc = createDoc();
    const pageId = doc.pages[0].rootId;
    const frame = createNode("frame", {
      frame: { x: 0, y: 0, w: 400, h: 200, rotation: 0 },
      layoutGrid: [
        { type: "columns", count: 2, width: 100, gutter: 20, offset: 20, alignment: "start" },
      ],
    });
    addNode(doc, frame, pageId);
    const rect = createNode("rect", {
      frame: { x: 40, y: 20, w: 80, h: 40, rotation: 0 },
      constraints: { left: true, right: true },
    });
    addNode(doc, rect, frame.id);

    const next = applyConstraintsOnResize(doc, frame.id, frame.frame, { ...frame.frame, w: 600, h: 200 });
    expect(next.nodes[rect.id].frame).toMatchObject({ x: 40, w: 280 });
  });
});
