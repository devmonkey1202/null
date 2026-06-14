import {
  type AutoLayoutAlign,
  type AutoLayoutData,
  type BridgeQuery,
  type ComponentNodeData,
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
  type ResizeSnapPreview,
  type RuntimeGraph,
  type SceneDoc,
  type SceneGuide,
  type SceneNode,
  type ScenePage,
  type InstanceNodeData,
  type InstanceShapeOverride,
  type InstanceTextOverride,
  type SelectionSetMode,
  type SnapGuide,
  type ShapeNodeData,
  type ShapePathData,
  type ShapeStylePatch,
  type TextNodeData,
  type TextStylePatch,
  type TransformHandle,
  type ValidationReport,
  type VerticalConstraint,
  V2_EDITOR_SCHEMA_VERSION,
} from "@/v2/editor/contracts";

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

function pointInsideRect(node: SceneNode, x: number, y: number) {
  return (
    x >= node.frame.x &&
    y >= node.frame.y &&
    x <= node.frame.x + node.frame.w &&
    y <= node.frame.y + node.frame.h
  );
}

function rectsIntersect(a: EditorRect, b: EditorRect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function buildSelectionBounds(document: SceneDoc, selection: string[]) {
  const nodes = document.pages
    .flatMap((page) => page.nodes)
    .filter((node) => selection.includes(node.id));

  if (nodes.length === 0) {
    return null;
  }

  const left = Math.min(...nodes.map((node) => node.frame.x));
  const top = Math.min(...nodes.map((node) => node.frame.y));
  const right = Math.max(...nodes.map((node) => node.frame.x + node.frame.w));
  const bottom = Math.max(...nodes.map((node) => node.frame.y + node.frame.h));

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
    ...(style.align ? { align: style.align } : {}),
    ...(style.color ? { color: style.color } : {}),
  };
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
    ...(next.align !== undefined ? { align: next.align } : {}),
    ...(next.color !== undefined ? { color: next.color } : {}),
  };
}

