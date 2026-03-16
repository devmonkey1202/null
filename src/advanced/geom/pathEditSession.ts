import type { EditablePathSource } from "./pathEditShape";
import { anchorsToPathData, pathDataToAnchors, snapDirection45, type PathAnchor } from "./pathData";

export type PathEditState = {
  nodeId: string;
  anchors: PathAnchor[];
  closed: boolean;
  source: EditablePathSource;
  selectedAnchorIndex?: number;
  addStart?: { x: number; y: number; attach: "start" | "end" };
};

export type PathEditPointHit = { kind: "anchor" | "handle1" | "handle2"; index: number };

export type PathEditSegmentHit = {
  kind: "segment";
  index: number;
  t: number;
  x: number;
  y: number;
};

export type PathEditHit = PathEditPointHit | PathEditSegmentHit;

export type PathEditOriginAnchor = {
  x: number;
  y: number;
  handle1X?: number;
  handle1Y?: number;
  handle2X?: number;
  handle2Y?: number;
};

const PATH_HIT_RADIUS = 10;
const PATH_HANDLE_RADIUS = 8;
const PATH_SEGMENT_HIT_RADIUS = 10;

type XY = { x: number; y: number };

export function serializePathEditState(state: Pick<PathEditState, "anchors" | "closed">): string {
  return anchorsToPathData(state.anchors, state.closed);
}

export function shouldClosePathAtPoint(state: PathEditState, point: { x: number; y: number }): boolean {
  if (state.anchors.length < 2 || state.closed) return false;
  const first = state.anchors[0];
  if (!first) return false;
  return Math.hypot(point.x - first.x, point.y - first.y) <= PATH_HIT_RADIUS;
}

export function hitPathAnchorOrHandle(point: { x: number; y: number }, anchors: PathAnchor[]): PathEditPointHit | null {
  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];
    if (Math.hypot(point.x - anchor.x, point.y - anchor.y) <= PATH_HIT_RADIUS) return { kind: "anchor", index };
    if (anchor.handle1X != null && anchor.handle1Y != null) {
      if (Math.hypot(point.x - anchor.handle1X, point.y - anchor.handle1Y) <= PATH_HANDLE_RADIUS) {
        return { kind: "handle1", index };
      }
    }
    if (anchor.handle2X != null && anchor.handle2Y != null) {
      if (Math.hypot(point.x - anchor.handle2X, point.y - anchor.handle2Y) <= PATH_HANDLE_RADIUS) {
        return { kind: "handle2", index };
      }
    }
  }
  return null;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function lerpPoint(start: XY, end: XY, t: number): XY {
  return {
    x: lerp(start.x, end.x, t),
    y: lerp(start.y, end.y, t),
  };
}

function getPathSegmentIndices(anchors: PathAnchor[], closed: boolean): Array<{ index: number; nextIndex: number }> {
  if (anchors.length < 2) return [];
  const pairs = anchors.slice(0, -1).map((_, index) => ({ index, nextIndex: index + 1 }));
  if (closed) pairs.push({ index: anchors.length - 1, nextIndex: 0 });
  return pairs;
}

function getLineProjection(point: XY, start: XY, end: XY): { t: number; point: XY; distance: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  const rawT = lengthSq > 1e-6 ? ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq : 0;
  const t = clamp01(rawT);
  const projected = {
    x: start.x + dx * t,
    y: start.y + dy * t,
  };
  return {
    t,
    point: projected,
    distance: Math.hypot(point.x - projected.x, point.y - projected.y),
  };
}

function cubicPointAt(p0: XY, p1: XY, p2: XY, p3: XY, t: number): XY {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: p0.x * mt2 * mt + 3 * p1.x * mt2 * t + 3 * p2.x * mt * t2 + p3.x * t2 * t,
    y: p0.y * mt2 * mt + 3 * p1.y * mt2 * t + 3 * p2.y * mt * t2 + p3.y * t2 * t,
  };
}

