import type { WebImportState } from "@/lib/webImportShared";

export type NodeType =
  | "frame"
  | "group"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "polygon"
  | "star"
  | "path"
  | "text"
  | "image"
  | "video"
  | "section"
  | "slice"
  | "component"
  | "instance"
  | "hotspot"
  | "table";

const DEFAULT_NODE_NAMES: Record<NodeType, string> = {
  frame: "프레임",
  group: "그룹",
  rect: "사각형",
  ellipse: "원",
  line: "선",
  arrow: "화살표",
  polygon: "다각형",
  star: "별",
  path: "벡터",
  text: "텍스트",
  image: "이미지",
  video: "비디오",
  section: "섹션",
  slice: "슬라이스",
  component: "컴포넌트",
  instance: "인스턴스",
  hotspot: "핫스팟",
  table: "테이블",
};

export type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten";

export type GradientStop = { offset: number; color: string; colorRef?: string };

export type Fill =
  | { type: "solid"; color: string; opacity?: number }
  | { type: "linear"; from: string; to: string; angle: number; opacity?: number; stops?: GradientStop[] }
  | { type: "radial"; from: string; to: string; opacity?: number; stops?: GradientStop[]; cx?: number; cy?: number; r?: number }
  | { type: "image"; src: string; fit: "cover" | "contain" | "fill" };

export type Stroke = {
  color: string;
  width: number;
  align?: "inside" | "center" | "outside";
  dash?: number[];
};

export type Effect =
  | { type: "shadow"; x: number; y: number; blur: number; color: string; opacity?: number }
  | { type: "blur"; blur: number }
  | { type: "noise"; amount?: number };

/** I5 Vector network: path 세그먼트별 d와 fills */
export type PathSegment = { d: string; fills: Fill[] };

export type BooleanSemanticOp = "union" | "subtract" | "intersect" | "exclude";

export type BooleanOperandSnapshot = {
  sourceId?: string;
  name?: string;
  type: NodeType;
  pathData?: string;
  frame?: Frame;
  fills?: Fill[];
  vectorNetwork?: VectorNetwork;
};

export type BooleanMeta = {
  op: BooleanSemanticOp;
  source: "editor" | "figma-import";
  operands?: BooleanOperandSnapshot[];
};

export type VectorNetworkVertex = {
  id: string;
  x: number;
  y: number;
  handleInX?: number;
  handleInY?: number;
  handleOutX?: number;
  handleOutY?: number;
  isSmooth?: boolean;
};

export type VectorNetworkSegment = {
  id: string;
  from: string;
  to: string;
};

export type VectorNetworkPath = {
  id: string;
  vertexIds: string[];
  closed: boolean;
  fills?: Fill[];
};

export type VectorNetwork = {
  vertices: VectorNetworkVertex[];
  segments: VectorNetworkSegment[];
  paths: VectorNetworkPath[];
};

function cloneFill(fill: Fill): Fill {
  if (fill.type === "linear" || fill.type === "radial") {
    return {
      ...fill,
      stops: fill.stops?.map((stop) => ({ ...stop })),
    };
  }
  return { ...fill };
}

function cloneFills(fills: Fill[] | undefined): Fill[] | undefined {
  return fills?.map((fill) => cloneFill(fill));
}

function cloneTextRanges(ranges: TextRange[] | undefined): TextRange[] | undefined {
  return ranges?.map((range) => ({
    start: range.start,
    end: range.end,
    style: range.style ? { ...range.style } : undefined,
    fill: range.fill,
    fillRef: range.fillRef,
    styleBindings: range.styleBindings ? { ...range.styleBindings } : undefined,
  }));
}

function cloneTextPath(textPath: TextPath | undefined): TextPath | undefined {
  return textPath ? { ...textPath } : undefined;
}

export type NodeShape = {
  polygonSides?: number;
  starPoints?: number;
  starInnerRatio?: number;
  /** SVG path d (path 노드용). segments 없을 때 사용 */
  pathData?: string;
  /** I5: 세그먼트별 path d와 fills. 있으면 segments 기준 렌더 */
  segments?: PathSegment[];
  /** boolean 결과 path의 semantic trace */
  booleanMeta?: BooleanMeta;
  /** pathData/segments와 병행 저장하는 vector network 편집 모델 */
  vectorNetwork?: VectorNetwork;
};

export type TextStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  paragraphSpacing?: number;
  align: "left" | "center" | "right" | "justify";
  italic?: boolean;
  underline?: boolean;
  /** 텍스트 케이스: none | upper(대문자) | lower(소문자) | capitalize(첫 글자 대문자) */
  textCase?: "none" | "upper" | "lower" | "capitalize";
  /** 취소선 */
  lineThrough?: boolean;
  /** OpenType font-feature-settings (e.g. "liga" 1, "ss01" 1) */
  fontFeatureSettings?: string;
  /** 가변 폰트 축 (e.g. "wght" 400, "wdth" 100) */
  fontVariationSettings?: string;
};

export type TextStyleVariableBindings = Partial<
  Record<"fontFamily" | "fontWeight" | "fontSize" | "lineHeight" | "letterSpacing" | "paragraphSpacing", string>
>;

export type TextRange = {
  start: number;
  end: number;
  style?: Partial<TextStyle>;
  fill?: string;
  fillRef?: string;
  styleBindings?: TextStyleVariableBindings;
};

