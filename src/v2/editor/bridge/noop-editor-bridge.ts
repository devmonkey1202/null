import {
  type AutoLayoutAlign,
  type AutoLayoutData,
  type BridgeQuery,
  type ComponentNodeData,
  type DistributionAxis,
  type EditorApplyResult,
  type EditorBridge,
  type EditorCommand,
  type EditorRect,
  type EditorSnapshot,
  type EditorViewport,
  type HitTestResult,
  type HorizontalConstraint,
  type MoveSnapPreview,
  type NodeConstraints,
  type LayoutSizingAxis,
  type ResizeSnapPreview,
  type RuntimeGraph,
  type SceneDoc,
  type SceneGuide,
  type SceneNode,
  type ScenePage,
  type InstanceNodeData,
  type InstanceOverrideKind,
  type InstanceShapeOverride,
  type InstanceTextOverride,
  type ReorderNodePosition,
  type SelectionAlignment,
  type SelectionSetMode,
  type SnapGuide,
  type ShapeNodeData,
  type ShapePathData,
  type ShapeStylePatch,
  type TextNodeData,
  type TextRange,
  type TextStylePatch,
  type TransformHandle,
  type ValidationReport,
  type VerticalConstraint,
  V2_EDITOR_SCHEMA_VERSION,
} from "@/v2/editor/contracts";
import { DEFAULT_LAYOUT_SIZING, resolveAutoLayout, resolveLayoutSizing } from "@/v2/editor/auto-layout";
import { buildFallbackTextLayout, fallbackTextAutoHeight } from "@/v2/editor/text-layout-fallback";

const DEFAULT_VIEWPORT: EditorViewport = { zoom: 1, x: 0, y: 0 };

function cloneDoc(document: SceneDoc): SceneDoc {
  return structuredClone(document);
}

function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return structuredClone(snapshot);
}

function buildValidation(document: SceneDoc): ValidationReport {
  const issues = [];

  if (!document.title.trim()) {
    issues.push({
      id: "missing-title",
      severity: "warning" as const,
      code: "doc.title.empty",
      message: "Document title is empty.",
    });
  }

  if (document.pages.length === 0) {
    issues.push({
      id: "missing-pages",
      severity: "error" as const,
      code: "doc.pages.empty",
      message: "Document must contain at least one page.",
    });
  }

  for (const page of document.pages) {
    for (const node of page.nodes) {
      if (node.kind === "text") {
        if (!node.text) {
          issues.push({
            id: `text-data-missing-${node.id}`,
            severity: "error" as const,
            code: "scene_text.data.missing",
            message: "Text node is missing text data.",
            targetId: node.id,
          });
          continue;
        }

        if (!node.text.content.trim()) {
          issues.push({
            id: `text-content-empty-${node.id}`,
            severity: "warning" as const,
            code: "scene_text.content.empty",
            message: "Text content is empty.",
            targetId: node.id,
          });
        }

        if (node.text.fontSize <= 0 || node.text.lineHeight <= 0) {
          issues.push({
            id: `text-metrics-invalid-${node.id}`,
            severity: "error" as const,
            code: "scene_text.metrics.invalid",
            message: "Text font size and line height must be greater than zero.",
            targetId: node.id,
          });
        }
      }

      if (node.kind === "component") {
        if (!node.component?.componentKey?.trim()) {
          issues.push({
            id: `component-data-missing-${node.id}`,
            severity: "error" as const,
            code: "scene_component.data.missing",
            message: "Component node is missing component metadata.",
            targetId: node.id,
          });
        }
      } else if (node.component) {
        issues.push({
          id: `component-data-unexpected-${node.id}`,
          severity: "error" as const,
          code: "scene_component.data.unexpected",
          message: "Only component nodes may contain component metadata.",
          targetId: node.id,
        });
      }

      if (node.kind === "instance") {
        const source = page.nodes.find(
          (candidate) => candidate.id === node.instance?.sourceComponentId,
        );
        if (
          !node.instance?.sourceComponentId?.trim() ||
          !node.instance?.sourceComponentKey?.trim() ||
          source?.kind !== "component"
        ) {
          issues.push({
            id: `instance-data-missing-${node.id}`,
            severity: "error" as const,
            code: "scene_instance.data.invalid",
            message: "Instance node must reference an existing component on the same page.",
            targetId: node.id,
          });
        }
      } else if (node.instance) {
        issues.push({
          id: `instance-data-unexpected-${node.id}`,
          severity: "error" as const,
          code: "scene_instance.data.unexpected",
          message: "Only instance nodes may contain instance metadata.",
          targetId: node.id,
        });
      }

      if (node.kind === "shape") {
        if (!node.shape) {
          issues.push({
            id: `shape-data-missing-${node.id}`,
            severity: "error" as const,
            code: "scene_shape.data.missing",
            message: "Shape node is missing shape data.",
            targetId: node.id,
          });
          continue;
        }

        if (node.shape.strokeWidth < 0 || node.shape.cornerRadius < 0) {
          issues.push({
            id: `shape-metrics-invalid-${node.id}`,
            severity: "error" as const,
            code: "scene_shape.metrics.invalid",
            message: "Shape stroke width and corner radius must be zero or greater.",
            targetId: node.id,
          });
        }

        if (node.shape.opacity < 0 || node.shape.opacity > 1) {
          issues.push({
            id: `shape-opacity-invalid-${node.id}`,
            severity: "error" as const,
            code: "scene_shape.opacity.invalid",
            message: "Shape opacity must be between 0 and 1.",
            targetId: node.id,
          });
        }

        if (node.shape.primitive === "path") {
          if (!node.shape.path) {
            issues.push({
              id: `shape-path-missing-${node.id}`,
              severity: "error" as const,
              code: "scene_shape.path.missing",
              message: "Path shape is missing path data.",
              targetId: node.id,
            });
          } else {
            if (node.shape.path.points.length < 2) {
              issues.push({
                id: `shape-path-points-invalid-${node.id}`,
                severity: "error" as const,
                code: "scene_shape.path.points.invalid",
                message: "Path shape must contain at least two points.",
                targetId: node.id,
              });
            }

            if (node.shape.path.closed && node.shape.path.points.length < 3) {
              issues.push({
                id: `shape-path-closed-invalid-${node.id}`,
                severity: "error" as const,
                code: "scene_shape.path.closed.invalid",
                message: "Closed path shape must contain at least three points.",
                targetId: node.id,
              });
            }
          }
        }
      }
    }
  }

  return {
    documentId: document.documentId,
    generatedAt: new Date().toISOString(),
    issues,
  };
}

function updateNode(
  pages: SceneDoc["pages"],
  nodeId: string,
  updater: (node: SceneNode) => SceneNode,
): SceneDoc["pages"] {
  return pages.map((page) => ({
    ...page,
    nodes: page.nodes.map((node) => (node.id === nodeId ? updater(node) : node)),
  }));
}

function buildPageNodeMap(page: ScenePage) {
  return new Map(page.nodes.map((node) => [node.id, node] as const));
}

function resolveAbsoluteFrame(
  nodeId: string,
  nodeMap: Map<string, SceneNode>,
  cache: Map<string, EditorRect>,
  lineage = new Set<string>(),
): EditorRect | null {
  const cached = cache.get(nodeId);
  if (cached) {
    return cached;
  }

  const node = nodeMap.get(nodeId);
  if (!node) {
    return null;
  }

  if (lineage.has(nodeId)) {
    return {
      ...node.frame,
    };
  }

  lineage.add(nodeId);
  const parentFrame = node.parentId
    ? resolveAbsoluteFrame(node.parentId, nodeMap, cache, lineage)
    : null;
  lineage.delete(nodeId);

  const frame = parentFrame
    ? {
        ...node.frame,
        x: parentFrame.x + node.frame.x,
        y: parentFrame.y + node.frame.y,
        rotation: normalizeDegrees(parentFrame.rotation + node.frame.rotation),
      }
    : {
        ...node.frame,
      };
  cache.set(nodeId, frame);
  return frame;
}

