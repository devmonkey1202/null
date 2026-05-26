import {
  type BridgeQuery,
  type EditorApplyResult,
  type EditorBridge,
  type EditorCommand,
  type EditorRect,
  type EditorSnapshot,
  type EditorViewport,
  type HitTestResult,
  type RuntimeGraph,
  type SceneDoc,
  type SceneNode,
  type SelectionSetMode,
  type TransformHandle,
  type ValidationReport,
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

export class NoopEditorBridge implements EditorBridge {
  private document: SceneDoc;
  private selection: string[] = [];
  private viewport: EditorViewport = DEFAULT_VIEWPORT;
  private version = 1;
  private history: EditorSnapshot[] = [];
  private historyCursor = -1;

  constructor(initialDocument: SceneDoc) {
    this.document = cloneDoc(initialDocument);
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
    this.document = cloneDoc(document);
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
        case "move_node":
          this.document = {
            ...this.document,
            pages: updateNode(this.document.pages, command.nodeId, (node) => ({
              ...node,
              frame: {
                ...node.frame,
                ...command.frame,
              },
            })),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          };
          this.version += 1;
          dirtyNodeIds.push(command.nodeId);
          this.recordHistory();
          break;
        case "create_node":
          this.document = {
            ...this.document,
            pages: this.document.pages.map((page) =>
              page.id === command.pageId
                ? { ...page, nodes: [...page.nodes, command.node] }
                : page,
            ),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          };
          this.version += 1;
          dirtyNodeIds.push(command.node.id);
          if (command.node.parentId) {
            dirtyNodeIds.push(command.node.parentId);
          }
          this.recordHistory();
          break;
        case "delete_node":
          this.document = {
            ...this.document,
            pages: this.document.pages.map((page) => ({
              ...page,
              nodes: page.nodes.filter((node) => node.id !== command.nodeId),
            })),
            meta: { ...this.document.meta, updatedAt: new Date().toISOString() },
          };
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