function upsertInstanceTextOverride(
  overrides: InstanceTextOverride[] | undefined,
  sourceNodeId: string,
  patch: {
    content?: string;
    style?: TextStylePatch;
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
    return nextOverrides;
  }

  nextOverrides.push({
    sourceNodeId,
    ...(patch.content !== undefined ? { content: patch.content } : {}),
    ...(patch.style ? { style: patch.style } : {}),
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
    targetNode.text = {
      ...targetNode.text,
      ...(override.content !== undefined ? { content: override.content } : {}),
      ...(override.style ? applyTextStylePatch(targetNode.text, override.style) : {}),
    };
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

function estimateTextAutoHeight(width: number, text: TextNodeData) {
  const availableWidth = Math.max(width, text.fontSize);
  const averageCharWidth = Math.max(text.fontSize * 0.56 + Math.max(text.letterSpacing, 0), 1);
  const charsPerLine = Math.max(Math.floor(availableWidth / averageCharWidth), 1);
  const lines = text.content.split("\n").reduce((count, paragraph) => {
    const paragraphLength = Math.max(Array.from(paragraph).length, 1);
    return count + Math.max(Math.ceil(paragraphLength / charsPerLine), 1);
  }, 0);

  return Math.max(text.lineHeight * Math.max(lines, 1), text.lineHeight);
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
  if (parent.layout) {
    const nextFrames = buildAutoLayoutFrames(page, parent, childIds, parent.layout);
    for (const [childId, nextFrame] of nextFrames) {
      const childIndex = page.nodes.findIndex((node) => node.id === childId);
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

  for (const childId of childIds) {
    applyAutoLayoutRecursive(page, childId);
  }
}

function buildAutoLayoutFrames(
  page: SceneDoc["pages"][number],
  parent: SceneNode,
  childIds: string[],
  layout: AutoLayoutData,
) {
  const frames = new Map<string, EditorRect>();
  let primaryCursor =
    layout.direction === "horizontal"
      ? parent.frame.x + layout.paddingX
      : parent.frame.y + layout.paddingY;
  const crossStart =
    layout.direction === "horizontal"
      ? parent.frame.y + layout.paddingY
      : parent.frame.x + layout.paddingX;
  const crossSize =
    layout.direction === "horizontal"
      ? Math.max(parent.frame.h - layout.paddingY * 2, 1)
      : Math.max(parent.frame.w - layout.paddingX * 2, 1);

  for (const childId of childIds) {
    const child = page.nodes.find((node) => node.id === childId);
    if (!child) {
      continue;
    }

    const nextFrame = { ...child.frame };
    if (layout.direction === "horizontal") {
      nextFrame.x = primaryCursor;
      const aligned = alignCrossAxis(nextFrame.h, crossStart, crossSize, layout.align);
      nextFrame.y = aligned.position;
      nextFrame.h = aligned.size;
      nextFrame.h = Math.max(nextFrame.h, 1);
      primaryCursor += nextFrame.w + layout.gap;
    } else {
      nextFrame.y = primaryCursor;
      const aligned = alignCrossAxis(nextFrame.w, crossStart, crossSize, layout.align);
      nextFrame.x = aligned.position;
      nextFrame.w = aligned.size;
      nextFrame.w = Math.max(nextFrame.w, 1);
      primaryCursor += nextFrame.h + layout.gap;
    }

    frames.set(childId, nextFrame);
  }

  return frames;
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

function normalizeDocument(document: SceneDoc) {
  return normalizeAutoLayoutNodes(normalizeAutoHeightNodes(document));
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

  const hitIds = page.nodes.filter((node) => rectsIntersect(node.frame, rect)).map((node) => node.id);

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
      nodes: page.nodes.map((node) => {
        if (!selection.includes(node.id)) {
          return node;
        }

        const leftOffset = node.frame.x - bounds.x;
        const topOffset = node.frame.y - bounds.y;
        const rightOffset = node.frame.x + node.frame.w - bounds.x;
        const bottomOffset = node.frame.y + node.frame.h - bounds.y;

        const nextLeft = nextBounds.x + leftOffset * scaleX;
        const nextTop = nextBounds.y + topOffset * scaleY;
        const nextRight = nextBounds.x + rightOffset * scaleX;
        const nextBottom = nextBounds.y + bottomOffset * scaleY;

        return normalizeTextNode({
          ...node,
          frame: {
            ...node.frame,
            x: nextLeft,
            y: nextTop,
            w: Math.max(nextRight - nextLeft, 1),
            h: Math.max(nextBottom - nextTop, 1),
          },
        });
      }),
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
      nodes: page.nodes.map((node) => {
        if (!selection.includes(node.id)) {
          return node;
        }

        const nodeCenterX = node.frame.x + node.frame.w / 2;
        const nodeCenterY = node.frame.y + node.frame.h / 2;
        const localX = nodeCenterX - centerX;
        const localY = nodeCenterY - centerY;
        const rotatedX = localX * cosTheta - localY * sinTheta;
        const rotatedY = localX * sinTheta + localY * cosTheta;

        return {
          ...node,
          frame: {
            ...node.frame,
            x: centerX + rotatedX - node.frame.w / 2,
            y: centerY + rotatedY - node.frame.h / 2,
            rotation: normalizeDegrees(node.frame.rotation + deltaDeg),
          },
        };
      }),
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

  const hitNodes = [...page.nodes].reverse().filter((node) => pointInsideRect(node, x, y));
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
                  ? {
                      ...node.text,
                      content: command.content,
                    }
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
                text: node.text ? applyTextStylePatch(node.text, command.style) : node.text,
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
        return computeMoveSnap(
          selectionBounds,
          { x: selector.deltaX, y: selector.deltaY },
          (page?.nodes ?? [])
            .filter((node) => !this.selection.includes(node.id))
            .map((node) => node.frame),
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
        return computeResizeSnap(
          selectionBounds,
          previewBounds,
          selector.handle,
          (page?.nodes ?? [])
            .filter((node) => !this.selection.includes(node.id))
            .map((node) => node.frame),
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