export type TextPath = {
  pathData: string;
  startOffset?: number;
  side?: "left" | "right";
};

export type AutoLayout = {
  mode: "auto";
  dir: "row" | "column";
  gap: number;
  /** 고정 간격(fixed) vs 공간 분배(space-between) */
  gapMode?: "fixed" | "space-between";
  /** 메인 축 정렬 */
  justify?: "start" | "center" | "end" | "space-between";
  padding: { t: number; r: number; b: number; l: number };
  align: "start" | "center" | "end" | "stretch" | "baseline";
  wrap: boolean;
  /** wrap 줄/열 사이 간격. 미설정 시 gap 사용 */
  wrapGap?: number;
  /** wrap 줄/열 묶음의 cross-axis 정렬 */
  wrapAlign?: "start" | "center" | "end" | "space-between";
  /** 레이아웃 크기 계산 시 테두리 두께 포함 (stroke inclusion) */
  includeStrokeInBounds?: boolean;
};

export type GridTrackSizing = {
  type: "fixed" | "flex" | "hug";
  value?: number;
};

export type GridAutoLayout = {
  mode: "grid";
  columns: number;
  rows: number;
  columnGap: number;
  rowGap: number;
  padding: { t: number; r: number; b: number; l: number };
  columnsSizing?: GridTrackSizing[];
  rowsSizing?: GridTrackSizing[];
};

export type GridChildAlign = "auto" | "start" | "center" | "end";

export type GridChildPlacement = {
  row?: number;
  column?: number;
  rowSpan?: number;
  columnSpan?: number;
  horizontalAlign?: GridChildAlign;
  verticalAlign?: GridChildAlign;
};

export type LayoutMode = { mode: "fixed" } | AutoLayout | GridAutoLayout;

export type LayoutSizing = "fixed" | "fill" | "hug";

export type LayoutSizingAxis = {
  width: LayoutSizing;
  height: LayoutSizing;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
};

export type LayoutPositioning = "auto" | "absolute";

export type Constraints = {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
  hCenter?: boolean;
  vCenter?: boolean;
  scaleX?: boolean;
  scaleY?: boolean;
};

export type VariableType = "color" | "number" | "string" | "boolean";

export type Variable = {
  id: string;
  name: string;
  type: VariableType;
  value: string | number | boolean;
  modes?: Record<string, string | number | boolean>;
  aliasOf?: string;
  modeAliases?: Record<string, string>;
  computed?: {
    formula: string;
    dependencies?: string[];
  };
  publishedKey?: string;
  sourceLibraryId?: string;
  sourceVersionId?: string;
};

export type GlobalStateType = "string" | "number" | "boolean" | "json";

export type GlobalStateItem = {
  id: string;
  key: string;
  type: GlobalStateType;
  defaultValue?: string | number | boolean | Record<string, unknown> | unknown[] | null;
};

export type StyleTokenType = "fill" | "stroke" | "text" | "effect";

export type StyleToken = {
  id: string;
  name: string;
  type: StyleTokenType;
  value: unknown;
  publishedKey?: string;
  sourceLibraryId?: string;
  sourceVersionId?: string;
};

export type ComponentVariant = {
  id: string;
  name: string;
  rootId: string;
  props?: Record<string, string>;
};

export type PrototypeTrigger = "click" | "hover" | "load" | "scroll" | "onPress" | "onDragStart" | "onDragEnd" | "whileHover";

/** 스크롤 트리거(trigger=== "scroll")일 때만 사용. 대상 스크롤 컨테이너 노드 ID, 도달 기준(0~1 또는 px), 단위. */
export type ScrollTriggerConfig = {
  nodeId?: string;
  threshold: number;
  unit: "percent" | "px";
};

export type PrototypeTransitionType = "instant" | "fade" | "slide-left" | "slide-right" | "smart";

export type PrototypeTransition = {
  type: PrototypeTransitionType;
  /** 전환 지속 시간(ms). 미설정 시 300 */
  duration?: number;
  /** 이징: ease | ease-in | ease-out | linear */
  easing?: string;
};

/** 액션 실행 조건: 변수 값 비교. 조건 불만족 시 액션 스킵 */
export type PrototypeCondition = {
  variableId: string;
  op: "eq" | "neq" | "gt" | "lt" | "gte" | "lte";
  value: string | number | boolean;
};

