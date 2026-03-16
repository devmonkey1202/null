import type { Frame } from "../doc/scene";
import type { Rect } from "./AdvancedEditor.types";

type Axis = "x" | "y";
type ResizeHandle = "nw" | "ne" | "sw" | "se";
type DistanceGuideSide = "left" | "right" | "top" | "bottom";

type SnapValueFn = (value: number, gridEnabled: boolean, axis?: Axis) => number;
type RectResolver = (id: string) => Rect | null;
type HiddenResolver = (id: string) => boolean;

export type DistanceGuideLine = {
  axis: Axis;
  side: DistanceGuideSide;
  source: "sibling" | "parent";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
  value: number;
};

export function applyAxisLock(dx: number, dy: number, lockAxis: boolean) {
  if (!lockAxis) return { moveX: dx, moveY: dy };
  if (Math.abs(dx) > Math.abs(dy)) return { moveX: dx, moveY: 0 };
  return { moveX: 0, moveY: dy };
}

function findBestSnapAdjustment(targets: number[], movingLines: number[], threshold: number) {
  let bestDelta = 0;
  let bestDistance = threshold + 1;
  let bestTarget: number | null = null;
  targets.forEach((target) => {
    movingLines.forEach((line) => {
      const delta = target - line;
      const distance = Math.abs(delta);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestDelta = delta;
        bestTarget = target;
      }
    });
  });
  return bestDistance <= threshold ? { delta: bestDelta, target: bestTarget } : { delta: 0, target: null };
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart) > 0;
}

type GapMatch = {
  rect: Rect;
  gap: number;
  overlapStart: number;
  overlapEnd: number;
};

function findNearestGapRect(moving: Rect, rects: Rect[], side: DistanceGuideSide): GapMatch | null {
  let best: GapMatch | null = null;
  rects.forEach((rect) => {
    if (side === "left") {
      const edge = rect.x + rect.w;
      if (edge > moving.x || !rangesOverlap(rect.y, rect.y + rect.h, moving.y, moving.y + moving.h)) return;
      const gap = moving.x - edge;
      const overlapStart = Math.max(rect.y, moving.y);
      const overlapEnd = Math.min(rect.y + rect.h, moving.y + moving.h);
      if (!best || gap < best.gap) best = { rect, gap, overlapStart, overlapEnd };
      return;
    }
    if (side === "right") {
      if (rect.x < moving.x + moving.w || !rangesOverlap(rect.y, rect.y + rect.h, moving.y, moving.y + moving.h)) return;
      const gap = rect.x - (moving.x + moving.w);
      const overlapStart = Math.max(rect.y, moving.y);
      const overlapEnd = Math.min(rect.y + rect.h, moving.y + moving.h);
      if (!best || gap < best.gap) best = { rect, gap, overlapStart, overlapEnd };
      return;
    }
    if (side === "top") {
      const edge = rect.y + rect.h;
      if (edge > moving.y || !rangesOverlap(rect.x, rect.x + rect.w, moving.x, moving.x + moving.w)) return;
      const gap = moving.y - edge;
      const overlapStart = Math.max(rect.x, moving.x);
      const overlapEnd = Math.min(rect.x + rect.w, moving.x + moving.w);
      if (!best || gap < best.gap) best = { rect, gap, overlapStart, overlapEnd };
      return;
    }
    if (rect.y < moving.y + moving.h || !rangesOverlap(rect.x, rect.x + rect.w, moving.x, moving.x + moving.w)) return;
    const gap = rect.y - (moving.y + moving.h);
    const overlapStart = Math.max(rect.x, moving.x);
    const overlapEnd = Math.min(rect.x + rect.w, moving.x + moving.w);
    if (!best || gap < best.gap) best = { rect, gap, overlapStart, overlapEnd };
  });
  return best;
}

function buildHorizontalDistanceGuide(
  moving: Rect,
  side: "left" | "right",
  source: "sibling" | "parent",
  fromX: number,
  toX: number,
  overlapStart: number,
  overlapEnd: number,
): DistanceGuideLine {
  const cross = overlapEnd > overlapStart ? (overlapStart + overlapEnd) / 2 : moving.y + moving.h / 2;
  return {
    axis: "x",
    side,
    source,
    x1: fromX,
    y1: cross,
    x2: toX,
    y2: cross,
    labelX: (fromX + toX) / 2,
    labelY: cross - 4,
    value: Math.abs(toX - fromX),
  };
}

