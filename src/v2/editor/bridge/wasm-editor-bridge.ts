import type {
  BridgeQuery,
  EditorApplyResult,
  EditorBridge,
  EditorCommand,
  EditorRect,
  EditorSnapshot,
  HitTestResult,
  MoveSnapPreview,
  ResizeSnapPreview,
  RuntimeGraph,
  SceneDoc,
  TransformHandle,
  ValidationReport,
} from "@/v2/editor/contracts";

type WasmEditorBridgeModule = {
  default: () => Promise<unknown>;
  WasmEditorBridgeHandle: new () => {
    load_document(serializedDoc: string): string;
    dispatch_editor_commands(commandsJson: string): string;
    query_node(nodeId: string): string;
    hit_test(pageId: string, x: number, y: number, mode: string): string;
    selection_bounds(): string;
    transform_handles(): string;
    move_snap(deltaX: number, deltaY: number, threshold?: number): string;
    resize_snap(
      handle: string,
      deltaX: number,
      deltaY: number,
      lockAspect: boolean,
      threshold?: number,
    ): string;
    run_validation(): string;
    export_document(): string;
  };
};

function buildRuntimeGraph(document: SceneDoc): RuntimeGraph {
  return {
    routes: document.pages.map((page, index) => ({
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

export class BrowserWasmEditorBridge implements EditorBridge {
  private constructor(
    private readonly handle: InstanceType<WasmEditorBridgeModule["WasmEditorBridgeHandle"]>,
  ) {}

  private snapshot: EditorSnapshot | null = null;

  static async create() {
    const module = (await import("../wasm/load-ffi-wasm-editor")) as unknown as WasmEditorBridgeModule;
    await module.default();
    return new BrowserWasmEditorBridge(new module.WasmEditorBridgeHandle());
  }

  async info() {
    return {
      mode: "wasm" as const,
      kernel: "rust-wasm" as const,
      schemaVersion: 2,
    };
  }

  async loadDocument(document: SceneDoc) {
    const raw = this.handle.load_document(JSON.stringify(document));
    const snapshot = JSON.parse(raw) as EditorSnapshot;
    this.snapshot = snapshot;
    return snapshot;
  }

  async dispatch(commands: EditorCommand[]) {
    const raw = this.handle.dispatch_editor_commands(JSON.stringify(commands));
    const result = JSON.parse(raw) as EditorApplyResult;
    this.snapshot = result.snapshot;
    return result;
  }

  async query(selector: BridgeQuery) {
    if (selector.kind === "selection") {
      return this.snapshot?.selection ?? [];
    }

    if (selector.kind === "document") {
      return this.snapshot?.doc ?? null;
    }

    if (selector.kind === "node") {
      return JSON.parse(this.handle.query_node(selector.nodeId)) as unknown;
    }

    if (selector.kind === "hit_test") {
      return JSON.parse(
        this.handle.hit_test(selector.pageId, selector.x, selector.y, selector.mode ?? "topmost"),
      ) as HitTestResult;
    }

    if (selector.kind === "selection_bounds") {
      return JSON.parse(this.handle.selection_bounds()) as EditorRect | null;
    }

    if (selector.kind === "transform_handles") {
      return JSON.parse(this.handle.transform_handles()) as TransformHandle[];
    }

    if (selector.kind === "move_snap") {
      return JSON.parse(
        this.handle.move_snap(selector.deltaX, selector.deltaY, selector.threshold),
      ) as MoveSnapPreview;
    }

    return JSON.parse(
      this.handle.resize_snap(
        selector.handle,
        selector.deltaX,
        selector.deltaY,
        selector.lockAspect ?? false,
        selector.threshold,
      ),
    ) as ResizeSnapPreview;
  }

  async runValidation() {
    return JSON.parse(this.handle.run_validation()) as ValidationReport;
  }

  async exportRuntimeGraph() {
    const document = JSON.parse(this.handle.export_document()) as SceneDoc;
    return buildRuntimeGraph(document);
  }
}