export type PrototypeAction =
  | { type: "navigate"; targetPageId: string; transition?: PrototypeTransition; delayMs?: number; condition?: PrototypeCondition }
  | { type: "back"; transition?: PrototypeTransition; delayMs?: number; condition?: PrototypeCondition }
  | { type: "overlay"; targetPageId: string; transition?: PrototypeTransition; delayMs?: number; condition?: PrototypeCondition; position?: "center" | "top" | "bottom" | "left" | "right" | "bottom-left" | "bottom-right" | "top-left" | "top-right"; overlayWidth?: number; overlayHeight?: number; dim?: number }
  | { type: "closeOverlay"; transition?: PrototypeTransition; delayMs?: number; condition?: PrototypeCondition }
  | { type: "url"; url: string; openInNewTab?: boolean; transition?: PrototypeTransition; delayMs?: number; condition?: PrototypeCondition }
  | { type: "submit"; url: string; method?: "POST" | "GET" | "PATCH" | "DELETE" | "PUT"; nextPageId?: string; delayMs?: number; condition?: PrototypeCondition }
  | { type: "setVariable"; variableId: string; value?: string | number | boolean; mode?: string }
  | { type: "setGlobalState"; key: string; value?: string | number | boolean | Record<string, unknown> | unknown[] | null }
  | { type: "scrollTo"; targetNodeId: string; axis?: "x" | "y" | "both"; offset?: number; transition?: PrototypeTransition; delayMs?: number; condition?: PrototypeCondition }
  | { type: "setVariant"; variantId: string; targetNodeId?: string; delayMs?: number; condition?: PrototypeCondition }
  | { type: "apiCall"; url: string; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; headers?: Record<string, string>; body?: Record<string, unknown>; responseVariable?: string; errorVariable?: string; onSuccess?: PrototypeAction; onError?: PrototypeAction; delayMs?: number; condition?: PrototypeCondition }
  | { type: "nativeCall"; name: string; args?: Record<string, unknown> | string; responseVariable?: string; errorVariable?: string; onSuccess?: PrototypeAction; onError?: PrototypeAction; delayMs?: number; condition?: PrototypeCondition }
  | { type: "appAuth"; action: "login" | "register" | "logout"; nextPageId?: string; delayMs?: number; condition?: PrototypeCondition };

export type PrototypeInteraction = {
  id: string;
  trigger: PrototypeTrigger;
  action: PrototypeAction;
  /** trigger === "scroll"일 때 스크롤 컨테이너·threshold·단위. */
  scrollTriggerConfig?: ScrollTriggerConfig;
  /** trigger === "whileHover"일 때 지연(ms). 이 시간 후에 액션 실행. */
  hoverDelayMs?: number;
};

export type NodePrototype = {
  interactions: PrototypeInteraction[];
};

export type DocPrototype = {
  startPageId?: string;
  /** NOCODE 4: 페이지 접근 조건. "login_required" 시 미인증 사용자 리다이렉트 (런타임·인증 연동 후 적용) */
  access?: "public" | "login_required";
  /** NOCODE 5: submit 전 필수 필드(키: payload.fields 키와 동일, 예: email, name). 비어 있으면 전송 차단 */
  submitRequiredFields?: string[];
};

export type NodeDataBindingFilterOp =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "in"
  | "notIn"
  | "exists"
  | "notExists";

export type NodeDataBindingFilter = {
  field: string;
  op: NodeDataBindingFilterOp;
  value?: unknown;
};

export type NodeDataBinding =
  | {
      type: "collection";
      collectionId: string;
      mode: "table" | "list";
      fields?: string[];
      limit?: number;
      offset?: number;
      orderBy?: string;
      orderDir?: "asc" | "desc";
      filters?: NodeDataBindingFilter[];
      search?: { q?: string; fields?: string[] };
      editable?: boolean;
      allowDelete?: boolean;
    };

export type WidgetExecution = "iframe" | "worker";
export type WidgetCachePolicy = "default" | "no-store" | "immutable";

export type NodeWidget = {
  kind: "sandbox";
  storeId?: string;
  storeVersion?: string;
  digest?: string;
  execution?: WidgetExecution;
  src?: string;
  html?: string;
  script?: string;
  title?: string;
  sandbox?: string;
  allow?: string;
  referrerPolicy?: string;
  timeoutMs?: number;
  maxMessagesPerSec?: number;
  allowedActions?: string[];
  allowedHosts?: string[];
  version?: string;
  cachePolicy?: WidgetCachePolicy;
  allowedScopes?: string[];
  actionScopes?: Record<string, string[]>;
};

export type Frame = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
};

export type NodeStyle = {
  fills: Fill[];
  strokes: Stroke[];
  opacity: number;
  blendMode: BlendMode;
  effects: Effect[];
  radius?: number | { tl: number; tr: number; br: number; bl: number };
  fillRef?: string;
  strokeRef?: string;
  strokeStyleId?: string;
  fillStyleId?: string;
  effectStyleId?: string;
  strokeCap?: "butt" | "round" | "square";
  strokeJoin?: "miter" | "round" | "bevel";
  strokeMiter?: number;
};

export type NodeText = {
  value: string;
  style: TextStyle;
  styleRef?: string;
  wrap?: boolean;
  autoSize?: boolean;
  ranges?: TextRange[];
  textPath?: TextPath;
  valueRef?: string;
  styleBindings?: TextStyleVariableBindings;
};

export type DevAnnotationStatus = "todo" | "ready" | "blocked";

