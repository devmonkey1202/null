"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runBooleanMultiple } from "@/advanced/geom/boolean";
import { anchorsToPathData, ellipseToPath, pathDataToAnchors, pathDataToBounds, pathDataToPolygon, rectToPath, type PathAnchor } from "@/advanced/geom/pathData";
import type {
  AutoLayoutAlign,
  AutoLayoutData,
  AutoLayoutDirection,
  EditorCommand,
  EditorBridge,
  EditorRect,
  EditorSnapshot,
  HorizontalConstraint,
  MoveSnapPreview,
  RuntimeGraph,
  SceneGuide,
  SceneNode,
  ResizeSnapPreview,
  SnapGuide,
  TextAlign,
  TextSizingMode,
  TextStylePatch,
  ShapePrimitive,
  ShapePathHandle,
  ShapePathData,
  ShapeStylePatch,
  TransformHandle,
  ValidationReport,
  VerticalConstraint,
  WasmBridgeInfo,
} from "@/v2/editor/contracts";
import { loadEditorBridge } from "@/v2/editor/bridge/load-editor-bridge";
import { sampleSceneDoc } from "@/v2/editor/sample-doc";
const CANVAS_PAGE_ID = sampleSceneDoc.pages[0]?.id ?? "page-home";

type DragMarquee = {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
};

type DragPan = {
  originClientX: number;
  originClientY: number;
  startViewportX: number;
  startViewportY: number;
};

type DragMove = {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
};

type DragTransform = {
  handle: TransformHandle["kind"];
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  lockAspect: boolean;
};

type DragGuide = {
  guideId: string;
  axis: "x" | "y";
  currentPosition: number;
};

type DragPathPoint = {
  nodeId: string;
  pointIndex: number;
  points: ShapePathData["points"];
  closed: boolean;
  currentX: number;
  currentY: number;
};

type PathHandleKey = "handleIn" | "handleOut";

type DragPathHandle = {
  nodeId: string;
  pointIndex: number;
  handleKey: PathHandleKey;
  points: ShapePathData["points"];
  closed: boolean;
  currentX: number;
  currentY: number;
};

type EditorTool = "select" | "path";

type PathDraft = {
  points: ShapePathData["points"];
  closed: boolean;
};

type ShapeBooleanOp = "union" | "subtract" | "intersect" | "exclude";

type CanvasSize = {
  width: number;
  height: number;
};

type RulerTick = {
  value: number;
  position: number;
  major: boolean;
};

const HORIZONTAL_CONSTRAINT_OPTIONS: HorizontalConstraint[] = ["min", "max", "stretch", "scale"];
const VERTICAL_CONSTRAINT_OPTIONS: VerticalConstraint[] = ["min", "max", "stretch", "scale"];
const AUTO_LAYOUT_DIRECTION_OPTIONS: AutoLayoutDirection[] = ["horizontal", "vertical"];
const AUTO_LAYOUT_ALIGN_OPTIONS: AutoLayoutAlign[] = ["start", "center", "end", "stretch"];
const TEXT_ALIGN_OPTIONS: TextAlign[] = ["left", "center", "right", "justify"];
const TEXT_SIZING_OPTIONS: TextSizingMode[] = ["fixed", "auto_height"];
const SHAPE_PRIMITIVE_OPTIONS: ShapePrimitive[] = ["rect", "ellipse", "line", "path"];
const EMPTY_MOVE_SNAP_PREVIEW: MoveSnapPreview = { deltaX: 0, deltaY: 0, guides: [] };
const EMPTY_RESIZE_SNAP_PREVIEW: ResizeSnapPreview = {
  bounds: null,
  deltaX: 0,
  deltaY: 0,
  guides: [],
};

function createDefaultShapePath(frame: EditorRect): ShapePathData {
  return {
    closed: true,
    points: [
      { x: 0, y: Math.max(frame.h - 16, 0) },
      { x: Math.max(frame.w * 0.28, 1), y: 12 },
      { x: Math.max(frame.w * 0.6, 1), y: Math.max(frame.h * 0.55, 1) },
      { x: Math.max(frame.w - 12, 1), y: 0 },
      { x: frame.w, y: Math.max(frame.h - 8, 1) },
    ],
  };
}

function shapePathToSvgD(path: ShapePathData | undefined) {
  if (!path || path.points.length === 0) {
    return "";
  }

  const [first, ...rest] = path.points;
  const segments = [`M ${first.x} ${first.y}`];
  let previous = first;

  for (const point of rest) {
    const controlOut = previous.handleOut;
    const controlIn = point.handleIn;
    if (controlOut || controlIn) {
      const resolvedOut = controlOut ?? previous;
      const resolvedIn = controlIn ?? point;
      segments.push(
        `C ${resolvedOut.x} ${resolvedOut.y} ${resolvedIn.x} ${resolvedIn.y} ${point.x} ${point.y}`,
      );
    } else {
      segments.push(`L ${point.x} ${point.y}`);
    }
    previous = point;
  }

  if (path.closed) {
    const last = path.points[path.points.length - 1];
    if (last && last !== first) {
      const controlOut = last.handleOut;
      const controlIn = first.handleIn;
      if (controlOut || controlIn) {
        const resolvedOut = controlOut ?? last;
        const resolvedIn = controlIn ?? first;
        segments.push(
          `C ${resolvedOut.x} ${resolvedOut.y} ${resolvedIn.x} ${resolvedIn.y} ${first.x} ${first.y}`,
        );
      }
    }
    segments.push("Z");
  }
  return segments.join(" ");
}

function roundLocalPoint(value: ShapePathHandle) {
  return {
    x: Number(value.x.toFixed(3)),
    y: Number(value.y.toFixed(3)),
  };
}

function applyDraggedPathPointToPoints(
  points: ShapePathData["points"],
  pointIndex: number,
  currentX: number,
  currentY: number,
) {
  const nextPoints = structuredClone(points);
  const originalPoint = nextPoints[pointIndex];
  if (!originalPoint) {
    return nextPoints;
  }

  const deltaX = currentX - originalPoint.x;
  const deltaY = currentY - originalPoint.y;
  nextPoints[pointIndex] = {
    ...originalPoint,
    x: currentX,
    y: currentY,
    ...(originalPoint.handleIn
      ? {
          handleIn: roundLocalPoint({
            x: originalPoint.handleIn.x + deltaX,
            y: originalPoint.handleIn.y + deltaY,
          }),
        }
      : {}),
    ...(originalPoint.handleOut
      ? {
          handleOut: roundLocalPoint({
            x: originalPoint.handleOut.x + deltaX,
            y: originalPoint.handleOut.y + deltaY,
          }),
        }
      : {}),
  };

  return nextPoints;
}

function applyDraggedPathHandleToPoints(
  points: ShapePathData["points"],
  pointIndex: number,
  handleKey: PathHandleKey,
  currentX: number,
  currentY: number,
) {
  const nextPoints = structuredClone(points);
  const originalPoint = nextPoints[pointIndex];
  if (!originalPoint) {
    return nextPoints;
  }

  nextPoints[pointIndex] = {
    ...originalPoint,
    [handleKey]: roundLocalPoint({
      x: currentX,
      y: currentY,
    }),
  };

  return nextPoints;
}

function localShapePointFromCanvas(node: SceneNode, canvasX: number, canvasY: number) {
  const centerX = node.frame.x + node.frame.w / 2;
  const centerY = node.frame.y + node.frame.h / 2;
  const radians = (-node.frame.rotation * Math.PI) / 180;
  const dx = canvasX - centerX;
  const dy = canvasY - centerY;
  const localX = dx * Math.cos(radians) - dy * Math.sin(radians) + node.frame.w / 2;
  const localY = dx * Math.sin(radians) + dy * Math.cos(radians) + node.frame.h / 2;

  return {
    x: Number(localX.toFixed(3)),
    y: Number(localY.toFixed(3)),
  };
}

function nodeCanvasPointFromLocal(node: SceneNode, localX: number, localY: number) {
  const centerX = node.frame.x + node.frame.w / 2;
  const centerY = node.frame.y + node.frame.h / 2;
  const radians = (node.frame.rotation * Math.PI) / 180;
  const dx = localX - node.frame.w / 2;
  const dy = localY - node.frame.h / 2;

  return {
    x: dx * Math.cos(radians) - dy * Math.sin(radians) + centerX,
    y: dx * Math.sin(radians) + dy * Math.cos(radians) + centerY,
  };
}

function localShapePathToAnchors(path: ShapePathData): PathAnchor[] {
  return path.points.map((point) => ({
    x: point.x,
    y: point.y,
    handle1X: point.handleIn?.x,
    handle1Y: point.handleIn?.y,
    handle2X: point.handleOut?.x,
    handle2Y: point.handleOut?.y,
  }));
}

function transformAnchorsToCanvas(node: SceneNode, anchors: PathAnchor[]) {
  return anchors.map((anchor) => {
    const origin = nodeCanvasPointFromLocal(node, anchor.x, anchor.y);
    const handleIn =
      anchor.handle1X != null && anchor.handle1Y != null
        ? nodeCanvasPointFromLocal(node, anchor.handle1X, anchor.handle1Y)
        : null;
    const handleOut =
      anchor.handle2X != null && anchor.handle2Y != null
        ? nodeCanvasPointFromLocal(node, anchor.handle2X, anchor.handle2Y)
        : null;

    return {
      x: origin.x,
      y: origin.y,
      ...(handleIn
        ? {
            handle1X: handleIn.x,
            handle1Y: handleIn.y,
          }
        : {}),
      ...(handleOut
        ? {
            handle2X: handleOut.x,
            handle2Y: handleOut.y,
          }
        : {}),
    } satisfies PathAnchor;
  });
}

function nodeToAbsolutePathD(node: SceneNode) {
  if (node.kind !== "shape" || !node.shape) {
    return null;
  }

  let localPathD: string | null = null;
  switch (node.shape.primitive) {
    case "rect":
      localPathD = rectToPath({ x: 0, y: 0, w: node.frame.w, h: node.frame.h });
      break;
    case "ellipse":
      localPathD = ellipseToPath({ x: 0, y: 0, w: node.frame.w, h: node.frame.h });
      break;
    case "line":
      return null;
    case "path":
      if (!node.shape.path) {
        return null;
      }
      localPathD = anchorsToPathData(localShapePathToAnchors(node.shape.path), node.shape.path.closed);
      break;
  }

  if (!localPathD) {
    return null;
  }

  const { anchors, closed } = pathDataToAnchors(localPathD);
  const absoluteAnchors = transformAnchorsToCanvas(node, anchors);
  return anchorsToPathData(absoluteAnchors, closed);
}

function pathDToLocalShapePath(pathD: string) {
  const { anchors, closed } = pathDataToAnchors(pathD);
  const bounds = pathDataToBounds(pathD);
  const points = anchors.map((anchor) => ({
    x: Number((anchor.x - bounds.x).toFixed(3)),
    y: Number((anchor.y - bounds.y).toFixed(3)),
    ...(anchor.handle1X != null && anchor.handle1Y != null
      ? {
          handleIn: roundLocalPoint({
            x: anchor.handle1X - bounds.x,
            y: anchor.handle1Y - bounds.y,
          }),
        }
      : {}),
    ...(anchor.handle2X != null && anchor.handle2Y != null
      ? {
          handleOut: roundLocalPoint({
            x: anchor.handle2X - bounds.x,
            y: anchor.handle2Y - bounds.y,
          }),
        }
      : {}),
  }));

  return {
    frame: {
      x: Number(bounds.x.toFixed(3)),
      y: Number(bounds.y.toFixed(3)),
      w: Number(bounds.w.toFixed(3)),
      h: Number(bounds.h.toFixed(3)),
      rotation: 0,
    } satisfies EditorRect,
    path: {
      points,
      closed,
    } satisfies ShapePathData,
  };
}

function createCurveHandles(
  points: ShapePathData["points"],
  pointIndex: number,
  closed: boolean,
) {
  const point = points[pointIndex];
  if (!point) {
    return null;
  }

  const previous =
    points[pointIndex - 1] ?? (closed ? points[points.length - 1] : undefined) ?? point;
  const next = points[pointIndex + 1] ?? (closed ? points[0] : undefined) ?? point;
  const tangentX = next.x - previous.x;
  const tangentY = next.y - previous.y;
  const length = Math.hypot(tangentX, tangentY) || 1;
  const distance = Math.min(40, Math.max(12, length * 0.2));
  const unitX = tangentX / length;
  const unitY = tangentY / length;

  return {
    handleIn: roundLocalPoint({
      x: point.x - unitX * distance,
      y: point.y - unitY * distance,
    }),
    handleOut: roundLocalPoint({
      x: point.x + unitX * distance,
      y: point.y + unitY * distance,
    }),
  };
}