function buildAbsoluteFrameMap(nodes: SceneNode[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
  const cache = new Map<string, EditorRect>();
  nodes.forEach((node) => {
    resolveAbsoluteFrame(node.id, nodeMap, cache);
  });
  return cache;
}

function pointInsideRect(frame: EditorRect, x: number, y: number) {
  return (
    x >= frame.x &&
    y >= frame.y &&
    x <= frame.x + frame.w &&
    y <= frame.y + frame.h
  );
}

function rectsIntersect(a: EditorRect, b: EditorRect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function buildSelectionBounds(document: SceneDoc, selection: string[]) {
  const frames = document.pages.flatMap((page) => {
    const frameMap = buildAbsoluteFrameMap(page.nodes);
    return page.nodes
      .filter((node) => selection.includes(node.id))
      .map((node) => frameMap.get(node.id))
      .filter((frame): frame is EditorRect => Boolean(frame));
  });

  if (frames.length === 0) {
    return null;
  }

  const left = Math.min(...frames.map((frame) => frame.x));
  const top = Math.min(...frames.map((frame) => frame.y));
  const right = Math.max(...frames.map((frame) => frame.x + frame.w));
  const bottom = Math.max(...frames.map((frame) => frame.y + frame.h));

  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
    rotation: 0,
  };
}

function buildTransformHandles(bounds: ReturnType<typeof buildSelectionBounds>): TransformHandle[] {
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

function selectionPage(document: SceneDoc, selection: string[]) {
  if (selection.length > 0) {
    const selectedId = selection[0]!;
    return document.pages.find((page) => page.nodes.some((node) => node.id === selectedId)) ?? null;
  }

  return document.pages[0] ?? null;
}

function offsetRect(rect: EditorRect, deltaX: number, deltaY: number): EditorRect {
  return {
    ...rect,
    x: rect.x + deltaX,
    y: rect.y + deltaY,
  };
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
): MoveSnapPreview {
  if (!selectionBounds || !delta) {
    return {
      deltaX: delta?.x ?? 0,
      deltaY: delta?.y ?? 0,
      guides: [],
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
): ResizeSnapPreview {
  if (!originalBounds || !previewBounds || !handle || handle === "rotate") {
    return {
      bounds: previewBounds,
      deltaX: 0,
      deltaY: 0,
      guides: [],
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

  return {
    bounds,
    deltaX:
      handle === "e" || handle === "ne" || handle === "se"
        ? bounds.x + bounds.w - (originalBounds.x + originalBounds.w)
        : handle === "w" || handle === "nw" || handle === "sw"
          ? bounds.x - originalBounds.x
          : 0,
    deltaY:
      handle === "s" || handle === "se" || handle === "sw"
        ? bounds.y + bounds.h - (originalBounds.y + originalBounds.h)
        : handle === "n" || handle === "ne" || handle === "nw"
          ? bounds.y - originalBounds.y
          : 0,
    guides,
  };
}

function applyTextStylePatch(text: TextNodeData, style: TextStylePatch): TextNodeData {
  return {
    ...text,
    ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
    ...(style.fontSize !== undefined ? { fontSize: Math.max(style.fontSize, 1) } : {}),
    ...(style.fontWeight !== undefined ? { fontWeight: style.fontWeight } : {}),
    ...(style.lineHeight !== undefined ? { lineHeight: Math.max(style.lineHeight, 1) } : {}),
    ...(style.letterSpacing !== undefined ? { letterSpacing: style.letterSpacing } : {}),
    ...(style.paragraphSpacing !== undefined ? { paragraphSpacing: Math.max(style.paragraphSpacing, 0) } : {}),
    ...(style.align ? { align: style.align } : {}),
    ...(style.color ? { color: style.color } : {}),
    ...(style.textCase !== undefined ? { textCase: style.textCase } : {}),
    ...(style.italic !== undefined ? { italic: style.italic } : {}),
    ...(style.underline !== undefined ? { underline: style.underline } : {}),
    ...(style.lineThrough !== undefined ? { lineThrough: style.lineThrough } : {}),
  };
}

function normalizeTextRanges(content: string, ranges: TextRange[] | undefined): TextRange[] | undefined {
  if (!ranges?.length) {
    return undefined;
  }

  const length = content.length;
  const normalized = ranges
    .map((range) => ({
      start: Math.max(0, Math.min(length, Math.floor(range.start))),
      end: Math.max(0, Math.min(length, Math.floor(range.end))),
      ...(range.style ? { style: { ...range.style } } : {}),
    }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => (left.start === right.start ? left.end - right.end : left.start - right.start));

  return normalized.length ? normalized : undefined;
}

function normalizeTextData(text: TextNodeData): TextNodeData {
  return {
    ...text,
    ranges: normalizeTextRanges(text.content, text.ranges),
  };
}

function applyTextRangeSet(text: TextNodeData, ranges: TextRange[]): TextNodeData {
  return {
    ...text,
    ranges: normalizeTextRanges(text.content, ranges),
  };
}

function applyInstanceTextOverrideToText(
  text: TextNodeData,
  override: {
    content?: string;
    style?: TextStylePatch;
    ranges?: TextRange[];
  },
): TextNodeData {
  let nextText: TextNodeData = {
    ...text,
    ...(override.content !== undefined ? { content: override.content } : {}),
  };

  nextText = normalizeTextData(nextText);

  if (override.style) {
    nextText = applyTextStylePatch(nextText, override.style);
  }

  if (override.ranges !== undefined) {
    nextText = applyTextRangeSet(nextText, override.ranges);
  }

  return normalizeTextData(nextText);
}

function applyShapeStylePatch(shape: ShapeNodeData, style: ShapeStylePatch): ShapeNodeData {
  return {
    ...shape,
    ...(style.fill ? { fill: style.fill } : {}),
    ...(style.strokeColor ? { strokeColor: style.strokeColor } : {}),
    ...(style.strokeWidth !== undefined ? { strokeWidth: Math.max(style.strokeWidth, 0) } : {}),
    ...(style.cornerRadius !== undefined ? { cornerRadius: Math.max(style.cornerRadius, 0) } : {}),
    ...(style.opacity !== undefined ? { opacity: Math.min(Math.max(style.opacity, 0), 1) } : {}),
  };
}

function applyShapePath(shape: ShapeNodeData, path: ShapePathData): ShapeNodeData {
  return {
    ...shape,
    primitive: "path",
    path: structuredClone(path),
  };
}

function promoteNodeToComponent(
  node: SceneNode,
  componentKey?: string,
): SceneNode {
  if (node.kind !== "frame" && node.kind !== "group" && node.kind !== "component") {
    throw new Error(`Node '${node.id}' cannot be promoted to a component.`);
  }

  return {
    ...node,
    kind: "component",
    component: {
      componentKey: componentKey?.trim() || `component-${node.id}`,
    } satisfies ComponentNodeData,
    instance: undefined,
    instanceSourceNodeId: undefined,
  };
}

function mergeTextStylePatch(
  current: TextStylePatch | undefined,
  next: TextStylePatch,
): TextStylePatch {
  return {
    ...(current ?? {}),
    ...(next.fontFamily !== undefined ? { fontFamily: next.fontFamily } : {}),
    ...(next.fontSize !== undefined ? { fontSize: next.fontSize } : {}),
    ...(next.fontWeight !== undefined ? { fontWeight: next.fontWeight } : {}),
    ...(next.lineHeight !== undefined ? { lineHeight: next.lineHeight } : {}),
    ...(next.letterSpacing !== undefined ? { letterSpacing: next.letterSpacing } : {}),
    ...(next.paragraphSpacing !== undefined ? { paragraphSpacing: next.paragraphSpacing } : {}),
    ...(next.align !== undefined ? { align: next.align } : {}),
    ...(next.color !== undefined ? { color: next.color } : {}),
    ...(next.textCase !== undefined ? { textCase: next.textCase } : {}),
    ...(next.italic !== undefined ? { italic: next.italic } : {}),
    ...(next.underline !== undefined ? { underline: next.underline } : {}),
    ...(next.lineThrough !== undefined ? { lineThrough: next.lineThrough } : {}),
  };
}

function upsertInstanceTextOverride(
  overrides: InstanceTextOverride[] | undefined,
  sourceNodeId: string,
  patch: {
    content?: string;
    style?: TextStylePatch;
    ranges?: TextRange[];
  },
) {
  const nextOverrides = structuredClone(overrides ?? []);
  const current = nextOverrides.find((entry) => entry.sourceNodeId === sourceNodeId);
  if (current) {
    if (patch.content !== undefined) {
      current.content = patch.content;
    }
    if (patch.style) {
      current.style = mergeTextStylePatch(current.style, patch.style);
    }
    if (patch.ranges !== undefined) {
      current.ranges = structuredClone(patch.ranges);
    }
    return nextOverrides;
  }

  nextOverrides.push({
    sourceNodeId,
    ...(patch.content !== undefined ? { content: patch.content } : {}),
    ...(patch.style ? { style: patch.style } : {}),
    ...(patch.ranges !== undefined ? { ranges: structuredClone(patch.ranges) } : {}),
  } satisfies InstanceTextOverride);
  return nextOverrides;
}

function upsertInstanceShapeOverride(
  overrides: InstanceShapeOverride[] | undefined,
  sourceNodeId: string,
  style: ShapeStylePatch,
) {
  const nextOverrides = structuredClone(overrides ?? []);
  const current = nextOverrides.find((entry) => entry.sourceNodeId === sourceNodeId);
  if (current) {
    current.style = mergeShapeStylePatch(current.style, style);
    return nextOverrides;
  }

  nextOverrides.push({
    sourceNodeId,
    style: structuredClone(style),
  } satisfies InstanceShapeOverride);
  return nextOverrides;
}

function mergeShapeStylePatch(
  current: ShapeStylePatch | undefined,
  next: ShapeStylePatch,
): ShapeStylePatch {
  return {
    ...(current ?? {}),
    ...(next.fill !== undefined ? { fill: next.fill } : {}),
    ...(next.strokeColor !== undefined ? { strokeColor: next.strokeColor } : {}),
    ...(next.strokeWidth !== undefined ? { strokeWidth: next.strokeWidth } : {}),
    ...(next.cornerRadius !== undefined ? { cornerRadius: next.cornerRadius } : {}),
    ...(next.opacity !== undefined ? { opacity: next.opacity } : {}),
  };
}

function syncComponentKeyOnPages(pages: ScenePage[], nodeId: string, componentKey: string) {
  const nextKey = componentKey.trim();
  if (!nextKey) {
    throw new Error("Component key cannot be empty.");
  }

  return pages.map((page) => ({
    ...page,
    nodes: page.nodes.map((node) => {
      if (node.id === nodeId) {
        if (node.kind !== "component" || !node.component) {
          throw new Error(`Node '${nodeId}' is not a component.`);
        }
        return {
          ...node,
          component: {
            componentKey: nextKey,
          } satisfies ComponentNodeData,
        };
      }
      if (node.instance?.sourceComponentId === nodeId) {
        return {
          ...node,
          instance: {
            ...node.instance,
            sourceComponentKey: nextKey,
          } satisfies InstanceNodeData,
        };
      }
      return node;
    }),
  }));
}

function findInstanceRootId(document: SceneDoc, nodeId: string) {
  let currentId: string | null = nodeId;
  while (currentId) {
    const currentNode = document.pages
      .flatMap((page) => page.nodes)
      .find((node) => node.id === currentId);
    if (!currentNode) {
      return null;
    }
    if (currentNode.kind === "instance" && currentNode.instance) {
      return currentNode.id;
    }
    currentId = currentNode.parentId;
  }
  return null;
}

function syncTextOverrideOnPages(
  document: SceneDoc,
  nodeId: string,
  patch: {
    content?: string;
    style?: TextStylePatch;
    ranges?: TextRange[];
  },
) {
  const instanceRootId = findInstanceRootId(document, nodeId);
  if (!instanceRootId) {
    return document.pages;
  }

  const node = document.pages.flatMap((page) => page.nodes).find((candidate) => candidate.id === nodeId);
  const sourceNodeId = node?.instanceSourceNodeId;
  if (!sourceNodeId) {
    return document.pages;
  }

  return document.pages.map((page) => ({
    ...page,
    nodes: page.nodes.map((candidate) => {
      if (candidate.id !== instanceRootId || candidate.kind !== "instance" || !candidate.instance) {
        return candidate;
      }

      return {
        ...candidate,
        instance: {
          ...candidate.instance,
          textOverrides: upsertInstanceTextOverride(candidate.instance.textOverrides, sourceNodeId, patch),
        } satisfies InstanceNodeData,
      };
    }),
  }));
}

function syncShapeOverrideOnPages(
  document: SceneDoc,
  nodeId: string,
  style: ShapeStylePatch,
) {
  const instanceRootId = findInstanceRootId(document, nodeId);
  if (!instanceRootId) {
    return document.pages;
  }

  const node = document.pages.flatMap((page) => page.nodes).find((candidate) => candidate.id === nodeId);
  const sourceNodeId = node?.instanceSourceNodeId;
  if (!sourceNodeId) {
    return document.pages;
  }

  return document.pages.map((page) => ({
    ...page,
    nodes: page.nodes.map((candidate) => {
      if (candidate.id !== instanceRootId || candidate.kind !== "instance" || !candidate.instance) {
        return candidate;
      }

      return {
        ...candidate,
        instance: {
          ...candidate.instance,
          shapeOverrides: upsertInstanceShapeOverride(candidate.instance.shapeOverrides, sourceNodeId, style),
        } satisfies InstanceNodeData,
      };
    }),
  }));
}

function createInstanceSubtree(
  document: SceneDoc,
  pageId: string,
  sourceNodeId: string,
  offsetX: number,
  offsetY: number,
) {
  const sourcePage = document.pages.find((page) => page.nodes.some((node) => node.id === sourceNodeId));
  if (!sourcePage) {
    throw new Error(`Component '${sourceNodeId}' was not found.`);
  }

  const sourceRoot = sourcePage.nodes.find((node) => node.id === sourceNodeId);
  if (!sourceRoot || sourceRoot.kind !== "component" || !sourceRoot.component) {
    throw new Error(`Node '${sourceNodeId}' is not a component.`);
  }

  const targetPage = document.pages.find((page) => page.id === pageId);
  if (!targetPage) {
    throw new Error(`Page '${pageId}' was not found.`);
  }

  const visited = new Set<string>();
  const order: string[] = [];
  const stack = [sourceNodeId];
  while (stack.length) {
    const currentId = stack.pop()!;
    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);
    order.push(currentId);
    const current = sourcePage.nodes.find((node) => node.id === currentId);
    for (const childId of [...(current?.children ?? [])].reverse()) {
      stack.push(childId);
    }
  }

  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const idMap = new Map(order.map((oldId, index) => [oldId, `instance-${sourceNodeId}-${nonce}-${index}`]));
  const targetParentId =
    sourceRoot.parentId && targetPage.nodes.some((node) => node.id === sourceRoot.parentId)
      ? sourceRoot.parentId
      : targetPage.rootId;

  const clonedNodes = order.map((oldId) => {
    const original = sourcePage.nodes.find((node) => node.id === oldId)!;
    const next: SceneNode = structuredClone(original);
    next.id = idMap.get(oldId)!;
    next.parentId =
      oldId === sourceNodeId
        ? targetParentId
        : original.parentId
          ? (idMap.get(original.parentId) ?? null)
          : null;
    next.children = original.children?.map((childId) => idMap.get(childId)!).filter(Boolean);
    next.frame = {
      ...next.frame,
      x: next.frame.x + offsetX,
      y: next.frame.y + offsetY,
    };
    next.instanceSourceNodeId = original.id;
    if (oldId === sourceNodeId) {
      next.kind = "instance";
      next.component = undefined;
      next.instance = {
        sourceComponentId: sourceRoot.id,
        sourceComponentKey: sourceRoot.component!.componentKey,
        textOverrides: [],
        shapeOverrides: [],
      } satisfies InstanceNodeData;
    }
    return next;
  });

  const createdRootId = clonedNodes[0]!.id;
  return {
    targetParentId,
    createdRootId,
    clonedNodes,
  };
}

function refreshInstanceSubtree(document: SceneDoc, nodeId: string) {
  const instancePage = document.pages.find((page) => page.nodes.some((node) => node.id === nodeId));
  if (!instancePage) {
    throw new Error(`Instance '${nodeId}' was not found.`);
  }

  const instanceRoot = instancePage.nodes.find((node) => node.id === nodeId);
  if (!instanceRoot || instanceRoot.kind !== "instance" || !instanceRoot.instance) {
    throw new Error(`Node '${nodeId}' is not an instance.`);
  }

  const sourcePage = document.pages.find((page: ScenePage) =>
    page.nodes.some((node) => node.id === instanceRoot.instance?.sourceComponentId),
  );
  if (!sourcePage) {
    throw new Error(`Component '${instanceRoot.instance.sourceComponentId}' was not found.`);
  }

  const sourceRoot = sourcePage.nodes.find(
    (node) => node.id === instanceRoot.instance?.sourceComponentId,
  );
  if (!sourceRoot || sourceRoot.kind !== "component" || !sourceRoot.component) {
    throw new Error(`Node '${instanceRoot.instance.sourceComponentId}' is not a component.`);
  }

  const order: string[] = [];
  const stack = [sourceRoot.id];
  const visited = new Set<string>();
  while (stack.length) {
    const currentId = stack.pop()!;
    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);
    order.push(currentId);
    const current = sourcePage.nodes.find((node) => node.id === currentId);
    for (const childId of [...(current?.children ?? [])].reverse()) {
      stack.push(childId);
    }
  }

  const oldInstanceIds: string[] = [];
  const oldStack = [nodeId];
  const oldVisited = new Set<string>();
  while (oldStack.length) {
    const currentId = oldStack.pop()!;
    if (oldVisited.has(currentId)) {
      continue;
    }
    oldVisited.add(currentId);
    oldInstanceIds.push(currentId);
    const current = instancePage.nodes.find((node) => node.id === currentId);
    for (const childId of [...(current?.children ?? [])].reverse()) {
      oldStack.push(childId);
    }
  }

  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const idMap = new Map(
    order.map((oldId, index) => [
      oldId,
      oldId === sourceRoot.id ? nodeId : `instance-${sourceRoot.id}-refresh-${nonce}-${index}`,
    ]),
  );
  const offsetX = instanceRoot.frame.x - sourceRoot.frame.x;
  const offsetY = instanceRoot.frame.y - sourceRoot.frame.y;

  const refreshedNodes = order.map((oldId) => {
    const original = sourcePage.nodes.find((node) => node.id === oldId)!;
    const next: SceneNode = structuredClone(original);
    next.id = idMap.get(oldId)!;
    next.parentId =
      oldId === sourceRoot.id
        ? instanceRoot.parentId
        : original.parentId
          ? (idMap.get(original.parentId) ?? null)
          : null;
    next.children = original.children?.map((childId) => idMap.get(childId)!).filter(Boolean);
    next.frame = {
      ...next.frame,
      x: next.frame.x + offsetX,
      y: next.frame.y + offsetY,
    };
    next.instanceSourceNodeId = original.id;
    if (oldId === sourceRoot.id) {
      next.kind = "instance";
      next.component = undefined;
      next.instance = {
        sourceComponentId: sourceRoot.id,
        sourceComponentKey: sourceRoot.component!.componentKey,
        textOverrides: structuredClone(instanceRoot.instance?.textOverrides ?? []),
        shapeOverrides: structuredClone(instanceRoot.instance?.shapeOverrides ?? []),
      } satisfies InstanceNodeData;
    }
    return next;
  });

  const overrides = instanceRoot.instance.textOverrides ?? [];
  for (const override of overrides) {
    const targetNode = refreshedNodes.find(
      (candidate) => candidate.instanceSourceNodeId === override.sourceNodeId,
    );
    if (!targetNode?.text) {
      continue;
    }
    targetNode.text = applyInstanceTextOverrideToText(targetNode.text, override);
  }

  const shapeOverrides = instanceRoot.instance.shapeOverrides ?? [];
  for (const override of shapeOverrides) {
    const targetNode = refreshedNodes.find(
      (candidate) => candidate.instanceSourceNodeId === override.sourceNodeId,
    );
    if (!targetNode?.shape || !override.style) {
      continue;
    }
    targetNode.shape = applyShapeStylePatch(targetNode.shape, override.style);
  }

  return {
    pageId: instancePage.id,
    refreshedNodes,
    oldInstanceIds,
  };
}

function detachInstanceNode(node: SceneNode): SceneNode {
  if (node.kind !== "instance") {
    throw new Error(`Node '${node.id}' is not an instance.`);
  }

  return {
    ...node,
    kind: "frame",
    instance: undefined,
    instanceSourceNodeId: undefined,
  };
}

function clearInstanceOverridesNode(
  node: SceneNode,
  overrideKind: InstanceOverrideKind,
  sourceNodeId?: string,
): SceneNode {
  if (node.kind !== "instance" || !node.instance) {
    throw new Error(`Node '${node.id}' is not an instance.`);
  }

  const clearTextOverrides = () =>
    sourceNodeId
      ? (node.instance?.textOverrides ?? []).filter((entry) => entry.sourceNodeId !== sourceNodeId)
      : [];
  const clearShapeOverrides = () =>
    sourceNodeId
      ? (node.instance?.shapeOverrides ?? []).filter((entry) => entry.sourceNodeId !== sourceNodeId)
      : [];

  return {
    ...node,
    instance: {
      ...node.instance,
      ...(overrideKind === "all" || overrideKind === "text"
        ? { textOverrides: clearTextOverrides() }
        : {}),
      ...(overrideKind === "all" || overrideKind === "shape"
        ? { shapeOverrides: clearShapeOverrides() }
        : {}),
    } satisfies InstanceNodeData,
  };
}

function collectSubtreeIds(nodes: SceneNode[], rootId: string) {
  const ordered: string[] = [];
  const stack = [rootId];
  const visited = new Set<string>();

  while (stack.length) {
    const currentId = stack.pop()!;
    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);
    ordered.push(currentId);
    const current = nodes.find((node) => node.id === currentId);
    for (const childId of [...(current?.children ?? [])].reverse()) {
      stack.push(childId);
    }
  }

  return ordered;
}

function rebuildPageNodeOrder(page: ScenePage) {
  const nodeMap = new Map(page.nodes.map((node) => [node.id, node] as const));
  const ordered: SceneNode[] = [];
  const visited = new Set<string>();

  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) {
      return;
    }

    const node = nodeMap.get(nodeId);
    if (!node) {
      return;
    }

    visited.add(nodeId);
    ordered.push(node);

    const childIds = node.children?.length
      ? node.children
      : page.nodes.filter((candidate) => candidate.parentId === node.id).map((candidate) => candidate.id);
    childIds.forEach((childId) => visit(childId));
  };

  visit(page.rootId);
  page.nodes.forEach((node) => visit(node.id));
  page.nodes = ordered;
}

function reorderNode(document: SceneDoc, nodeId: string, position: ReorderNodePosition) {
  const nextDocument = structuredClone(document);

  for (const page of nextDocument.pages) {
    const target = page.nodes.find((node) => node.id === nodeId);
    if (!target) {
      continue;
    }

    if (page.rootId === nodeId) {
      throw new Error(`Root node '${nodeId}' cannot be reordered.`);
    }

    const parentId = target.parentId;
    const parent =
      parentId != null ? page.nodes.find((node) => node.id === parentId) ?? null : null;
    const siblingIds = parent
      ? [...orderedChildIds(page, parent)]
      : page.nodes
          .filter((node) => node.parentId == null && node.id !== page.rootId)
          .map((node) => node.id);
    const currentIndex = siblingIds.indexOf(nodeId);
    if (currentIndex === -1 || siblingIds.length <= 1) {
      return nextDocument;
    }

    let nextIndex = currentIndex;
    switch (position) {
      case "back":
        nextIndex = 0;
        break;
      case "backward":
        nextIndex = Math.max(0, currentIndex - 1);
        break;
      case "forward":
        nextIndex = Math.min(siblingIds.length - 1, currentIndex + 1);
        break;
      case "front":
        nextIndex = siblingIds.length - 1;
        break;
    }

    if (nextIndex === currentIndex) {
      return nextDocument;
    }

    const [movedId] = siblingIds.splice(currentIndex, 1);
    siblingIds.splice(nextIndex, 0, movedId!);

    if (parent) {
      parent.children = siblingIds;
    } else {
      const subtreeOrder = siblingIds.flatMap((siblingId) => collectSubtreeIds(page.nodes, siblingId));
      const subtreeSet = new Set(subtreeOrder);
      const orderedNodes = subtreeOrder
        .map((id) => page.nodes.find((node) => node.id === id))
        .filter((node): node is SceneNode => Boolean(node));
      const remainingNodes = page.nodes.filter((node) => !subtreeSet.has(node.id));
      page.nodes = [...remainingNodes, ...orderedNodes];
    }

    rebuildPageNodeOrder(page);
    return nextDocument;
  }

  throw new Error(`Node '${nodeId}' was not found.`);
}

function groupSelection(document: SceneDoc, selection: string[]) {
  const nextDocument = structuredClone(document);
  const groupedRootIds: string[] = [];
  const dirtyNodeIds: string[] = [];

  for (const page of nextDocument.pages) {
    const sourceNodes = structuredClone(page.nodes);
    const nodeMap = new Map(sourceNodes.map((node) => [node.id, node] as const));
    const selectionSet = new Set(selection.filter((nodeId) => nodeMap.has(nodeId)));
    if (selectionSet.size < 2) {
      continue;
    }

    const selectedRootIds = sourceNodes
      .filter(
        (node) =>
          selectionSet.has(node.id) &&
          node.id !== page.rootId &&
          !hasSelectedAncestor(node, selectionSet, nodeMap),
      )
      .map((node) => node.id);

    if (selectedRootIds.length < 2) {
      continue;
    }

    const sharedParentId = nodeMap.get(selectedRootIds[0]!)?.parentId ?? null;
    if (
      !sharedParentId ||
      !selectedRootIds.every((nodeId) => nodeMap.get(nodeId)?.parentId === sharedParentId)
    ) {
      continue;
    }

    const sourceParent = sourceNodes.find((node) => node.id === sharedParentId);
    if (!sourceParent) {
      continue;
    }

    const siblingIds = orderedChildIdsFromNodes(sourceNodes, sourceParent);
    const orderedSelectedRootIds = siblingIds.filter((nodeId) => selectedRootIds.includes(nodeId));
    const absoluteFrameMap = buildAbsoluteFrameMap(sourceNodes);
    const selectedFrames = orderedSelectedRootIds
      .map((nodeId) => absoluteFrameMap.get(nodeId))
      .filter((frame): frame is EditorRect => Boolean(frame));
    if (selectedFrames.length !== orderedSelectedRootIds.length) {
      continue;
    }

    const parentFrame = absoluteFrameMap.get(sharedParentId) ?? {
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      rotation: 0,
    };
    const left = Math.min(...selectedFrames.map((frame) => frame.x));
    const top = Math.min(...selectedFrames.map((frame) => frame.y));
    const right = Math.max(...selectedFrames.map((frame) => frame.x + frame.w));
    const bottom = Math.max(...selectedFrames.map((frame) => frame.y + frame.h));
    const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    page.nodes = page.nodes.map((node) => {
      if (!orderedSelectedRootIds.includes(node.id)) {
        return node;
      }

      const absoluteFrame = absoluteFrameMap.get(node.id) ?? node.frame;
      return {
        ...node,
        parentId: groupId,
        frame: {
          ...node.frame,
          x: absoluteFrame.x - left,
          y: absoluteFrame.y - top,
        },
      };
    });

    page.nodes.push({
      id: groupId,
      kind: "group",
      name: "Group",
      parentId: sharedParentId,
      children: [...orderedSelectedRootIds],
      frame: {
        x: left - parentFrame.x,
        y: top - parentFrame.y,
        w: Math.max(right - left, 1),
        h: Math.max(bottom - top, 1),
        rotation: 0,
      },
      constraints: { horizontal: "min", vertical: "min" },
      layout: undefined,
      layoutSizing: undefined,
      text: undefined,
      shape: undefined,
      component: undefined,
      instance: undefined,
      instanceSourceNodeId: undefined,
    });

    const parent = page.nodes.find((node) => node.id === sharedParentId);
    if (parent) {
      let inserted = false;
      parent.children = siblingIds.flatMap((siblingId) => {
        if (orderedSelectedRootIds.includes(siblingId)) {
          if (!inserted) {
            inserted = true;
            return [groupId];
          }
          return [];
        }
        return [siblingId];
      });
    }

    rebuildPageNodeOrder(page);
    groupedRootIds.push(groupId);
    dirtyNodeIds.push(groupId, sharedParentId, ...orderedSelectedRootIds);
  }

  return {
    document: normalizeDocument(nextDocument),
    groupedRootIds,
    dirtyNodeIds: [...new Set(dirtyNodeIds)],
  };
}

function ungroupSelection(document: SceneDoc, selection: string[]) {
  const nextDocument = structuredClone(document);
  const nextSelectionIds: string[] = [];
  const dirtyNodeIds: string[] = [];

  for (const page of nextDocument.pages) {
    const selectedGroupIds = selection.filter((nodeId) => {
      const node = page.nodes.find((candidate) => candidate.id === nodeId);
      return node?.kind === "group";
    });
    if (!selectedGroupIds.length) {
      continue;
    }

    for (const groupId of selectedGroupIds) {
      const sourceNodes = structuredClone(page.nodes);
      const nodeMap = new Map(sourceNodes.map((node) => [node.id, node] as const));
      const group = nodeMap.get(groupId);
      if (!group || group.kind !== "group" || !group.parentId) {
        continue;
      }

      const parent = page.nodes.find((node) => node.id === group.parentId);
      const sourceParent = nodeMap.get(group.parentId);
      if (!parent || !sourceParent) {
        continue;
      }

      const absoluteFrameMap = buildAbsoluteFrameMap(sourceNodes);
      const parentFrame = absoluteFrameMap.get(group.parentId) ?? {
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        rotation: 0,
      };
      const childIds = orderedChildIdsFromNodes(sourceNodes, group);

      page.nodes = page.nodes
        .filter((node) => node.id !== groupId)
        .map((node) => {
          if (!childIds.includes(node.id)) {
            return node;
          }

          const absoluteFrame = absoluteFrameMap.get(node.id) ?? node.frame;
          return {
            ...node,
            parentId: group.parentId,
            frame: {
              ...node.frame,
              x: absoluteFrame.x - parentFrame.x,
              y: absoluteFrame.y - parentFrame.y,
            },
          };
        });

      const siblingIds = orderedChildIdsFromNodes(sourceNodes, sourceParent);
      parent.children = siblingIds.flatMap((siblingId) => (siblingId === groupId ? childIds : [siblingId]));

      nextSelectionIds.push(...childIds);
      dirtyNodeIds.push(groupId, group.parentId, ...childIds);
    }

    rebuildPageNodeOrder(page);
  }

  return {
    document: normalizeDocument(nextDocument),
    selection: [...new Set(nextSelectionIds)],
    dirtyNodeIds: [...new Set(dirtyNodeIds)],
  };
}

function duplicateSelection(
  document: SceneDoc,
  selection: string[],
  offsetX = 24,
  offsetY = 24,
) {
  const nextDocument = structuredClone(document);
  const duplicatedRootIds: string[] = [];
  const dirtyNodeIds: string[] = [];
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let cloneIndex = 0;

  for (const page of nextDocument.pages) {
    const sourceNodes = structuredClone(page.nodes);
    const nodeMap = new Map(sourceNodes.map((node) => [node.id, node] as const));
    const pageSelectionIds = selection.filter((nodeId) => nodeMap.has(nodeId));
    if (!pageSelectionIds.length) {
      continue;
    }

    const selectionSet = new Set(pageSelectionIds);
    const selectedRootIds = sourceNodes
      .filter(
        (node) =>
          selectionSet.has(node.id) &&
          node.id !== page.rootId &&
          !hasSelectedAncestor(node, selectionSet, nodeMap),
      )
      .map((node) => node.id);

    if (!selectedRootIds.length) {
      continue;
    }

    const cloneRootByOriginal = new Map<string, string>();
    const createdNodes: SceneNode[] = [];

    for (const rootId of selectedRootIds) {
      const subtreeIds = collectSubtreeIds(sourceNodes, rootId);
      const idMap = new Map(
        subtreeIds.map((oldId) => [oldId, `duplicate-${rootId}-${nonce}-${cloneIndex++}`]),
      );
      cloneRootByOriginal.set(rootId, idMap.get(rootId)!);

      for (const oldId of subtreeIds) {
        const original = nodeMap.get(oldId);
        if (!original) {
          continue;
        }

        const next = structuredClone(original);
        next.id = idMap.get(oldId)!;
        next.parentId =
          oldId === rootId
            ? original.parentId
            : original.parentId
              ? (idMap.get(original.parentId) ?? null)
              : null;
        next.children = original.children?.map((childId) => idMap.get(childId)!).filter(Boolean);
        next.frame = {
          ...next.frame,
          x: next.frame.x + offsetX,
          y: next.frame.y + offsetY,
        };
        createdNodes.push(next);
        dirtyNodeIds.push(next.id);
      }
    }

    page.nodes.push(...createdNodes);

    const rootsByParent = new Map<string, string[]>();
    for (const rootId of selectedRootIds) {
      const parentId = nodeMap.get(rootId)?.parentId;
      if (!parentId) {
        continue;
      }
      rootsByParent.set(parentId, [...(rootsByParent.get(parentId) ?? []), rootId]);
      dirtyNodeIds.push(parentId);
    }

    for (const [parentId, rootIds] of rootsByParent) {
      const sourceParent = sourceNodes.find((node) => node.id === parentId);
      const parent = page.nodes.find((node) => node.id === parentId);
      if (!sourceParent || !parent) {
        continue;
      }

      const siblingIds = orderedChildIdsFromNodes(sourceNodes, sourceParent);
      const cloneSiblingIds = new Map(
        rootIds.map((rootId) => [rootId, cloneRootByOriginal.get(rootId)!] as const),
      );
      const nextSiblingIds: string[] = [];
      siblingIds.forEach((siblingId) => {
        nextSiblingIds.push(siblingId);
        if (cloneSiblingIds.has(siblingId)) {
          nextSiblingIds.push(cloneSiblingIds.get(siblingId)!);
        }
      });
      parent.children = nextSiblingIds;
    }

    rebuildPageNodeOrder(page);
    duplicatedRootIds.push(...selectedRootIds.map((rootId) => cloneRootByOriginal.get(rootId)!));
  }

  return {
    document: normalizeDocument(nextDocument),
    duplicatedRootIds,
    dirtyNodeIds: [...new Set(dirtyNodeIds)],
  };
}

function estimateTextAutoHeight(width: number, text: TextNodeData) {
  return fallbackTextAutoHeight(width, text);
}

function normalizeTextNode(node: SceneNode): SceneNode {
  if (node.kind !== "text" || !node.text || node.text.sizing !== "auto_height") {
    return node;
  }

  return {
    ...node,
    frame: {
      ...node.frame,
      h: estimateTextAutoHeight(node.frame.w, node.text),
    },
  };
}

function normalizeAutoHeightNodes(document: SceneDoc): SceneDoc {
  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      nodes: page.nodes.map((node) => normalizeTextNode(node)),
    })),
  };
}

