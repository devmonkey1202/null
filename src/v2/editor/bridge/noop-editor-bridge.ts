import {
  type BridgeQuery,
  type EditorApplyResult,
  type EditorBridge,
  type EditorCommand,
  type EditorSnapshot,
  type EditorViewport,
  type RuntimeGraph,
  type SceneDoc,
  type SceneNode,
  type ValidationReport,
  V2_EDITOR_SCHEMA_VERSION,
} from "@/v2/editor/contracts";

const DEFAULT_VIEWPORT: EditorViewport = { zoom: 1, x: 0, y: 0 };

function cloneDoc(document: SceneDoc): SceneDoc {
  return structuredClone(document);
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

export class NoopEditorBridge implements EditorBridge {
  private document: SceneDoc;
  private selection: string[] = [];
  private viewport: EditorViewport = DEFAULT_VIEWPORT;
  private version = 1;

  constructor(initialDocument: SceneDoc) {
    this.document = cloneDoc(initialDocument);
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
    return this.snapshot();
  }

  async dispatch(commands: EditorCommand[]): Promise<EditorApplyResult> {
    for (const command of commands) {
      switch (command.kind) {
        case "select_nodes":
          this.selection = [...command.nodeIds];
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
          break;
      }
    }

    return {
      snapshot: this.snapshot(),
      validation: buildValidation(this.document),
      appliedCommands: commands.map((command) => command.kind),
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
}

export function createNoopEditorBridge(initialDocument: SceneDoc) {
  return new NoopEditorBridge(initialDocument);
}