function withDraggedPathPoint(
  nodeId: string,
  path: ShapePathData | undefined,
  dragPathPoint: DragPathPoint | null,
) {
  if (!path) {
    return path;
  }

  if (!dragPathPoint || dragPathPoint.nodeId !== nodeId) {
    return path;
  }

  return {
    closed: dragPathPoint.closed,
    points: applyDraggedPathPointToPoints(
      dragPathPoint.points,
      dragPathPoint.pointIndex,
      dragPathPoint.currentX,
      dragPathPoint.currentY,
    ),
  };
}

function withDraggedPathHandle(
  nodeId: string,
  path: ShapePathData | undefined,
  dragPathHandle: DragPathHandle | null,
) {
  if (!path) {
    return path;
  }

  if (!dragPathHandle || dragPathHandle.nodeId !== nodeId) {
    return path;
  }

  return {
    closed: dragPathHandle.closed,
    points: applyDraggedPathHandleToPoints(
      dragPathHandle.points,
      dragPathHandle.pointIndex,
      dragPathHandle.handleKey,
      dragPathHandle.currentX,
      dragPathHandle.currentY,
    ),
  };
}

function supportsAutoLayout(node: SceneNode | null) {
  return Boolean(node && (node.kind === "frame" || node.kind === "group" || node.kind === "component"));
}

function supportsComponentPromotion(node: SceneNode | null) {
  return Boolean(node && (node.kind === "frame" || node.kind === "group" || node.kind === "component"));
}

function isComponentNode(node: SceneNode | null) {
  return Boolean(node && node.kind === "component" && node.component);
}

function isInstanceNode(node: SceneNode | null) {
  return Boolean(node && node.kind === "instance" && node.instance);
}

function supportsShapeEditing(node: SceneNode | null) {
  return Boolean(node && node.kind === "shape" && node.shape);
}

function flattenNodes(snapshot: EditorSnapshot | null) {
  return snapshot?.doc.pages.flatMap((page) => page.nodes) ?? [];
}

function selectedNode(nodes: SceneNode[], selection: string[]) {
  if (selection.length === 0) {
    return null;
  }

  return nodes.find((node) => node.id === selection[0]) ?? null;
}

function normalizeRect({ originX, originY, currentX, currentY }: DragMarquee): EditorRect {
  const x = Math.min(originX, currentX);
  const y = Math.min(originY, currentY);
  const w = Math.abs(currentX - originX);
  const h = Math.abs(currentY - originY);

  return { x, y, w, h, rotation: 0 };
}

function selectionSummary(selection: string[]) {
  if (selection.length === 0) {
    return "No selection";
  }

  if (selection.length === 1) {
    return "1 layer selected";
  }

  return `${selection.length} layers selected`;
}

function offsetRect(rect: EditorRect, deltaX: number, deltaY: number): EditorRect {
  return {
    ...rect,
    x: rect.x + deltaX,
    y: rect.y + deltaY,
  };
}

function resizePreviewBounds(
  bounds: EditorRect,
  handle: TransformHandle["kind"],
  deltaX: number,
  deltaY: number,
  lockAspect: boolean,
): EditorRect {
  const minSize = 1;
  let left = bounds.x;
  let top = bounds.y;
  let right = bounds.x + bounds.w;
  let bottom = bounds.y + bounds.h;

  switch (handle) {
    case "n":
      top += deltaY;
      break;
    case "ne":
      top += deltaY;
      right += deltaX;
      break;
    case "e":
      right += deltaX;
      break;
    case "se":
      right += deltaX;
      bottom += deltaY;
      break;
    case "s":
      bottom += deltaY;
      break;
    case "sw":
      left += deltaX;
      bottom += deltaY;
      break;
    case "w":
      left += deltaX;
      break;
    case "nw":
      left += deltaX;
      top += deltaY;
      break;
    case "rotate":
      break;
  }

  if (lockAspect) {
    const aspect = bounds.h !== 0 ? bounds.w / bounds.h : 1;
    const currentW = Math.max(right - left, minSize);
    const currentH = Math.max(bottom - top, minSize);

    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      const adjustedH = currentW / Math.max(aspect, 0.0001);
      if (handle === "nw" || handle === "ne") {
        top = bottom - adjustedH;
      } else if (handle === "sw" || handle === "se") {
        bottom = top + adjustedH;
      }
    } else {
      const adjustedW = currentH * aspect;
      if (handle === "nw" || handle === "sw") {
        left = right - adjustedW;
      } else if (handle === "ne" || handle === "se") {
        right = left + adjustedW;
      }
    }
  }

  if (right - left < minSize) {
    if (handle === "w" || handle === "nw" || handle === "sw") {
      left = right - minSize;
    } else {
      right = left + minSize;
    }
  }

  if (bottom - top < minSize) {
    if (handle === "n" || handle === "nw" || handle === "ne") {
      top = bottom - minSize;
    } else {
      bottom = top + minSize;
    }
  }

  return {
    ...bounds,
    x: left,
    y: top,
    w: Math.max(right - left, minSize),
    h: Math.max(bottom - top, minSize),
  };
}

function buildTransformHandles(bounds: EditorRect | null): TransformHandle[] {
  if (!bounds) {
    return [];
  }

  const left = bounds.x;
  const centerX = bounds.x + bounds.w / 2;
  const right = bounds.x + bounds.w;
  const top = bounds.y;
  const centerY = bounds.y + bounds.h / 2;
  const bottom = bounds.y + bounds.h;
  const rotateOffset = 28;

  return [
    { kind: "nw", x: left, y: top, cursor: "nwse-resize" },
    { kind: "n", x: centerX, y: top, cursor: "ns-resize" },
    { kind: "ne", x: right, y: top, cursor: "nesw-resize" },
    { kind: "e", x: right, y: centerY, cursor: "ew-resize" },
    { kind: "se", x: right, y: bottom, cursor: "nwse-resize" },
    { kind: "s", x: centerX, y: bottom, cursor: "ns-resize" },
    { kind: "sw", x: left, y: bottom, cursor: "nesw-resize" },
    { kind: "w", x: left, y: centerY, cursor: "ew-resize" },
    { kind: "rotate", x: centerX, y: top - rotateOffset, cursor: "grab" },
  ];
}

function angleDeltaFromBounds(
  bounds: EditorRect,
  originX: number,
  originY: number,
  currentX: number,
  currentY: number,
) {
  const centerX = bounds.x + bounds.w / 2;
  const centerY = bounds.y + bounds.h / 2;
  const originAngle = Math.atan2(originY - centerY, originX - centerX);
  const currentAngle = Math.atan2(currentY - centerY, currentX - centerX);
  return ((currentAngle - originAngle) * 180) / Math.PI;
}

function rectAnchors(rect: EditorRect) {
  return {
    left: rect.x,
    centerX: rect.x + rect.w / 2,
    right: rect.x + rect.w,
    top: rect.y,
    centerY: rect.y + rect.h / 2,
    bottom: rect.y + rect.h,
  };
}

function computeMoveSnap(
  selectionBounds: EditorRect | null,
  delta: { x: number; y: number } | null,
  targetRects: EditorRect[],
  targetGuides: SceneGuide[] = [],
  threshold = 8,
) {
  if (!selectionBounds || !delta) {
    return {
      deltaX: delta?.x ?? 0,
      deltaY: delta?.y ?? 0,
      guides: [] as SnapGuide[],
    };
  }

  const movedBounds = offsetRect(selectionBounds, delta.x, delta.y);
  const moved = rectAnchors(movedBounds);

  let bestX: { adjust: number; position: number; spanStart: number; spanEnd: number } | null = null;
  let bestY: { adjust: number; position: number; spanStart: number; spanEnd: number } | null = null;

  for (const target of targetRects) {
    const anchors = rectAnchors(target);
    const xValues = [anchors.left, anchors.centerX, anchors.right];
    const yValues = [anchors.top, anchors.centerY, anchors.bottom];
    const movedXValues = [moved.left, moved.centerX, moved.right];
    const movedYValues = [moved.top, moved.centerY, moved.bottom];

    for (const currentX of movedXValues) {
      for (const targetX of xValues) {
        const adjust = targetX - currentX;
        if (Math.abs(adjust) <= threshold && (!bestX || Math.abs(adjust) < Math.abs(bestX.adjust))) {
          bestX = {
            adjust,
            position: targetX,
            spanStart: Math.min(moved.top, anchors.top),
            spanEnd: Math.max(moved.bottom, anchors.bottom),
          };
        }
      }
    }

    for (const currentY of movedYValues) {
      for (const targetY of yValues) {
        const adjust = targetY - currentY;
        if (Math.abs(adjust) <= threshold && (!bestY || Math.abs(adjust) < Math.abs(bestY.adjust))) {
          bestY = {
            adjust,
            position: targetY,
            spanStart: Math.min(moved.left, anchors.left),
            spanEnd: Math.max(moved.right, anchors.right),
          };
        }
      }
    }
  }

  for (const guide of targetGuides) {
    if (guide.axis === "x") {
      for (const currentX of [moved.left, moved.centerX, moved.right]) {
        const adjust = guide.position - currentX;
        if (Math.abs(adjust) <= threshold && (!bestX || Math.abs(adjust) < Math.abs(bestX.adjust))) {
          bestX = {
            adjust,
            position: guide.position,
            spanStart: moved.top,
            spanEnd: moved.bottom,
          };
        }
      }
    } else {
      for (const currentY of [moved.top, moved.centerY, moved.bottom]) {
        const adjust = guide.position - currentY;
        if (Math.abs(adjust) <= threshold && (!bestY || Math.abs(adjust) < Math.abs(bestY.adjust))) {
          bestY = {
            adjust,
            position: guide.position,
            spanStart: moved.left,
            spanEnd: moved.right,
          };
        }
      }
    }
  }

  const guides: SnapGuide[] = [];
  if (bestX) {
    guides.push({
      axis: "x",
      position: bestX.position,
      spanStart: bestX.spanStart,
      spanEnd: bestX.spanEnd,
    });
  }
  if (bestY) {
    guides.push({
      axis: "y",
      position: bestY.position,
      spanStart: bestY.spanStart,
      spanEnd: bestY.spanEnd,
    });
  }

  return {
    deltaX: delta.x + (bestX?.adjust ?? 0),
    deltaY: delta.y + (bestY?.adjust ?? 0),
    guides,
  };
}