export type DevAnnotation = {
  id: string;
  text: string;
  status?: DevAnnotationStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type DevCodeLinkKind = "docs" | "repo" | "storybook" | "react" | "tailwind" | "api";

export type DevCodeLink = {
  id: string;
  title: string;
  kind: DevCodeLinkKind;
  url?: string;
  snippet?: string;
  language?: string;
  exportKey?: string;
};

export type NodeDevHandoffStatus = "draft" | "ready" | "needs-review";

export type NodeDevHandoff = {
  readyForDev?: boolean;
  status?: NodeDevHandoffStatus;
  annotations?: DevAnnotation[];
  codeLinks?: DevCodeLink[];
};

export type NodeImage = {
  src: string;
  fit: "cover" | "contain" | "fill";
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  poster?: string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  /** 크롭 영역 (0~1 정규화). 미설정 시 전체 표시 */
  crop?: { x: number; y: number; w: number; h: number };
  /** 밝기 (0~2, 1=기본) */
  brightness?: number;
  /** 대비 (0~2, 1=기본) */
  contrast?: number;
};

export type NodeOverrides = {
  name?: string;
  frame?: Frame;
  style?: NodeStyle;
  text?: NodeText;
  image?: NodeImage;
  video?: NodeImage;
  instanceOf?: string;
  publishedKey?: string;
  sourceLibraryId?: string;
  sourceVersionId?: string;
  instanceLibraryId?: string;
  variantId?: string;
  layout?: LayoutMode;
  layoutSizing?: LayoutSizingAxis;
  layoutPositioning?: LayoutPositioning;
  gridChild?: GridChildPlacement;
  constraints?: Constraints;
  hidden?: boolean;
  locked?: boolean;
  clipContent?: boolean;
  shape?: NodeShape;
  data?: NodeDataBinding;
  prototype?: NodePrototype;
  isMask?: boolean;
  overflowScrolling?: "none" | "vertical" | "horizontal" | "both";
  sticky?: boolean;
  widthPercent?: number;
  heightPercent?: number;
  /** NOCODE 8: 슬롯 채우기. slotId -> 페이지 내 노드 id 배열 (해당 슬롯에 넣을 자식들) */
  slotContents?: Record<string, string[]>;
  widget?: NodeWidget;
  dev?: NodeDevHandoff;
};

export interface Node {
  id: string;
  type: NodeType;
  name: string;
  parentId: string | null;
  children: string[];
  frame: Frame;
  style: NodeStyle;
  text?: NodeText;
  image?: NodeImage;
  video?: NodeImage;
  layout?: LayoutMode;
  layoutSizing?: LayoutSizingAxis;
  layoutPositioning?: LayoutPositioning;
  gridChild?: GridChildPlacement;
  constraints?: Constraints;
  locked?: boolean;
  hidden?: boolean;
  clipContent?: boolean;
  shape?: NodeShape;
  data?: NodeDataBinding;
  componentId?: string;
  instanceOf?: string;
  publishedKey?: string;
  sourceLibraryId?: string;
  sourceVersionId?: string;
  /** C1: 인스턴스가 참조하는 컴포넌트가 속한 라이브러리 id. 있으면 instanceOf는 해당 라이브러리 문서 내 노드 id. */
  instanceLibraryId?: string;
  sourceId?: string;
  overrides?: NodeOverrides;
  prototype?: NodePrototype;
  /** 그룹 내 첫 자식일 때 true면 이 노드가 형제들을 마스크함 */
  isMask?: boolean;
  /** 프레임/섹션: 자식이 영역을 넘을 때 스크롤. none | vertical | horizontal | both */
  overflowScrolling?: "none" | "vertical" | "horizontal" | "both";
  /** 스크롤 컨테이너 내에서 스크롤 시 상단에 고정(sticky). 부모에 overflowScrolling 있을 때만 유효 */
  sticky?: boolean;
  /** 컴포넌트 변형. 각 변형은 rootId(컴포넌트 자식)를 가리킴 */
  variants?: ComponentVariant[];
  /** 컴포넌트 속성 정의: sourceId -> { kind, name } (텍스트·불리언·인스턴스 스왑) */
  propertyDefinitions?: Record<string, { kind: "text" | "boolean" | "instance"; name: string }>;
  /** 인스턴스가 사용할 변형 id (미설정 시 첫 변형 또는 컴포넌트 첫 자식) */
  variantId?: string;
  /** 레이아웃 그리드 (Columns / Rows / Grid). 프레임·섹션·컴포넌트 등 */
  layoutGrid?: LayoutGridItem[];
  /** 노드별 내보내기 설정. 비어 있으면 기본 내보내기 사용 */
  exportSettings?: { format: "png" | "svg" | "pdf"; scale: number }[];
  /** 부모 대비 크기 비율(0–100). 설정 시 w/h는 부모 기준으로 계산 */
  widthPercent?: number;
  heightPercent?: number;
  /** NOCODE 8: 슬롯. 컴포넌트 내 이 노드가 슬롯 컨테이너임을 표시. 인스턴스 overrides.slotContents[slotId]로 채움 */
  slotId?: string;
  /** N1: 테이블 노드. 열 개수·헤더 행 여부. 자식들은 행×열 그리드로 배치됨 */
  table?: NodeTable;
  widget?: NodeWidget;
  dev?: NodeDevHandoff;
  breakpointOverrides?: Record<string, {
    frame?: Partial<Frame>;
    style?: Partial<NodeStyle>;
    layout?: Partial<LayoutMode>;
    layoutSizing?: LayoutSizingAxis;
    hidden?: boolean;
  }>;
}

/** N1: 테이블 노드 전용. 자식 노드가 columns 기준으로 그리드 배치됨 */
export type NodeTable = {
  columns: number;
  headerRow?: boolean;
};

export type LayoutGridItem =
  | {
      type: "columns";
      count: number;
      width?: number;
      gutter?: number;
      offset?: number;
      color?: string;
      opacity?: number;
      alignment?: "start" | "center" | "stretch";
    }
  | {
      type: "rows";
      count: number;
      height?: number;
      gutter?: number;
      offset?: number;
      color?: string;
      opacity?: number;
      alignment?: "start" | "center" | "stretch";
    }
  | { type: "grid"; cellSize: number; color?: string; opacity?: number };

export type PageBreakpoint = {
  id: string;
  name: string;
  width: number;
  height: number;
  minWidth?: number;
  maxWidth?: number;
};

export type DocPage = {
  id: string;
  name: string;
  rootId: string;
  breakpoints?: PageBreakpoint[];
  activeBreakpointId?: string;
};

/** C1: 팀 라이브러리·파일 간 컴포넌트. 문서가 참조하는 외부 라이브러리 메타. */
export type LibraryRefStatus = "up-to-date" | "update-available";

export type LibraryRef = {
  id: string;
  name: string;
  currentVersionId?: string;
  latestVersionId?: string;
  status?: LibraryRefStatus;
  consumedAt?: string;
  lastCheckedAt?: string;
  componentKeys?: string[];
  styleKeys?: string[];
  variableKeys?: string[];
};

export type ComponentVersion = {
  id: string;
  name: string;
  createdAt: string;
  rootId: string;
  nodes: Record<string, Node>;
};

export type BranchMergeResolution = "current" | "branch";

export type BranchDiffSummary = {
  added: string[];
  removed: string[];
  changed: string[];
  conflicts: string[];
};

export type BranchEntry = {
  name: string;
  versionId: string;
  createdAt: string;
  updatedAt?: string;
  lastComparedAt?: string;
  lastReviewId?: string;
};

export type BranchReviewStatus = "open" | "approved" | "merged" | "closed";

export type BranchReviewItem = {
  id: string;
  branchName: string;
  versionId: string;
  createdAt: string;
  updatedAt?: string;
  status: BranchReviewStatus;
  summary: BranchDiffSummary;
  resolutions?: Record<string, BranchMergeResolution>;
};

export interface Doc {
  schema: "null_advanced_v1";
  version: 1;
  root: string;
  pages: DocPage[];
  nodes: Record<string, Node>;
  selection: Set<string>;
  view: { zoom: number; panX: number; panY: number; guides?: { x: number[]; y: number[] } };
  styles: StyleToken[];
  variables: Variable[];
  variableModes?: string[];
  variableMode?: string;
  globalState?: GlobalStateItem[];
  components: Record<string, string>;
  componentVersions?: Record<string, ComponentVersion[]>;
  branches?: Record<string, BranchEntry>;
  branchReviews?: BranchReviewItem[];
  /** C1: 이 문서가 사용하는 팀/외부 라이브러리 목록. */
  libraries?: LibraryRef[];
  imports?: WebImportState;
  prototype?: DocPrototype;
}

export type SerializableDoc = Omit<Doc, "selection"> & { selection: string[] };

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: "Space Grotesk, 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
  fontSize: 16,
  fontWeight: 500,
  lineHeight: 1.4,
  letterSpacing: 0,
  paragraphSpacing: 0,
  align: "left",
};

