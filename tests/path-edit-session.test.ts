import { describe, expect, it } from "vitest";

import {
  appendPathAnchorFromPointer,
  applyPathEditDrag,
  cycleSelectedPathAnchor,
  createPathDrawState,
  createPathEditStateFromPathData,
  hitPathSegment,
  hitPathAnchorOrHandle,
  insertPathAnchorAtHit,
  nudgeSelectedPathAnchor,
  removeSelectedPathAnchor,
  selectPathAnchor,
  serializePathEditState,
  setSelectedPathAnchorMode,
  shouldClosePathAtPoint,
  togglePathClosed,
} from "../src/advanced/geom/pathEditSession";

describe("path edit session", () => {
  it("creates a draw session for a new path node", () => {
    const state = createPathDrawState("node_1", { x: 10, y: 20 });

    expect(state).toEqual({
      nodeId: "node_1",
      anchors: [{ x: 10, y: 20 }],
      closed: false,
      source: { kind: "pathData" },
      selectedAnchorIndex: 0,
      addStart: { x: 10, y: 20, attach: "end" },
    });
  });

  it("opens a path edit session from local path data with absolute offset", () => {
    const state = createPathEditStateFromPathData({
      nodeId: "node_2",
      pathData: "M 0 0 L 10 0 L 10 10 Z",
      source: { kind: "segment", index: 0 },
      absoluteOffset: { x: 100, y: 200 },
    });

    expect(state.anchors).toEqual([
      { x: 100, y: 200 },
      { x: 110, y: 200 },
      { x: 110, y: 210 },
    ]);
    expect(state.closed).toBe(true);
    expect(state.source).toEqual({ kind: "segment", index: 0 });
    expect(state.selectedAnchorIndex).toBe(0);
  });

  it("infers smooth points from collinear cubic handles", () => {
    const state = createPathEditStateFromPathData({
      nodeId: "node_curve",
      pathData: "M 0 0 C 10 0 20 0 30 0 C 40 0 50 0 60 0",
      source: { kind: "pathData" },
    });

    expect(state.anchors[1]).toMatchObject({
      handle1X: 20,
      handle1Y: 0,
      handle2X: 40,
      handle2Y: 0,
      isSmooth: true,
    });
  });

  it("hits handles and anchors in the expected order", () => {
    const hit = hitPathAnchorOrHandle(
      { x: 19, y: 20 },
      [{ x: 10, y: 10, handle2X: 20, handle2Y: 20 }],
    );

    expect(hit).toEqual({ kind: "handle2", index: 0 });
  });

  it("mirrors the opposite handle on drag when alt is not pressed", () => {
    const next = applyPathEditDrag({
      state: {
        nodeId: "node_3",
        anchors: [{ x: 0, y: 0, handle1X: -10, handle1Y: 0, handle2X: 10, handle2Y: 0, isSmooth: true }],
        closed: false,
        source: { kind: "pathData" },
      },
      anchorIndex: 0,
      kind: "handle2",
      originAnchors: [{ x: 0, y: 0, handle1X: -10, handle1Y: 0, handle2X: 10, handle2Y: 0 }],
      point: { x: 20, y: 10 },
      start: { x: 10, y: 0 },
      shiftKey: false,
      altKey: false,
    });

    expect(next.anchors[0]).toMatchObject({
      handle2X: 20,
      handle2Y: 10,
      handle1X: -8.94427190999916,
      handle1Y: -4.47213595499958,
    });
  });

  it("keeps the opposite handle independent on corner points", () => {
    const next = applyPathEditDrag({
      state: {
        nodeId: "node_corner",
        anchors: [{ x: 0, y: 0, handle1X: -10, handle1Y: 0, handle2X: 10, handle2Y: 0, isSmooth: false }],
        closed: false,
        source: { kind: "pathData" },
      },
      anchorIndex: 0,
      kind: "handle2",
      originAnchors: [{ x: 0, y: 0, handle1X: -10, handle1Y: 0, handle2X: 10, handle2Y: 0 }],
      point: { x: 20, y: 10 },
      start: { x: 10, y: 0 },
      shiftKey: false,
      altKey: false,
    });

    expect(next.anchors[0]).toMatchObject({
      handle2X: 20,
      handle2Y: 10,
      handle1X: -10,
      handle1Y: 0,
    });
  });

  it("appends a curved anchor on pointer up and serializes the preview path", () => {
    const state = appendPathAnchorFromPointer({
      state: {
        nodeId: "node_4",
        anchors: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
        closed: false,
        source: { kind: "pathData" },
      },
      point: { x: 40, y: 20 },
      start: { x: 20, y: 0 },
      shiftKey: false,
      snapValue: (value) => value,
      snapToGrid: false,
    });

    expect(state.anchors).toHaveLength(3);
    expect(state.selectedAnchorIndex).toBe(2);
    expect(state.anchors[1]?.isSmooth).toBe(true);
    expect(state.anchors[2]?.isSmooth).toBe(true);
    expect(state.anchors[1]).toMatchObject({ handle2X: 26.666666666666664, handle2Y: 6.666666666666666 });
    expect(state.anchors[2]).toMatchObject({ handle1X: 33.333333333333336, handle1Y: 13.333333333333334 });
    expect(serializePathEditState(state)).toContain("C 26.666666666666664 6.666666666666666");
  });

  it("prepends a curved anchor when the selected endpoint is the start anchor", () => {
    const state = appendPathAnchorFromPointer({
      state: {
        nodeId: "node_prepend",
        anchors: [{ x: 20, y: 0 }, { x: 40, y: 0 }],
        closed: false,
        source: { kind: "pathData" },
        selectedAnchorIndex: 0,
        addStart: { x: 20, y: 0, attach: "start" },
      },
      point: { x: 0, y: 20 },
      start: { x: 20, y: 0 },
      shiftKey: false,
      snapValue: (value) => value,
      snapToGrid: false,
    });

    expect(state.selectedAnchorIndex).toBe(0);
    expect(state.anchors).toHaveLength(3);
    expect(state.anchors[0]).toMatchObject({
      x: 0,
      y: 20,
      handle2X: 6.666666666666666,
      handle2Y: 13.333333333333334,
      isSmooth: true,
    });
    expect(state.anchors[1]).toMatchObject({
      x: 20,
      y: 0,
      handle1X: 13.333333333333334,
      handle1Y: 6.666666666666666,
      isSmooth: true,
    });
    expect(serializePathEditState(state)).toContain("C 6.666666666666666 13.333333333333334 13.333333333333334 6.666666666666666 20 0");
  });

  it("recognizes close-path hit near the first anchor", () => {
    const state = createPathEditStateFromPathData({
      nodeId: "node_5",
      pathData: "M 0 0 L 20 0 L 20 20",
      source: { kind: "pathData" },
    });

    expect(shouldClosePathAtPoint(state, { x: 3, y: 4 })).toBe(true);
    expect(shouldClosePathAtPoint(state, { x: 30, y: 30 })).toBe(false);
  });

  it("hits a line segment and returns the projected insertion point", () => {
    const hit = hitPathSegment(
      { x: 12, y: 4 },
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
      ],
      false,
    );

    expect(hit).toMatchObject({
      kind: "segment",
      index: 0,
      x: 12,
      y: 0,
    });
    expect(hit?.t).toBeCloseTo(0.6, 4);
  });

  it("inserts a new anchor into a line segment", () => {
    const inserted = insertPathAnchorAtHit({
      state: createPathEditStateFromPathData({
        nodeId: "node_6",
        pathData: "M 0 0 L 20 0 L 20 20",
        source: { kind: "pathData" },
      }),
      hit: {
        kind: "segment",
        index: 0,
        t: 0.5,
        x: 10,
        y: 0,
      },
    });

    expect(inserted.anchorIndex).toBe(1);
    expect(inserted.state.selectedAnchorIndex).toBe(1);
    expect(inserted.state.anchors).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
    ]);
    expect(serializePathEditState(inserted.state)).toBe("M 0 0 L 10 0 L 20 0 L 20 20");
  });

  it("splits cubic handles when inserting a point on a curved segment", () => {
    const inserted = insertPathAnchorAtHit({
      state: createPathEditStateFromPathData({
        nodeId: "node_7",
        pathData: "M 0 0 C 10 0 20 30 30 30",
        source: { kind: "pathData" },
      }),
      hit: {
        kind: "segment",
        index: 0,
        t: 0.5,
        x: 0,
        y: 0,
      },
    });

    expect(inserted.anchorIndex).toBe(1);
    expect(inserted.state.selectedAnchorIndex).toBe(1);
    expect(inserted.state.anchors[0]).toMatchObject({
      x: 0,
      y: 0,
      handle2X: 5,
      handle2Y: 0,
    });
    expect(inserted.state.anchors[1]).toMatchObject({
      x: 15,
      y: 15,
      handle1X: 10,
      handle1Y: 7.5,
      handle2X: 20,
      handle2Y: 22.5,
      isSmooth: true,
    });
    expect(inserted.state.anchors[2]).toMatchObject({
      x: 30,
      y: 30,
      handle1X: 25,
      handle1Y: 30,
    });
    expect(serializePathEditState(inserted.state)).toContain("C 5 0 10 7.5 15 15");
    expect(serializePathEditState(inserted.state)).toContain("C 20 22.5 25 30 30 30");
  });

  it("cycles selection across anchors", () => {
    const state = createPathEditStateFromPathData({
      nodeId: "node_8",
      pathData: "M 0 0 L 10 0 L 10 10",
      source: { kind: "pathData" },
    });

    expect(cycleSelectedPathAnchor(state, 1).selectedAnchorIndex).toBe(1);
    expect(cycleSelectedPathAnchor(state, -1).selectedAnchorIndex).toBe(2);
  });

  it("nudges the selected anchor and its handles", () => {
    const next = nudgeSelectedPathAnchor(
      selectPathAnchor(
        createPathEditStateFromPathData({
          nodeId: "node_9",
          pathData: "M 0 0 C 10 0 20 10 30 10",
          source: { kind: "pathData" },
        }),
        1,
      ),
      { x: 5, y: -3 },
    );

    expect(next.anchors[1]).toMatchObject({
      x: 35,
      y: 7,
      handle1X: 25,
      handle1Y: 7,
    });
  });

  it("removes the selected anchor and reselects a valid neighbor", () => {
    const next = removeSelectedPathAnchor(
      selectPathAnchor(
        createPathEditStateFromPathData({
          nodeId: "node_10",
          pathData: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
          source: { kind: "pathData" },
        }),
        1,
      ),
    );

    expect(next.anchors).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
    expect(next.closed).toBe(true);
    expect(next.selectedAnchorIndex).toBe(1);
  });

  it("opens the path automatically when deleting below three anchors", () => {
    const next = removeSelectedPathAnchor(
      selectPathAnchor(
        createPathEditStateFromPathData({
          nodeId: "node_11",
          pathData: "M 0 0 L 10 0 L 10 10 Z",
          source: { kind: "pathData" },
        }),
        1,
      ),
    );

    expect(next.anchors).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(next.closed).toBe(false);
    expect(next.selectedAnchorIndex).toBe(1);
  });

  it("toggles path closed state only when enough anchors exist", () => {
    const closed = togglePathClosed(
      createPathEditStateFromPathData({
        nodeId: "node_12",
        pathData: "M 0 0 L 10 0 L 10 10",
        source: { kind: "pathData" },
      }),
    );
    expect(closed.closed).toBe(true);

    const reopened = togglePathClosed(closed);
    expect(reopened.closed).toBe(false);

    const tooShort = togglePathClosed(
      createPathEditStateFromPathData({
        nodeId: "node_13",
        pathData: "M 0 0 L 10 0",
        source: { kind: "pathData" },
      }),
    );
    expect(tooShort.closed).toBe(false);
  });

  it("toggles the selected anchor between smooth and corner", () => {
    const smooth = setSelectedPathAnchorMode(
      selectPathAnchor(
        createPathEditStateFromPathData({
          nodeId: "node_14",
          pathData: "M 0 0 C 10 5 20 10 30 10",
          source: { kind: "pathData" },
        }),
        1,
      ),
      "smooth",
    );

    expect(smooth.anchors[1]).toMatchObject({
      isSmooth: true,
      handle1X: 20,
      handle1Y: 10,
    });

    const corner = setSelectedPathAnchorMode(smooth, "corner");
    expect(corner.anchors[1]?.isSmooth).toBe(false);
    expect(corner.anchors[1]).toMatchObject({
      handle1X: 20,
      handle1Y: 10,
    });
  });
});