function getCubicProjection(point: XY, p0: XY, p1: XY, p2: XY, p3: XY): { t: number; point: XY; distance: number } {
  let bestT = 0;
  let bestPoint = p0;
  let bestDistance = Number.POSITIVE_INFINITY;
  const samples = 24;

  for (let step = 0; step <= samples; step += 1) {
    const t = step / samples;
    const candidate = cubicPointAt(p0, p1, p2, p3, t);
    const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
    if (distance < bestDistance) {
      bestT = t;
      bestPoint = candidate;
      bestDistance = distance;
    }
  }

  let range = 1 / samples;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    let localBestT = bestT;
    let localBestPoint = bestPoint;
    let localBestDistance = bestDistance;
    const start = Math.max(0, bestT - range);
    const end = Math.min(1, bestT + range);
    for (let step = 0; step <= 8; step += 1) {
      const t = lerp(start, end, step / 8);
      const candidate = cubicPointAt(p0, p1, p2, p3, t);
      const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
      if (distance < localBestDistance) {
        localBestT = t;
        localBestPoint = candidate;
        localBestDistance = distance;
      }
    }
    bestT = localBestT;
    bestPoint = localBestPoint;
    bestDistance = localBestDistance;
    range /= 2;
  }

  return {
    t: bestT,
    point: bestPoint,
    distance: bestDistance,
  };
}

function splitCubicAt(p0: XY, p1: XY, p2: XY, p3: XY, t: number) {
  const p01 = lerpPoint(p0, p1, t);
  const p12 = lerpPoint(p1, p2, t);
  const p23 = lerpPoint(p2, p3, t);
  const p012 = lerpPoint(p01, p12, t);
  const p123 = lerpPoint(p12, p23, t);
  const p0123 = lerpPoint(p012, p123, t);
  return {
    leftHandle: p01,
    insertedHandleIn: p012,
    insertedPoint: p0123,
    insertedHandleOut: p123,
    rightHandle: p23,
  };
}

function normalizeDirection(dx: number, dy: number): XY | null {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  return { x: dx / len, y: dy / len };
}

function normalizeSmoothAnchor(anchor: PathAnchor): PathAnchor {
  const nextAnchor: PathAnchor = { ...anchor, isSmooth: true };
  const hasIn = nextAnchor.handle1X != null && nextAnchor.handle1Y != null;
  const hasOut = nextAnchor.handle2X != null && nextAnchor.handle2Y != null;
  if (!hasIn || !hasOut) return nextAnchor;

  const inLen = Math.hypot(nextAnchor.handle1X! - nextAnchor.x, nextAnchor.handle1Y! - nextAnchor.y);
  const outLen = Math.hypot(nextAnchor.handle2X! - nextAnchor.x, nextAnchor.handle2Y! - nextAnchor.y);
  const dir =
    normalizeDirection(nextAnchor.handle2X! - nextAnchor.x, nextAnchor.handle2Y! - nextAnchor.y) ??
    normalizeDirection(nextAnchor.x - nextAnchor.handle1X!, nextAnchor.y - nextAnchor.handle1Y!);
  if (!dir) return nextAnchor;

  nextAnchor.handle2X = nextAnchor.x + dir.x * outLen;
  nextAnchor.handle2Y = nextAnchor.y + dir.y * outLen;
  nextAnchor.handle1X = nextAnchor.x - dir.x * inLen;
  nextAnchor.handle1Y = nextAnchor.y - dir.y * inLen;
  return nextAnchor;
}

export function hitPathSegment(point: { x: number; y: number }, anchors: PathAnchor[], closed: boolean): PathEditSegmentHit | null {
  let winner: PathEditSegmentHit | null = null;
  let winnerDistance = Number.POSITIVE_INFINITY;

  for (const { index, nextIndex } of getPathSegmentIndices(anchors, closed)) {
    const start = anchors[index];
    const end = anchors[nextIndex];
    if (!start || !end) continue;

    const hasCurve =
      start.handle2X != null &&
      start.handle2Y != null &&
      end.handle1X != null &&
      end.handle1Y != null;

    const projection = hasCurve
      ? getCubicProjection(
          point,
          { x: start.x, y: start.y },
          { x: start.handle2X!, y: start.handle2Y! },
          { x: end.handle1X!, y: end.handle1Y! },
          { x: end.x, y: end.y },
        )
      : getLineProjection(point, { x: start.x, y: start.y }, { x: end.x, y: end.y });

    if (projection.distance > PATH_SEGMENT_HIT_RADIUS || projection.distance >= winnerDistance) continue;
    winnerDistance = projection.distance;
    winner = {
      kind: "segment",
      index,
      t: projection.t,
      x: projection.point.x,
      y: projection.point.y,
    };
  }

  return winner;
}

