import { describe, expect, it } from "vitest";

import { addNode, createDoc, createNode } from "../src/advanced/doc/scene";
import {
  buildOverlayCardStyle,
  buildOverlayShellStyle,
  buildPageTransitionAnimationStyle,
  deriveSmartAnimatePlan,
  normalizeOverlayPresentation,
} from "../src/advanced/prototype/prototypeMotion";

describe("prototype motion", () => {
  it("normalizes overlay presentation and clamps dim", () => {
    const presentation = normalizeOverlayPresentation({
      type: "overlay",
      targetPageId: "page-2",
      position: "bottom-right",
      overlayWidth: 480,
      overlayHeight: 320,
      dim: 2,
    });

    expect(presentation).toEqual({
      position: "bottom-right",
      overlayWidth: 480,
      overlayHeight: 320,
      dim: 0.95,
    });
  });

  it("derives smart animate matches from shared source ids", () => {
    const doc = createDoc();
    const pageA = doc.pages[0]!;
    const pageBId = "page_B";
    doc.pages.push({ id: pageBId, name: "Page B", rootId: pageBId });
    const pageBRoot = createNode("frame", { id: pageBId, name: "Page B", parentId: doc.root, frame: { x: 0, y: 0, w: 400, h: 400, rotation: 0 } });
    doc.nodes[pageBId] = pageBRoot;
    doc.nodes[doc.root].children.push(pageBId);

    const sourceA = createNode("rect", { frame: { x: 40, y: 60, w: 120, h: 80, rotation: 0 }, sourceId: "hero_image" });
    const sourceB = createNode("rect", { frame: { x: 140, y: 120, w: 200, h: 120, rotation: 0 }, sourceId: "hero_image" });
    addNode(doc, sourceA, pageA.rootId);
    addNode(doc, sourceB, pageBId);

    const plan = deriveSmartAnimatePlan(doc, pageA.id, pageBId);

    expect(plan?.matchCount).toBe(1);
    expect(plan?.anchor?.fromNodeId).toBe(sourceA.id);
    expect(plan?.anchor?.toNodeId).toBe(sourceB.id);
    expect(plan?.shiftX).not.toBe(0);
    expect(plan?.scaleX).toBeLessThan(1);
  });

  it("builds smart transition and overlay layout styles", () => {
    const style = buildPageTransitionAnimationStyle(
      "smart",
      "to",
      false,
      300,
      "ease",
      {
        matchCount: 1,
        coverage: 0.5,
        shiftX: 80,
        shiftY: -24,
        scaleX: 0.8,
        scaleY: 1.1,
        anchor: {
          fromNodeId: "a",
          toNodeId: "b",
          fromCenter: { x: 100, y: 100 },
          toCenter: { x: 160, y: 140 },
        },
      },
    );
    const shell = buildOverlayShellStyle({ position: "top-right", dim: 0.2 });
    const card = buildOverlayCardStyle({ position: "center", dim: 0.2, overlayWidth: 520, overlayHeight: 360 });

    expect(style.transition).toContain("transform 300ms ease");
    expect(style.transform).toContain("translate");
    expect(shell.justifyContent).toBe("flex-end");
    expect(shell.alignItems).toBe("flex-start");
    expect(card.width).toBe(520);
    expect(card.height).toBe(360);
  });
});