function orderedChildIds(page: SceneDoc["pages"][number], parent: SceneNode) {
  if (parent.children?.length) {
    return parent.children;
  }

  return page.nodes
    .filter((node) => node.parentId === parent.id)
    .map((node) => node.id);
}

function orderedChildIdsFromNodes(nodes: SceneNode[], parent: SceneNode) {
  if (parent.children?.length) {
    return parent.children;
  }

  return nodes.filter((node) => node.parentId === parent.id).map((node) => node.id);
}

function hasSelectedAncestor(
  node: SceneNode,
  selectionSet: Set<string>,
  nodeMap: Map<string, SceneNode>,
) {
  let current = node.parentId ? (nodeMap.get(node.parentId) ?? null) : null;
  while (current) {
    if (selectionSet.has(current.id)) {
      return true;
    }
    current = current.parentId ? (nodeMap.get(current.parentId) ?? null) : null;
  }
  return false;
}

function clampSize(value: number, min?: number, max?: number) {
  let next = Math.max(value, 1);
  if (typeof min === "number" && Number.isFinite(min)) {
    next = Math.max(next, min);
  }
  if (typeof max === "number" && Number.isFinite(max)) {
    next = Math.min(next, max);
  }
  return next;
}

function resolveNodeLayoutSizing(node: SceneNode) {
  return resolveLayoutSizing(node.layoutSizing ?? DEFAULT_LAYOUT_SIZING);
}