export function createPathDrawState(nodeId: string, point: { x: number; y: number }): PathEditState {
  return {
    nodeId,
    anchors: [{ x: point.x, y: point.y }],
    closed: false,
    source: { kind: "pathData" },
    selectedAnchorIndex: 0,
    addStart: { x: point.x, y: point.y, attach: "end" },
  };
}

export function createPathEditStateFromPathData(options: {
  nodeId: string;
  pathData: string;
  source: EditablePathSource;
  absoluteOffset?: { x: number; y: number };
}): PathEditState {
  const { anchors, closed } = pathDataToAnchors(options.pathData);
  const offset = options.absoluteOffset;
  const absoluteAnchors = offset
    ? anchors.map((anchor) => ({
        ...anchor,
        x: anchor.x + offset.x,
        y: anchor.y + offset.y,
        handle1X: anchor.handle1X != null ? anchor.handle1X + offset.x : undefined,
        handle1Y: anchor.handle1Y != null ? anchor.handle1Y + offset.y : undefined,
        handle2X: anchor.handle2X != null ? anchor.handle2X + offset.x : undefined,
        handle2Y: anchor.handle2Y != null ? anchor.handle2Y + offset.y : undefined,
      }))
    : anchors;
  return {
    nodeId: options.nodeId,
    anchors: absoluteAnchors,
    closed,
    source: options.source,
    selectedAnchorIndex: absoluteAnchors.length ? 0 : undefined,
  };
}

export function applyPathEditDrag(options: {
  state: PathEditState;
  anchorIndex: number;
  kind: PathEditHit["kind"];
  originAnchors: PathEditOriginAnchor[];
  point: { x: number; y: number };
  start: { x: number; y: number };
  shiftKey: boolean;
  altKey: boolean;
}): PathEditState {
  const { state, anchorIndex, kind, originAnchors, point, start, shiftKey, altKey } = options;
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  const origin = originAnchors[anchorIndex];
  if (!origin) return state;

  const anchors = state.anchors.map((anchor, index) => {
    if (index !== anchorIndex) return anchor;
    const nextAnchor: PathAnchor = { ...anchor };
    if (kind === "anchor") {
      nextAnchor.x = origin.x + dx;
      nextAnchor.y = origin.y + dy;
      if (origin.handle1X != null) nextAnchor.handle1X = origin.handle1X + dx;
      if (origin.handle1Y != null) nextAnchor.handle1Y = origin.handle1Y + dy;
      if (origin.handle2X != null) nextAnchor.handle2X = origin.handle2X + dx;
      if (origin.handle2Y != null) nextAnchor.handle2Y = origin.handle2Y + dy;
      return nextAnchor;
    }

    if (kind === "handle1" && origin.handle1X != null && origin.handle1Y != null) {
      let hx = origin.handle1X + dx;
      let hy = origin.handle1Y + dy;
      if (shiftKey) {
        const dir = snapDirection45(hx - origin.x, hy - origin.y);
        const len = Math.hypot(hx - origin.x, hy - origin.y);
        hx = origin.x + dir.x * len;
        hy = origin.y + dir.y * len;
      }
      if (altKey) {
        nextAnchor.handle1X = hx;
        nextAnchor.handle1Y = hy;
      } else if (origin.handle2X != null && origin.handle2Y != null && nextAnchor.isSmooth) {
        const d1x = hx - origin.x;
        const d1y = hy - origin.y;
        const len = Math.hypot(d1x, d1y) || 1;
        const oppositeLen = Math.hypot(origin.handle2X - origin.x, origin.handle2Y - origin.y) || len;
        nextAnchor.handle1X = hx;
        nextAnchor.handle1Y = hy;
        nextAnchor.handle2X = origin.x - (d1x / len) * oppositeLen;
        nextAnchor.handle2Y = origin.y - (d1y / len) * oppositeLen;
      } else {
        nextAnchor.handle1X = hx;
        nextAnchor.handle1Y = hy;
      }
      return nextAnchor;
    }

    if (kind === "handle2" && origin.handle2X != null && origin.handle2Y != null) {
      let hx = origin.handle2X + dx;
      let hy = origin.handle2Y + dy;
      if (shiftKey) {
        const dir = snapDirection45(hx - origin.x, hy - origin.y);
        const len = Math.hypot(hx - origin.x, hy - origin.y);
        hx = origin.x + dir.x * len;
        hy = origin.y + dir.y * len;
      }
      if (altKey) {
        nextAnchor.handle2X = hx;
        nextAnchor.handle2Y = hy;
      } else if (origin.handle1X != null && origin.handle1Y != null && nextAnchor.isSmooth) {
        const d2x = hx - origin.x;
        const d2y = hy - origin.y;
        const len = Math.hypot(d2x, d2y) || 1;
        const oppositeLen = Math.hypot(origin.handle1X - origin.x, origin.handle1Y - origin.y) || len;
        nextAnchor.handle2X = hx;
        nextAnchor.handle2Y = hy;
        nextAnchor.handle1X = origin.x - (d2x / len) * oppositeLen;
        nextAnchor.handle1Y = origin.y - (d2y / len) * oppositeLen;
      } else {
        nextAnchor.handle2X = hx;
        nextAnchor.handle2Y = hy;
      }
      return nextAnchor;
    }

    return nextAnchor;
  });

  return { ...state, anchors, selectedAnchorIndex: anchorIndex };
}