function computeResizeSnap(
  originalBounds: EditorRect | null,
  previewBounds: EditorRect | null,
  handle: TransformHandle["kind"] | null,
  targetRects: EditorRect[],
  targetGuides: SceneGuide[] = [],
  threshold = 8,
) {
  if (!originalBounds || !previewBounds || !handle || handle === "rotate") {
    return {
      bounds: previewBounds,
      deltaX: 0,
      deltaY: 0,
      guides: [] as SnapGuide[],
    };
  }

  const preview = rectAnchors(previewBounds);
  let bestX: { adjust: number; position: number; spanStart: number; spanEnd: number } | null = null;
  let bestY: { adjust: number; position: number; spanStart: number; spanEnd: number } | null = null;

  const activeXKeys =
    handle === "e" || handle === "ne" || handle === "se"
      ? (["right"] as const)
      : handle === "w" || handle === "nw" || handle === "sw"
        ? (["left"] as const)
        : ([] as const);
  const activeYKeys =
    handle === "s" || handle === "se" || handle === "sw"
      ? (["bottom"] as const)
      : handle === "n" || handle === "ne" || handle === "nw"
        ? (["top"] as const)
        : ([] as const);

  for (const target of targetRects) {
    const anchors = rectAnchors(target);
    const targetXValues = [anchors.left, anchors.centerX, anchors.right];
    const targetYValues = [anchors.top, anchors.centerY, anchors.bottom];

    for (const key of activeXKeys) {
      const currentX = preview[key];
      for (const targetX of targetXValues) {
        const adjust = targetX - currentX;
        if (Math.abs(adjust) <= threshold && (!bestX || Math.abs(adjust) < Math.abs(bestX.adjust))) {
          bestX = {
            adjust,
            position: targetX,
            spanStart: Math.min(previewBounds.y, anchors.top),
            spanEnd: Math.max(previewBounds.y + previewBounds.h, anchors.bottom),
          };
        }
      }
    }

    for (const key of activeYKeys) {
      const currentY = preview[key];
      for (const targetY of targetYValues) {
        const adjust = targetY - currentY;
        if (Math.abs(adjust) <= threshold && (!bestY || Math.abs(adjust) < Math.abs(bestY.adjust))) {
          bestY = {
            adjust,
            position: targetY,
            spanStart: Math.min(previewBounds.x, anchors.left),
            spanEnd: Math.max(previewBounds.x + previewBounds.w, anchors.right),
          };
        }
      }
    }
  }

  for (const guide of targetGuides) {
    if (guide.axis === "x") {
      for (const key of activeXKeys) {
        const currentX = preview[key];
        const adjust = guide.position - currentX;
        if (Math.abs(adjust) <= threshold && (!bestX || Math.abs(adjust) < Math.abs(bestX.adjust))) {
          bestX = {
            adjust,
            position: guide.position,
            spanStart: previewBounds.y,
            spanEnd: previewBounds.y + previewBounds.h,
          };
        }
      }
    } else {
      for (const key of activeYKeys) {
        const currentY = preview[key];
        const adjust = guide.position - currentY;
        if (Math.abs(adjust) <= threshold && (!bestY || Math.abs(adjust) < Math.abs(bestY.adjust))) {
          bestY = {
            adjust,
            position: guide.position,
            spanStart: previewBounds.x,
            spanEnd: previewBounds.x + previewBounds.w,
          };
        }
      }
    }
  }

  const bounds = { ...previewBounds };
  if (bestX) {
    if (handle === "e" || handle === "ne" || handle === "se") {
      bounds.w += bestX.adjust;
    } else if (handle === "w" || handle === "nw" || handle === "sw") {
      bounds.x += bestX.adjust;
      bounds.w -= bestX.adjust;
    }
  }

  if (bestY) {
    if (handle === "s" || handle === "se" || handle === "sw") {
      bounds.h += bestY.adjust;
    } else if (handle === "n" || handle === "ne" || handle === "nw") {
      bounds.y += bestY.adjust;
      bounds.h -= bestY.adjust;
    }
  }

  const guides: SnapGuide[] = [];
  if (bestX) {
    guides.push({
      axis: "x",
      position: bestX.position,
      spanStart: bestX.spanStart,
      spanEnd: bestX.spanEnd,
    });
  }
  if (bestY) {
    guides.push({
      axis: "y",
      position: bestY.position,
      spanStart: bestY.spanStart,
      spanEnd: bestY.spanEnd,
    });
  }

  let deltaX = 0;
  let deltaY = 0;
  switch (handle) {
    case "n":
      deltaY = bounds.y - originalBounds.y;
      break;
    case "ne":
      deltaX = bounds.x + bounds.w - (originalBounds.x + originalBounds.w);
      deltaY = bounds.y - originalBounds.y;
      break;
    case "e":
      deltaX = bounds.x + bounds.w - (originalBounds.x + originalBounds.w);
      break;
    case "se":
      deltaX = bounds.x + bounds.w - (originalBounds.x + originalBounds.w);
      deltaY = bounds.y + bounds.h - (originalBounds.y + originalBounds.h);
      break;
    case "s":
      deltaY = bounds.y + bounds.h - (originalBounds.y + originalBounds.h);
      break;
    case "sw":
      deltaX = bounds.x - originalBounds.x;
      deltaY = bounds.y + bounds.h - (originalBounds.y + originalBounds.h);
      break;
    case "w":
      deltaX = bounds.x - originalBounds.x;
      break;
    case "nw":
      deltaX = bounds.x - originalBounds.x;
      deltaY = bounds.y - originalBounds.y;
      break;
  }

  return {
    bounds,
    deltaX,
    deltaY,
    guides,
  };
}

function chooseRulerStep(zoom: number) {
  const targetPx = 96;
  const logicalTarget = targetPx / Math.max(zoom, 0.001);
  const exponent = Math.floor(Math.log10(Math.max(logicalTarget, 1)));
  const base = 10 ** exponent;
  const multipliers = [1, 2, 5, 10];

  for (const multiplier of multipliers) {
    const step = base * multiplier;
    if (step >= logicalTarget) {
      return step;
    }
  }

  return base * 10;
}

function buildRulerTicks(
  axisLength: number,
  viewportOffset: number,
  zoom: number,
  majorStep: number,
  minorDivisions = 4,
) {
  if (axisLength <= 0 || zoom <= 0) {
    return [] as RulerTick[];
  }

  const ticks: RulerTick[] = [];
  const minorStep = majorStep / minorDivisions;
  const docStart = (-viewportOffset) / zoom;
  const docEnd = (axisLength - viewportOffset) / zoom;
  const startValue = Math.floor(docStart / minorStep) * minorStep;
  const endValue = Math.ceil(docEnd / minorStep) * minorStep;
  const tolerance = minorStep * 0.05;

  for (let value = startValue; value <= endValue; value += minorStep) {
    const position = value * zoom + viewportOffset;
    if (position < -1 || position > axisLength + 1) {
      continue;
    }

    const major = Math.abs(value / majorStep - Math.round(value / majorStep)) < tolerance;
    ticks.push({
      value: Number(value.toFixed(3)),
      position,
      major,
    });
  }

  return ticks;
}

function createGuideId() {
  return `guide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDraftPathNode(path: PathDraft, rootFrame: SceneNode | null): SceneNode | null {
  if (path.points.length < 2) {
    return null;
  }

  const minX = Math.min(...path.points.map((point) => point.x));
  const minY = Math.min(...path.points.map((point) => point.y));
  const maxX = Math.max(...path.points.map((point) => point.x));
  const maxY = Math.max(...path.points.map((point) => point.y));
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);

  return {
    id: `path-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: "shape",
    name: "Path",
    parentId: rootFrame?.id ?? null,
    children: undefined,
    frame: {
      x: minX,
      y: minY,
      w: width,
      h: height,
      rotation: 0,
    },
    constraints: { horizontal: "min", vertical: "min" },
    shape: {
      primitive: "path",
      fill: "#93c5fd",
      strokeColor: "#1d4ed8",
      strokeWidth: 3,
      cornerRadius: 0,
      opacity: 0.9,
      path: {
        closed: path.closed,
        points: path.points.map((point) => ({
          x: Number((point.x - minX).toFixed(3)),
          y: Number((point.y - minY).toFixed(3)),
        })),
      },
    },
  };
}