function mainLayoutMode(sizing: LayoutSizingAxis, isHorizontal: boolean) {
  return isHorizontal ? sizing.width : sizing.height;
}

function crossLayoutMode(sizing: LayoutSizingAxis, isHorizontal: boolean) {
  return isHorizontal ? sizing.height : sizing.width;
}

function normalizeAutoLayoutNodes(document: SceneDoc): SceneDoc {
  const nextDocument = structuredClone(document);

  for (const page of nextDocument.pages) {
    const rootIds = page.nodes.filter((node) => node.parentId === null).map((node) => node.id);
    for (const rootId of rootIds) {
      applyAutoLayoutRecursive(page, rootId);
    }
  }

  return nextDocument;
}

function applyAutoLayoutRecursive(page: SceneDoc["pages"][number], parentId: string) {
  const parent = page.nodes.find((node) => node.id === parentId);
  if (!parent) {
    return;
  }

  const childIds = orderedChildIds(page, parent);
  for (const childId of childIds) {
    applyAutoLayoutRecursive(page, childId);
  }

  const refreshedParent = page.nodes.find((node) => node.id === parentId);
  if (refreshedParent?.layout) {
    const nextFrames = buildAutoLayoutFrames(page, refreshedParent, childIds, refreshedParent.layout);
    for (const [nodeId, nextFrame] of nextFrames) {
      const childIndex = page.nodes.findIndex((node) => node.id === nodeId);
      if (childIndex === -1) {
        continue;
      }

      const current = page.nodes[childIndex]!;
      page.nodes[childIndex] = normalizeTextNode({
        ...current,
        frame: nextFrame,
      });
    }
  }
}