export function insertPathAnchorAtHit(options: {
  state: PathEditState;
  hit: PathEditSegmentHit;
}): { state: PathEditState; anchorIndex: number } {
  const { state, hit } = options;
  const anchors = state.anchors.map((anchor) => ({ ...anchor }));
  const fromIndex = hit.index;
  const toIndex = fromIndex === anchors.length - 1 ? 0 : fromIndex + 1;
  const insertionIndex = toIndex === 0 ? anchors.length : toIndex;
  const from = anchors[fromIndex];
  const to = anchors[toIndex];

  if (!from || !to) {
    return { state, anchorIndex: Math.max(0, Math.min(fromIndex + 1, anchors.length - 1)) };
  }

  const hasCurve =
    from.handle2X != null &&
    from.handle2Y != null &&
    to.handle1X != null &&
    to.handle1Y != null;

  let inserted: PathAnchor;
  if (hasCurve) {
    const split = splitCubicAt(
      { x: from.x, y: from.y },
      { x: from.handle2X!, y: from.handle2Y! },
      { x: to.handle1X!, y: to.handle1Y! },
      { x: to.x, y: to.y },
      clamp01(hit.t),
    );
    anchors[fromIndex] = {
      ...from,
      handle2X: split.leftHandle.x,
      handle2Y: split.leftHandle.y,
    };
    anchors[toIndex] = {
      ...to,
      handle1X: split.rightHandle.x,
      handle1Y: split.rightHandle.y,
    };
    inserted = {
      x: split.insertedPoint.x,
      y: split.insertedPoint.y,
      handle1X: split.insertedHandleIn.x,
      handle1Y: split.insertedHandleIn.y,
      handle2X: split.insertedHandleOut.x,
      handle2Y: split.insertedHandleOut.y,
      isSmooth: true,
    };
  } else {
    inserted = {
      x: hit.x,
      y: hit.y,
    };
  }

  anchors.splice(insertionIndex, 0, inserted);
  return {
    state: {
      ...state,
      anchors,
      selectedAnchorIndex: insertionIndex,
    },
    anchorIndex: insertionIndex,
  };
}