const DEFAULT_STYLE: NodeStyle = {
  fills: [{ type: "solid", color: "#EDEDED" }],
  strokes: [],
  opacity: 1,
  blendMode: "normal",
  effects: [],
  strokeCap: "butt",
  strokeJoin: "miter",
  strokeMiter: 4,
};

const DEFAULT_FRAME: Frame = { x: 0, y: 0, w: 100, h: 100, rotation: 0 };

export function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createNode(type: NodeType, overrides: Partial<Node> = {}): Node {
  const base: Node = {
    id: makeId(type),
    type,
    name: DEFAULT_NODE_NAMES[type] ?? type,
    parentId: null,
    children: [],
    frame: { ...DEFAULT_FRAME },
    style: { ...DEFAULT_STYLE, fills: [...DEFAULT_STYLE.fills], strokes: [] },
    layout: { mode: "fixed" },
    layoutSizing: { width: "fixed", height: "fixed" },
    constraints: {},
    locked: false,
    hidden: false,
    clipContent: false,
    prototype: { interactions: [] },
  };

  if (type === "frame" || type === "section") {
    base.frame = { x: 0, y: 0, w: 1200, h: 800, rotation: 0 };
    base.style = {
      ...base.style,
      fills: [{ type: "solid", color: "#FFFFFF" }],
      strokes: [{ color: "#E5E7EB", width: 1, align: "inside" }],
    };
  }

  if (type === "rect") {
    base.frame = { x: 0, y: 0, w: 200, h: 140, rotation: 0 };
    base.style = { ...base.style, radius: 12 };
  }

  if (type === "ellipse") {
    base.frame = { x: 0, y: 0, w: 160, h: 160, rotation: 0 };
  }

  if (type === "line" || type === "arrow") {
    base.frame = { x: 0, y: 0, w: 240, h: 0, rotation: 0 };
    base.style = { ...base.style, strokes: [{ color: "#111111", width: 2 }] };
  }

  if (type === "polygon" || type === "star") {
    base.frame = { x: 0, y: 0, w: 180, h: 180, rotation: 0 };
    base.style = { ...base.style, fills: [{ type: "solid", color: "#EDEDED" }], strokes: [{ color: "#111111", width: 1 }] };
    if (type === "polygon") {
      base.shape = { polygonSides: 6 };
    } else {
      base.shape = { starPoints: 5, starInnerRatio: 0.5 };
    }
  }

  if (type === "path") {
    base.frame = { x: 0, y: 0, w: 220, h: 140, rotation: 0 };
    base.style = { ...base.style, fills: [], strokes: [{ color: "#111111", width: 2 }] };
  }

  if (type === "text") {
    base.frame = { x: 0, y: 0, w: 240, h: 40, rotation: 0 };
    base.text = { value: "텍스트", style: { ...DEFAULT_TEXT_STYLE }, wrap: true, autoSize: false };
    base.style = { ...base.style, fills: [{ type: "solid", color: "#111111" }] };
  }

  if (type === "image" || type === "video") {
    base.frame = { x: 0, y: 0, w: 320, h: 220, rotation: 0 };
    const media = {
      src: "",
      fit: "cover" as const,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      poster: "",
      autoplay: false,
      loop: false,
      muted: false,
      controls: true,
    };
    if (type === "video") base.video = { ...media };
    else base.image = { ...media };
    base.style = { ...base.style, fills: [{ type: "solid", color: "#D1D5DB" }] };
  }

  if (type === "group" || type === "component" || type === "instance") {
    base.style = { ...base.style, fills: [] };
  }

  if (type === "table") {
    base.frame = { x: 0, y: 0, w: 400, h: 200, rotation: 0 };
    base.style = {
      ...base.style,
      fills: [{ type: "solid", color: "#FFFFFF" }],
      strokes: [{ color: "#E5E7EB", width: 1, align: "inside" }],
    };
    base.table = { columns: 3, headerRow: true };
  }

  if (type === "hotspot") {
    base.frame = { x: 0, y: 0, w: 100, h: 44, rotation: 0 };
    base.style = { ...base.style, fills: [], strokes: [] };
  }

  return { ...base, ...overrides };
}