function buildAutoLayoutFrames(
  page: SceneDoc["pages"][number],
  parent: SceneNode,
  childIds: string[],
  layout: AutoLayoutData,
) {
  const frames = new Map<string, EditorRect>();
  const resolvedLayout = resolveAutoLayout(layout);
  if (!resolvedLayout) {
    return frames;
  }

  const isHorizontal = resolvedLayout.direction === "horizontal";
  const parentSizing = resolveNodeLayoutSizing(parent);
  const primaryStart = isHorizontal
    ? parent.frame.x + resolvedLayout.paddingLeft
    : parent.frame.y + resolvedLayout.paddingTop;
  const crossStart = isHorizontal
    ? parent.frame.y + resolvedLayout.paddingTop
    : parent.frame.x + resolvedLayout.paddingLeft;
  const availablePrimary = isHorizontal
    ? Math.max(parent.frame.w - resolvedLayout.paddingLeft - resolvedLayout.paddingRight, 1)
    : Math.max(parent.frame.h - resolvedLayout.paddingTop - resolvedLayout.paddingBottom, 1);
  const availableCross = isHorizontal
    ? Math.max(parent.frame.h - resolvedLayout.paddingTop - resolvedLayout.paddingBottom, 1)
    : Math.max(parent.frame.w - resolvedLayout.paddingLeft - resolvedLayout.paddingRight, 1);
  const hugMain = mainLayoutMode(parentSizing, isHorizontal) === "hug";
  const hugCross = crossLayoutMode(parentSizing, isHorizontal) === "hug";
  const lineLimitPrimary = resolvedLayout.wrap && !hugMain ? availablePrimary : Number.POSITIVE_INFINITY;
  const lines: Array<{ ids: string[]; main: number; cross: number }> = [];
  let currentLine: { ids: string[]; main: number; cross: number } = { ids: [], main: 0, cross: 0 };

  for (const childId of childIds) {
    const child = page.nodes.find((node) => node.id === childId);
    if (!child) {
      continue;
    }

    const childSizing = resolveNodeLayoutSizing(child);
    const childMain = isHorizontal
      ? clampSize(child.frame.w, childSizing.minWidth, childSizing.maxWidth)
      : clampSize(child.frame.h, childSizing.minHeight, childSizing.maxHeight);
    const childCross = isHorizontal
      ? clampSize(child.frame.h, childSizing.minHeight, childSizing.maxHeight)
      : clampSize(child.frame.w, childSizing.minWidth, childSizing.maxWidth);
    const nextMain = currentLine.ids.length
      ? currentLine.main + resolvedLayout.gap + childMain
      : childMain;

    if (resolvedLayout.wrap && currentLine.ids.length > 0 && nextMain > lineLimitPrimary) {
      lines.push(currentLine);
      currentLine = { ids: [], main: 0, cross: 0 };
    }

    currentLine.ids.push(childId);
    currentLine.main = currentLine.ids.length === 1 ? childMain : currentLine.main + resolvedLayout.gap + childMain;
    currentLine.cross = Math.max(currentLine.cross, childCross);
  }

  if (currentLine.ids.length > 0) {
    lines.push(currentLine);
  }

  const wrapGap = resolvedLayout.wrapGap;
  const totalCross = lines.reduce((sum, line) => sum + line.cross, 0)
    + (resolvedLayout.wrap ? wrapGap * Math.max(lines.length - 1, 0) : 0);
  const remainingCross = Math.max(availableCross - totalCross, 0);
  const crossGap = resolvedLayout.wrap && resolvedLayout.wrapAlign === "space_between" && lines.length > 1
    ? remainingCross / Math.max(lines.length - 1, 1)
    : wrapGap;
  let crossCursor = crossStart + (
    resolvedLayout.wrap
      ? resolvedLayout.wrapAlign === "center"
        ? remainingCross / 2
        : resolvedLayout.wrapAlign === "end"
          ? remainingCross
          : 0
      : 0
  );
  let measuredMain = 0;
  let measuredCross = 0;
  for (const line of lines) {
    const gapCount = Math.max(line.ids.length - 1, 0);
    let actualGap = resolvedLayout.gap;
    const lineCross = resolvedLayout.wrap || hugCross ? line.cross : availableCross;
    const resolvedChildren = line.ids.flatMap((childId) => {
      const child = page.nodes.find((node) => node.id === childId);
      if (!child) {
        return [];
      }
      const childSizing = resolveNodeLayoutSizing(child);
      const mainMode = mainLayoutMode(childSizing, isHorizontal);
      const crossMode = crossLayoutMode(childSizing, isHorizontal);
      const currentMain = isHorizontal
        ? clampSize(child.frame.w, childSizing.minWidth, childSizing.maxWidth)
        : clampSize(child.frame.h, childSizing.minHeight, childSizing.maxHeight);
      const currentCross = isHorizontal
        ? clampSize(child.frame.h, childSizing.minHeight, childSizing.maxHeight)
        : clampSize(child.frame.w, childSizing.minWidth, childSizing.maxWidth);
      return [{ childId, child, childSizing, mainMode, crossMode, currentMain, currentCross }];
    });
    const fixedMain = resolvedChildren.reduce(
      (sum, entry) => sum + (entry.mainMode === "fill" && !hugMain ? 0 : entry.currentMain),
      0,
    );
    const fillCount = resolvedChildren.filter((entry) => entry.mainMode === "fill" && !hugMain).length;
    const totalGap = resolvedLayout.gap * gapCount;
    const leftover = hugMain ? 0 : Math.max(availablePrimary - fixedMain - totalGap, 0);
    const fillMain = fillCount > 0 ? leftover / fillCount : 0;
    const layoutChildren = resolvedChildren.map((entry) => {
      const desiredMain = entry.mainMode === "fill" && !hugMain ? fillMain : entry.currentMain;
      const desiredCross = entry.crossMode === "fill" || resolvedLayout.align === "stretch"
        ? lineCross
        : entry.currentCross;
      const width = isHorizontal
        ? clampSize(desiredMain, entry.childSizing.minWidth, entry.childSizing.maxWidth)
        : clampSize(desiredCross, entry.childSizing.minWidth, entry.childSizing.maxWidth);
      const height = isHorizontal
        ? clampSize(desiredCross, entry.childSizing.minHeight, entry.childSizing.maxHeight)
        : clampSize(desiredMain, entry.childSizing.minHeight, entry.childSizing.maxHeight);
      return {
        ...entry,
        width,
        height,
        actualMain: isHorizontal ? width : height,
      };
    });

    if (resolvedLayout.justify === "space_between" && layoutChildren.length > 1 && fillCount === 0 && availablePrimary > fixedMain) {
      actualGap = (availablePrimary - fixedMain) / Math.max(gapCount, 1);
    }

    const occupiedMain =
      layoutChildren.reduce((sum, entry) => sum + entry.actualMain, 0) + actualGap * gapCount;
    const remainingMain = hugMain ? 0 : Math.max(availablePrimary - occupiedMain, 0);
    let primaryCursor = primaryStart;
    if (resolvedLayout.justify === "center") {
      primaryCursor += remainingMain / 2;
    } else if (resolvedLayout.justify === "end") {
      primaryCursor += remainingMain;
    }
    const isBaseline = resolvedLayout.align === "baseline" && isHorizontal;
    const lineBaseline = isBaseline
      ? Math.max(...layoutChildren.map((entry) => getBaselineOffset(entry.child)))
      : 0;

    for (const entry of layoutChildren) {
      const nextFrame = { ...entry.child.frame };
      if (isHorizontal) {
        nextFrame.x = primaryCursor;
        if (entry.crossMode === "fill" || resolvedLayout.align === "stretch") {
          nextFrame.y = crossCursor;
          nextFrame.h = Math.max(lineCross, 1);
        } else if (isBaseline) {
          nextFrame.y = crossCursor + lineBaseline - getBaselineOffset(entry.child);
          nextFrame.h = Math.max(entry.height, 1);
        } else {
          const aligned = alignCrossAxis(entry.height, crossCursor, lineCross, resolvedLayout.align);
          nextFrame.y = aligned.position;
          nextFrame.h = Math.max(aligned.size, 1);
        }
        nextFrame.w = Math.max(entry.width, 1);
        primaryCursor += entry.actualMain + actualGap;
      } else {
        nextFrame.y = primaryCursor;
        if (entry.crossMode === "fill" || resolvedLayout.align === "stretch") {
          nextFrame.x = crossCursor;
          nextFrame.w = Math.max(lineCross, 1);
        } else {
          const aligned = alignCrossAxis(entry.width, crossCursor, lineCross, resolvedLayout.align);
          nextFrame.x = aligned.position;
          nextFrame.w = Math.max(aligned.size, 1);
        }
        nextFrame.h = Math.max(entry.height, 1);
        primaryCursor += entry.actualMain + actualGap;
      }

      frames.set(entry.childId, nextFrame);
    }

    measuredMain = Math.max(measuredMain, occupiedMain);
    measuredCross += lineCross + (resolvedLayout.wrap ? crossGap : 0);
    crossCursor += lineCross + (resolvedLayout.wrap ? crossGap : 0);
  }

  if (resolvedLayout.wrap && measuredCross > 0) {
    measuredCross -= crossGap;
  }

  if (hugMain || hugCross) {
    const parentFrame = { ...parent.frame };
    if (isHorizontal) {
      if (hugMain) {
        parentFrame.w = clampSize(
          resolvedLayout.paddingLeft + resolvedLayout.paddingRight + measuredMain,
          parentSizing.minWidth,
          parentSizing.maxWidth,
        );
      }
      if (hugCross) {
        parentFrame.h = clampSize(
          resolvedLayout.paddingTop + resolvedLayout.paddingBottom + measuredCross,
          parentSizing.minHeight,
          parentSizing.maxHeight,
        );
      }
    } else {
      if (hugCross) {
        parentFrame.w = clampSize(
          resolvedLayout.paddingLeft + resolvedLayout.paddingRight + measuredCross,
          parentSizing.minWidth,
          parentSizing.maxWidth,
        );
      }
      if (hugMain) {
        parentFrame.h = clampSize(
          resolvedLayout.paddingTop + resolvedLayout.paddingBottom + measuredMain,
          parentSizing.minHeight,
          parentSizing.maxHeight,
        );
      }
    }
    frames.set(parent.id, parentFrame);
  }

  return frames;
}

function getBaselineOffset(node: SceneNode) {
  if (node.text) {
    return Math.min(Math.max(node.text.lineHeight * 0.8, 1), Math.max(node.frame.h, 1));
  }

  return Math.max(node.frame.h, 1);
}

function alignCrossAxis(currentSize: number, crossStart: number, crossSize: number, align: AutoLayoutAlign) {
  switch (align) {
    case "center":
      return {
        position: crossStart + (crossSize - currentSize) / 2,
        size: currentSize,
      };
    case "end":
      return {
        position: crossStart + crossSize - currentSize,
        size: currentSize,
      };
    case "stretch":
      return {
        position: crossStart,
        size: crossSize,
      };
    default:
      return {
        position: crossStart,
        size: currentSize,
      };
  }
}

function captureFrameSignature(document: SceneDoc) {
  return document.pages.flatMap((page) =>
    page.nodes.map(
      (node) =>
        `${page.id}:${node.id}:${node.frame.x}:${node.frame.y}:${node.frame.w}:${node.frame.h}:${node.frame.rotation}`,
    ),
  );
}

function runNormalizationPass(document: SceneDoc) {
  return normalizeAutoLayoutNodes(normalizeAutoHeightNodes(document));
}

