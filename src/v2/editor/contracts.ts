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

export type HorizontalConstraint = "min" | "max" | "stretch" | "scale";

export type VerticalConstraint = "min" | "max" | "stretch" | "scale";

export type NodeConstraints = {
  horizontal: HorizontalConstraint;
  vertical: VerticalConstraint;
};

export type AutoLayoutDirection = "horizontal" | "vertical";

export type AutoLayoutAlign = "start" | "center" | "end" | "stretch";

export type AutoLayoutData = {
  direction: AutoLayoutDirection;
  gap: number;
  paddingX: number;
  paddingY: number;
  align: AutoLayoutAlign;
};

export type TextAlign = "left" | "center" | "right" | "justify";

export type TextSizingMode = "fixed" | "auto_height";

export type TextNodeData = {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  align: TextAlign;
  color: string;
  sizing: TextSizingMode;
};

export type TextStylePatch = Partial<Omit<TextNodeData, "content" | "sizing">>;

export type ShapePrimitive = "rect" | "ellipse" | "line" | "path";

export type ShapePathHandle = {
  x: number;
  y: number;
};

export type ShapePathPoint = {
  x: number;
  y: number;
  handleIn?: ShapePathHandle;
  handleOut?: ShapePathHandle;
};

export type ShapePathData = {
  points: ShapePathPoint[];
  closed: boolean;
};

export type ShapeNodeData = {
  primitive: ShapePrimitive;
  fill: string;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius: number;
  opacity: number;
  path?: ShapePathData;
};

export type ShapeStylePatch = Partial<Omit<ShapeNodeData, "primitive" | "path">>;

export type ComponentNodeData = {
  componentKey: string;
};

export type InstanceNodeData = {
  sourceComponentId: string;
  sourceComponentKey: string;
};

export type SceneGuide = {
  id: string;
  axis: "x" | "y";
  position: number;
};

export type SelectionSetMode = "replace" | "add" | "toggle";

export type SceneNode = {
  id: string;
  kind: EditorNodeKind;
  name: string;
  parentId: string | null;
  children?: string[];
  frame: EditorRect;
  constraints?: NodeConstraints;
  layout?: AutoLayoutData;
  text?: TextNodeData;
  shape?: ShapeNodeData;
  component?: ComponentNodeData;
  instance?: InstanceNodeData;
};

export type ScenePage = {
  id: string;
  name: string;
  rootId: string;
  nodes: SceneNode[];
  guides?: SceneGuide[];
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
  | { kind: "set_text_content"; nodeId: string; content: string }
  | { kind: "set_text_style"; nodeId: string; style: TextStylePatch }
  | { kind: "set_text_sizing"; nodeId: string; sizing: TextSizingMode }
  | { kind: "set_shape_primitive"; nodeId: string; primitive: ShapePrimitive }
  | { kind: "set_shape_style"; nodeId: string; style: ShapeStylePatch }
  | { kind: "set_shape_path"; nodeId: string; path: ShapePathData }
  | { kind: "promote_to_component"; nodeId: string; componentKey?: string }
  | { kind: "set_component_key"; nodeId: string; componentKey: string }
  | {
      kind: "create_instance_from_component";
      pageId: string;
      sourceNodeId: string;
      offsetX?: number;
      offsetY?: number;
    }
  | { kind: "refresh_instance"; nodeId: string }
  | { kind: "detach_instance"; nodeId: string }
  | { kind: "set_node_auto_layout"; nodeId: string; layout: AutoLayoutData | null }
  | {
      kind: "set_node_constraints";
      nodeId: string;
      constraints: NodeConstraints;
    }
  | { kind: "move_selection"; deltaX: number; deltaY: number }
  | { kind: "move_node"; nodeId: string; frame: Partial<EditorRect> }
  | { kind: "rotate_selection"; deltaDeg: number }
  | {
      kind: "resize_selection";
      handle: TransformHandleKind;
      deltaX: number;
      deltaY: number;
      lockAspect?: boolean;
    }
  | { kind: "add_guide"; pageId: string; guide: SceneGuide }
  | { kind: "move_guide"; pageId: string; guideId: string; position: number }
  | { kind: "delete_guide"; pageId: string; guideId: string }
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

export type SnapGuide = {
  axis: "x" | "y";
  position: number;
  spanStart: number;
  spanEnd: number;
};

export type MoveSnapPreview = {
  deltaX: number;
  deltaY: number;
  guides: SnapGuide[];
};

export type ResizeSnapPreview = {
  bounds: EditorRect | null;
  deltaX: number;
  deltaY: number;
  guides: SnapGuide[];
};

export type BridgeQuery =
  | { kind: "selection" }
  | { kind: "document" }
  | { kind: "node"; nodeId: string }
  | { kind: "hit_test"; pageId: string; x: number; y: number; mode?: HitTestMode }
  | { kind: "selection_bounds" }
  | { kind: "transform_handles" }
  | { kind: "move_snap"; deltaX: number; deltaY: number; threshold?: number }
  | {
      kind: "resize_snap";
      handle: TransformHandleKind;
      deltaX: number;
      deltaY: number;
      lockAspect?: boolean;
      threshold?: number;
    };

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
  mode: "scaffold" | "wasm";
  kernel: "browser-noop" | "rust-wasm";
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