/** 초기 문서용 고정 ID (SSR/클라이언트 hydration 일치) */
const INITIAL_PAGE_ID = "page_0";

export function createDoc(): Doc {
  const root = "root";
  const pageId = INITIAL_PAGE_ID;
  const pageNode = createNode("frame", {
    id: pageId,
    name: "페이지 1",
    parentId: root,
  });

  return {
    schema: "null_advanced_v1",
    version: 1,
    root,
    pages: [{ id: pageId, name: "페이지 1", rootId: pageId }],
    nodes: {
      [root]: {
        id: root,
        type: "group",
        name: "루트",
        parentId: null,
        children: [pageId],
        frame: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
        style: { ...DEFAULT_STYLE, fills: [] },
        layout: { mode: "fixed" },
        constraints: {},
        locked: true,
        hidden: true,
      },
      [pageId]: pageNode,
    },
    selection: new Set(),
    view: { zoom: 1, panX: -200, panY: -200 },
    styles: [],
    variables: [],
    globalState: [],
    variableModes: ["기본"],
    variableMode: "기본",
    components: {},
    componentVersions: {},
    branches: {},
    branchReviews: [],
    imports: {},
    prototype: { startPageId: pageId },
  };
}

export function addNode(doc: Doc, node: Node, parentId: string) {
  doc.nodes[node.id] = node;
  node.parentId = parentId;
  const parent = doc.nodes[parentId];
  if (parent) parent.children = [...parent.children, node.id];
}