function normalizeDocument(document: SceneDoc) {
  let nextDocument = document;
  for (let pass = 0; pass < 4; pass += 1) {
    const before = captureFrameSignature(nextDocument);
    nextDocument = runNormalizationPass(nextDocument);
    const after = captureFrameSignature(nextDocument);
    if (before.length === after.length && before.every((value, index) => value === after[index])) {
      break;
    }
  }

  return nextDocument;
}

function selectInRect(
  document: SceneDoc,
  currentSelection: string[],
  pageId: string,
  rect: EditorRect,
  mode: SelectionSetMode,
) {
  const page = document.pages.find((candidate) => candidate.id === pageId);
  if (!page) {
    return currentSelection;
  }

  const frameMap = buildAbsoluteFrameMap(page.nodes);
  const hitIds = page.nodes
    .filter((node) => {
      const frame = frameMap.get(node.id);
      return frame ? rectsIntersect(frame, rect) : false;
    })
    .map((node) => node.id);

  switch (mode) {
    case "add":
      return [...new Set([...currentSelection, ...hitIds])];
    case "toggle":
      return currentSelection
        .filter((id) => !hitIds.includes(id))
        .concat(hitIds.filter((id) => !currentSelection.includes(id)));
    default:
      return hitIds;
  }
}

function resizeSelection(
  document: SceneDoc,
  selection: string[],
  handle: TransformHandle["kind"],
  deltaX: number,
  deltaY: number,
  lockAspect: boolean,
) {
  const bounds = buildSelectionBounds(document, selection);
  if (!bounds || handle === "rotate") {
    return document;
  }

  const nextBounds = resizeBounds(bounds, handle, deltaX, deltaY, lockAspect);
  const scaleX = nextBounds.w / Math.max(bounds.w, 1);
  const scaleY = nextBounds.h / Math.max(bounds.h, 1);

  const resized = {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      nodes: (() => {
        const frameMap = buildAbsoluteFrameMap(page.nodes);
        return page.nodes.map((node) => {
        if (!selection.includes(node.id)) {
          return node;
        }

        const absoluteFrame = frameMap.get(node.id) ?? node.frame;
        const parentFrame = node.parentId ? (frameMap.get(node.parentId) ?? null) : null;
        const leftOffset = absoluteFrame.x - bounds.x;
        const topOffset = absoluteFrame.y - bounds.y;
        const rightOffset = absoluteFrame.x + absoluteFrame.w - bounds.x;
        const bottomOffset = absoluteFrame.y + absoluteFrame.h - bounds.y;

        const nextLeft = nextBounds.x + leftOffset * scaleX;
        const nextTop = nextBounds.y + topOffset * scaleY;
        const nextRight = nextBounds.x + rightOffset * scaleX;
        const nextBottom = nextBounds.y + bottomOffset * scaleY;

        return normalizeTextNode({
          ...node,
          frame: {
            ...node.frame,
            x: nextLeft - (parentFrame?.x ?? 0),
            y: nextTop - (parentFrame?.y ?? 0),
            w: Math.max(nextRight - nextLeft, 1),
            h: Math.max(nextBottom - nextTop, 1),
          },
        });
        });
      })(),
    })),
    meta: { ...document.meta, updatedAt: new Date().toISOString() },
  };

  let nextDocument = resized;
  for (const selectedId of selection) {
    const previous = document.pages.flatMap((page) => page.nodes).find((node) => node.id === selectedId)?.frame;
    const next = nextDocument.pages.flatMap((page) => page.nodes).find((node) => node.id === selectedId)?.frame;
    if (previous && next) {
      nextDocument = applyChildConstraints(nextDocument, selectedId, previous, next, new Set(selection));
    }
  }

  return nextDocument;
}

function moveSelection(document: SceneDoc, selection: string[], deltaX: number, deltaY: number) {
  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      nodes: page.nodes.map((node) =>
        selection.includes(node.id)
          ? {
              ...node,
              frame: {
                ...node.frame,
                x: node.frame.x + deltaX,
                y: node.frame.y + deltaY,
              },
            }
          : node,
      ),
    })),
    meta: { ...document.meta, updatedAt: new Date().toISOString() },
  };
}

function positionableSelectionRoots(document: SceneDoc, selection: string[]) {
  const page = selectionPage(document, selection);
  if (!page) {
    throw new Error("Cannot position layers because the current selection is empty.");
  }

  const nodeMap = new Map(page.nodes.map((node) => [node.id, node] as const));
  if (selection.some((nodeId) => !nodeMap.has(nodeId))) {
    throw new Error("Selection positioning requires every selected layer to be on the same page.");
  }

  const selectionSet = new Set(selection);
  const selectedRootIds = page.nodes
    .filter(
      (node) =>
        selectionSet.has(node.id) &&
        node.id !== page.rootId &&
        !hasSelectedAncestor(node, selectionSet, nodeMap),
    )
    .map((node) => node.id);

  selectedRootIds.forEach((nodeId) => {
    const parentId = nodeMap.get(nodeId)?.parentId;
    if (parentId && nodeMap.get(parentId)?.layout) {
      throw new Error(
        `Layer '${nodeId}' is positioned by its parent's auto layout and cannot be aligned or distributed manually.`,
      );
    }
  });

  return { page, selectedRootIds };
}

function applyAbsolutePositionUpdates(
  document: SceneDoc,
  page: ScenePage,
  frameMap: Map<string, EditorRect>,
  updates: Map<string, { x: number; y: number }>,
) {
  const dirtyNodeIds = new Set<string>();
  const nextNodes = page.nodes.map((node) => {
    const update = updates.get(node.id);
    if (!update) {
      return node;
    }

    const parentFrame = node.parentId ? frameMap.get(node.parentId) : null;
    const nextX = update.x - (parentFrame?.x ?? 0);
    const nextY = update.y - (parentFrame?.y ?? 0);
    if (Math.abs(node.frame.x - nextX) <= 0.0001 && Math.abs(node.frame.y - nextY) <= 0.0001) {
      return node;
    }

    dirtyNodeIds.add(node.id);
    if (node.parentId) {
      dirtyNodeIds.add(node.parentId);
    }
    return {
      ...node,
      frame: {
        ...node.frame,
        x: nextX,
        y: nextY,
      },
    };
  });

  if (!dirtyNodeIds.size) {
    return { document, dirtyNodeIds: [] as string[] };
  }

  return {
    document: {
      ...document,
      pages: document.pages.map((candidate) =>
        candidate.id === page.id ? { ...candidate, nodes: nextNodes } : candidate,
      ),
      meta: { ...document.meta, updatedAt: new Date().toISOString() },
    },
    dirtyNodeIds: [...dirtyNodeIds],
  };
}

function alignSelection(document: SceneDoc, selection: string[], alignment: SelectionAlignment) {
  const { page, selectedRootIds } = positionableSelectionRoots(document, selection);
  if (selectedRootIds.length < 2) {
    throw new Error("Align requires at least two independently positioned layers.");
  }

  const frameMap = buildAbsoluteFrameMap(page.nodes);
  const frames = selectedRootIds.map((nodeId) => frameMap.get(nodeId)!);
  const left = Math.min(...frames.map((frame) => frame.x));
  const top = Math.min(...frames.map((frame) => frame.y));
  const right = Math.max(...frames.map((frame) => frame.x + frame.w));
  const bottom = Math.max(...frames.map((frame) => frame.y + frame.h));
  const updates = new Map<string, { x: number; y: number }>();

  selectedRootIds.forEach((nodeId, index) => {
    const frame = frames[index]!;
    switch (alignment) {
      case "left":
        updates.set(nodeId, { x: left, y: frame.y });
        break;
      case "horizontal_center":
        updates.set(nodeId, { x: left + (right - left - frame.w) / 2, y: frame.y });
        break;
      case "right":
        updates.set(nodeId, { x: right - frame.w, y: frame.y });
        break;
      case "top":
        updates.set(nodeId, { x: frame.x, y: top });
        break;
      case "vertical_center":
        updates.set(nodeId, { x: frame.x, y: top + (bottom - top - frame.h) / 2 });
        break;
      case "bottom":
        updates.set(nodeId, { x: frame.x, y: bottom - frame.h });
        break;
    }
  });

  return applyAbsolutePositionUpdates(document, page, frameMap, updates);
}

function distributeSelection(document: SceneDoc, selection: string[], axis: DistributionAxis) {
  const { page, selectedRootIds } = positionableSelectionRoots(document, selection);
  if (selectedRootIds.length < 3) {
    throw new Error("Distribute requires at least three independently positioned layers.");
  }

  const frameMap = buildAbsoluteFrameMap(page.nodes);
  const ordered = selectedRootIds
    .map((nodeId) => ({ nodeId, frame: frameMap.get(nodeId)! }))
    .sort((left, right) => {
      const leftCenter =
        axis === "horizontal"
          ? left.frame.x + left.frame.w / 2
          : left.frame.y + left.frame.h / 2;
      const rightCenter =
        axis === "horizontal"
          ? right.frame.x + right.frame.w / 2
          : right.frame.y + right.frame.h / 2;
      return leftCenter - rightCenter || left.nodeId.localeCompare(right.nodeId);
    });
  const first = ordered[0]!.frame;
  const last = ordered[ordered.length - 1]!.frame;
  const totalSize = ordered.reduce(
    (sum, item) => sum + (axis === "horizontal" ? item.frame.w : item.frame.h),
    0,
  );
  const span =
    axis === "horizontal"
      ? last.x + last.w - first.x
      : last.y + last.h - first.y;
  const gap = (span - totalSize) / (ordered.length - 1);
  let cursor = axis === "horizontal" ? first.x : first.y;
  const updates = new Map<string, { x: number; y: number }>();

  ordered.forEach(({ nodeId, frame }) => {
    updates.set(
      nodeId,
      axis === "horizontal" ? { x: cursor, y: frame.y } : { x: frame.x, y: cursor },
    );
    cursor += (axis === "horizontal" ? frame.w : frame.h) + gap;
  });

  return applyAbsolutePositionUpdates(document, page, frameMap, updates);
}

function rotateSelection(document: SceneDoc, selection: string[], deltaDeg: number) {
  const bounds = buildSelectionBounds(document, selection);
  if (!bounds) {
    return document;
  }

  const centerX = bounds.x + bounds.w / 2;
  const centerY = bounds.y + bounds.h / 2;
  const angle = (deltaDeg * Math.PI) / 180;
  const cosTheta = Math.cos(angle);
  const sinTheta = Math.sin(angle);

  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      nodes: (() => {
        const frameMap = buildAbsoluteFrameMap(page.nodes);
        return page.nodes.map((node) => {
        if (!selection.includes(node.id)) {
          return node;
        }

        const absoluteFrame = frameMap.get(node.id) ?? node.frame;
        const parentFrame = node.parentId ? (frameMap.get(node.parentId) ?? null) : null;
        const nodeCenterX = absoluteFrame.x + absoluteFrame.w / 2;
        const nodeCenterY = absoluteFrame.y + absoluteFrame.h / 2;
        const localX = nodeCenterX - centerX;
        const localY = nodeCenterY - centerY;
        const rotatedX = localX * cosTheta - localY * sinTheta;
        const rotatedY = localX * sinTheta + localY * cosTheta;

        return {
          ...node,
          frame: {
            ...node.frame,
            x: centerX + rotatedX - absoluteFrame.w / 2 - (parentFrame?.x ?? 0),
            y: centerY + rotatedY - absoluteFrame.h / 2 - (parentFrame?.y ?? 0),
            rotation: normalizeDegrees(node.frame.rotation + deltaDeg),
          },
        };
        });
      })(),
    })),
    meta: { ...document.meta, updatedAt: new Date().toISOString() },
  };
}

