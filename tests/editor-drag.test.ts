import { describe, expect, it } from "vitest";

import {
  applyAxisLock,
  buildMovedFrames,
  collectMoveSnapTargets,
  computeDistanceGuideLines,
  computeMovePreview,
  computeResizePreviewFrame,
  computeSmartSnapAdjustment,
  computeSmartSnapFeedback,
} from "@/advanced/ui/AdvancedEditor.drag";

describe("editor drag math", () => {
  it("locks movement to the dominant axis when shift is pressed", () => {
    expect(applyAxisLock(12, 5, true)).toEqual({ moveX: 12, moveY: 0 });
    expect(applyAxisLock(4, 9, true)).toEqual({ moveX: 0, moveY: 9 });
    expect(applyAxisLock(4, 9, false)).toEqual({ moveX: 4, moveY: 9 });
  });

  it("computes smart snap offsets against target lines within threshold", () => {
    const snap = computeSmartSnapAdjustment({
      moving: { x: 10, y: 20, w: 20, h: 10 },
      targetX: [32],
      targetY: [26],
      threshold: 3,
    });

    expect(snap).toEqual({ dx: 2, dy: 1 });
  });

  it("returns smart guide feedback for the snapped axes", () => {
    const snap = computeSmartSnapFeedback({
      moving: { x: 10, y: 20, w: 20, h: 10 },
      targetX: [32],
      targetY: [26],
      threshold: 3,
    });

    expect(snap).toEqual({ dx: 2, dy: 1, guideX: 32, guideY: 26, distances: [] });
  });

  it("returns no smart snap offset when targets are outside threshold", () => {
    const snap = computeSmartSnapAdjustment({
      moving: { x: 10, y: 20, w: 20, h: 10 },
      targetX: [40],
      targetY: [40],
      threshold: 3,
    });

    expect(snap).toEqual({ dx: 0, dy: 0 });
  });

  it("keeps smart guide feedback empty for axes without a valid snap target", () => {
    const snap = computeSmartSnapFeedback({
      moving: { x: 10, y: 20, w: 20, h: 10 },
      targetX: [31],
      targetY: [40],
      threshold: 2,
    });

    expect(snap).toEqual({ dx: 1, dy: 0, guideX: 31, guideY: undefined, distances: [] });
  });

  it("collects move snap targets while skipping the moving and hidden nodes", () => {
    const rects = {
      a: { x: 0, y: 0, w: 100, h: 50 },
      b: { x: 200, y: 10, w: 60, h: 40 },
      c: { x: 300, y: 20, w: 30, h: 30 },
    };

    const targets = collectMoveSnapTargets({
      candidateIds: ["a", "b", "c"],
      movingId: "b",
      resolveRect: (id) => rects[id as keyof typeof rects] ?? null,
      isHidden: (id) => id === "c",
      extraRects: [{ x: 20, y: 30, w: 40, h: 20 }],
    });

    expect(targets).toEqual({
      targetRects: [
        { x: 0, y: 0, w: 100, h: 50 },
        { x: 20, y: 30, w: 40, h: 20 },
      ],
      targetX: [0, 50, 100, 20, 40, 60],
      targetY: [0, 25, 50, 30, 40, 50],
    });
  });

  it("computes sibling and parent distance guides from the moving rect", () => {
    const distances = computeDistanceGuideLines({
      moving: { x: 120, y: 40, w: 60, h: 40 },
      targetRects: [
        { x: 40, y: 48, w: 60, h: 24 },
        { x: 200, y: 32, w: 80, h: 48 },
      ],
      parentRect: { x: 0, y: 0, w: 320, h: 160 },
    });

    expect(distances).toMatchObject([
      { axis: "x", side: "left", source: "sibling", value: 20 },
      { axis: "x", side: "right", source: "sibling", value: 20 },
      { axis: "y", side: "top", source: "parent", value: 40 },
      { axis: "y", side: "bottom", source: "parent", value: 80 },
    ]);
  });

  it("includes distance guides in smart snap feedback after snap adjustments", () => {
    const snap = computeSmartSnapFeedback({
      moving: { x: 10, y: 20, w: 20, h: 10 },
      targetX: [32],
      targetY: [26],
      threshold: 3,
      targetRects: [{ x: 0, y: 18, w: 8, h: 16 }],
      parentRect: { x: 0, y: 0, w: 100, h: 100 },
    });

    expect(snap.dx).toBe(2);
    expect(snap.dy).toBe(1);
    expect(snap.distances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ side: "left", source: "sibling", value: 4 }),
        expect.objectContaining({ side: "right", source: "parent", value: 68 }),
      ]),
    );
  });

  it("builds moved frames from the original drag origins", () => {
    const frames = buildMovedFrames({
      ids: ["a", "b", "missing"],
      origins: {
        a: { x: 10, y: 20, w: 30, h: 40, rotation: 0 },
        b: { x: -5, y: 12, w: 18, h: 24, rotation: 15 },
      },
      delta: { dx: 7, dy: -3 },
    });

    expect(frames).toEqual({
      a: { x: 17, y: 17, w: 30, h: 40, rotation: 0 },
      b: { x: 2, y: 9, w: 18, h: 24, rotation: 15 },
    });
  });

  it("computes move preview delta and frames from the anchor origin", () => {
    const preview = computeMovePreview({
      anchorOrigin: { x: 10, y: 20, w: 30, h: 40, rotation: 0 },
      moveX: 12,
      moveY: -3,
      gridSnap: false,
      snapValue: (value) => value,
      ids: ["a", "b"],
      origins: {
        a: { x: 10, y: 20, w: 30, h: 40, rotation: 0 },
        b: { x: 50, y: 60, w: 20, h: 20, rotation: 0 },
      },
    });

    expect(preview).toEqual({
      delta: { dx: 12, dy: -3 },
      frames: {
        a: { x: 22, y: 17, w: 30, h: 40, rotation: 0 },
        b: { x: 62, y: 57, w: 20, h: 20, rotation: 0 },
      },
    });
  });

  it("returns null move preview when the anchor origin is missing", () => {
    const preview = computeMovePreview({
      anchorOrigin: undefined,
      moveX: 12,
      moveY: -3,
      gridSnap: false,
      snapValue: (value) => value,
      ids: ["a"],
      origins: {
        a: { x: 10, y: 20, w: 30, h: 40, rotation: 0 },
      },
    });

    expect(preview).toBeNull();
  });

  it("computes resize preview from center without mutating rotation", () => {
    const frame = computeResizePreviewFrame({
      origin: { x: 10, y: 20, w: 100, h: 50, rotation: 15 },
      handle: "se",
      dx: 20,
      dy: 10,
      gridSnap: false,
      keepRatio: false,
      fromCenter: true,
      snapValue: (value) => value,
    });

    expect(frame).toEqual({ x: 0, y: 15, w: 120, h: 60, rotation: 15 });
  });

  it("preserves the current ratio behavior for corner resize", () => {
    const frame = computeResizePreviewFrame({
      origin: { x: 10, y: 20, w: 100, h: 50, rotation: 0 },
      handle: "se",
      dx: 20,
      dy: 5,
      gridSnap: false,
      keepRatio: true,
      fromCenter: false,
      snapValue: (value) => value,
    });

    expect(frame).toEqual({ x: 0, y: 15, w: 120, h: 60, rotation: 0 });
  });
});