function buildVerticalDistanceGuide(
  moving: Rect,
  side: "top" | "bottom",
  source: "sibling" | "parent",
  fromY: number,
  toY: number,
  overlapStart: number,
  overlapEnd: number,
): DistanceGuideLine {
  const cross = overlapEnd > overlapStart ? (overlapStart + overlapEnd) / 2 : moving.x + moving.w / 2;
  return {
    axis: "y",
    side,
    source,
    x1: cross,
    y1: fromY,
    x2: cross,
    y2: toY,
    labelX: cross + 4,
    labelY: (fromY + toY) / 2,
    value: Math.abs(toY - fromY),
  };
}

export function computeDistanceGuideLines(params: {
  moving: Rect;
  targetRects?: Rect[];
  parentRect?: Rect | null;
}) {
  const { moving, targetRects = [], parentRect = null } = params;
  const guides: DistanceGuideLine[] = [];
  const left = findNearestGapRect(moving, targetRects, "left");
  const right = findNearestGapRect(moving, targetRects, "right");
  const top = findNearestGapRect(moving, targetRects, "top");
  const bottom = findNearestGapRect(moving, targetRects, "bottom");

  if (left) {
    guides.push(
      buildHorizontalDistanceGuide(
        moving,
        "left",
        "sibling",
        left.rect.x + left.rect.w,
        moving.x,
        left.overlapStart,
        left.overlapEnd,
      ),
    );
  } else if (parentRect) {
    guides.push(buildHorizontalDistanceGuide(moving, "left", "parent", parentRect.x, moving.x, moving.y, moving.y + moving.h));
  }

  if (right) {
    guides.push(
      buildHorizontalDistanceGuide(
        moving,
        "right",
        "sibling",
        moving.x + moving.w,
        right.rect.x,
        right.overlapStart,
        right.overlapEnd,
      ),
    );
  } else if (parentRect) {
    guides.push(
      buildHorizontalDistanceGuide(
        moving,
        "right",
        "parent",
        moving.x + moving.w,
        parentRect.x + parentRect.w,
        moving.y,
        moving.y + moving.h,
      ),
    );
  }

  if (top) {
    guides.push(
      buildVerticalDistanceGuide(
        moving,
        "top",
        "sibling",
        top.rect.y + top.rect.h,
        moving.y,
        top.overlapStart,
        top.overlapEnd,
      ),
    );
  } else if (parentRect) {
    guides.push(buildVerticalDistanceGuide(moving, "top", "parent", parentRect.y, moving.y, moving.x, moving.x + moving.w));
  }

  if (bottom) {
    guides.push(
      buildVerticalDistanceGuide(
        moving,
        "bottom",
        "sibling",
        moving.y + moving.h,
        bottom.rect.y,
        bottom.overlapStart,
        bottom.overlapEnd,
      ),
    );
  } else if (parentRect) {
    guides.push(
      buildVerticalDistanceGuide(
        moving,
        "bottom",
        "parent",
        moving.y + moving.h,
        parentRect.y + parentRect.h,
        moving.x,
        moving.x + moving.w,
      ),
    );
  }

  return guides;
}

export function computeSmartSnapFeedback(params: {
  moving: Rect;
  targetX: number[];
  targetY: number[];
  threshold: number;
  targetRects?: Rect[];
  parentRect?: Rect | null;
}) {
  const { moving, targetX, targetY, threshold, targetRects, parentRect } = params;
  const movingX = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const movingY = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
  const xMatch = findBestSnapAdjustment(targetX, movingX, threshold);
  const yMatch = findBestSnapAdjustment(targetY, movingY, threshold);
  const snappedMoving = {
    ...moving,
    x: moving.x + xMatch.delta,
    y: moving.y + yMatch.delta,
  };
  return {
    dx: xMatch.delta,
    dy: yMatch.delta,
    guideX: xMatch.target ?? undefined,
    guideY: yMatch.target ?? undefined,
    distances: computeDistanceGuideLines({ moving: snappedMoving, targetRects, parentRect }),
  };
}

export function computeSmartSnapAdjustment(params: {
  moving: Rect;
  targetX: number[];
  targetY: number[];
  threshold: number;
}) {
  const { dx, dy } = computeSmartSnapFeedback(params);
  return {
    dx,
    dy,
  };
}

