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
  TextLayout,
  TransformHandle,
  ValidationReport,
} from "@/v2/editor/contracts";

type WasmEditorBridgeModule = {
  default: () => Promise<unknown>;
  WasmEditorBridgeHandle: new () => {
    load_document(serializedDoc: string): string;
    dispatch_editor_commands(commandsJson: string): string;
    query_node(nodeId: string): string;
    text_layout(nodeId: string): string;
    register_font(family: string, data: Uint8Array, italic: boolean): string;
    unregister_font(family: string, italic: boolean): boolean;
    font_registry(): string;
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

type EditorFontDefinition = {
  family: string;
  path: string;
  italic: boolean;
};

type RegisteredFontInfo = {
  family: string;
  italic: boolean;
  byteLength: number;
  glyphCount: number;
};

const EDITOR_FONTS: EditorFontDefinition[] = [
  {
    family: "Inter",
    path: "/v2/fonts/InterVariable.ttf",
    italic: false,
  },
  {
    family: "Inter",
    path: "/v2/fonts/InterVariable-Italic.ttf",
    italic: true,
  },
  {
    family: "Noto Sans Hebrew",
    path: "/v2/fonts/NotoSansHebrew-Variable.ttf",
    italic: false,
  },
  {
    family: "Noto Sans Arabic",
    path: "/v2/fonts/NotoSansArabic-Variable.ttf",
    italic: false,
  },
];

async function registerEditorFonts(
  handle: InstanceType<WasmEditorBridgeModule["WasmEditorBridgeHandle"]>,
) {
  const fetched = await Promise.allSettled(
    EDITOR_FONTS.map(async (font) => {
      const response = await fetch(font.path, { cache: "force-cache" });
      if (!response.ok) {
        throw new Error(`${font.path} returned HTTP ${response.status}`);
      }
      return {
        font,
        bytes: new Uint8Array(await response.arrayBuffer()),
      };
    }),
  );

  for (const [index, result] of fetched.entries()) {
    const definition = EDITOR_FONTS[index];
    if (result.status === "rejected") {
      console.warn(`[NULL v2] Could not load ${definition.family}.`, result.reason);
      continue;
    }
    try {
      JSON.parse(
        handle.register_font(
          result.value.font.family,
          result.value.bytes,
          result.value.font.italic,
        ),
      ) as RegisteredFontInfo;
    } catch (error) {
      console.warn(`[NULL v2] Could not register ${definition.family}.`, error);
    }
  }
}

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
    const wasmModule = (await import("../wasm/load-ffi-wasm-editor")) as unknown as WasmEditorBridgeModule;
    await wasmModule.default();
    const handle = new wasmModule.WasmEditorBridgeHandle();
    await registerEditorFonts(handle);
    return new BrowserWasmEditorBridge(handle);
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

    if (selector.kind === "text_layout") {
      return JSON.parse(this.handle.text_layout(selector.nodeId)) as TextLayout;
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
