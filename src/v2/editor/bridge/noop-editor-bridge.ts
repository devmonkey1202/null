import {
  type AutoLayoutAlign,
  type AutoLayoutData,
  type BridgeQuery,
  type EditorApplyResult,
  type EditorBridge,
  type EditorCommand,
  type EditorRect,
  type EditorSnapshot,
  type EditorViewport,
  type HitTestResult,
  type HorizontalConstraint,
  type NodeConstraints,
  type RuntimeGraph,
  type SceneDoc,
  type SceneNode,
  type SelectionSetMode,
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
          this.document = normalizeDocument({
            ...this.document,
            pages: updateNode(this.document.pages, command.nodeId, (node) =>
              ({
                ...node,
                text: node.text
                  ? {
                      ...node.text,
                      content: command.content,
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
        case "set_text_style":
          this.document = normalizeDocument({
            ...this.document,
            pages: updateNode(this.document.pages, command.nodeId, (node) =>
              ({
                ...node,
                text: node.text ? applyTextStylePatch(node.text, command.style) : node.text,
              }),
            ),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          });
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
