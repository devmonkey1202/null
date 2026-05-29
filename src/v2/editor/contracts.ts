export const V2_EDITOR_SCHEMA_VERSION = 2;

export type EditorNodeKind =
  | "frame"
  | "text"
  | "shape"
  | "image"
  | "video"
  | "component"
  | "instance"
  | "group";

export type EditorRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
};

export type EditorViewport = {
  zoom: number;
  x: number;
  y: number;
};

export type SelectionSetMode = "replace" | "add" | "toggle";

export type SceneNode = {
  id: string;
  kind: EditorNodeKind;
  name: string;
  parentId: string | null;
  children?: string[];
  frame: EditorRect;
};

export type ScenePage = {
  id: string;
  name: string;
  rootId: string;
  nodes: SceneNode[];
};

export type SceneDoc = {
  schemaVersion: typeof V2_EDITOR_SCHEMA_VERSION;
  documentId: string;
  title: string;
  pages: ScenePage[];
  meta: {
    createdAt: string;
    updatedAt: string;
  };
};

export type ValidationIssue = {
  id: string;
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  targetId?: string;
};

export type ValidationReport = {
  documentId: string;
  generatedAt: string;
  issues: ValidationIssue[];
};

export type EditorCommand =
  | { kind: "select_nodes"; nodeIds: string[] }
  | { kind: "select_in_rect"; pageId: string; rect: EditorRect; mode?: SelectionSetMode }
  | { kind: "set_viewport"; viewport: EditorViewport }
  | { kind: "rename_node"; nodeId: string; name: string }
  | { kind: "move_node"; nodeId: string; frame: Partial<EditorRect> }
  | {
      kind: "resize_selection";
      handle: TransformHandleKind;
      deltaX: number;
      deltaY: number;
      lockAspect?: boolean;
    }
  | { kind: "create_node"; pageId: string; node: SceneNode }
  | { kind: "delete_node"; nodeId: string }
  | { kind: "undo" }
  | { kind: "redo" };

export type EditorSnapshot = {
  version: number;
  doc: SceneDoc;
  selection: string[];
  viewport: EditorViewport;
};

export type EditorApplyResult = {
  snapshot: EditorSnapshot;
  validation: ValidationReport;
  appliedCommands: string[];
  dirtyNodeIds: string[];
};

export type HitTestMode = "topmost" | "all";

export type HitTestResult = {
  pageId: string;
  nodeIds: string[];
  topNodeId: string | null;
};

export type TransformHandleKind =
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "nw"
  | "rotate";

export type TransformHandle = {
  kind: TransformHandleKind;
  x: number;
  y: number;
  cursor: string;
};

export type BridgeQuery =
  | { kind: "selection" }
  | { kind: "document" }
  | { kind: "node"; nodeId: string }
  | { kind: "hit_test"; pageId: string; x: number; y: number; mode?: HitTestMode }
  | { kind: "selection_bounds" }
  | { kind: "transform_handles" };

export type ServiceBinding = {
  id: string;
  key: string;
  kind: "auth" | "storage" | "publish" | "collaboration" | "realtime" | "ai";
  target: string;
};

export type RuntimeRoute = {
  id: string;
  key: string;
  path: string;
  pageId: string;
};

export type RuntimeGraph = {
  routes: RuntimeRoute[];
  serviceBindings: ServiceBinding[];
};

export type WasmBridgeInfo = {
  mode: "scaffold";
  kernel: "browser-noop";
  schemaVersion: number;
};

export interface EditorBridge {
  info(): Promise<WasmBridgeInfo>;
  loadDocument(document: SceneDoc): Promise<EditorSnapshot>;
  dispatch(commands: EditorCommand[]): Promise<EditorApplyResult>;
  query(selector: BridgeQuery): Promise<unknown>;
  runValidation(): Promise<ValidationReport>;
  exportRuntimeGraph(): Promise<RuntimeGraph>;
}