export function cloneDoc(doc: Doc): Doc {
  return {
    ...doc,
    pages: doc.pages.map((p) => ({ ...p })),
    nodes: Object.fromEntries(
      Object.entries(doc.nodes).map(([id, node]) => [
        id,
        {
          ...node,
          children: [...node.children],
          frame: { ...node.frame },
          style: {
            ...node.style,
            fills: [...node.style.fills],
            strokes: [...node.style.strokes],
            effects: [...node.style.effects],
            radius: typeof node.style.radius === "object" && node.style.radius ? { ...node.style.radius } : node.style.radius,
          },
          text: node.text
            ? {
                value: node.text.value,
                style: { ...node.text.style },
                styleRef: node.text.styleRef,
                wrap: node.text.wrap,
                autoSize: node.text.autoSize,
                ranges: cloneTextRanges(node.text.ranges),
                textPath: cloneTextPath(node.text.textPath),
                valueRef: node.text.valueRef,
                styleBindings: node.text.styleBindings ? { ...node.text.styleBindings } : undefined,
              }
            : undefined,
          image: node.image ? { ...node.image } : undefined,
          video: node.video ? { ...node.video } : undefined,
          shape: node.shape
            ? {
                ...node.shape,
                segments: node.shape.segments?.map((seg) => ({ d: seg.d, fills: cloneFills(seg.fills) ?? [] })),
                booleanMeta: node.shape.booleanMeta
                  ? {
                      ...node.shape.booleanMeta,
                      operands: node.shape.booleanMeta.operands?.map((operand) => ({
                        ...operand,
                        frame: operand.frame ? { ...operand.frame } : undefined,
                        fills: cloneFills(operand.fills),
                        vectorNetwork: operand.vectorNetwork
                          ? {
                              vertices: operand.vectorNetwork.vertices.map((vertex) => ({ ...vertex })),
                              segments: operand.vectorNetwork.segments.map((segment) => ({ ...segment })),
                              paths: operand.vectorNetwork.paths.map((path) => ({
                                ...path,
                                vertexIds: [...path.vertexIds],
                                fills: cloneFills(path.fills),
                              })),
                            }
                          : undefined,
                      })),
                    }
                  : undefined,
                vectorNetwork: node.shape.vectorNetwork
                  ? {
                      vertices: node.shape.vectorNetwork.vertices.map((vertex) => ({ ...vertex })),
                      segments: node.shape.vectorNetwork.segments.map((segment) => ({ ...segment })),
                      paths: node.shape.vectorNetwork.paths.map((path) => ({
                        ...path,
                        vertexIds: [...path.vertexIds],
                        fills: cloneFills(path.fills),
                      })),
                    }
                  : undefined,
              }
            : undefined,
          layout: node.layout
            ? "mode" in node.layout
              ? {
                  ...node.layout,
                  padding: "padding" in node.layout ? { ...node.layout.padding } : undefined,
                  columnsSizing: "columnsSizing" in node.layout && node.layout.columnsSizing
                    ? node.layout.columnsSizing.map((track) => ({ ...track }))
                    : undefined,
                  rowsSizing: "rowsSizing" in node.layout && node.layout.rowsSizing
                    ? node.layout.rowsSizing.map((track) => ({ ...track }))
                    : undefined,
                }
              : node.layout
            : undefined,
          layoutGrid: node.layoutGrid?.map((grid) => ({ ...grid })),
          layoutSizing: node.layoutSizing ? { ...node.layoutSizing } : undefined,
          layoutPositioning: node.layoutPositioning,
          gridChild: node.gridChild ? { ...node.gridChild } : undefined,
          constraints: node.constraints ? { ...node.constraints } : undefined,
          data: node.data ? { ...node.data } : undefined,
          table: node.table ? { ...node.table } : undefined,
          variants: node.variants?.map((variant) => ({
            ...variant,
            props: variant.props ? { ...variant.props } : undefined,
          })),
          propertyDefinitions: node.propertyDefinitions
            ? Object.fromEntries(Object.entries(node.propertyDefinitions).map(([key, value]) => [key, { ...value }]))
            : undefined,
          overrides: node.overrides
            ? {
                ...node.overrides,
                frame: node.overrides.frame ? { ...node.overrides.frame } : undefined,
                style: node.overrides.style
                  ? {
                      ...node.overrides.style,
                      fills: [...node.overrides.style.fills],
                      strokes: [...node.overrides.style.strokes],
                      effects: [...node.overrides.style.effects],
                      radius:
                        typeof node.overrides.style.radius === "object" && node.overrides.style.radius
                          ? { ...node.overrides.style.radius }
                          : node.overrides.style.radius,
                    }
                  : undefined,
                text: node.overrides.text
                  ? {
                      value: node.overrides.text.value,
                      style: { ...node.overrides.text.style },
                      styleRef: node.overrides.text.styleRef,
                      wrap: node.overrides.text.wrap,
                      autoSize: node.overrides.text.autoSize,
                      ranges: cloneTextRanges(node.overrides.text.ranges),
                      textPath: cloneTextPath(node.overrides.text.textPath),
                      valueRef: node.overrides.text.valueRef,
                      styleBindings: node.overrides.text.styleBindings ? { ...node.overrides.text.styleBindings } : undefined,
                    }
                  : undefined,
                image: node.overrides.image ? { ...node.overrides.image } : undefined,
                video: node.overrides.video ? { ...node.overrides.video } : undefined,
                instanceOf: node.overrides.instanceOf,
                instanceLibraryId: node.overrides.instanceLibraryId,
                variantId: node.overrides.variantId,
                shape: node.overrides.shape
                  ? {
                      ...node.overrides.shape,
                      segments: node.overrides.shape.segments?.map((seg) => ({ d: seg.d, fills: cloneFills(seg.fills) ?? [] })),
                      booleanMeta: node.overrides.shape.booleanMeta
                        ? {
                            ...node.overrides.shape.booleanMeta,
                            operands: node.overrides.shape.booleanMeta.operands?.map((operand) => ({
                              ...operand,
                              frame: operand.frame ? { ...operand.frame } : undefined,
                              fills: cloneFills(operand.fills),
                              vectorNetwork: operand.vectorNetwork
                                ? {
                                    vertices: operand.vectorNetwork.vertices.map((vertex) => ({ ...vertex })),
                                    segments: operand.vectorNetwork.segments.map((segment) => ({ ...segment })),
                                    paths: operand.vectorNetwork.paths.map((path) => ({
                                      ...path,
                                      vertexIds: [...path.vertexIds],
                                      fills: cloneFills(path.fills),
                                    })),
                                  }
                                : undefined,
                            })),
                          }
                        : undefined,
                      vectorNetwork: node.overrides.shape.vectorNetwork
                        ? {
                            vertices: node.overrides.shape.vectorNetwork.vertices.map((vertex) => ({ ...vertex })),
                            segments: node.overrides.shape.vectorNetwork.segments.map((segment) => ({ ...segment })),
                            paths: node.overrides.shape.vectorNetwork.paths.map((path) => ({
                              ...path,
                              vertexIds: [...path.vertexIds],
                              fills: cloneFills(path.fills),
                            })),
                          }
                        : undefined,
                    }
                  : undefined,
                layout: node.overrides.layout
                  ? "mode" in node.overrides.layout
                    ? {
                        ...node.overrides.layout,
                        padding: "padding" in node.overrides.layout ? { ...node.overrides.layout.padding } : undefined,
                        columnsSizing: "columnsSizing" in node.overrides.layout && node.overrides.layout.columnsSizing
                          ? node.overrides.layout.columnsSizing.map((track) => ({ ...track }))
                          : undefined,
                        rowsSizing: "rowsSizing" in node.overrides.layout && node.overrides.layout.rowsSizing
                          ? node.overrides.layout.rowsSizing.map((track) => ({ ...track }))
                          : undefined,
                      }
                    : node.overrides.layout
                  : undefined,
                layoutSizing: node.overrides.layoutSizing ? { ...node.overrides.layoutSizing } : undefined,
                layoutPositioning: node.overrides.layoutPositioning,
                gridChild: node.overrides.gridChild ? { ...node.overrides.gridChild } : undefined,
                constraints: node.overrides.constraints ? { ...node.overrides.constraints } : undefined,
                data: node.overrides.data ? { ...node.overrides.data } : undefined,
                slotContents: node.overrides.slotContents ? { ...node.overrides.slotContents } : undefined,
                dev: node.overrides.dev
                  ? {
                      ...node.overrides.dev,
                      annotations: node.overrides.dev.annotations?.map((annotation) => ({ ...annotation })),
                      codeLinks: node.overrides.dev.codeLinks?.map((link) => ({ ...link })),
                    }
                  : undefined,
                prototype: node.overrides.prototype
                  ? {
                      interactions: node.overrides.prototype.interactions.map((interaction) => ({
                        ...interaction,
                        action: (() => {
                          const a = interaction.action;
                          const t = "transition" in a && a.transition ? { ...a.transition } : undefined;
                          return { ...a, transition: t } as PrototypeAction;
                        })(),
                      })),
                    }
                  : undefined,
              }
            : undefined,
          dev: node.dev
            ? {
                ...node.dev,
                annotations: node.dev.annotations?.map((annotation) => ({ ...annotation })),
                codeLinks: node.dev.codeLinks?.map((link) => ({ ...link })),
              }
            : undefined,
          prototype: node.prototype
            ? {
                interactions: node.prototype.interactions.map((interaction) => ({
                  ...interaction,
                  action: (() => {
                    const a = interaction.action;
                    const t = "transition" in a && a.transition ? { ...a.transition } : undefined;
                    return { ...a, transition: t } as PrototypeAction;
                  })(),
                })),
              }
            : undefined,
        },
      ]),
    ) as Record<string, Node>,
    selection: new Set(doc.selection),
    view: { ...doc.view },
    styles: doc.styles.map((s) => ({ ...s })),
    variables: doc.variables.map((v) => ({
      ...v,
      modes: v.modes ? { ...v.modes } : undefined,
      modeAliases: v.modeAliases ? { ...v.modeAliases } : undefined,
    })),
    variableModes: doc.variableModes ? [...doc.variableModes] : undefined,
    variableMode: doc.variableMode,
    globalState: doc.globalState ? doc.globalState.map((item) => ({ ...item })) : undefined,
    components: { ...doc.components },
    componentVersions: doc.componentVersions ? JSON.parse(JSON.stringify(doc.componentVersions)) : undefined,
    branches: doc.branches ? JSON.parse(JSON.stringify(doc.branches)) : undefined,
    branchReviews: doc.branchReviews ? JSON.parse(JSON.stringify(doc.branchReviews)) : undefined,
    libraries: doc.libraries ? doc.libraries.map((l) => ({ ...l })) : undefined,
    imports: doc.imports ? JSON.parse(JSON.stringify(doc.imports)) : undefined,
    prototype: doc.prototype ? { ...doc.prototype } : undefined,
  };
}