export function V2EditorShell() {
  const [bridgeInfo, setBridgeInfo] = useState<WasmBridgeInfo | null>(null);
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [runtimeGraph, setRuntimeGraph] = useState<RuntimeGraph | null>(null);
  const [selectionBounds, setSelectionBounds] = useState<EditorRect | null>(null);
  const [transformHandles, setTransformHandles] = useState<TransformHandle[]>([]);
  const [dragMarquee, setDragMarquee] = useState<DragMarquee | null>(null);
  const [dragPan, setDragPan] = useState<DragPan | null>(null);
  const [dragMove, setDragMove] = useState<DragMove | null>(null);
  const [dragTransform, setDragTransform] = useState<DragTransform | null>(null);
  const [dragGuide, setDragGuide] = useState<DragGuide | null>(null);
  const [dragPathPoint, setDragPathPoint] = useState<DragPathPoint | null>(null);
  const [dragPathHandle, setDragPathHandle] = useState<DragPathHandle | null>(null);
  const [activeTool, setActiveTool] = useState<EditorTool>("select");
  const [pathDraft, setPathDraft] = useState<PathDraft | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [draftViewport, setDraftViewport] = useState<EditorSnapshot["viewport"] | null>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [editingTextNodeId, setEditingTextNodeId] = useState<string | null>(null);
  const [editingTextDraft, setEditingTextDraft] = useState("");
  const [editingTextComposing, setEditingTextComposing] = useState(false);
  const [moveSnapPreview, setMoveSnapPreview] = useState<MoveSnapPreview>(EMPTY_MOVE_SNAP_PREVIEW);
  const [resizeSnapPreview, setResizeSnapPreview] = useState<ResizeSnapPreview>(EMPTY_RESIZE_SNAP_PREVIEW);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<EditorBridge | null>(null);
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const snapQuerySeqRef = useRef(0);

  const syncBridgeState = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge) {
      return;
    }

    const [nextValidation, nextRuntime, nextSelectionBounds, nextTransformHandles] =
      await Promise.all([
        bridge.runValidation(),
        bridge.exportRuntimeGraph(),
        bridge.query({ kind: "selection_bounds" }) as Promise<EditorRect | null>,
        bridge.query({ kind: "transform_handles" }) as Promise<TransformHandle[]>,
      ]);

    setValidation(nextValidation);
    setRuntimeGraph(nextRuntime);
    setSelectionBounds(nextSelectionBounds);
    setTransformHandles(nextTransformHandles);
  }, []);

  useEffect(() => {
    async function load() {
      const bridge = await loadEditorBridge();
      bridgeRef.current = bridge;
      const [info, initialSnapshot] = await Promise.all([
        bridge.info(),
        bridge.loadDocument(sampleSceneDoc),
      ]);

      setBridgeInfo(info);
      setSnapshot(initialSnapshot);
      await syncBridgeState();
    }

    void load();
  }, [syncBridgeState]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) {
      return;
    }

    const measure = () => {
      setCanvasSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    measure();

    const observer = new ResizeObserver(() => {
      measure();
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const nodes = useMemo(() => flattenNodes(snapshot), [snapshot]);
  const currentPage = useMemo(
    () => snapshot?.doc.pages.find((page) => page.id === CANVAS_PAGE_ID) ?? null,
    [snapshot?.doc.pages],
  );
  const pageGuides = currentPage?.guides ?? [];
  const activeNode = useMemo(
    () => selectedNode(nodes, snapshot?.selection ?? []),
    [nodes, snapshot?.selection],
  );
  const selectedShapeNodes = useMemo(
    () =>
      (snapshot?.selection ?? [])
        .map((nodeId) => nodes.find((node) => node.id === nodeId) ?? null)
        .filter(
          (node): node is SceneNode =>
            Boolean(node && node.kind === "shape" && node.shape && node.shape.primitive !== "line"),
        ),
    [nodes, snapshot?.selection],
  );
  const componentNodes = useMemo(
    () =>
      nodes.filter(
        (node): node is SceneNode & { component: NonNullable<SceneNode["component"]> } =>
          node.kind === "component" && Boolean(node.component),
      ),
    [nodes],
  );
  const editingTextNode = useMemo(
    () =>
      editingTextNodeId
        ? nodes.find((node) => node.id === editingTextNodeId && node.kind === "text") ?? null
        : null,
    [editingTextNodeId, nodes],
  );
  const rootFrame = useMemo(
    () => nodes.find((node) => node.parentId === null) ?? null,
    [nodes],
  );
  const canvasNodes = useMemo(
    () => nodes.filter((node) => node.parentId !== null),
    [nodes],
  );
  const liveMarqueeRect = useMemo(
    () => (dragMarquee ? normalizeRect(dragMarquee) : null),
    [dragMarquee],
  );
  const viewViewport = draftViewport ?? snapshot?.viewport ?? { zoom: 1, x: 0, y: 0 };
  const dragMoveDelta = useMemo(
    () =>
      dragMove
        ? {
            x: dragMove.currentX - dragMove.originX,
            y: dragMove.currentY - dragMove.originY,
          }
        : null,
    [dragMove],
  );
  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge || !dragMoveDelta) {
      setMoveSnapPreview(EMPTY_MOVE_SNAP_PREVIEW);
      return;
    }

    const seq = ++snapQuerySeqRef.current;
    void bridge
      .query({
        kind: "move_snap",
        deltaX: dragMoveDelta.x,
        deltaY: dragMoveDelta.y,
      })
      .then((result) => {
        if (snapQuerySeqRef.current !== seq) {
          return;
        }

        setMoveSnapPreview((result as MoveSnapPreview) ?? EMPTY_MOVE_SNAP_PREVIEW);
      })
      .catch(() => {
        if (snapQuerySeqRef.current === seq) {
          setMoveSnapPreview(EMPTY_MOVE_SNAP_PREVIEW);
        }
      });
  }, [dragMoveDelta]);

  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge || !selectionBounds || !dragTransform || dragTransform.handle === "rotate") {
      setResizeSnapPreview(EMPTY_RESIZE_SNAP_PREVIEW);
      return;
    }

    const seq = ++snapQuerySeqRef.current;
    void bridge
      .query({
        kind: "resize_snap",
        handle: dragTransform.handle,
        deltaX: dragTransform.currentX - dragTransform.originX,
        deltaY: dragTransform.currentY - dragTransform.originY,
        lockAspect: dragTransform.lockAspect,
      })
      .then((result) => {
        if (snapQuerySeqRef.current !== seq) {
          return;
        }

        setResizeSnapPreview((result as ResizeSnapPreview) ?? EMPTY_RESIZE_SNAP_PREVIEW);
      })
      .catch(() => {
        if (snapQuerySeqRef.current === seq) {
          setResizeSnapPreview(EMPTY_RESIZE_SNAP_PREVIEW);
        }
      });
  }, [dragTransform, selectionBounds]);
  const previewSelectionBounds = useMemo(() => {
    if (!selectionBounds) {
      return null;
    }

    if (dragMoveDelta) {
      return offsetRect(selectionBounds, moveSnapPreview.deltaX, moveSnapPreview.deltaY);
    }

    if (dragTransform) {
      if (dragTransform.handle === "rotate") {
        return selectionBounds;
      }

      return resizeSnapPreview.bounds;
    }

    return selectionBounds;
  }, [
    dragMoveDelta,
    dragTransform,
    moveSnapPreview.deltaX,
    moveSnapPreview.deltaY,
    resizeSnapPreview.bounds,
    selectionBounds,
  ]);
  const previewTransformHandles = useMemo(
    () => (dragMove || dragTransform ? buildTransformHandles(previewSelectionBounds) : transformHandles),
    [dragMove, dragTransform, previewSelectionBounds, transformHandles],
  );
  const previewGuides = useMemo(
    () =>
      dragGuide
        ? pageGuides.map((guide) =>
            guide.id === dragGuide.guideId ? { ...guide, position: dragGuide.currentPosition } : guide,
          )
        : pageGuides,
    [dragGuide, pageGuides],
  );
  const activeGuides = useMemo(
    () => (dragMove ? moveSnapPreview.guides : dragTransform ? resizeSnapPreview.guides : []),
    [dragMove, dragTransform, moveSnapPreview.guides, resizeSnapPreview.guides],
  );
  const rulerStep = useMemo(() => chooseRulerStep(viewViewport.zoom), [viewViewport.zoom]);
  const horizontalRulerTicks = useMemo(
    () => buildRulerTicks(canvasSize.width, viewViewport.x, viewViewport.zoom, rulerStep),
    [canvasSize.width, rulerStep, viewViewport.x, viewViewport.zoom],
  );
  const verticalRulerTicks = useMemo(
    () => buildRulerTicks(canvasSize.height, viewViewport.y, viewViewport.zoom, rulerStep),
    [canvasSize.height, rulerStep, viewViewport.y, viewViewport.zoom],
  );

  useEffect(() => {
    if (!editingTextNodeId) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const input = textEditorRef.current;
      if (!input) {
        return;
      }

      input.focus();
      input.select();
    });

    return () => cancelAnimationFrame(frame);
  }, [editingTextNodeId]);

  async function applyAndSync(commands: EditorCommand[]) {
    const bridge = bridgeRef.current;
    if (!bridge) {
      return;
    }

    const result = await bridge.dispatch(commands);
    setSnapshot(result.snapshot);
    setDraftViewport(null);
    await syncBridgeState();
  }

  async function updateConstraints(
    axis: "horizontal" | "vertical",
    value: HorizontalConstraint | VerticalConstraint,
  ) {
    if (!activeNode) {
      return;
    }

    const current = activeNode.constraints ?? { horizontal: "min", vertical: "min" };
    await applyAndSync([
      {
        kind: "set_node_constraints",
        nodeId: activeNode.id,
        constraints: {
          ...current,
          [axis]: value,
        },
      },
    ]);
  }

  async function updateAutoLayout(patch: Partial<AutoLayoutData> | null) {
    if (!activeNode || !supportsAutoLayout(activeNode)) {
      return;
    }

    const current: AutoLayoutData = activeNode.layout ?? {
      direction: "vertical",
      gap: 16,
      paddingX: 24,
      paddingY: 24,
      align: "start",
    };

    await applyAndSync([
      {
        kind: "set_node_auto_layout",
        nodeId: activeNode.id,
        layout: patch ? { ...current, ...patch } : null,
      },
    ]);
  }

  async function promoteActiveNodeToComponent(componentKey?: string) {
    if (!activeNode || !supportsComponentPromotion(activeNode)) {
      return;
    }

    await applyAndSync([
      {
        kind: "promote_to_component",
        nodeId: activeNode.id,
        ...(componentKey !== undefined ? { componentKey } : {}),
      },
    ]);
  }

  async function updateActiveComponentKey(componentKey: string) {
    if (!activeNode || !isComponentNode(activeNode)) {
      return;
    }

    await applyAndSync([
      {
        kind: "set_component_key",
        nodeId: activeNode.id,
        componentKey,
      },
    ]);
  }

  async function createInstanceFromActiveComponent() {
    if (!activeNode || !isComponentNode(activeNode)) {
      return;
    }

    await createInstanceFromComponentNode(activeNode.id);
  }

  async function createInstanceFromComponentNode(sourceNodeId: string) {
    await applyAndSync([
      {
        kind: "create_instance_from_component",
        pageId: CANVAS_PAGE_ID,
        sourceNodeId,
        offsetX: 56,
        offsetY: 56,
      },
    ]);
  }

  async function refreshActiveInstance() {
    if (!activeNode || !isInstanceNode(activeNode)) {
      return;
    }

    await applyAndSync([
      {
        kind: "refresh_instance",
        nodeId: activeNode.id,
      },
    ]);
  }

  async function detachActiveInstance() {
    if (!activeNode || !isInstanceNode(activeNode)) {
      return;
    }

    await applyAndSync([
      {
        kind: "detach_instance",
        nodeId: activeNode.id,
      },
    ]);
  }

  async function updateTextContent(content: string) {
    if (!activeNode || activeNode.kind !== "text") {
      return;
    }

    await applyAndSync([
      {
        kind: "set_text_content",
        nodeId: activeNode.id,
        content,
      },
    ]);
  }

  function beginInlineTextEdit(node: SceneNode) {
    if (node.kind !== "text") {
      return;
    }

    setSelectedGuideId(null);
    setEditingTextComposing(false);
    setEditingTextNodeId(node.id);
    setEditingTextDraft(node.text?.content ?? "");
  }

  async function commitInlineTextEdit() {
    if (!editingTextNode) {
      setEditingTextNodeId(null);
      setEditingTextDraft("");
      setEditingTextComposing(false);
      return;
    }

    const nextContent = editingTextDraft;
    setEditingTextNodeId(null);
    setEditingTextDraft("");
    setEditingTextComposing(false);

    if (nextContent === (editingTextNode.text?.content ?? "")) {
      return;
    }

    await updateTextContent(nextContent);
  }

  function cancelInlineTextEdit() {
    setEditingTextNodeId(null);
    setEditingTextDraft("");
    setEditingTextComposing(false);
  }

  async function updateTextStyle(style: TextStylePatch) {
    if (!activeNode || activeNode.kind !== "text") {
      return;
    }

    await applyAndSync([
      {
        kind: "set_text_style",
        nodeId: activeNode.id,
        style,
      },
    ]);
  }

  async function updateTextSizing(sizing: TextSizingMode) {
    if (!activeNode || activeNode.kind !== "text") {
      return;
    }

    await applyAndSync([
      {
        kind: "set_text_sizing",
        nodeId: activeNode.id,
        sizing,
      },
    ]);
  }

  async function updateShapePrimitive(primitive: ShapePrimitive) {
    if (!activeNode || activeNode.kind !== "shape") {
      return;
    }

    const commands: EditorCommand[] = [
      {
        kind: "set_shape_primitive",
        nodeId: activeNode.id,
        primitive,
      },
    ];

    if (primitive === "path") {
      commands.push({
        kind: "set_shape_path",
        nodeId: activeNode.id,
        path: activeNode.shape?.path
          ? structuredClone(activeNode.shape.path)
          : createDefaultShapePath(activeNode.frame),
      });
    }

    await applyAndSync(commands);
  }

  async function updateShapeStyle(style: ShapeStylePatch) {
    if (!activeNode || activeNode.kind !== "shape") {
      return;
    }

    await applyAndSync([
      {
        kind: "set_shape_style",
        nodeId: activeNode.id,
        style,
      },
    ]);
  }

  async function updateShapePath(path: ShapePathData) {
    if (!activeNode || activeNode.kind !== "shape") {
      return;
    }

    await applyAndSync([
      {
        kind: "set_shape_path",
        nodeId: activeNode.id,
        path,
      },
    ]);
  }

  async function runShapeBoolean(op: ShapeBooleanOp) {
    if (!snapshot || selectedShapeNodes.length < 2) {
      return;
    }

    const sourcePathDs = selectedShapeNodes
      .map((node) => nodeToAbsolutePathD(node))
      .filter((value): value is string => Boolean(value));

    if (sourcePathDs.length < 2) {
      return;
    }

    const rings = sourcePathDs
      .map((pathD) => pathDataToPolygon(pathD))
      .filter((ring): ring is number[][] => Boolean(ring));

    if (rings.length < 2) {
      return;
    }

    const resultPathD = runBooleanMultiple(rings, op);
    if (!resultPathD) {
      return;
    }

    const normalized = pathDToLocalShapePath(resultPathD);
    const styleSource = selectedShapeNodes[0]?.shape;
    const sharedParentId = selectedShapeNodes.every(
      (node) => node.parentId === selectedShapeNodes[0]?.parentId,
    )
      ? selectedShapeNodes[0]?.parentId ?? rootFrame?.id ?? null
      : rootFrame?.id ?? null;
    const newNodeId = `boolean-${op}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const newNode: SceneNode = {
      id: newNodeId,
      kind: "shape",
      name: `${op[0]!.toUpperCase()}${op.slice(1)} Result`,
      parentId: sharedParentId,
      children: undefined,
      frame: normalized.frame,
      shape: {
        primitive: "path",
        fill: styleSource?.fill ?? "#93c5fd",
        strokeColor: styleSource?.strokeColor ?? "#1d4ed8",
        strokeWidth: styleSource?.strokeWidth ?? 2,
        cornerRadius: 0,
        opacity: styleSource?.opacity ?? 1,
        path: normalized.path,
      },
    };

    const commands: EditorCommand[] = [
      {
        kind: "create_node",
        pageId: CANVAS_PAGE_ID,
        node: newNode,
      },
      ...selectedShapeNodes.map((node) => ({
        kind: "delete_node" as const,
        nodeId: node.id,
      })),
      {
        kind: "select_nodes",
        nodeIds: [newNodeId],
      },
    ];

    await applyAndSync(commands);
  }

  async function updateShapePathPoint(
    pointIndex: number,
    updater: (point: ShapePathData["points"][number]) => ShapePathData["points"][number],
  ) {
    if (!activeNode || activeNode.kind !== "shape" || activeNode.shape?.primitive !== "path") {
      return;
    }

    const points = structuredClone(activeNode.shape.path?.points ?? []);
    if (!points[pointIndex]) {
      return;
    }

    points[pointIndex] = updater(points[pointIndex]!);
    await updateShapePath({
      points,
      closed: activeNode.shape.path?.closed ?? false,
    });
  }

  async function selectNode(nodeId: string) {
    await applyAndSync([{ kind: "select_nodes", nodeIds: [nodeId] }]);
  }

  async function rerunValidation() {
    await syncBridgeState();
  }

  const runDeleteSelection = useCallback(async () => {
    if (!snapshot?.selection.length) {
      return;
    }

    const commands = snapshot.selection.map((nodeId) => ({
      kind: "delete_node" as const,
      nodeId,
    }));

    await applyAndSync(commands);
  }, [snapshot?.selection, syncBridgeState]);

  const runUndo = useCallback(async () => {
    await applyAndSync([{ kind: "undo" }]);
  }, [syncBridgeState]);

  const runRedo = useCallback(async () => {
    await applyAndSync([{ kind: "redo" }]);
  }, [syncBridgeState]);

  const finishPathDraft = useCallback(async () => {
    if (!pathDraft) {
      return;
    }

    const node = createDraftPathNode(pathDraft, rootFrame);
    if (!node) {
      setPathDraft(null);
      setActiveTool("select");
      return;
    }

    await applyAndSync([
      {
        kind: "create_node",
        pageId: CANVAS_PAGE_ID,
        node,
      },
      {
        kind: "select_nodes",
        nodeIds: [node.id],
      },
    ]);

    setPathDraft(null);
    setActiveTool("select");
  }, [applyAndSync, pathDraft, rootFrame]);

  const cancelPathDraft = useCallback(() => {
    setPathDraft(null);
    setActiveTool("select");
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (activeTool === "path") {
        if (event.key === "Escape") {
          event.preventDefault();
          cancelPathDraft();
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          void finishPathDraft();
          return;
        }
      }

      const isMeta = event.metaKey || event.ctrlKey;

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedGuideId) {
          event.preventDefault();
          const guideId = selectedGuideId;
          setSelectedGuideId(null);
          void applyAndSync([{ kind: "delete_guide", pageId: CANVAS_PAGE_ID, guideId }]);
          return;
        }

        if (snapshot?.selection.length) {
          event.preventDefault();
          void runDeleteSelection();
        }
        return;
      }

      if (!isMeta) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        void runUndo();
        return;
      }

      if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        void runRedo();
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        setSpacePressed(true);
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") {
        setSpacePressed(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    activeTool,
    applyAndSync,
    cancelPathDraft,
    finishPathDraft,
    runDeleteSelection,
    runRedo,
    runUndo,
    selectedGuideId,
    snapshot?.selection.length,
  ]);

  function toCanvasPointFromClient(clientX: number, clientY: number) {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) {
      return null;
    }

    const activeViewport = draftViewport ?? snapshot?.viewport ?? { zoom: 1, x: 0, y: 0 };

    return {
      x: (clientX - bounds.left - activeViewport.x) / activeViewport.zoom,
      y: (clientY - bounds.top - activeViewport.y) / activeViewport.zoom,
    };
  }

  function toCanvasPoint(event: React.PointerEvent<HTMLDivElement>) {
    return toCanvasPointFromClient(event.clientX, event.clientY);
  }

  async function handleNodePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    nodeId: string,
  ) {
    event.stopPropagation();
    setSelectedGuideId(null);

    if (editingTextNodeId === nodeId) {
      return;
    }

    if (event.button !== 0 || spacePressed) {
      return;
    }

    const point = toCanvasPoint(event as unknown as React.PointerEvent<HTMLDivElement>);
    if (!point) {
      return;
    }

    const alreadySelected = snapshot?.selection.includes(nodeId) ?? false;
    if (!alreadySelected) {
      await applyAndSync([{ kind: "select_nodes", nodeIds: [nodeId] }]);
    }

    setDragMove({
      originX: point.x,
      originY: point.y,
      currentX: point.x,
      currentY: point.y,
    });
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function handleNodeDoubleClick(
    event: React.MouseEvent<HTMLButtonElement>,
    node: SceneNode,
  ) {
    if (node.kind !== "text") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void selectNode(node.id);
    beginInlineTextEdit(node);
  }

  function handleTransformHandlePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    handle: TransformHandle,
  ) {
    event.stopPropagation();
    setSelectedGuideId(null);

    if (event.button !== 0 || !selectionBounds || spacePressed) {
      return;
    }

    const point = toCanvasPoint(event as unknown as React.PointerEvent<HTMLDivElement>);
    if (!point) {
      return;
    }

    setDragTransform({
      handle: handle.kind,
      originX: point.x,
      originY: point.y,
      currentX: point.x,
      currentY: point.y,
      lockAspect: event.shiftKey,
    });
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  async function addGuide(axis: "x" | "y", clientX: number, clientY: number) {
    const point = toCanvasPointFromClient(clientX, clientY);
    if (!point) {
      return;
    }

    const guide: SceneGuide = {
      id: createGuideId(),
      axis,
      position: Math.round(axis === "x" ? point.x : point.y),
    };

    setSelectedGuideId(guide.id);
    await applyAndSync([{ kind: "add_guide", pageId: CANVAS_PAGE_ID, guide }]);
  }

  function handleGuidePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    guide: SceneGuide,
  ) {
    event.stopPropagation();

    if (event.button !== 0) {
      return;
    }

    const point = toCanvasPointFromClient(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    setSelectedGuideId(guide.id);
    setDragGuide({
      guideId: guide.id,
      axis: guide.axis,
      currentPosition: Math.round(guide.axis === "x" ? point.x : point.y),
    });
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePathPointPointerDown(
    event: React.PointerEvent<HTMLDivElement>,
    node: SceneNode,
    pointIndex: number,
  ) {
    event.stopPropagation();
    event.preventDefault();

    if (event.button !== 0 || !node.shape?.path) {
      return;
    }

    const point = toCanvasPointFromClient(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    const localPoint = localShapePointFromCanvas(node, point.x, point.y);
    setDragPathPoint({
      nodeId: node.id,
      pointIndex,
      points: structuredClone(node.shape.path.points),
      closed: node.shape.path.closed,
      currentX: localPoint.x,
      currentY: localPoint.y,
    });
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePathHandlePointerDown(
    event: React.PointerEvent<HTMLDivElement>,
    node: SceneNode,
    pointIndex: number,
    handleKey: PathHandleKey,
  ) {
    event.stopPropagation();
    event.preventDefault();

    if (event.button !== 0 || !node.shape?.path) {
      return;
    }

    const point = toCanvasPointFromClient(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    const localPoint = localShapePointFromCanvas(node, point.x, point.y);
    setDragPathHandle({
      nodeId: node.id,
      pointIndex,
      handleKey,
      points: structuredClone(node.shape.path.points),
      closed: node.shape.path.closed,
      currentX: localPoint.x,
      currentY: localPoint.y,
    });
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function handleTopRulerDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
    void addGuide("x", event.clientX, event.clientY);
  }

  function handleLeftRulerDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
    void addGuide("y", event.clientX, event.clientY);
  }

  function handleCanvasPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) {
      return;
    }

    setSelectedGuideId(null);

    const activeViewport = draftViewport ?? snapshot?.viewport ?? { zoom: 1, x: 0, y: 0 };

    if (event.button === 1 || spacePressed) {
      setDragPan({
        originClientX: event.clientX,
        originClientY: event.clientY,
        startViewportX: activeViewport.x,
        startViewportY: activeViewport.y,
      });
      canvasRef.current?.setPointerCapture(event.pointerId);
      return;
    }

    const point = toCanvasPoint(event);
    if (!point) {
      return;
    }

    if (activeTool === "path") {
      setPathDraft((current) => ({
        closed: current?.closed ?? false,
        points: [...(current?.points ?? []), { x: point.x, y: point.y }],
      }));
      return;
    }

    setDragMarquee({
      originX: point.x,
      originY: point.y,
      currentX: point.x,
      currentY: point.y,
      additive: event.shiftKey,
    });
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function handleCanvasPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (dragPan) {
      const nextViewport = {
        zoom: viewViewport.zoom,
        x: dragPan.startViewportX + (event.clientX - dragPan.originClientX),
        y: dragPan.startViewportY + (event.clientY - dragPan.originClientY),
      };
      setDraftViewport(nextViewport);
      return;
    }

    if (dragGuide) {
      const point = toCanvasPoint(event);
      if (!point) {
        return;
      }

      setDragGuide((current) =>
        current
          ? {
              ...current,
              currentPosition: Math.round(current.axis === "x" ? point.x : point.y),
            }
          : current,
      );
      return;
    }

    if (dragPathHandle) {
      const point = toCanvasPoint(event);
      if (!point) {
        return;
      }

      const targetNode = nodes.find((node) => node.id === dragPathHandle.nodeId);
      if (!targetNode) {
        return;
      }

      const localPoint = localShapePointFromCanvas(targetNode, point.x, point.y);
      setDragPathHandle((current) =>
        current
          ? {
              ...current,
              currentX: localPoint.x,
              currentY: localPoint.y,
            }
          : current,
      );
      return;
    }

    if (dragPathPoint) {
      const point = toCanvasPoint(event);
      if (!point) {
        return;
      }

      const targetNode = nodes.find((node) => node.id === dragPathPoint.nodeId);
      if (!targetNode) {
        return;
      }

      const localPoint = localShapePointFromCanvas(targetNode, point.x, point.y);
      setDragPathPoint((current) =>
        current
          ? {
              ...current,
              currentX: localPoint.x,
              currentY: localPoint.y,
            }
          : current,
      );
      return;
    }

    if (dragMove) {
      const point = toCanvasPoint(event);
      if (!point) {
        return;
      }

      setDragMove((current) =>
        current
          ? {
              ...current,
              currentX: point.x,
              currentY: point.y,
            }
          : current,
      );
      return;
    }

    if (dragTransform) {
      const point = toCanvasPoint(event);
      if (!point) {
        return;
      }

      setDragTransform((current) =>
        current
          ? {
              ...current,
              currentX: point.x,
              currentY: point.y,
            }
          : current,
      );
      return;
    }

    if (!dragMarquee) {
      return;
    }

    const point = toCanvasPoint(event);
    if (!point) {
      return;
    }

    setDragMarquee((current) =>
      current
        ? {
            ...current,
            currentX: point.x,
            currentY: point.y,
          }
        : current,
    );
  }

  async function commitViewport(viewport: EditorSnapshot["viewport"]) {
    await applyAndSync([{ kind: "set_viewport", viewport }]);
  }

  async function zoomCanvas(multiplier: number) {
    const current = draftViewport ?? snapshot?.viewport ?? { zoom: 1, x: 0, y: 0 };
    const nextZoom = Math.min(4, Math.max(0.2, Number((current.zoom * multiplier).toFixed(3))));
    await commitViewport({ ...current, zoom: nextZoom });
  }

  async function finishMarqueeSelection() {
    if (!dragMarquee) {
      return;
    }

    const rect = normalizeRect(dragMarquee);
    setDragMarquee(null);

    const isClick =
      rect.w < 4 &&
      rect.h < 4;

    if (isClick) {
      await applyAndSync([{ kind: "select_nodes", nodeIds: [] }]);
      return;
    }

    await applyAndSync([
      {
        kind: "select_in_rect",
        pageId: CANVAS_PAGE_ID,
        rect,
        mode: dragMarquee.additive ? "add" : "replace",
      },
    ]);
  }

  function handleCanvasPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragPan) {
      if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
        canvasRef.current.releasePointerCapture(event.pointerId);
      }

      const viewportToCommit = draftViewport ?? snapshot?.viewport ?? { zoom: 1, x: 0, y: 0 };
      setDragPan(null);
      void commitViewport(viewportToCommit);
      return;
    }

    if (dragMove) {
      if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
        canvasRef.current.releasePointerCapture(event.pointerId);
      }

      const deltaX = dragMove.currentX - dragMove.originX;
      const deltaY = dragMove.currentY - dragMove.originY;
      setDragMove(null);

      if (Math.abs(deltaX) >= 0.5 || Math.abs(deltaY) >= 0.5) {
        void applyAndSync([
          {
            kind: "move_selection",
            deltaX: moveSnapPreview.deltaX,
            deltaY: moveSnapPreview.deltaY,
          },
        ]);
      }
      return;
    }

    if (dragGuide) {
      if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
        canvasRef.current.releasePointerCapture(event.pointerId);
      }

      const currentDrag = dragGuide;
      setDragGuide(null);
      void applyAndSync([
        {
          kind: "move_guide",
          pageId: CANVAS_PAGE_ID,
          guideId: currentDrag.guideId,
          position: currentDrag.currentPosition,
        },
      ]);
      return;
    }

    if (dragPathHandle) {
      if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
        canvasRef.current.releasePointerCapture(event.pointerId);
      }

      const currentDrag = dragPathHandle;
      setDragPathHandle(null);
      void applyAndSync([
        {
          kind: "set_shape_path",
          nodeId: currentDrag.nodeId,
          path: {
            closed: currentDrag.closed,
            points: applyDraggedPathHandleToPoints(
              currentDrag.points,
              currentDrag.pointIndex,
              currentDrag.handleKey,
              currentDrag.currentX,
              currentDrag.currentY,
            ),
          },
        },
      ]);
      return;
    }

    if (dragPathPoint) {
      if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
        canvasRef.current.releasePointerCapture(event.pointerId);
      }

      const currentDrag = dragPathPoint;
      setDragPathPoint(null);
      void applyAndSync([
        {
          kind: "set_shape_path",
          nodeId: currentDrag.nodeId,
          path: {
            closed: currentDrag.closed,
            points: applyDraggedPathPointToPoints(
              currentDrag.points,
              currentDrag.pointIndex,
              currentDrag.currentX,
              currentDrag.currentY,
            ),
          },
        },
      ]);
      return;
    }

    if (dragTransform) {
      if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
        canvasRef.current.releasePointerCapture(event.pointerId);
      }

      const currentDrag = dragTransform;
      setDragTransform(null);

      if (currentDrag.handle === "rotate") {
        if (!selectionBounds) {
          return;
        }

        const deltaDeg = angleDeltaFromBounds(
          selectionBounds,
          currentDrag.originX,
          currentDrag.originY,
          currentDrag.currentX,
          currentDrag.currentY,
        );

        if (Math.abs(deltaDeg) >= 0.5) {
          void applyAndSync([{ kind: "rotate_selection", deltaDeg }]);
        }
        return;
      }

      const deltaX = currentDrag.currentX - currentDrag.originX;
      const deltaY = currentDrag.currentY - currentDrag.originY;
      if (Math.abs(deltaX) >= 0.5 || Math.abs(deltaY) >= 0.5) {
        void applyAndSync([
          {
            kind: "resize_selection",
            handle: currentDrag.handle,
            deltaX: resizeSnapPreview.deltaX,
            deltaY: resizeSnapPreview.deltaY,
            lockAspect: currentDrag.lockAspect,
          },
        ]);
      }
      return;
    }

    if (!dragMarquee) {
      return;
    }

    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }

    void finishMarqueeSelection();
  }

  function handleCanvasPointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
    setDragPan(null);
    setDragGuide(null);
    setDragPathPoint(null);
    setDragPathHandle(null);
    setDragMove(null);
    setDragTransform(null);
    setDragMarquee(null);
  }

  async function handleCanvasWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!(event.metaKey || event.ctrlKey)) {
      return;
    }

    event.preventDefault();
    const current = draftViewport ?? snapshot?.viewport ?? { zoom: 1, x: 0, y: 0 };
    const multiplier = event.deltaY < 0 ? 1.08 : 0.92;
    const nextZoom = Math.min(4, Math.max(0.2, Number((current.zoom * multiplier).toFixed(3))));
    await commitViewport({ ...current, zoom: nextZoom });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-slate-950 px-3 py-1 text-sm font-semibold text-white">
            NULL v2
          </div>
          <div>
            <div className="text-sm font-semibold">
              {snapshot?.doc.title ?? "Loading editor shell"}
            </div>
            <div className="text-xs text-slate-500">
              {bridgeInfo ? `${bridgeInfo.kernel} bridge` : "Booting bridge"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTool("select");
              setPathDraft(null);
            }}
            className={`rounded-full border px-3 py-2 text-sm font-medium ${
              activeTool === "select"
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 text-slate-700"
            }`}
          >
            Select
          </button>
          <button
            type="button"
            onClick={() => setActiveTool("path")}
            className={`rounded-full border px-3 py-2 text-sm font-medium ${
              activeTool === "path"
                ? "border-[#2859ff] bg-[#2859ff] text-white"
                : "border-slate-200 text-slate-700"
            }`}
          >
            Path
          </button>
          {supportsComponentPromotion(activeNode) && activeNode?.kind !== "component" ? (
            <button
              type="button"
              onClick={() => void promoteActiveNodeToComponent()}
              className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
            >
              Create component
            </button>
          ) : null}
          {isComponentNode(activeNode) ? (
            <button
              type="button"
              onClick={() => void createInstanceFromActiveComponent()}
              className="rounded-full border border-[#2859ff]/25 bg-[#2859ff]/10 px-3 py-2 text-sm font-medium text-[#2859ff]"
            >
              Create instance
            </button>
          ) : null}
          {selectedShapeNodes.length >= 2 ? (
            <>
              <button
                type="button"
                onClick={() => void runShapeBoolean("union")}
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
              >
                Union
              </button>
              <button
                type="button"
                onClick={() => void runShapeBoolean("subtract")}
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
              >
                Subtract
              </button>
              <button
                type="button"
                onClick={() => void runShapeBoolean("intersect")}
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
              >
                Intersect
              </button>
              <button
                type="button"
                onClick={() => void runShapeBoolean("exclude")}
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
              >
                Exclude
              </button>
            </>
          ) : null}
          {activeTool === "path" ? (
            <>
              <label className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={pathDraft?.closed ?? false}
                  onChange={(event) =>
                    setPathDraft((current) =>
                      current
                        ? {
                            ...current,
                            closed: event.target.checked,
                          }
                        : {
                            points: [],
                            closed: event.target.checked,
                          },
                    )
                  }
                />
                Closed
              </label>
              <button
                type="button"
                onClick={() => void finishPathDraft()}
                disabled={(pathDraft?.points.length ?? 0) < 2}
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Finish
              </button>
              <button
                type="button"
                onClick={cancelPathDraft}
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => void zoomCanvas(0.9)}
            className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
          >
            -
          </button>
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
            {Math.round(viewViewport.zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => void zoomCanvas(1.1)}
            className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
          >
            +
          </button>
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
            schema v{bridgeInfo?.schemaVersion ?? 0}
          </span>
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
            version {snapshot?.version ?? 0}
          </span>
          <button
            type="button"
            onClick={rerunValidation}
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white"
          >
            Validate
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Layers
            </div>
          </div>
          <div className="space-y-1 p-3">
            {nodes.map((node) => {
              const selected = snapshot?.selection.includes(node.id) ?? false;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => void selectNode(node.id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                    selected
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-white"
                  }`}
                >
                  <span className="truncate text-sm font-medium">{node.name}</span>
                  <span className="ml-3 text-[11px] uppercase tracking-[0.14em] opacity-70">
                    {node.kind}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-slate-200 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Components
            </div>
          </div>
          <div className="space-y-2 p-3">
            {componentNodes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                No components yet.
              </div>
            ) : (
              componentNodes.map((node) => {
                const instanceCount = nodes.filter(
                  (candidate) => candidate.instance?.sourceComponentId === node.id,
                ).length;

                return (
                  <div
                    key={`component-panel-${node.id}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => void selectNode(node.id)}
                        className="min-w-0 text-left"
                      >
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {node.name}
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-500">
                          {node.component.componentKey}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => void createInstanceFromComponentNode(node.id)}
                        className="shrink-0 rounded-full bg-[#2859ff] px-3 py-1 text-xs font-semibold text-white"
                      >
                        Insert
                      </button>
                    </div>
                    <div className="mt-3 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                      {instanceCount} instance{instanceCount === 1 ? "" : "s"}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <main className="flex min-h-0 flex-col">
          <div className="border-b border-slate-200 bg-[#f8fafc] px-5 py-3 text-sm text-slate-600">
            Editor-first shell. Selection, marquee, handles, history, and diagnostics are driven
            through the v2 bridge contract.
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-[#edf1f7] p-8">
            <div
              ref={canvasRef}
              className="relative mx-auto h-[960px] w-full max-w-[1280px] rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerCancel}
              onWheel={handleCanvasWheel}
            >
              <div
                className="absolute inset-0 origin-top-left"
                style={{
                  transform: `translate(${viewViewport.x}px, ${viewViewport.y}px) scale(${viewViewport.zoom})`,
                }}
              >
                {rootFrame ? (
                  <div className="pointer-events-none absolute left-0 top-0 rounded-[28px] border border-dashed border-slate-200/80 p-5 text-xs uppercase tracking-[0.18em] text-slate-300">
                    {rootFrame.name}
                  </div>
                ) : null}

                {canvasNodes.map((node) => {
                  const selected = snapshot?.selection.includes(node.id) ?? false;
                  const previewX = selected && dragMoveDelta ? node.frame.x + dragMoveDelta.x : node.frame.x;
                  const previewY = selected && dragMoveDelta ? node.frame.y + dragMoveDelta.y : node.frame.y;
                  const textData = node.kind === "text" ? node.text : undefined;
                  const shapeData = node.kind === "shape" ? node.shape : undefined;
                  const previewPath =
                    shapeData?.primitive === "path"
                      ? withDraggedPathHandle(
                          node.id,
                          withDraggedPathPoint(node.id, shapeData.path, dragPathPoint),
                          dragPathHandle,
                        )
                      : shapeData?.path;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onPointerDown={(event) => void handleNodePointerDown(event, node.id)}
                      onClick={() => void selectNode(node.id)}
                      onDoubleClick={(event) => handleNodeDoubleClick(event, node)}
                      style={{
                        left: previewX,
                        top: previewY,
                        width: node.frame.w,
                        height: node.frame.h,
                        transform: `rotate(${node.frame.rotation}deg)`,
                        transformOrigin: "center",
                      }}
                      className={`absolute rounded-2xl border text-left transition ${
                        node.kind === "text" ? "bg-transparent" : "bg-slate-50"
                      } ${
                        selected
                          ? "border-slate-950 ring-2 ring-slate-950/15"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {node.kind === "component" ? (
                        <div className="pointer-events-none absolute left-2 top-2 rounded-full bg-[#2859ff] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                          Component
                        </div>
                      ) : null}
                      {node.kind === "instance" ? (
                        <div className="pointer-events-none absolute left-2 top-2 rounded-full border border-[#2859ff]/25 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#2859ff]">
                          Instance
                        </div>
                      ) : null}
                      {textData ? (
                        <div
                          className="h-full w-full p-1"
                          style={{
                            fontFamily: textData.fontFamily,
                            fontSize: textData.fontSize,
                            fontWeight: textData.fontWeight,
                            lineHeight: `${textData.lineHeight}px`,
                            letterSpacing: textData.letterSpacing,
                            color: textData.color,
                            textAlign: textData.align,
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {textData.content}
                        </div>
                      ) : shapeData ? (
                        shapeData.primitive === "line" ? (
                          <div className="flex h-full w-full items-center">
                            <div
                              className="w-full"
                              style={{
                                borderTop: `${Math.max(shapeData.strokeWidth, 1)}px solid ${shapeData.strokeColor}`,
                                opacity: shapeData.opacity,
                              }}
                            />
                          </div>
                        ) : shapeData.primitive === "path" ? (
                          <div className="relative h-full w-full">
                            <svg
                              className="h-full w-full overflow-visible"
                              viewBox={`0 0 ${Math.max(node.frame.w, 1)} ${Math.max(node.frame.h, 1)}`}
                            >
                              <path
                                d={shapePathToSvgD(previewPath)}
                                fill={previewPath?.closed ? shapeData.fill : "none"}
                                stroke={shapeData.strokeColor}
                                strokeWidth={Math.max(shapeData.strokeWidth, 1)}
                                opacity={shapeData.opacity}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                              />
                            </svg>
                            {selected
                              ? (previewPath?.points ?? []).map((point, pointIndex) => (
                                  <div key={`path-point-${node.id}-${pointIndex}`}>
                                    {point.handleIn ? (
                                      <>
                                        <div
                                          className="absolute border-t border-dashed border-[#2859ff]/70"
                                          style={{
                                            left: point.x,
                                            top: point.y,
                                            width: Math.max(
                                              Math.hypot(
                                                point.handleIn.x - point.x,
                                                point.handleIn.y - point.y,
                                              ),
                                              1,
                                            ),
                                            transformOrigin: "left center",
                                            transform: `translateY(-0.5px) rotate(${(Math.atan2(
                                              point.handleIn.y - point.y,
                                              point.handleIn.x - point.x,
                                            ) *
                                              180) /
                                              Math.PI}deg)`,
                                          }}
                                        />
                                        <div
                                          onPointerDown={(event) =>
                                            handlePathHandlePointerDown(event, node, pointIndex, "handleIn")
                                          }
                                          style={{
                                            left: point.handleIn.x - 4,
                                            top: point.handleIn.y - 4,
                                          }}
                                          className="absolute h-2.5 w-2.5 rounded-full border border-white bg-white shadow-[0_0_0_1px_rgba(40,89,255,0.7)]"
                                        />
                                      </>
                                    ) : null}
                                    {point.handleOut ? (
                                      <>
                                        <div
                                          className="absolute border-t border-dashed border-[#2859ff]/70"
                                          style={{
                                            left: point.x,
                                            top: point.y,
                                            width: Math.max(
                                              Math.hypot(
                                                point.handleOut.x - point.x,
                                                point.handleOut.y - point.y,
                                              ),
                                              1,
                                            ),
                                            transformOrigin: "left center",
                                            transform: `translateY(-0.5px) rotate(${(Math.atan2(
                                              point.handleOut.y - point.y,
                                              point.handleOut.x - point.x,
                                            ) *
                                              180) /
                                              Math.PI}deg)`,
                                          }}
                                        />
                                        <div
                                          onPointerDown={(event) =>
                                            handlePathHandlePointerDown(event, node, pointIndex, "handleOut")
                                          }
                                          style={{
                                            left: point.handleOut.x - 4,
                                            top: point.handleOut.y - 4,
                                          }}
                                          className="absolute h-2.5 w-2.5 rounded-full border border-white bg-white shadow-[0_0_0_1px_rgba(40,89,255,0.7)]"
                                        />
                                      </>
                                    ) : null}
                                    <div
                                      onPointerDown={(event) =>
                                        handlePathPointPointerDown(event, node, pointIndex)
                                      }
                                      style={{
                                        left: point.x - 5,
                                        top: point.y - 5,
                                      }}
                                      className="absolute h-3 w-3 rounded-full border border-white bg-[#2859ff] shadow-[0_0_0_1px_rgba(40,89,255,0.45)]"
                                    />
                                  </div>
                                ))
                              : null}
                          </div>
                        ) : (
                          <div
                            className="h-full w-full"
                            style={{
                              backgroundColor: shapeData.fill,
                              border: `${shapeData.strokeWidth}px solid ${shapeData.strokeColor}`,
                              borderRadius:
                                shapeData.primitive === "ellipse"
                                  ? "9999px"
                                  : `${shapeData.cornerRadius}px`,
                              opacity: shapeData.opacity,
                            }}
                          />
                        )
                      ) : (
                        <div className="p-4">
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                            {node.kind}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-900">
                            {node.name}
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}

                {pathDraft && pathDraft.points.length > 0 ? (
                  <div className="pointer-events-none absolute inset-0">
                    <svg className="h-full w-full overflow-visible">
                      <path
                        d={shapePathToSvgD({
                          closed: pathDraft.closed,
                          points: pathDraft.points,
                        })}
                        fill={pathDraft.closed ? "rgba(147,197,253,0.24)" : "none"}
                        stroke="#2859ff"
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                    {pathDraft.points.map((point, index) => (
                      <div
                        key={`draft-path-point-${index}`}
                        style={{
                          left: point.x - 4,
                          top: point.y - 4,
                        }}
                        className="absolute h-2.5 w-2.5 rounded-full border border-white bg-[#2859ff] shadow-[0_0_0_1px_rgba(40,89,255,0.45)]"
                      />
                    ))}
                  </div>
                ) : null}

                {editingTextNode && editingTextNode.text ? (
                  <textarea
                    ref={textEditorRef}
                    value={editingTextDraft}
                    onChange={(event) => setEditingTextDraft(event.target.value)}
                    onCompositionStart={() => setEditingTextComposing(true)}
                    onCompositionEnd={() => setEditingTextComposing(false)}
                    onBlur={() => void commitInlineTextEdit()}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (editingTextComposing || event.nativeEvent.isComposing) {
                        return;
                      }

                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelInlineTextEdit();
                        return;
                      }

                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void commitInlineTextEdit();
                      }
                    }}
                    style={{
                      left: editingTextNode.frame.x,
                      top: editingTextNode.frame.y,
                      width: editingTextNode.frame.w,
                      height: editingTextNode.frame.h,
                      transform: `rotate(${editingTextNode.frame.rotation}deg)`,
                      transformOrigin: "center",
                      fontFamily: editingTextNode.text.fontFamily,
                      fontSize: editingTextNode.text.fontSize,
                      fontWeight: editingTextNode.text.fontWeight,
                      lineHeight: `${editingTextNode.text.lineHeight}px`,
                      letterSpacing: editingTextNode.text.letterSpacing,
                      color: editingTextNode.text.color,
                      textAlign: editingTextNode.text.align,
                    }}
                    className="absolute z-20 resize-none overflow-hidden rounded-md border border-[#2859ff] bg-white px-1 py-1 outline-none ring-2 ring-[#2859ff]/15"
                  />
                ) : null}

                {previewGuides.map((guide) =>
                  guide.axis === "x" ? (
                    <button
                      key={guide.id}
                      type="button"
                      onPointerDown={(event) => handleGuidePointerDown(event, guide)}
                      className={`absolute top-0 h-full w-px ${
                        selectedGuideId === guide.id ? "bg-[#2859ff]" : "bg-[#2859ff]/65"
                      }`}
                      style={{ left: guide.position, cursor: "col-resize" }}
                      title="Vertical guide"
                    />
                  ) : (
                    <button
                      key={guide.id}
                      type="button"
                      onPointerDown={(event) => handleGuidePointerDown(event, guide)}
                      className={`absolute left-0 h-px w-full ${
                        selectedGuideId === guide.id ? "bg-[#2859ff]" : "bg-[#2859ff]/65"
                      }`}
                      style={{ top: guide.position, cursor: "row-resize" }}
                      title="Horizontal guide"
                    />
                  ),
                )}

                {previewSelectionBounds ? (
                  <div
                    className="pointer-events-none absolute border border-[#2859ff] shadow-[0_0_0_1px_rgba(40,89,255,0.12)]"
                    style={{
                      left: previewSelectionBounds.x,
                      top: previewSelectionBounds.y,
                      width: previewSelectionBounds.w,
                      height: previewSelectionBounds.h,
                    }}
                  />
                ) : null}

                {previewTransformHandles.map((handle) => (
                  <button
                    key={`${handle.kind}-${handle.x}-${handle.y}`}
                    type="button"
                    onPointerDown={(event) => handleTransformHandlePointerDown(event, handle)}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#2859ff] bg-white ${
                      handle.kind === "rotate" ? "h-3.5 w-3.5" : "h-3 w-3"
                    }`}
                    style={{
                      left: handle.x,
                      top: handle.y,
                      cursor: handle.cursor,
                    }}
                    title={handle.kind}
                  />
                ))}

                {liveMarqueeRect ? (
                  <div
                    className="pointer-events-none absolute border border-dashed border-[#2859ff] bg-[#2859ff]/10"
                    style={{
                      left: liveMarqueeRect.x,
                      top: liveMarqueeRect.y,
                      width: liveMarqueeRect.w,
                      height: liveMarqueeRect.h,
                    }}
                  />
                ) : null}

                {activeGuides.map((guide) =>
                  guide.axis === "x" ? (
                    <div
                      key={`guide-x-${guide.position}-${guide.spanStart}-${guide.spanEnd}`}
                      className="pointer-events-none absolute w-px bg-[#2859ff]/80"
                      style={{
                        left: guide.position,
                        top: guide.spanStart,
                        height: Math.max(1, guide.spanEnd - guide.spanStart),
                      }}
                    />
                  ) : (
                    <div
                      key={`guide-y-${guide.position}-${guide.spanStart}-${guide.spanEnd}`}
                      className="pointer-events-none absolute h-px bg-[#2859ff]/80"
                      style={{
                        left: guide.spanStart,
                        top: guide.position,
                        width: Math.max(1, guide.spanEnd - guide.spanStart),
                      }}
                    />
                  ),
                )}
              </div>
              <div
                className="absolute inset-x-0 top-0 h-7 border-b border-slate-200/90 bg-white/90 backdrop-blur-sm"
                onDoubleClick={handleTopRulerDoubleClick}
              >
                <div className="pointer-events-none absolute left-0 top-0 h-7 w-7 border-r border-slate-200/90 bg-slate-50/90" />
                {horizontalRulerTicks.map((tick) => (
                  <div
                    key={`ruler-x-${tick.value}-${tick.position}`}
                    className="pointer-events-none absolute top-0"
                    style={{ left: tick.position }}
                  >
                    <div
                      className={`w-px bg-slate-300/90 ${tick.major ? "h-4" : "h-2.5"} ml-0`}
                    />
                    {tick.major ? (
                      <div className="mt-0.5 -translate-x-1/2 text-[10px] font-medium text-slate-400">
                        {Math.round(tick.value)}
                      </div>
                    ) : null}
                  </div>
                ))}
                {activeGuides
                  .filter((guide) => guide.axis === "x")
                  .map((guide) => (
                    <div
                      key={`ruler-guide-x-${guide.position}`}
                      className="absolute top-0 h-7 w-px bg-[#2859ff]"
                      style={{ left: guide.position }}
                    />
                  ))}
                {previewGuides
                  .filter((guide) => guide.axis === "x")
                  .map((guide) => (
                    <button
                      key={`persistent-ruler-guide-x-${guide.id}`}
                      type="button"
                      onPointerDown={(event) => handleGuidePointerDown(event, guide)}
                      className={`absolute top-0 h-7 w-px ${
                        selectedGuideId === guide.id ? "bg-[#2859ff]" : "bg-[#2859ff]/80"
                      }`}
                      style={{ left: guide.position * viewViewport.zoom + viewViewport.x }}
                      title="Vertical guide"
                    />
                  ))}
              </div>
              <div
                className="absolute inset-y-0 left-0 w-7 border-r border-slate-200/90 bg-white/90 backdrop-blur-sm"
                onDoubleClick={handleLeftRulerDoubleClick}
              >
                <div className="pointer-events-none absolute left-0 top-0 h-7 w-7 border-b border-slate-200/90 bg-slate-50/90" />
                {verticalRulerTicks.map((tick) => (
                  <div
                    key={`ruler-y-${tick.value}-${tick.position}`}
                    className="pointer-events-none absolute left-0"
                    style={{ top: tick.position }}
                  >
                    <div
                      className={`h-px bg-slate-300/90 ${tick.major ? "w-4" : "w-2.5"} mt-0`}
                    />
                    {tick.major ? (
                      <div
                        className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-400"
                        style={{ writingMode: "vertical-rl" }}
                      >
                        {Math.round(tick.value)}
                      </div>
                    ) : null}
                  </div>
                ))}
                {activeGuides
                  .filter((guide) => guide.axis === "y")
                  .map((guide) => (
                    <div
                      key={`ruler-guide-y-${guide.position}`}
                      className="absolute left-0 h-px w-7 bg-[#2859ff]"
                      style={{ top: guide.position }}
                    />
                  ))}
                {previewGuides
                  .filter((guide) => guide.axis === "y")
                  .map((guide) => (
                    <button
                      key={`persistent-ruler-guide-y-${guide.id}`}
                      type="button"
                      onPointerDown={(event) => handleGuidePointerDown(event, guide)}
                      className={`absolute left-0 h-px w-7 ${
                        selectedGuideId === guide.id ? "bg-[#2859ff]" : "bg-[#2859ff]/80"
                      }`}
                      style={{ top: guide.position * viewViewport.zoom + viewViewport.y }}
                      title="Horizontal guide"
                    />
                  ))}
              </div>
              <div
                className={`pointer-events-none absolute bottom-4 left-4 rounded-full border px-3 py-1 text-xs font-medium ${
                  dragPan || spacePressed
                    ? "border-[#2859ff]/20 bg-[#2859ff]/10 text-[#2859ff]"
                    : "border-slate-200 bg-white/90 text-slate-500"
                }`}
              >
                {dragPan || spacePressed ? "Pan mode" : "Hold Space or use middle mouse to pan"}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[1.4fr_1fr] border-t border-slate-200 bg-white">
            <div className="border-r border-slate-200 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Diagnostics
              </div>
              <div className="mt-3 space-y-2">
                {validation?.issues.length ? (
                  validation.issues.map((issue) => (
                    <div
                      key={issue.id}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                    >
                      <div className="font-semibold">{issue.code}</div>
                      <div className="text-xs">{issue.message}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                    No validation issues in the scaffold document.
                  </div>
                )}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Runtime handoff
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  {runtimeGraph?.routes.length ?? 0} route
                  {(runtimeGraph?.routes.length ?? 0) === 1 ? "" : "s"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Minimal preview/publish contract only.
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  {selectionSummary(snapshot?.selection ?? [])}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Click to select, drag on canvas to marquee, Cmd/Ctrl+Z to undo, Delete to
                  remove.
                </div>
              </div>
            </div>
          </div>
        </main>

        <aside className="border-l border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Inspector
            </div>
          </div>
          <div className="space-y-5 p-4">
            <section>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Selection
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                {activeNode ? (
                  <>
                    <div className="text-sm font-semibold text-slate-900">{activeNode.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                      {activeNode.kind}
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-slate-400">X</dt>
                        <dd className="font-medium text-slate-900">{activeNode.frame.x}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Y</dt>
                        <dd className="font-medium text-slate-900">{activeNode.frame.y}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">W</dt>
                        <dd className="font-medium text-slate-900">{activeNode.frame.w}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">H</dt>
                        <dd className="font-medium text-slate-900">{activeNode.frame.h}</dd>
                      </div>
                    </dl>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-slate-400">Horizontal</div>
                        <select
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                          value={activeNode.constraints?.horizontal ?? "min"}
                          onChange={(event) =>
                            void updateConstraints("horizontal", event.target.value as HorizontalConstraint)
                          }
                        >
                          {HORIZONTAL_CONSTRAINT_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="text-slate-400">Vertical</div>
                        <select
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                          value={activeNode.constraints?.vertical ?? "min"}
                          onChange={(event) =>
                            void updateConstraints("vertical", event.target.value as VerticalConstraint)
                          }
                        >
                          {VERTICAL_CONSTRAINT_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {supportsAutoLayout(activeNode) ? (
                      <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">Auto layout</div>
                            <div className="text-xs text-slate-500">
                              Stack direct children in the Rust kernel.
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void updateAutoLayout(activeNode.layout ? null : {})}
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              activeNode.layout
                                ? "bg-[#2859ff] text-white"
                                : "border border-slate-200 bg-white text-slate-600"
                            }`}
                          >
                            {activeNode.layout ? "Enabled" : "Disabled"}
                          </button>
                        </div>
                        {activeNode.layout ? (
                          <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                              <div className="text-slate-400">Direction</div>
                              <select
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                                value={activeNode.layout.direction}
                                onChange={(event) =>
                                  void updateAutoLayout({
                                    direction: event.target.value as AutoLayoutDirection,
                                  })
                                }
                              >
                                {AUTO_LAYOUT_DIRECTION_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block">
                              <div className="text-slate-400">Align</div>
                              <select
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                                value={activeNode.layout.align}
                                onChange={(event) =>
                                  void updateAutoLayout({
                                    align: event.target.value as AutoLayoutAlign,
                                  })
                                }
                              >
                                {AUTO_LAYOUT_ALIGN_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block">
                              <div className="text-slate-400">Gap</div>
                              <input
                                type="number"
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                                value={activeNode.layout.gap}
                                onChange={(event) =>
                                  void updateAutoLayout({
                                    gap: Number(event.target.value) || 0,
                                  })
                                }
                              />
                            </label>
                            <label className="block">
                              <div className="text-slate-400">Padding X</div>
                              <input
                                type="number"
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                                value={activeNode.layout.paddingX}
                                onChange={(event) =>
                                  void updateAutoLayout({
                                    paddingX: Number(event.target.value) || 0,
                                  })
                                }
                              />
                            </label>
                            <label className="block">
                              <div className="text-slate-400">Padding Y</div>
                              <input
                                type="number"
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                                value={activeNode.layout.paddingY}
                                onChange={(event) =>
                                  void updateAutoLayout({
                                    paddingY: Number(event.target.value) || 0,
                                  })
                                }
                              />
                            </label>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {supportsComponentPromotion(activeNode) || isInstanceNode(activeNode) ? (
                      <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">Component</div>
                            <div className="text-xs text-slate-500">
                              Promote reusable frames and place linked instances.
                            </div>
                          </div>
                          {supportsComponentPromotion(activeNode) && activeNode.kind !== "component" ? (
                            <button
                              type="button"
                              onClick={() => void promoteActiveNodeToComponent()}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                            >
                              Create component
                            </button>
                          ) : null}
                          {isComponentNode(activeNode) ? (
                            <button
                              type="button"
                              onClick={() => void createInstanceFromActiveComponent()}
                              className="rounded-full bg-[#2859ff] px-3 py-1 text-xs font-semibold text-white"
                            >
                              Create instance
                            </button>
                          ) : null}
                        </div>
                        {isComponentNode(activeNode) ? (
                          <label className="block">
                            <div className="text-slate-400">Component key</div>
                            <input
                              type="text"
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                              value={activeNode.component?.componentKey ?? ""}
                              onChange={(event) =>
                                void updateActiveComponentKey(event.target.value)
                              }
                            />
                          </label>
                        ) : null}
                        {isInstanceNode(activeNode) ? (
                          <div className="space-y-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
                            <div>
                              <div className="text-slate-400">Source component</div>
                              <div className="mt-1 font-medium text-slate-900">
                                {activeNode.instance?.sourceComponentKey}
                              </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {activeNode.instance?.sourceComponentId}
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                              Text overrides: {activeNode.instance?.textOverrides?.length ?? 0}
                            </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void refreshActiveInstance()}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                              >
                                Refresh
                              </button>
                              <button
                                type="button"
                                onClick={() => void detachActiveInstance()}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                              >
                                Detach
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {activeNode.kind === "text" && activeNode.text ? (
                      <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
                        <div>
                          <div className="text-slate-400">Content</div>
                          <textarea
                            className="mt-1 h-28 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                            value={activeNode.text.content}
                            onChange={(event) => void updateTextContent(event.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <div className="text-slate-400">Font size</div>
                            <input
                              type="number"
                              min={1}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                              value={activeNode.text.fontSize}
                              onChange={(event) =>
                                void updateTextStyle({ fontSize: Number(event.target.value) || 1 })
                              }
                            />
                          </label>
                          <label className="block">
                            <div className="text-slate-400">Line height</div>
                            <input
                              type="number"
                              min={1}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                              value={activeNode.text.lineHeight}
                              onChange={(event) =>
                                void updateTextStyle({ lineHeight: Number(event.target.value) || 1 })
                              }
                            />
                          </label>
                          <label className="block">
                            <div className="text-slate-400">Weight</div>
                            <input
                              type="number"
                              min={100}
                              step={100}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                              value={activeNode.text.fontWeight}
                              onChange={(event) =>
                                void updateTextStyle({ fontWeight: Number(event.target.value) || 400 })
                              }
                            />
                          </label>
                          <label className="block">
                            <div className="text-slate-400">Letter spacing</div>
                            <input
                              type="number"
                              step={0.1}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                              value={activeNode.text.letterSpacing}
                              onChange={(event) =>
                                void updateTextStyle({ letterSpacing: Number(event.target.value) || 0 })
                              }
                            />
                          </label>
                          <label className="block">
                            <div className="text-slate-400">Align</div>
                            <select
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                              value={activeNode.text.align}
                              onChange={(event) =>
                                void updateTextStyle({ align: event.target.value as TextAlign })
                              }
                            >
                              {TEXT_ALIGN_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <div className="text-slate-400">Sizing</div>
                            <select
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                              value={activeNode.text.sizing ?? "fixed"}
                              onChange={(event) =>
                                void updateTextSizing(event.target.value as TextSizingMode)
                              }
                            >
                              {TEXT_SIZING_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <div className="text-slate-400">Color</div>
                            <input
                              type="color"
                              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-2 py-1"
                              value={activeNode.text.color}
                              onChange={(event) => void updateTextStyle({ color: event.target.value })}
                            />
                          </label>
                        </div>
                      </div>
                    ) : null}
                    {supportsShapeEditing(activeNode) ? (
                      <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
                        <div className="text-sm font-semibold text-slate-900">Shape</div>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <div className="text-slate-400">Primitive</div>
                            <select
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                              value={activeNode.shape?.primitive}
                              onChange={(event) =>
                                void updateShapePrimitive(event.target.value as ShapePrimitive)
                              }
                            >
                              {SHAPE_PRIMITIVE_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <div className="text-slate-400">Opacity</div>
                            <input
                              type="number"
                              min={0}
                              max={1}
                              step={0.05}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                              value={activeNode.shape?.opacity ?? 1}
                              onChange={(event) =>
                                void updateShapeStyle({ opacity: Number(event.target.value) || 0 })
                              }
                            />
                          </label>
                          <label className="block">
                            <div className="text-slate-400">Fill</div>
                            <input
                              type="color"
                              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-2 py-1"
                              value={activeNode.shape?.fill ?? "#ffffff"}
                              onChange={(event) => void updateShapeStyle({ fill: event.target.value })}
                            />
                          </label>
                          <label className="block">
                            <div className="text-slate-400">Stroke</div>
                            <input
                              type="color"
                              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-2 py-1"
                              value={activeNode.shape?.strokeColor ?? "#000000"}
                              onChange={(event) =>
                                void updateShapeStyle({ strokeColor: event.target.value })
                              }
                            />
                          </label>
                          <label className="block">
                            <div className="text-slate-400">Stroke width</div>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                              value={activeNode.shape?.strokeWidth ?? 0}
                              onChange={(event) =>
                                void updateShapeStyle({ strokeWidth: Number(event.target.value) || 0 })
                              }
                            />
                          </label>
                          <label className="block">
                            <div className="text-slate-400">Radius</div>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              disabled={activeNode.shape?.primitive !== "rect"}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition disabled:bg-slate-100 disabled:text-slate-400 focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                              value={activeNode.shape?.cornerRadius ?? 0}
                              onChange={(event) =>
                                void updateShapeStyle({ cornerRadius: Number(event.target.value) || 0 })
                              }
                            />
                          </label>
                        </div>
                        {activeNode.shape?.primitive === "path" ? (
                          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <label className="flex items-center justify-between text-sm font-medium text-slate-700">
                              <span>Closed path</span>
                              <input
                                type="checkbox"
                                checked={activeNode.shape.path?.closed ?? false}
                                onChange={(event) =>
                                  void updateShapePath({
                                    points: structuredClone(activeNode.shape?.path?.points ?? []),
                                    closed: event.target.checked,
                                  })
                                }
                              />
                            </label>
                            <div className="space-y-2">
                              {(activeNode.shape.path?.points ?? []).map((point, index, points) => (
                                <div
                                  key={`path-point-${index}`}
                                  className="space-y-2 rounded-xl border border-slate-200 bg-white p-3"
                                >
                                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                                    <input
                                      type="number"
                                      step={1}
                                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                                      value={point.x}
                                      onChange={(event) =>
                                        void updateShapePathPoint(index, (current) => ({
                                          ...current,
                                          x: Number(event.target.value) || 0,
                                        }))
                                      }
                                    />
                                    <input
                                      type="number"
                                      step={1}
                                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                                      value={point.y}
                                      onChange={(event) =>
                                        void updateShapePathPoint(index, (current) => ({
                                          ...current,
                                          y: Number(event.target.value) || 0,
                                        }))
                                      }
                                    />
                                    <button
                                      type="button"
                                      disabled={points.length <= 2}
                                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                                      onClick={() => {
                                        if (points.length <= 2) {
                                          return;
                                        }
                                        const nextPoints = points.filter((_, pointIndex) => pointIndex !== index);
                                        void updateShapePath({
                                          points: nextPoints,
                                          closed: activeNode.shape?.path?.closed ?? false,
                                        });
                                      }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                                      onClick={() => {
                                        const curveHandles = createCurveHandles(
                                          points,
                                          index,
                                          activeNode.shape?.path?.closed ?? false,
                                        );
                                        if (!curveHandles) {
                                          return;
                                        }
                                        void updateShapePathPoint(index, (current) => ({
                                          ...current,
                                          ...curveHandles,
                                        }));
                                      }}
                                    >
                                      Curve
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                                      onClick={() =>
                                        void updateShapePathPoint(index, (current) => ({
                                          ...current,
                                          handleIn: undefined,
                                          handleOut: undefined,
                                        }))
                                      }
                                    >
                                      Corner
                                    </button>
                                  </div>
                                  {point.handleIn || point.handleOut ? (
                                    <div className="grid grid-cols-2 gap-2">
                                      <label className="block">
                                        <div className="text-slate-400">In X</div>
                                        <input
                                          type="number"
                                          step={1}
                                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                                          value={point.handleIn?.x ?? point.x}
                                          onChange={(event) =>
                                            void updateShapePathPoint(index, (current) => ({
                                              ...current,
                                              handleIn: {
                                                x: Number(event.target.value) || 0,
                                                y: current.handleIn?.y ?? current.y,
                                              },
                                            }))
                                          }
                                        />
                                      </label>
                                      <label className="block">
                                        <div className="text-slate-400">In Y</div>
                                        <input
                                          type="number"
                                          step={1}
                                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                                          value={point.handleIn?.y ?? point.y}
                                          onChange={(event) =>
                                            void updateShapePathPoint(index, (current) => ({
                                              ...current,
                                              handleIn: {
                                                x: current.handleIn?.x ?? current.x,
                                                y: Number(event.target.value) || 0,
                                              },
                                            }))
                                          }
                                        />
                                      </label>
                                      <label className="block">
                                        <div className="text-slate-400">Out X</div>
                                        <input
                                          type="number"
                                          step={1}
                                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                                          value={point.handleOut?.x ?? point.x}
                                          onChange={(event) =>
                                            void updateShapePathPoint(index, (current) => ({
                                              ...current,
                                              handleOut: {
                                                x: Number(event.target.value) || 0,
                                                y: current.handleOut?.y ?? current.y,
                                              },
                                            }))
                                          }
                                        />
                                      </label>
                                      <label className="block">
                                        <div className="text-slate-400">Out Y</div>
                                        <input
                                          type="number"
                                          step={1}
                                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2859ff] focus:ring-2 focus:ring-[#2859ff]/20"
                                          value={point.handleOut?.y ?? point.y}
                                          onChange={(event) =>
                                            void updateShapePathPoint(index, (current) => ({
                                              ...current,
                                              handleOut: {
                                                x: current.handleOut?.x ?? current.x,
                                                y: Number(event.target.value) || 0,
                                              },
                                            }))
                                          }
                                        />
                                      </label>
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                              onClick={() => {
                                const points = structuredClone(activeNode.shape?.path?.points ?? []);
                                const lastPoint = points[points.length - 1] ?? {
                                  x: Math.round(activeNode.frame.w / 2),
                                  y: Math.round(activeNode.frame.h / 2),
                                };
                                points.push({
                                  x: Math.min(lastPoint.x + 24, activeNode.frame.w),
                                  y: Math.min(lastPoint.y + 24, activeNode.frame.h),
                                });
                                void updateShapePath({
                                  points,
                                  closed: activeNode.shape?.path?.closed ?? false,
                                });
                              }}
                            >
                              Add point
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="text-sm text-slate-500">Select a layer or canvas object.</div>
                )}
              </div>
            </section>

            <section>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Bridge state
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <div>mode: {bridgeInfo?.mode ?? "loading"}</div>
                <div className="mt-1">kernel: {bridgeInfo?.kernel ?? "loading"}</div>
                <div className="mt-1">
                  viewport: {Math.round(viewViewport.zoom * 100)}% / {Math.round(viewViewport.x)}/
                  {Math.round(viewViewport.y)}
                </div>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