export function appendPathAnchorFromPointer(options: {
  state: PathEditState;
  point: { x: number; y: number };
  start: { x: number; y: number };
  shiftKey: boolean;
  snapValue: (value: number, enabled: boolean, axis?: "x" | "y") => number;
  snapToGrid: boolean;
}): PathEditState {
  const { state, point, start, shiftKey, snapValue, snapToGrid } = options;
  if (state.anchors.length === 0) return state;
  const attach = state.addStart?.attach ?? "end";

  let x = snapValue(point.x, snapToGrid, "x");
  let y = snapValue(point.y, snapToGrid, "y");
  if (shiftKey) {
    const pivot = attach === "start" ? state.anchors[0] : state.anchors[state.anchors.length - 1];
    const dx = point.x - pivot.x;
    const dy = point.y - pivot.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      const dir = snapDirection45(dx, dy);
      const snappedLen = Math.max(len, 1);
      x = pivot.x + dir.x * snappedLen;
      y = pivot.y + dir.y * snappedLen;
    }
  }

  const dist = Math.hypot(point.x - start.x, point.y - start.y);
  const isCurve = dist > 6;
  const newAnchor: PathAnchor = { x, y };

  if (attach === "start") {
    const newAnchors = state.anchors.slice(1);
    const first = { ...state.anchors[0] };
    if (isCurve) {
      const dx = first.x - x;
      const dy = first.y - y;
      const k = 1 / 3;
      newAnchor.handle2X = x + dx * k;
      newAnchor.handle2Y = y + dy * k;
      newAnchor.isSmooth = true;
      first.handle1X = first.x - dx * k;
      first.handle1Y = first.y - dy * k;
      first.isSmooth = true;
    }
    newAnchors.unshift(first);
    newAnchors.unshift(newAnchor);
    return { ...state, anchors: newAnchors, selectedAnchorIndex: 0, addStart: undefined };
  }

  const newAnchors = state.anchors.slice(0, -1);
  const last = { ...state.anchors[state.anchors.length - 1] };
  if (isCurve) {
    const dx = x - last.x;
    const dy = y - last.y;
    const k = 1 / 3;
    last.handle2X = last.x + dx * k;
    last.handle2Y = last.y + dy * k;
    last.isSmooth = true;
    newAnchor.handle1X = x - dx * k;
    newAnchor.handle1Y = y - dy * k;
    newAnchor.isSmooth = true;
  }
  newAnchors.push(last);
  newAnchors.push(newAnchor);
  return { ...state, anchors: newAnchors, selectedAnchorIndex: newAnchors.length - 1, addStart: undefined };
}

export function selectPathAnchor(state: PathEditState, index: number | undefined): PathEditState {
  if (index == null || !state.anchors[index]) return { ...state, selectedAnchorIndex: undefined };
  return { ...state, selectedAnchorIndex: index };
}

export function cycleSelectedPathAnchor(state: PathEditState, step: 1 | -1): PathEditState {
  if (!state.anchors.length) return state;
  const current = state.selectedAnchorIndex ?? 0;
  const next = (current + step + state.anchors.length) % state.anchors.length;
  return { ...state, selectedAnchorIndex: next };
}

export function nudgeSelectedPathAnchor(state: PathEditState, delta: { x: number; y: number }): PathEditState {
  const index = state.selectedAnchorIndex;
  if (index == null || !state.anchors[index]) return state;
  const anchors = state.anchors.map((anchor, anchorIndex) => {
    if (anchorIndex !== index) return anchor;
    return {
      ...anchor,
      x: anchor.x + delta.x,
      y: anchor.y + delta.y,
      handle1X: anchor.handle1X != null ? anchor.handle1X + delta.x : undefined,
      handle1Y: anchor.handle1Y != null ? anchor.handle1Y + delta.y : undefined,
      handle2X: anchor.handle2X != null ? anchor.handle2X + delta.x : undefined,
      handle2Y: anchor.handle2Y != null ? anchor.handle2Y + delta.y : undefined,
    };
  });
  return { ...state, anchors };
}

export function removeSelectedPathAnchor(state: PathEditState): PathEditState {
  const index = state.selectedAnchorIndex;
  if (index == null || !state.anchors[index] || state.anchors.length <= 1) return state;
  const anchors = state.anchors.filter((_, anchorIndex) => anchorIndex !== index);
  const closed = state.closed && anchors.length >= 3;
  const selectedAnchorIndex = anchors.length ? Math.min(index, anchors.length - 1) : undefined;
  return {
    ...state,
    anchors,
    closed,
    selectedAnchorIndex,
  };
}

export function togglePathClosed(state: PathEditState): PathEditState {
  if (state.closed) return { ...state, closed: false };
  if (state.anchors.length < 3) return state;
  return { ...state, closed: true };
}

export function setSelectedPathAnchorMode(state: PathEditState, mode: "smooth" | "corner"): PathEditState {
  const index = state.selectedAnchorIndex;
  if (index == null || !state.anchors[index]) return state;
  const anchors = state.anchors.map((anchor, anchorIndex) => {
    if (anchorIndex !== index) return anchor;
    if (mode === "smooth") return normalizeSmoothAnchor(anchor);
    return { ...anchor, isSmooth: false };
  });
  return { ...state, anchors };
}