function resizeBounds(
  bounds: EditorRect,
  handle: TransformHandle["kind"],
  deltaX: number,
  deltaY: number,
  lockAspect: boolean,
) {
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
    x: left,
    y: top,
    w: Math.max(right - left, minSize),
    h: Math.max(bottom - top, minSize),
    rotation: bounds.rotation,
  };
}

function runHitTest(
  document: SceneDoc,
  pageId: string,
  x: number,
  y: number,
  mode: "topmost" | "all",
): HitTestResult {
  const page = document.pages.find((candidate) => candidate.id === pageId);
  if (!page) {
    return {
      pageId,
      nodeIds: [],
      topNodeId: null,
    };
  }

  const frameMap = buildAbsoluteFrameMap(page.nodes);
  const hitNodes = [...page.nodes]
    .reverse()
    .filter((node) => {
      const frame = frameMap.get(node.id);
      return frame ? pointInsideRect(frame, x, y) : false;
    });
  const nodeIds = mode === "topmost" ? hitNodes.slice(0, 1).map((node) => node.id) : hitNodes.map((node) => node.id);

  return {
    pageId,
    nodeIds,
    topNodeId: nodeIds[0] ?? null,
  };
}

function normalizeDegrees(value: number) {
  const normalized = ((value % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function frameSizeChanged(previous: EditorRect, next: EditorRect) {
  return previous.w !== next.w || previous.h !== next.h;
}

function directChildIds(document: SceneDoc, parentId: string) {
  return document.pages
    .flatMap((page) => page.nodes)
    .filter((node) => node.parentId === parentId)
    .map((node) => node.id);
}

function constrainedFrame(
  oldParent: EditorRect,
  newParent: EditorRect,
  child: EditorRect,
  constraints?: NodeConstraints,
): EditorRect {
  const horizontal: HorizontalConstraint = constraints?.horizontal ?? "min";
  const vertical: VerticalConstraint = constraints?.vertical ?? "min";
  const oldParentRight = oldParent.x + oldParent.w;
  const newParentRight = newParent.x + newParent.w;
  const oldParentBottom = oldParent.y + oldParent.h;
  const newParentBottom = newParent.y + newParent.h;
  const leftMargin = child.x - oldParent.x;
  const rightMargin = oldParentRight - (child.x + child.w);
  const topMargin = child.y - oldParent.y;
  const bottomMargin = oldParentBottom - (child.y + child.h);
  const scaleX = newParent.w / Math.max(oldParent.w, 1);
  const scaleY = newParent.h / Math.max(oldParent.h, 1);

  const horizontalNext =
    horizontal === "max"
      ? { x: newParentRight - rightMargin - child.w, w: child.w }
      : horizontal === "stretch"
        ? { x: newParent.x + leftMargin, w: Math.max(newParent.w - leftMargin - rightMargin, 1) }
        : horizontal === "scale"
          ? { x: newParent.x + leftMargin * scaleX, w: Math.max(child.w * scaleX, 1) }
          : { x: newParent.x + leftMargin, w: child.w };

  const verticalNext =
    vertical === "max"
      ? { y: newParentBottom - bottomMargin - child.h, h: child.h }
      : vertical === "stretch"
        ? { y: newParent.y + topMargin, h: Math.max(newParent.h - topMargin - bottomMargin, 1) }
        : vertical === "scale"
          ? { y: newParent.y + topMargin * scaleY, h: Math.max(child.h * scaleY, 1) }
          : { y: newParent.y + topMargin, h: child.h };

  return {
    ...child,
    x: horizontalNext.x,
    y: verticalNext.y,
    w: horizontalNext.w,
    h: verticalNext.h,
  };
}

function applyChildConstraints(
  document: SceneDoc,
  parentId: string,
  oldParent: EditorRect,
  newParent: EditorRect,
  selectedIds: Set<string>,
) {
  if (!frameSizeChanged(oldParent, newParent)) {
    return document;
  }

  const nextDocument = structuredClone(document);
  const queue: Array<{ parentId: string; oldParent: EditorRect; newParent: EditorRect }> = [
    { parentId, oldParent, newParent },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const childId of directChildIds(nextDocument, current.parentId)) {
      if (selectedIds.has(childId)) {
        continue;
      }

      const child = nextDocument.pages
        .flatMap((page) => page.nodes)
        .find((node) => node.id === childId);
      if (!child) {
        continue;
      }

      const previous = structuredClone(child.frame);
      child.frame = constrainedFrame(current.oldParent, current.newParent, child.frame, child.constraints);
      if (child.kind === "text" && child.text?.sizing === "auto_height") {
        child.frame.h = estimateTextAutoHeight(child.frame.w, child.text);
      }
      if (frameSizeChanged(previous, child.frame)) {
        queue.push({
          parentId: child.id,
          oldParent: previous,
          newParent: structuredClone(child.frame),
        });
      }
    }
  }

  return nextDocument;
}

export class NoopEditorBridge implements EditorBridge {
  private document: SceneDoc;
  private selection: string[] = [];
  private viewport: EditorViewport = DEFAULT_VIEWPORT;
  private version = 1;
  private history: EditorSnapshot[] = [];
  private historyCursor = -1;

  constructor(initialDocument: SceneDoc) {
    this.document = normalizeDocument(cloneDoc(initialDocument));
    this.seedHistory();
  }

  async info() {
    return {
      mode: "scaffold" as const,
      kernel: "browser-noop" as const,
      schemaVersion: V2_EDITOR_SCHEMA_VERSION,
    };
  }

  async loadDocument(document: SceneDoc): Promise<EditorSnapshot> {
    this.document = normalizeDocument(cloneDoc(document));
    this.selection = [];
    this.viewport = DEFAULT_VIEWPORT;
    this.version = 1;
    this.seedHistory();
    return this.snapshot();
  }

  async dispatch(commands: EditorCommand[]): Promise<EditorApplyResult> {
    const dirtyNodeIds: string[] = [];

    for (const command of commands) {
      switch (command.kind) {
        case "select_nodes":
          this.selection = [...command.nodeIds];
          break;
        case "select_in_rect":
          this.selection = selectInRect(
            this.document,
            this.selection,
            command.pageId,
            command.rect,
            command.mode ?? "replace",
          );
          break;
        case "set_viewport":
          this.viewport = { ...command.viewport };
          break;
        case "rename_node":
          this.document = {
            ...this.document,
            pages: updateNode(this.document.pages, command.nodeId, (node) => ({
              ...node,
              name: command.name,
            })),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          };
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "set_text_content":
          {
            const nextPages = updateNode(this.document.pages, command.nodeId, (node) =>
              ({
                ...node,
                text: node.text
                  ? normalizeTextData({
                      ...node.text,
                      content: command.content,
                    })
                  : node.text,
              }),
            );
            this.document = normalizeDocument({
              ...this.document,
              pages: syncTextOverrideOnPages(
                {
                  ...this.document,
                  pages: nextPages,
                },
                command.nodeId,
                { content: command.content },
              ),
              meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
            });
          }
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "set_text_style":
          {
            const nextPages = updateNode(this.document.pages, command.nodeId, (node) =>
              ({
                ...node,
                text: node.text ? normalizeTextData(applyTextStylePatch(node.text, command.style)) : node.text,
              }),
            );
            this.document = normalizeDocument({
              ...this.document,
              pages: syncTextOverrideOnPages(
                {
                  ...this.document,
                  pages: nextPages,
                },
                command.nodeId,
                { style: command.style },
              ),
              meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
            });
          }
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "set_text_ranges":
          {
            const nextPages = updateNode(this.document.pages, command.nodeId, (node) =>
              ({
                ...node,
                text: node.text ? applyTextRangeSet(node.text, command.ranges) : node.text,
              }),
            );
            this.document = normalizeDocument({
              ...this.document,
              pages: syncTextOverrideOnPages(
                {
                  ...this.document,
                  pages: nextPages,
                },
                command.nodeId,
                { ranges: command.ranges },
              ),
              meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
            });
          }
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "set_text_sizing":
          this.document = normalizeDocument({
            ...this.document,
            pages: updateNode(this.document.pages, command.nodeId, (node) =>
              ({
                ...node,
                text: node.text
                  ? {
                      ...node.text,
                      sizing: command.sizing,
                    }
                  : node.text,
              }),
            ),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          });
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "set_shape_primitive":
          this.document = normalizeDocument({
            ...this.document,
            pages: updateNode(this.document.pages, command.nodeId, (node) => ({
              ...node,
              shape: node.shape
                ? {
                    ...node.shape,
                    primitive: command.primitive,
                  }
                : node.shape,
            })),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          });
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "set_shape_style":
          {
            const nextPages = updateNode(this.document.pages, command.nodeId, (node) => ({
              ...node,
              shape: node.shape ? applyShapeStylePatch(node.shape, command.style) : node.shape,
            }));
            this.document = normalizeDocument({
              ...this.document,
              pages: syncShapeOverrideOnPages(
                {
                  ...this.document,
                  pages: nextPages,
                },
                command.nodeId,
                command.style,
              ),
              meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
            });
          }
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "set_shape_path":
          this.document = normalizeDocument({
            ...this.document,
            pages: updateNode(this.document.pages, command.nodeId, (node) => ({
              ...node,
              shape: node.shape ? applyShapePath(node.shape, command.path) : node.shape,
            })),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          });
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "promote_to_component":
          this.document = normalizeDocument({
            ...this.document,
            pages: updateNode(this.document.pages, command.nodeId, (node) =>
              promoteNodeToComponent(node, command.componentKey),
            ),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          });
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "set_component_key":
          this.document = normalizeDocument({
            ...this.document,
            pages: syncComponentKeyOnPages(this.document.pages, command.nodeId, command.componentKey),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          });
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "create_instance_from_component": {
          const { targetParentId, createdRootId, clonedNodes } = createInstanceSubtree(
            this.document,
            command.pageId,
            command.sourceNodeId,
            command.offsetX ?? 48,
            command.offsetY ?? 48,
          );

          this.document = normalizeDocument({
            ...this.document,
            pages: this.document.pages.map((page) => {
              if (page.id !== command.pageId) {
                return page;
              }

              const nextNodes = page.nodes.map((node) =>
                node.id === targetParentId
                  ? {
                      ...node,
                      children: [...(node.children ?? []), createdRootId],
                    }
                  : node,
              );

              nextNodes.push(...clonedNodes);

              return {
                ...page,
                nodes: nextNodes,
              };
            }),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          });
          this.selection = [createdRootId];
          this.version += 1;
          dirtyNodeIds.push(...clonedNodes.map((node) => node.id), targetParentId);
          this.recordHistory();
          break;
        }
        case "refresh_instance": {
          const { pageId, refreshedNodes, oldInstanceIds } = refreshInstanceSubtree(
            this.document,
            command.nodeId,
          );
          const refreshedNodeIds = refreshedNodes.map((node) => node.id);
          const removeSet = new Set(oldInstanceIds.filter((id) => id !== command.nodeId));
          this.document = normalizeDocument({
            ...this.document,
            pages: this.document.pages.map((page) => {
              if (page.id !== pageId) {
                return page;
              }
              const nextNodes = page.nodes
                .filter((node) => !removeSet.has(node.id))
                .map((node) => refreshedNodes.find((candidate) => candidate.id === node.id) ?? node);
              for (const refreshedNode of refreshedNodes) {
                if (!nextNodes.some((node) => node.id === refreshedNode.id)) {
                  nextNodes.push(refreshedNode);
                }
              }
              return {
                ...page,
                nodes: nextNodes,
              };
            }),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          });
          this.selection = [command.nodeId];
          this.version += 1;
          dirtyNodeIds.push(...oldInstanceIds, ...refreshedNodeIds);
          this.recordHistory();
          break;
        }
        case "detach_instance":
          this.document = normalizeDocument({
            ...this.document,
            pages: updateNode(this.document.pages, command.nodeId, (node) => detachInstanceNode(node)),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          });
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "clear_instance_overrides":
          this.document = normalizeDocument({
            ...this.document,
            pages: updateNode(this.document.pages, command.nodeId, (node) =>
              clearInstanceOverridesNode(
                node,
                command.overrideKind ?? "all",
                command.sourceNodeId,
              ),
            ),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          });
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "group_selection": {
          const result = groupSelection(this.document, this.selection);
          if (!result.groupedRootIds.length) {
            break;
          }
          this.document = result.document;
          this.selection = result.groupedRootIds;
          this.version += 1;
          dirtyNodeIds.push(...result.dirtyNodeIds);
          this.recordHistory();
          break;
        }
        case "ungroup_selection": {
          const result = ungroupSelection(this.document, this.selection);
          if (!result.selection.length) {
            break;
          }
          this.document = result.document;
          this.selection = result.selection;
          this.version += 1;
          dirtyNodeIds.push(...result.dirtyNodeIds);
          this.recordHistory();
          break;
        }
        case "align_selection": {
          const result = alignSelection(this.document, this.selection, command.alignment);
          if (!result.dirtyNodeIds.length) {
            break;
          }
          this.document = normalizeDocument(result.document);
          this.version += 1;
          dirtyNodeIds.push(...result.dirtyNodeIds);
          this.recordHistory();
          break;
        }
        case "distribute_selection": {
          const result = distributeSelection(this.document, this.selection, command.axis);
          if (!result.dirtyNodeIds.length) {
            break;
          }
          this.document = normalizeDocument(result.document);
          this.version += 1;
          dirtyNodeIds.push(...result.dirtyNodeIds);
          this.recordHistory();
          break;
        }
        case "reorder_node":
          this.document = normalizeDocument(
            reorderNode(this.document, command.nodeId, command.position),
          );
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          {
            const reorderedNode = this.document.pages
              .flatMap((page) => page.nodes)
              .find((node) => node.id === command.nodeId);
            if (reorderedNode?.parentId) {
              dirtyNodeIds.push(reorderedNode.parentId);
            }
          }
          this.recordHistory();
          break;
        case "set_node_auto_layout":
          this.document = normalizeDocument({
            ...this.document,
            pages: updateNode(this.document.pages, command.nodeId, (node) => ({
              ...node,
              layout: command.layout ? { ...command.layout } : undefined,
            })),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          });
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "set_node_layout_sizing":
          this.document = normalizeDocument({
            ...this.document,
            pages: updateNode(this.document.pages, command.nodeId, (node) => ({
              ...node,
              layoutSizing: command.layoutSizing ? { ...command.layoutSizing } : undefined,
            })),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          });
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "set_node_constraints":
          this.document = normalizeDocument({
            ...this.document,
            pages: updateNode(this.document.pages, command.nodeId, (node) => ({
              ...node,
              constraints: { ...command.constraints },
            })),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          });
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "move_selection":
          this.document = normalizeDocument(
            moveSelection(this.document, this.selection, command.deltaX, command.deltaY),
          );
          this.version += 1;
          dirtyNodeIds.push(...this.selection);
          this.recordHistory();
          break;
        case "move_node":
          const previous = this.document.pages
            .flatMap((page) => page.nodes)
            .find((node) => node.id === command.nodeId)?.frame;
          this.document = {
            ...this.document,
            pages: updateNode(this.document.pages, command.nodeId, (node) =>
              normalizeTextNode({
                ...node,
                frame: {
                  ...node.frame,
                  ...command.frame,
                },
              }),
            ),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          };
          if (previous) {
            const next = this.document.pages
              .flatMap((page) => page.nodes)
              .find((node) => node.id === command.nodeId)?.frame;
            if (next) {
              this.document = applyChildConstraints(
                this.document,
                command.nodeId,
                previous,
                next,
                new Set(),
              );
            }
          }
          this.document = normalizeDocument(this.document);
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "rotate_selection":
          this.document = normalizeDocument(
            rotateSelection(this.document, this.selection, command.deltaDeg),
          );
          this.version += 1;
          dirtyNodeIds.push(...this.selection);
          this.recordHistory();
          break;
        case "resize_selection":
          this.document = normalizeDocument(
            resizeSelection(
              this.document,
              this.selection,
              command.handle,
              command.deltaX,
              command.deltaY,
              command.lockAspect ?? false,
            ),
          );
          this.version += 1;
          dirtyNodeIds.push(...this.selection);
          this.recordHistory();
          break;
        case "add_guide":
          this.document = {
            ...this.document,
            pages: this.document.pages.map((page) =>
              page.id === command.pageId
                ? { ...page, guides: [...(page.guides ?? []), command.guide] }
                : page,
            ),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          };
          this.version += 1;
          dirtyNodeIds.push(command.guide.id);
          this.recordHistory();
          break;
        case "move_guide":
          this.document = {
            ...this.document,
            pages: this.document.pages.map((page) =>
              page.id === command.pageId
                ? {
                    ...page,
                    guides: (page.guides ?? []).map((guide) =>
                      guide.id === command.guideId ? { ...guide, position: command.position } : guide,
                    ),
                  }
                : page,
            ),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          };
          this.version += 1;
          dirtyNodeIds.push(command.guideId);
          this.recordHistory();
          break;
        case "delete_guide":
          this.document = {
            ...this.document,
            pages: this.document.pages.map((page) =>
              page.id === command.pageId
                ? {
                    ...page,
                    guides: (page.guides ?? []).filter((guide) => guide.id !== command.guideId),
                  }
                : page,
            ),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          };
          this.version += 1;
          dirtyNodeIds.push(command.guideId);
          this.recordHistory();
          break;
        case "create_node":
          this.document = normalizeDocument({
            ...this.document,
            pages: this.document.pages.map((page) =>
              page.id === command.pageId
                ? { ...page, nodes: [...page.nodes, command.node] }
                : page,
            ),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          });
          this.version += 1;
          dirtyNodeIds.push(command.node.id);
          if (command.node.parentId) {
            dirtyNodeIds.push(command.node.parentId);
          }
          this.recordHistory();
          break;
        case "delete_node":
          this.document = normalizeDocument({
            ...this.document,
            pages: this.document.pages.map((page) => ({
              ...page,
              nodes: page.nodes.filter((node) => node.id !== command.nodeId),
            })),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          });
          this.selection = this.selection.filter((id) => id !== command.nodeId);
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "duplicate_selection": {
          const result = duplicateSelection(
            this.document,
            this.selection,
            command.offsetX ?? 24,
            command.offsetY ?? 24,
          );
          if (result.duplicatedRootIds.length === 0) {
            break;
          }
          this.document = result.document;
          this.selection = result.duplicatedRootIds;
          this.version += 1;
          dirtyNodeIds.push(...result.dirtyNodeIds);
          this.recordHistory();
          break;
        }
        case "undo": {
          const snapshot = this.historyCursor > 0 ? cloneSnapshot(this.history[this.historyCursor - 1]!) : null;
          if (snapshot) {
            this.restoreSnapshot(snapshot);
            this.historyCursor -= 1;
          }
          break;
        }
        case "redo": {
          const snapshot =
            this.historyCursor + 1 < this.history.length
              ? cloneSnapshot(this.history[this.historyCursor + 1]!)
              : null;
          if (snapshot) {
            this.restoreSnapshot(snapshot);
            this.historyCursor += 1;
          }
          break;
        }
      }
    }

    return {
      snapshot: this.snapshot(),
      validation: buildValidation(this.document),
      appliedCommands: commands.map((command) => command.kind),
      dirtyNodeIds: [...new Set(dirtyNodeIds)],
    };
  }

  async query(selector: BridgeQuery) {
    switch (selector.kind) {
      case "selection":
        return this.selection;
      case "document":
        return this.document;
      case "node":
        return this.document.pages
          .flatMap((page) => page.nodes)
          .find((node) => node.id === selector.nodeId);
      case "text_layout": {
        const node = this.document.pages
          .flatMap((page) => page.nodes)
          .find((candidate) => candidate.id === selector.nodeId);
        return node ? buildFallbackTextLayout(node) : null;
      }
      case "hit_test":
        return runHitTest(
          this.document,
          selector.pageId,
          selector.x,
          selector.y,
          selector.mode ?? "topmost",
        );
      case "selection_bounds":
        return buildSelectionBounds(this.document, this.selection);
      case "transform_handles":
        return buildTransformHandles(buildSelectionBounds(this.document, this.selection));
      case "move_snap": {
        const selectionBounds = buildSelectionBounds(this.document, this.selection);
        const page = selectionPage(this.document, this.selection);
        const frameMap = page ? buildAbsoluteFrameMap(page.nodes) : null;
        return computeMoveSnap(
          selectionBounds,
          { x: selector.deltaX, y: selector.deltaY },
          (page?.nodes ?? [])
            .filter((node) => !this.selection.includes(node.id))
            .map((node) => frameMap?.get(node.id) ?? node.frame),
          page?.guides ?? [],
          selector.threshold ?? 8,
        );
      }
      case "resize_snap": {
        const selectionBounds = buildSelectionBounds(this.document, this.selection);
        const previewBounds = selectionBounds
          ? resizeBounds(
              selectionBounds,
              selector.handle,
              selector.deltaX,
              selector.deltaY,
              selector.lockAspect ?? false,
            )
          : null;
        const page = selectionPage(this.document, this.selection);
        const frameMap = page ? buildAbsoluteFrameMap(page.nodes) : null;
        return computeResizeSnap(
          selectionBounds,
          previewBounds,
          selector.handle,
          (page?.nodes ?? [])
            .filter((node) => !this.selection.includes(node.id))
            .map((node) => frameMap?.get(node.id) ?? node.frame),
          page?.guides ?? [],
          selector.threshold ?? 8,
        );
      }
    }
  }

  async runValidation() {
    return buildValidation(this.document);
  }

  async exportRuntimeGraph(): Promise<RuntimeGraph> {
    return {
      routes: this.document.pages.map((page, index) => ({
        id: `route-${page.id}`,
        key: page.name.toLowerCase().replace(/\s+/g, "-"),
        path: index === 0 ? "/" : `/${page.name.toLowerCase().replace(/\s+/g, "-")}`,
        pageId: page.id,
      })),
      serviceBindings: [
        {
          id: "binding-platform-auth",
          key: "platform-auth",
          kind: "auth",
          target: "platform_auth.default",
        },
        {
          id: "binding-publish",
          key: "publish-snapshot",
          kind: "publish",
          target: "publish.snapshot.default",
        },
      ],
    };
  }

  private snapshot(): EditorSnapshot {
    return {
      version: this.version,
      doc: cloneDoc(this.document),
      selection: [...this.selection],
      viewport: { ...this.viewport },
    };
  }

  private recordHistory() {
    const next = this.snapshot();
    if (this.historyCursor + 1 < this.history.length) {
      this.history = this.history.slice(0, this.historyCursor + 1);
    }
    this.history.push(cloneSnapshot(next));
    this.historyCursor = this.history.length - 1;
  }

  private restoreSnapshot(snapshot: EditorSnapshot) {
    this.version = snapshot.version;
    this.document = cloneDoc(snapshot.doc);
    this.selection = [...snapshot.selection];
    this.viewport = { ...snapshot.viewport };
  }

  private seedHistory() {
    const snapshot = this.snapshot();
    this.history = [cloneSnapshot(snapshot)];
    this.historyCursor = 0;
  }
}

export function createNoopEditorBridge(initialDocument: SceneDoc) {
  return new NoopEditorBridge(initialDocument);
}