export function collectMoveSnapTargets(params: {
  candidateIds: string[];
  movingId: string;
  resolveRect: RectResolver;
  isHidden: HiddenResolver;
  extraRects?: Rect[];
}) {
  const { candidateIds, movingId, resolveRect, isHidden, extraRects = [] } = params;
  const targetX: number[] = [];
  const targetY: number[] = [];
  const targetRects: Rect[] = [];

  candidateIds.forEach((id) => {
    if (id === movingId || isHidden(id)) return;
    const rect = resolveRect(id);
    if (!rect) return;
    targetRects.push(rect);
    targetX.push(rect.x, rect.x + rect.w / 2, rect.x + rect.w);
    targetY.push(rect.y, rect.y + rect.h / 2, rect.y + rect.h);
  });

  extraRects.forEach((rect) => {
    targetRects.push(rect);
    targetX.push(rect.x, rect.x + rect.w / 2, rect.x + rect.w);
    targetY.push(rect.y, rect.y + rect.h / 2, rect.y + rect.h);
  });

  return { targetX, targetY, targetRects };
}

export function buildMovedFrames(params: {
  ids: string[];
  origins: Record<string, Frame>;
  delta: { dx: number; dy: number };
}) {
  const { ids, origins, delta } = params;
  const frames: Record<string, Frame> = {};
  ids.forEach((id) => {
    const origin = origins[id];
    if (!origin) return;
    frames[id] = {
      ...origin,
      x: origin.x + delta.dx,
      y: origin.y + delta.dy,
    };
  });
  return frames;
}

export function computeMovePreview(params: {
  anchorOrigin?: Frame;
  moveX: number;
  moveY: number;
  gridSnap: boolean;
  snapValue: SnapValueFn;
  ids: string[];
  origins: Record<string, Frame>;
}) {
  const { anchorOrigin, moveX, moveY, gridSnap, snapValue, ids, origins } = params;
  if (!anchorOrigin) return null;
  const dx = snapValue(anchorOrigin.x + moveX, gridSnap, "x") - anchorOrigin.x;
  const dy = snapValue(anchorOrigin.y + moveY, gridSnap, "y") - anchorOrigin.y;
  return {
    delta: { dx, dy },
    frames: buildMovedFrames({ ids, origins, delta: { dx, dy } }),
  };
}

export function computeResizePreviewFrame(params: {
  origin: Frame;
  handle: ResizeHandle;
  dx: number;
  dy: number;
  gridSnap: boolean;
  keepRatio: boolean;
  fromCenter: boolean;
  snapValue: SnapValueFn;
  minSize?: number;
}): Frame {
  const {
    origin,
    handle,
    dx,
    dy,
    gridSnap,
    keepRatio,
    fromCenter,
    snapValue,
    minSize = 20,
  } = params;

  let x = origin.x;
  let y = origin.y;
  let w = origin.w;
  let h = origin.h;

  if (handle.includes("e")) w = snapValue(Math.max(minSize, origin.w + dx), gridSnap);
  if (handle.includes("s")) h = snapValue(Math.max(minSize, origin.h + dy), gridSnap);
  if (handle.includes("w")) {
    x = snapValue(origin.x + dx, gridSnap, "x");
    w = snapValue(Math.max(minSize, origin.w - dx), gridSnap);
  }
  if (handle.includes("n")) {
    y = snapValue(origin.y + dy, gridSnap, "y");
    h = snapValue(Math.max(minSize, origin.h - dy), gridSnap);
  }

  if (keepRatio && origin.h !== 0) {
    const ratio = origin.w / origin.h;
    if (handle.includes("e") || handle.includes("w")) {
      h = snapValue(Math.max(minSize, w / ratio), gridSnap);
      y = snapValue(origin.y + (origin.h - h) / 2, gridSnap, "y");
    }
    if (handle.includes("n") || handle.includes("s")) {
      w = snapValue(Math.max(minSize, h * ratio), gridSnap);
      x = snapValue(origin.x + (origin.w - w) / 2, gridSnap, "x");
    }
  }

  if (fromCenter) {
    const cx = origin.x + origin.w / 2;
    const cy = origin.y + origin.h / 2;
    x = snapValue(cx - w / 2, gridSnap, "x");
    y = snapValue(cy - h / 2, gridSnap, "y");
  }

  return { x, y, w, h, rotation: origin.rotation };
}