export function serializeDoc(doc: Doc): SerializableDoc {
  return {
    ...doc,
    selection: [...doc.selection],
  };
}

export function hydrateDoc(raw: unknown): Doc {
  if (!raw || typeof raw !== "object") return createDoc();
  const r = raw as Partial<SerializableDoc>;
  if (r.schema !== "null_advanced_v1") return createDoc();

  const base = createDoc();
  const nodes = r.nodes && typeof r.nodes === "object" ? (r.nodes as Record<string, Node>) : base.nodes;

  return {
    ...base,
    ...r,
    nodes,
    pages: Array.isArray(r.pages) && r.pages.length ? (r.pages as DocPage[]) : base.pages,
    selection: new Set(Array.isArray(r.selection) ? r.selection : []),
    view: r.view && typeof r.view === "object" ? (r.view as Doc["view"]) : base.view,
    styles: Array.isArray(r.styles) ? (r.styles as StyleToken[]) : base.styles,
    variables: Array.isArray(r.variables) ? (r.variables as Variable[]) : base.variables,
    globalState: Array.isArray(r.globalState) ? (r.globalState as GlobalStateItem[]) : base.globalState,
    components: r.components && typeof r.components === "object" ? (r.components as Record<string, string>) : base.components,
    componentVersions: r.componentVersions && typeof r.componentVersions === "object" ? (r.componentVersions as Doc["componentVersions"]) : base.componentVersions,
    branches: r.branches && typeof r.branches === "object" ? (r.branches as Doc["branches"]) : base.branches,
    branchReviews: Array.isArray(r.branchReviews) ? (r.branchReviews as Doc["branchReviews"]) : base.branchReviews,
    libraries: Array.isArray(r.libraries) ? (r.libraries as Doc["libraries"]) : base.libraries,
    imports: r.imports && typeof r.imports === "object" ? (r.imports as Doc["imports"]) : base.imports,
    prototype: r.prototype && typeof r.prototype === "object" ? (r.prototype as DocPrototype) : base.prototype,
  };
}
