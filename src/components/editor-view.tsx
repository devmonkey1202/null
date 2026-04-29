// src/components/editor-view.tsx
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CanvasRender from "@/components/canvas-render";
import { ColorField, PropertyField, SelectField, TextAreaField, TextField } from "@/components/editor-fields";
import {
  DEFAULT_CANVAS,
  ELEMENT_DEFAULTS,
  GRID_SIZE,
  clamp,
  clampNodeToCanvas,
  genNodeId,
  snapToGrid,
  type BuilderAction,
  type CanvasDocument,
  type CanvasNode,
  type CanvasNodeType,
} from "@/lib/canvas";
import type { PlanFeatures } from "@/lib/plan";
import { runBooleanMultiple, type BooleanOp } from "@/advanced/geom/boolean";
import { pathDataToBounds, pathDataToPolygon } from "@/advanced/geom/pathData";

type HistoryState = {
  past: CanvasNode[][];
  present: CanvasNode[];
  future: CanvasNode[][];
};

type GuideLine =
  | { kind: "v"; x: number }
  | { kind: "h"; y: number };

type DragState =
  | {
      mode: "move";
      primaryId: string;
      ids: string[];
      startX: number;
      startY: number;
      origins: Record<string, { x: number; y: number; w: number; h: number }>;
      didBeginHistory: boolean;
    }
  | {
      mode: "resize";
      id: string;
      startX: number;
      startY: number;
      origin: { x: number; y: number; w: number; h: number };
      handle: "nw" | "ne" | "sw" | "se";
      didBeginHistory: boolean;
    };



type Scene = {
  id: string;
  name: string;
  width: number;
  height: number;
  nodes: CanvasNode[];
};

type ContentV2 = {
  schema: "canvas_v2";
  startSceneId: string;
  scenes: Scene[];
};

type StylePreset = {
  id: string;
  name: string;
  props: Record<string, unknown>;
};

type ColorToken = { id: string; name: string; value: string };
type NumberToken = { id: string; name: string; value: number };
type TextToken = { id: string; name: string; value: string };

type StyleTokens = {
  colors: ColorToken[];
  radii: NumberToken[];
  textSizes: NumberToken[];
  shadows: TextToken[];
  fonts: TextToken[];
};

type FillStop = { color: string; pos: number };

type LayoutSettings = {
  dir: "row" | "column";
  gap: number;
  align: "start" | "center" | "end" | "stretch";
  justify: "start" | "center" | "end" | "space-between";
  wrap: boolean;
  padding: { t: number; r: number; b: number; l: number };
  auto: boolean;
  wrapSize?: number;
};

type LayoutGroup = {
  id: string;
  name: string;
  nodeIds: string[];
  settings: LayoutSettings;
};

type ComponentVariant = {
  id: string;
  name: string;
  nodes: CanvasNode[];
  size: { w: number; h: number };
};

type ComponentDefinition = {
  id: string;
  name: string;
  nodes: CanvasNode[];
  size: { w: number; h: number };
  variants: ComponentVariant[];
};

const NODE_TYPE_LABELS: Record<CanvasNodeType, string> = {
  box: "박스",
  frame: "프레임",
  text: "텍스트",
  button: "버튼",
  image: "이미지",
  divider: "구분선",
  badge: "배지",
  link: "링크",
  shape_rect: "사각형",
  shape_ellipse: "원형",
  line: "선",
  path: "패스",
  input: "입력",
  textarea: "텍스트 영역",
  checkbox: "체크박스",
  select: "선택",
  slider: "슬라이더",
};

const TOOLBOX_GROUPS: Array<{ title: string; items: CanvasNodeType[] }> = [
  { title: "기본", items: ["box", "frame", "text", "button", "image", "divider", "badge", "link"] },
  { title: "도형", items: ["shape_rect", "shape_ellipse", "line", "path"] },
  { title: "폼", items: ["input", "textarea", "checkbox", "select", "slider"] },
];

const BORDER_STYLE_OPTIONS = [
  { value: "solid", label: "실선" },
  { value: "dashed", label: "점선" },
  { value: "dotted", label: "점점선" },
];

const BLEND_MODE_OPTIONS = [
  { value: "normal", label: "일반" },
  { value: "multiply", label: "곱하기" },
  { value: "screen", label: "스크린" },
  { value: "overlay", label: "오버레이" },
  { value: "darken", label: "어둡게" },
  { value: "lighten", label: "밝게" },
  { value: "color-dodge", label: "컬러 닷지" },
  { value: "color-burn", label: "컬러 번" },
  { value: "difference", label: "차이" },
  { value: "exclusion", label: "제외" },
];

const TEXT_TRANSFORM_OPTIONS = [
  { value: "none", label: "없음" },
  { value: "uppercase", label: "대문자" },
  { value: "lowercase", label: "소문자" },
  { value: "capitalize", label: "첫 글자 대문자" },
];

const FONT_STYLE_OPTIONS = [
  { value: "normal", label: "기본" },
  { value: "italic", label: "기울임" },
  { value: "oblique", label: "비스듬" },
];

const TEXT_ALIGN_OPTIONS = [
  { value: "left", label: "왼쪽" },
  { value: "center", label: "가운데" },
  { value: "right", label: "오른쪽" },
];

const LINE_CAP_OPTIONS = [
  { value: "round", label: "라운드" },
  { value: "butt", label: "기본" },
  { value: "square", label: "사각" },
];

const LINE_JOIN_OPTIONS = [
  { value: "round", label: "라운드" },
  { value: "bevel", label: "베벨" },
  { value: "miter", label: "마이터" },
];

function genSceneId(prefix = "scene") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
const MAX_HISTORY = 60;
const SNAP_THRESHOLD = 6;

// Normalize inspector props for runtime render fields.
function mapInspectorPropsForRender(nodeType: CanvasNodeType, patch: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...patch };
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown, fb = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fb);

  // NOTE: comment removed (encoding issue).
  if ("background" in patch) {
    const bg = str(patch["background"]);
    if (bg.trim()) out.fill = bg; // Map background to renderer fill.
  }

  // NOTE: comment removed (encoding issue).
  if ("borderColor" in patch) {
    const c = str(patch["borderColor"]);
    if (c.trim()) out.stroke = c;
  }
  if ("borderWidth" in patch) {
    out.strokeWidth = num(patch["borderWidth"], 0);
  }

  // Text shortcuts: map size/weight to fontSize/fontWeight.
  if (nodeType === "text") {
    const size = str(patch["size"] ?? "");
    if (size) {
      const fs = size === "sm" ? 14 : size === "md" ? 16 : size === "lg" ? 20 : undefined;
      if (fs) out.fontSize = fs;
    }
    const weight = str(patch["weight"] ?? "");
    if (weight) {
      const fw = weight === "light" ? 300 : weight === "medium" ? 500 : weight === "bold" ? 700 : undefined;
      if (fw) out.fontWeight = fw;
    }
  }

  // NOTE: comment removed (encoding issue).
  // NOTE: comment removed (encoding issue).
  if (nodeType === "badge") {
    if ("background" in patch) {
      const bg = str(patch["background"]);
      if (bg.trim()) out.fill = bg;
    }
  }

  return out;
}

function isEditableTarget(el: EventTarget | null) {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = (node.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (node.isContentEditable) return true;
  return false;
}

function rectOf(n: { x: number; y: number; w: number; h: number }) {
  const l = n.x;
  const t = n.y;
  const r = n.x + n.w;
  const b = n.y + n.h;
  const cx = l + n.w / 2;
  const cy = t + n.h / 2;
  return { l, t, r, b, cx, cy };
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function pickSmallestMissingPositive(nums: number[]) {
  const used = new Set<number>();
  for (const n of nums) if (Number.isFinite(n) && n > 0) used.add(n);
  let k = 1;
  while (used.has(k)) k++;
  return k;
}

function isValueEqual(a: unknown, b: unknown) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function formatOptionList(value: unknown) {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string").join(", ");
  if (typeof value === "string") return value;
  return "";
}

function parseOptionList(raw: string) {
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function formatPathPoints(value: unknown) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  const parts: string[] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const x = typeof item[0] === "number" ? item[0] : Number(item[0]);
    const y = typeof item[1] === "number" ? item[1] : Number(item[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    parts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return parts.join("; ");
}

function parsePathPointsToArray(points: unknown): Array<[number, number]> {
  if (Array.isArray(points)) {
    const mapped: Array<[number, number]> = [];
    for (const p of points) {
      if (!Array.isArray(p) || p.length < 2) continue;
      const xn = typeof p[0] === "number" ? p[0] : Number(p[0]);
      const yn = typeof p[1] === "number" ? p[1] : Number(p[1]);
      if (!Number.isFinite(xn) || !Number.isFinite(yn)) continue;
      mapped.push([xn, yn]);
    }
    return mapped;
  }
  if (typeof points === "string") {
    const entries = points.split(/[\n;]+/).map((v) => v.trim()).filter(Boolean);
    const mapped: Array<[number, number]> = [];
    for (const entry of entries) {
      const parts = entry.split(/[, ]+/).map((v) => v.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      let x = Number(parts[0]);
      let y = Number(parts[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (Math.abs(x) > 1 && Math.abs(x) <= 100) x = x / 100;
      if (Math.abs(y) > 1 && Math.abs(y) <= 100) y = y / 100;
      x = Math.min(1, Math.max(0, x));
      y = Math.min(1, Math.max(0, y));
      mapped.push([x, y]);
    }
    return mapped;
  }
  return [];
}

function resolveFontSize(props: Record<string, unknown>, fallback = 16) {
  const raw = props.fontSize;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  const preset = String(props.size ?? "");
  if (preset === "sm") return 14;
  if (preset === "md") return 16;
  if (preset === "lg") return 20;
  return fallback;
}

function resolveFontWeight(props: Record<string, unknown>, fallback = 500) {
  const raw = props.fontWeight;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  const preset = String(props.weight ?? "");
  if (preset === "light") return 300;
  if (preset === "medium") return 500;
  if (preset === "bold") return 700;
  return fallback;
}

function buildLinearGradient(angle: number, from: string, to: string) {
  const safeAngle = Number.isFinite(angle) ? angle : 135;
  return `linear-gradient(${safeAngle}deg, ${from} 0%, ${to} 100%)`;
}

function getFillControlState(node: CanvasNode, fillKey: "background" | "fill") {
  const props = node.props as Record<string, unknown>;
  const mode = String(props.fillMode ?? "solid");
  const fallback = String(props[fillKey] ?? "#FFFFFF");
  const from = String(props.fillFrom ?? fallback ?? "#FFFFFF");
  const to = String(props.fillTo ?? "#111111");
  const angle = Number(props.fillAngle ?? 135);
  const fillType = String(props.fillType ?? "linear");
  const centerX = Number(props.fillCenterX ?? 50);
  const centerY = Number(props.fillCenterY ?? 50);
  const stopsRaw = Array.isArray(props.fillStops) ? (props.fillStops as FillStop[]) : [];
  const stops =
    stopsRaw.length > 0
      ? stopsRaw.map((s) => ({ color: String(s.color ?? "#000000"), pos: Number(s.pos ?? 0) }))
      : [
          { color: from, pos: 0 },
          { color: to, pos: 100 },
        ];
  return { mode, from, to, angle, fillType, centerX, centerY, stops };
}

const STYLE_KEYS_COMMON = [
  "fill",
  "background",
  "color",
  "fillMode",
  "fillFrom",
  "fillTo",
  "fillAngle",
  "fillType",
  "fillStops",
  "fillCenterX",
  "fillCenterY",
  "border",
  "borderColor",
  "borderWidth",
  "borderStyle",
  "stroke",
  "strokeWidth",
  "strokeStyle",
  "radius",
  "shadow",
  "blur",
  "blendMode",
  "filterBrightness",
  "filterContrast",
  "filterSaturate",
  "filterHue",
  "filterGrayscale",
];

const STYLE_KEYS_TEXT = [
  "fontSize",
  "fontWeight",
  "fontFamily",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "fontStyle",
  "textAlign",
  "align",
];

const STYLE_KEYS_VECTOR = ["dash", "lineCap", "lineJoin", "closed", "fill", "stroke", "strokeWidth"];

const DEFAULT_STYLE_TOKENS: StyleTokens = {
  colors: [],
  radii: [],
  textSizes: [],
  shadows: [],
  fonts: [],
};

const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
  dir: "row",
  gap: 12,
  align: "start",
  justify: "start",
  wrap: false,
  padding: { t: 16, r: 16, b: 16, l: 16 },
  auto: true,
  wrapSize: undefined,
};

function getStyleKeysForType(nodeType: CanvasNodeType): Set<string> {
  switch (nodeType) {
    case "text":
      return new Set([...STYLE_KEYS_TEXT, "color", "blendMode", "shadow", "blur"]);
    case "button":
    case "link":
    case "badge":
      return new Set([...STYLE_KEYS_COMMON, ...STYLE_KEYS_TEXT]);
    case "input":
    case "textarea":
    case "select":
    case "checkbox":
    case "slider":
      return new Set([...STYLE_KEYS_COMMON, ...STYLE_KEYS_TEXT]);
    case "box":
    case "frame":
    case "shape_rect":
    case "shape_ellipse":
      return new Set([...STYLE_KEYS_COMMON]);
    case "image":
      return new Set(["borderColor", "borderWidth", "borderStyle", "radius", "shadow", "blur", "blendMode"]);
    case "line":
      return new Set(["stroke", "strokeWidth", "dash", "lineCap", "shadow", "blur", "blendMode"]);
    case "path":
      return new Set([...STYLE_KEYS_VECTOR, "shadow", "blur", "blendMode"]);
    case "divider":
      return new Set(["color", "thickness", "shadow", "blur", "blendMode"]);
    default:
      return new Set([...STYLE_KEYS_COMMON]);
  }
}

function extractStyleProps(node: CanvasNode) {
  const props = node.props ?? {};
  const keys = getStyleKeysForType(node.type);
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in props) out[key] = props[key];
  }
  return out;
}

function normalizeStylePatchForNode(nodeType: CanvasNodeType, patch: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...patch };
  if ((nodeType === "box" || nodeType === "frame" || nodeType === "link") && "fill" in out && !("background" in out)) {
    out.background = out.fill;
  }
  if ((nodeType === "shape_rect" || nodeType === "shape_ellipse" || nodeType === "path") && "background" in out && !("fill" in out)) {
    out.fill = out.background;
  }
  if (nodeType === "text" && "textAlign" in out && !("align" in out)) {
    out.align = out.textAlign;
  }
  return out;
}

export default function EditorView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPageId = searchParams.get("pageId");
  const initialSceneId = searchParams.get("s");

  const [pageId, setPageId] = useState<string | null>(initialPageId);
  const [title, setTitle] = useState<string>("");

  // NOTE: comment removed (encoding issue).
  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          const next = encodeURIComponent("/editor" + (typeof window !== "undefined" && window.location.search ? window.location.search : ""));
          window.location.href = `/login?next=${next}`;
        }
      })
      .catch(() => null);
  }, []);

  const draftKey = useMemo(() => `NULL_EDITOR_DRAFT:${pageId ?? "new"}`, [pageId]);

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [startSceneId, setStartSceneId] = useState<string | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(initialSceneId);

  useEffect(() => {
    if (pageId) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (typeof d?.title === "string") setTitle(d.title);
      if (Array.isArray(d?.scenes)) setScenes(d.scenes);
      if (typeof d?.startSceneId === "string") setStartSceneId(d.startSceneId);
      if (typeof d?.activeSceneId === "string") setActiveSceneId(d.activeSceneId);
      if (Array.isArray(d?.stylePresets)) setStylePresets(d.stylePresets);
      if (d?.styleTokens && typeof d.styleTokens === "object") {
        setStyleTokens({
          colors: Array.isArray(d.styleTokens.colors) ? d.styleTokens.colors : [],
          radii: Array.isArray(d.styleTokens.radii) ? d.styleTokens.radii : [],
          textSizes: Array.isArray(d.styleTokens.textSizes) ? d.styleTokens.textSizes : [],
          shadows: Array.isArray(d.styleTokens.shadows) ? d.styleTokens.shadows : [],
          fonts: Array.isArray(d.styleTokens.fonts) ? d.styleTokens.fonts : [],
        });
      }
      if (Array.isArray(d?.components)) {
        setComponents(d.components);
      }
      if (Array.isArray(d?.layoutGroups)) {
        setLayoutGroups(d.layoutGroups);
      }

      const v2: ContentV2 = {
        schema: "canvas_v2",
        startSceneId: typeof d?.startSceneId === "string" ? d.startSceneId : "",
        scenes: Array.isArray(d?.scenes) ? d.scenes : [],
      };
      const scene = getActiveScene(v2, typeof d?.activeSceneId === "string" ? d.activeSceneId : null);
      if (scene) {
        setDocMeta({ width: scene.width, height: scene.height, nodes: scene.nodes });
        setHistory({ past: [], present: scene.nodes, future: [] });
      }
      setMessage("임시 저장본을 불러왔습니다.");
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);


  // multi-select
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsRef = useRef<string[]>([]);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  const [gridSnap, setGridSnap] = useState(true);
  const gridSnapRef = useRef(true);
  useEffect(() => {
    gridSnapRef.current = gridSnap;
  }, [gridSnap]);


  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: [...DEFAULT_CANVAS.nodes],
    future: [],
  });

  const nodesRef = useRef<CanvasNode[]>(history.present);
  useEffect(() => {
    nodesRef.current = history.present;
  }, [history.present]);

  const [docMeta, setDocMeta] = useState<CanvasDocument>({
    width: DEFAULT_CANVAS.width,
    height: DEFAULT_CANVAS.height,
    nodes: [],
  });

  const docMetaRef = useRef({ width: docMeta.width, height: docMeta.height });
  useEffect(() => {
    docMetaRef.current = { width: docMeta.width, height: docMeta.height };
  }, [docMeta.width, docMeta.height]);

  const [features, setFeatures] = useState<PlanFeatures>({
    maxLivePages: 1,
    maxButtons: 3,
    maxTexts: 6,
    maxImages: 1,
    maxElements: 20,
    replayEnabled: false,
    detailedReports: false,
    maxHistoryItems: 10,
  });

  const [status, setStatus] = useState<"idle" | "saving" | "publishing">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  /** NOTE: comment removed (encoding issue). */
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [stylePresets, setStylePresets] = useState<StylePreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const styleClipboardRef = useRef<Record<string, unknown> | null>(null);
  const [styleTokens, setStyleTokens] = useState<StyleTokens>(DEFAULT_STYLE_TOKENS);
  const [colorTokenDraft, setColorTokenDraft] = useState({ name: "", value: "#111111" });
  const [radiusTokenDraft, setRadiusTokenDraft] = useState({ name: "", value: 12 });
  const [textSizeTokenDraft, setTextSizeTokenDraft] = useState({ name: "", value: 14 });
  const [shadowTokenDraft, setShadowTokenDraft] = useState({ name: "", value: "0 12px 30px rgba(0,0,0,0.15)" });
  const [fontTokenDraft, setFontTokenDraft] = useState({ name: "", value: "" });
  const [components, setComponents] = useState<ComponentDefinition[]>([]);
  const [componentNameDraft, setComponentNameDraft] = useState("");
  const [variantNameDraft, setVariantNameDraft] = useState("");
  const [layoutGroups, setLayoutGroups] = useState<LayoutGroup[]>([]);
  const [layoutGroupNameDraft, setLayoutGroupNameDraft] = useState("");
  const [pathOffsetDraft, setPathOffsetDraft] = useState(8);
  const [pathSmoothDraft, setPathSmoothDraft] = useState(1);
  const [pathSimplifyDraft, setPathSimplifyDraft] = useState(0.02);
  const layoutGroupsRef = useRef<LayoutGroup[]>([]);
  useEffect(() => {
    layoutGroupsRef.current = layoutGroups;
  }, [layoutGroups]);

  // NOTE: comment removed (encoding issue).
  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.features && typeof data.features === "object") {
          setFeatures((prev) => ({ ...prev, ...data.features }));
        }
      })
      .catch(() => {});
  }, []);

  const [guides, setGuides] = useState<GuideLine[]>([]);
  const guidesRef = useRef<GuideLine[]>([]);
  useEffect(() => {
    guidesRef.current = guides;
  }, [guides]);

  /** NOTE: comment removed (encoding issue). */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceKeyRef.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceKeyRef.current = false;
        panStartRef.current = null;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const dragRef = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  /** NOTE: comment removed (encoding issue). */
  const copyBufferRef = useRef<CanvasNode[] | null>(null);
  /** NOTE: comment removed (encoding issue). */
  const [boxSelect, setBoxSelect] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  /** NOTE: comment removed (encoding issue). */
  const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;
  const [zoom, setZoom] = useState<(typeof ZOOM_STEPS)[number]>(1);
  /** NOTE: comment removed (encoding issue). */
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStartRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(null);
  const spaceKeyRef = useRef(false);

  const nodes = history.present;

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCount = selectedIds.length;

  // NOTE: comment removed (encoding issue).
  const constraintCounts = useMemo(() => {
    const buttonCount = nodes.filter((n) => n.type === "button").length;
    const textCount = nodes.filter((n) => n.type === "text").length;
    const imageCount = nodes.filter((n) => n.type === "image").length;
    const totalElements = nodes.length;
    return { buttonCount, textCount, imageCount, totalElements };
  }, [nodes]);

  const selectedNode = useMemo(() => {
    if (selectedCount !== 1) return null;
    const id = selectedIds[0];
    return nodes.find((n) => n.id === id) ?? null;
  }, [nodes, selectedCount, selectedIds]);

  const selectedNodes = useMemo(() => selectedIds.map((id) => nodes.find((n) => n.id === id)).filter(Boolean) as CanvasNode[], [
    nodes,
    selectedIds,
  ]);
  const multiPathSelection = useMemo(
    () => selectedNodes.length > 1 && selectedNodes.every((n) => n.type === "path"),
    [selectedNodes],
  );
  const multiBooleanSelection = useMemo(
    () =>
      selectedNodes.length > 1 &&
      selectedNodes.every((n) => n.type === "path" || n.type === "shape_rect" || n.type === "shape_ellipse"),
    [selectedNodes],
  );
  const convertibleSelection = useMemo(
    () => selectedNodes.some((n) => n.type === "shape_rect" || n.type === "shape_ellipse" || n.type === "line"),
    [selectedNodes],
  );
  const selectionComponentId = useMemo(() => {
    if (selectedNodes.length === 0) return null;
    const id = selectedNodes[0].componentId;
    if (!id) return null;
    return selectedNodes.every((n) => n.componentId === id) ? id : null;
  }, [selectedNodes]);
  const selectionInstanceId = useMemo(() => {
    if (selectedNodes.length === 0) return null;
    const id = selectedNodes[0].componentInstanceId;
    if (!id) return null;
    return selectedNodes.every((n) => n.componentInstanceId === id) ? id : null;
  }, [selectedNodes]);
  const selectionVariantId = useMemo(() => {
    if (selectedNodes.length === 0) return null;
    const id = selectedNodes[0].componentVariantId;
    if (!id) return null;
    return selectedNodes.every((n) => n.componentVariantId === id) ? id : null;
  }, [selectedNodes]);
  const activeComponent = selectionComponentId ? components.find((c) => c.id === selectionComponentId) ?? null : null;
  const instanceOverrideSummary = useMemo(() => {
    if (!selectionInstanceId || !selectionComponentId || !activeComponent) return [];
    const defNodes = getComponentDefinitionNodes(selectionComponentId, selectionVariantId);
    if (defNodes.length === 0) return [];
    const defMap = new Map(defNodes.map((n) => [n.id, n]));
    const summary: Array<{ nodeId: string; label: string; keys: string[] }> = [];
    const instanceNodes = nodes.filter(
      (n) => n.componentId === selectionComponentId && n.componentInstanceId === selectionInstanceId,
    );
    for (const node of instanceNodes) {
      const sourceId = node.componentNodeId ?? node.id;
      const defNode = defMap.get(sourceId);
      if (!defNode) continue;
      const baseProps = defNode.props ?? {};
      const currentProps = node.props ?? {};
      const keys = Object.keys(currentProps).filter(
        (key) => !isValueEqual(currentProps[key], (baseProps as Record<string, unknown>)[key]),
      );
      if (keys.length === 0) continue;
      const label = String((node.props as Record<string, unknown>)?.layerName ?? NODE_TYPE_LABELS[node.type] ?? node.type);
      summary.push({ nodeId: node.id, label, keys });
    }
    return summary;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionInstanceId, selectionComponentId, selectionVariantId, activeComponent, nodes]);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  function beginGestureHistoryOnce() {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.didBeginHistory) return;
    drag.didBeginHistory = true;
    setHistory((prev) => {
      const past = [...prev.past, prev.present].slice(-MAX_HISTORY);
      return { past, present: prev.present, future: [] };
    });
  }

  function setPresent(nodesNext: CanvasNode[], commit = true) {
    const withLayout = commit ? applyAutoLayoutGroups(nodesNext) : nodesNext;
    setHistory((prev) => {
      const past = commit ? [...prev.past, prev.present].slice(-MAX_HISTORY) : prev.past;
      const future = commit ? [] : prev.future;
      return { past, present: withLayout, future };
    });
  }

  function undo() {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      const past = prev.past.slice(0, -1);
      const future = [prev.present, ...prev.future];
      return { past, present: previous, future };
    });
    setMessage(null);
  }

  function redo() {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      const future = prev.future.slice(1);
      const past = [...prev.past, prev.present].slice(-MAX_HISTORY);
      return { past, present: next, future };
    });
    setMessage(null);
  }

  useEffect(() => {
    if (!pageId) return;
    fetch(`/api/pages/${pageId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.version?.content_json) return;
        const content = data.version.content_json;
        setTitle(typeof data?.page?.title === "string" ? data.page.title : "");
        if (Array.isArray(content?.stylePresets)) {
          setStylePresets(content.stylePresets);
        }
        if (content?.styleTokens && typeof content.styleTokens === "object") {
          setStyleTokens({
            colors: Array.isArray(content.styleTokens.colors) ? content.styleTokens.colors : [],
            radii: Array.isArray(content.styleTokens.radii) ? content.styleTokens.radii : [],
            textSizes: Array.isArray(content.styleTokens.textSizes) ? content.styleTokens.textSizes : [],
            shadows: Array.isArray(content.styleTokens.shadows) ? content.styleTokens.shadows : [],
            fonts: Array.isArray(content.styleTokens.fonts) ? content.styleTokens.fonts : [],
          });
        }
        if (Array.isArray(content?.components)) {
          setComponents(content.components);
        }
        if (Array.isArray(content?.layoutGroups)) {
          setLayoutGroups(content.layoutGroups);
        }

        const v2 = normalizeToV2(content);
        setScenes(v2.scenes);
        setStartSceneId(v2.startSceneId);

        const initial = initialSceneId || v2.startSceneId;
        setActiveSceneId(initial);

        const scene = getActiveScene(v2, initial);
        setDocMeta({ width: scene.width, height: scene.height, nodes: scene.nodes });
        setHistory({ past: [], present: scene.nodes, future: [] });
        setSelectedIds([]);
      })
      .catch(() => null);
  }, [initialSceneId, pageId]);

  useEffect(() => {
    setDocMeta((prev) => ({ ...prev, nodes }));

    // NOTE: comment removed (encoding issue).
    if (activeSceneId) {
      setScenes((prev) => prev.map((s) => (s.id === activeSceneId ? { ...s, nodes } : s)));
    }
  }, [nodes, activeSceneId]);

  // NOTE: comment removed (encoding issue).
  useEffect(() => {
    try {
      const payload = {
        title,
        scenes,
        startSceneId,
        activeSceneId,
        stylePresets,
        styleTokens,
        components,
        layoutGroups,
        docMeta: { width: docMetaRef.current.width, height: docMetaRef.current.height },
        ts: Date.now(),
      };
      localStorage.setItem(draftKey, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [draftKey, title, scenes, startSceneId, activeSceneId, stylePresets, styleTokens, components, layoutGroups]);

  function addNode(type: CanvasNodeType) {
    const base = ELEMENT_DEFAULTS[type];
    const id = genNodeId("node");
    const { width, height } = docMetaRef.current;

    const x0 = width / 2 - base.w / 2;
    const y0 = height / 2 - base.h / 2;

    const nextNode: CanvasNode = clampNodeToCanvas(
      {
        id,
        ...base,
        x: gridSnapRef.current ? snapToGrid(x0, GRID_SIZE) : x0,
        y: gridSnapRef.current ? snapToGrid(y0, GRID_SIZE) : y0,
      },
      { width, height },
    );

    const nextNodes = [...nodesRef.current, nextNode];
    setPresent(nextNodes, true);
    setSelectedIds([id]);
    setMessage(null);
  }


  function switchScene(sceneId: string) {
    if (!sceneId) return;
    const target = scenes.find((s) => s.id === sceneId);
    if (!target) return;

    setActiveSceneId(sceneId);
    // NOTE: comment removed (encoding issue).
    const id = pageId;
    if (id) router.replace(`/editor?pageId=${id}&s=${encodeURIComponent(sceneId)}`);
    else router.replace(`/editor?s=${encodeURIComponent(sceneId)}`);

    setDocMeta({ width: target.width, height: target.height, nodes: target.nodes });
    setHistory({ past: [], present: target.nodes, future: [] });
    setSelectedIds([]);
    setMessage(null);
  }

  function addScene() {
    const id = genSceneId();
    const baseW = docMetaRef.current.width;
    const baseH = docMetaRef.current.height;
    const name = `씬 ${scenes.length + 1}`;

    const next: Scene = { id, name, width: baseW, height: baseH, nodes: [] };
    const nextScenes = [...scenes, next];
    setScenes(nextScenes);

    if (!startSceneId) setStartSceneId(id);
    switchScene(id);
  }

  function duplicateScene(sceneId: string) {
    const s = scenes.find((x) => x.id === sceneId);
    if (!s) return;
    const id = genSceneId();
    const name = `${s.name} 복제`;
    const nodes = s.nodes.map((n) => ({ ...n, id: genNodeId("node"), props: { ...(n.props ?? {}) } }));
    const next: Scene = { id, name, width: s.width, height: s.height, nodes };
    const nextScenes = [...scenes, next];
    setScenes(nextScenes);
    switchScene(id);
  }

  function renameScene(sceneId: string, name: string) {
    // NOTE: comment removed (encoding issue).
    const raw = name.slice(0, 40);
    setScenes((prev) => prev.map((s) => (s.id === sceneId ? { ...s, name: raw } : s)));

    if (raw.trim().length === 0) setMessage("씬 이름은 비워둘 수 없습니다.");
    else setMessage(null);
  }

  function deleteSelected() {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setLayoutGroups((prev) =>
      prev
        .map((g) => ({ ...g, nodeIds: g.nodeIds.filter((id) => !idSet.has(id)) }))
        .filter((g) => g.nodeIds.length > 0),
    );
    const next = nodesRef.current.filter((n) => !ids.includes(n.id));
    setPresent(next, true);
    setSelectedIds([]);
    setMessage(null);
  }

  function duplicateSelected() {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;

    const nowNodes = nodesRef.current;
    const idSet = new Set(ids);
    const instanceMap = new Map<string, string>();
    const getInstanceId = (oldId: string | undefined) => {
      const key = oldId ?? "instance";
      if (!instanceMap.has(key)) instanceMap.set(key, genNodeId("instance"));
      return instanceMap.get(key)!;
    };

    // preserve stacking: clone in the same order as current array
    const clones: CanvasNode[] = [];
    for (const n of nowNodes) {
      if (!idSet.has(n.id)) continue;
      const id = genNodeId("node");
      const { width, height } = docMetaRef.current;

      const dx = gridSnapRef.current ? GRID_SIZE : 8;
      const dy = gridSnapRef.current ? GRID_SIZE : 8;

      const nextInstanceId = n.componentId ? getInstanceId(n.componentInstanceId) : n.componentInstanceId;
      const cloned: CanvasNode = clampNodeToCanvas(
        {
          ...n,
          id,
          x: n.x + dx,
          y: n.y + dy,
          props: { ...(n.props ?? {}) },
          componentInstanceId: nextInstanceId,
        },
        { width, height },
      );
      clones.push(cloned);
    }

    const next = [...nowNodes, ...clones];
    setPresent(next, true);
    setSelectedIds(clones.map((c) => c.id));
    setMessage("복제되었습니다.");
  }

  function remapComponentInstances(nodes: CanvasNode[]) {
    const map = new Map<string, string>();
    return nodes.map((n) => {
      if (!n.componentId) return n;
      const key = n.componentInstanceId ?? n.id;
      if (!map.has(key)) map.set(key, genNodeId("instance"));
      return { ...n, componentInstanceId: map.get(key)! };
    });
  }

  function nudgeSelected(dx: number, dy: number) {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;

    const { width, height } = docMetaRef.current;
    const idSet = new Set(ids);

    const next = nodesRef.current.map((n) => {
      if (!idSet.has(n.id)) return n;
      const x = n.x + dx;
      const y = n.y + dy;
      return clampNodeToCanvas({ ...n, x, y }, { width, height });
    });

    setPresent(next, true);
  }

  function bringToFront() {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const base = nodesRef.current.filter((n) => !idSet.has(n.id));
    const top = nodesRef.current.filter((n) => idSet.has(n.id));
    setPresent([...base, ...top], true);
  }

  function sendToBack() {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const bottom = nodesRef.current.filter((n) => idSet.has(n.id));
    const rest = nodesRef.current.filter((n) => !idSet.has(n.id));
    setPresent([...bottom, ...rest], true);
  }

  function bringForward() {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const idSet = new Set(ids);

    const arr = [...nodesRef.current];
    for (let i = arr.length - 2; i >= 0; i--) {
      if (idSet.has(arr[i].id) && !idSet.has(arr[i + 1].id)) {
        const tmp = arr[i];
        arr[i] = arr[i + 1];
        arr[i + 1] = tmp;
      }
    }
    setPresent(arr, true);
  }

  function sendBackward() {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const idSet = new Set(ids);

    const arr = [...nodesRef.current];
    for (let i = 1; i < arr.length; i++) {
      if (idSet.has(arr[i].id) && !idSet.has(arr[i - 1].id)) {
        const tmp = arr[i];
        arr[i] = arr[i - 1];
        arr[i - 1] = tmp;
      }
    }
    setPresent(arr, true);
  }

  /** NOTE: comment removed (encoding issue). */
  function alignSelected(horizontal: "left" | "center" | "right" | null, vertical: "top" | "middle" | "bottom" | null) {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const nodes = nodesRef.current;
    const selected = nodes.filter((n) => ids.includes(n.id));
    const minX = Math.min(...selected.map((n) => n.x));
    const maxX = Math.max(...selected.map((n) => n.x + n.w));
    const minY = Math.min(...selected.map((n) => n.y));
    const maxY = Math.max(...selected.map((n) => n.y + n.h));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const nextNodes = nodes.map((node) => {
      if (!ids.includes(node.id)) return node;
      let x = node.x;
      let y = node.y;
      if (horizontal === "left") x = minX;
      else if (horizontal === "center") x = centerX - node.w / 2;
      else if (horizontal === "right") x = maxX - node.w;
      if (vertical === "top") y = minY;
      else if (vertical === "middle") y = centerY - node.h / 2;
      else if (vertical === "bottom") y = maxY - node.h;
      return { ...node, x, y };
    });
    setPresent(nextNodes, true);
  }

  function alignToCanvas(horizontal: "left" | "center" | "right" | null, vertical: "top" | "middle" | "bottom" | null) {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const { width, height } = docMetaRef.current;
    const nextNodes = nodesRef.current.map((node) => {
      if (!idSet.has(node.id)) return node;
      let x = node.x;
      let y = node.y;
      if (horizontal === "left") x = 0;
      else if (horizontal === "center") x = width / 2 - node.w / 2;
      else if (horizontal === "right") x = width - node.w;
      if (vertical === "top") y = 0;
      else if (vertical === "middle") y = height / 2 - node.h / 2;
      else if (vertical === "bottom") y = height - node.h;
      return clampNodeToCanvas({ ...node, x, y }, { width, height });
    });
    setPresent(nextNodes, true);
  }

  /** NOTE: comment removed (encoding issue). */
  function distributeSelected(direction: "horizontal" | "vertical") {
    const ids = selectedIdsRef.current;
    if (ids.length < 2) return;
    const nodes = nodesRef.current;
    const selected = nodes.filter((n) => ids.includes(n.id));
    const idSet = new Set(ids);

    if (direction === "horizontal") {
      const sorted = [...selected].sort((a, b) => a.x - b.x);
      const minX = sorted[0].x;
      const maxX = Math.max(...sorted.map((n) => n.x + n.w));
      const totalW = sorted.reduce((s, n) => s + n.w, 0);
      const gap = (maxX - minX - totalW) / (sorted.length - 1);
      let curX = minX;
      const updates = new Map<string, number>();
      for (const n of sorted) {
        updates.set(n.id, curX);
        curX += n.w + gap;
      }
      const nextNodes = nodes.map((node) => (idSet.has(node.id) && updates.has(node.id) ? { ...node, x: updates.get(node.id)! } : node));
      setPresent(nextNodes, true);
    } else {
      const sorted = [...selected].sort((a, b) => a.y - b.y);
      const minY = sorted[0].y;
      const maxY = Math.max(...sorted.map((n) => n.y + n.h));
      const totalH = sorted.reduce((s, n) => s + n.h, 0);
      const gap = (maxY - minY - totalH) / (sorted.length - 1);
      let curY = minY;
      const updates = new Map<string, number>();
      for (const n of sorted) {
        updates.set(n.id, curY);
        curY += n.h + gap;
      }
      const nextNodes = nodes.map((node) => (idSet.has(node.id) && updates.has(node.id) ? { ...node, y: updates.get(node.id)! } : node));
      setPresent(nextNodes, true);
    }
  }

  function matchSelectedSize(mode: "width" | "height" | "both") {
    const ids = selectedIdsRef.current;
    if (ids.length < 2) return;
    const primaryId = ids[0];
    const primary = nodesRef.current.find((n) => n.id === primaryId) ?? nodesRef.current.find((n) => ids.includes(n.id));
    if (!primary) return;
    const { width, height } = docMetaRef.current;
    const idSet = new Set(ids);
    const nextNodes = nodesRef.current.map((node) => {
      if (!idSet.has(node.id)) return node;
      if (node.id === primary.id) return node;
      const patch: Partial<CanvasNode> = {};
      if (mode === "width" || mode === "both") patch.w = primary.w;
      if (mode === "height" || mode === "both") patch.h = primary.h;
      return clampNodeToCanvas({ ...node, ...patch }, { width, height });
    });
    setPresent(nextNodes, true);
  }

  function rotateSelected(delta: number) {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const nextNodes = nodesRef.current.map((node) => {
      if (!idSet.has(node.id)) return node;
      const current = typeof node.rotation === "number" ? node.rotation : 0;
      const nextRotation = ((current + delta) % 360 + 360) % 360;
      return { ...node, rotation: nextRotation };
    });
    setPresent(nextNodes, true);
  }

  function applyConstraintsOnResize(nodes: CanvasNode[], prevW: number, prevH: number, nextW: number, nextH: number) {
    return nodes.map((node) => {
      const c = node.constraints;
      if (!c) return node;
      let x = node.x;
      let y = node.y;
      let w = node.w;
      let h = node.h;
      const left = node.x;
      const right = prevW - (node.x + node.w);
      const top = node.y;
      const bottom = prevH - (node.y + node.h);

      if (c.scaleX && prevW > 0) {
        const scaleX = nextW / prevW;
        x = node.x * scaleX;
        w = node.w * scaleX;
      } else if (c.pinLeft && c.pinRight) {
        x = left;
        w = Math.max(1, nextW - left - right);
      } else if (c.centerX) {
        const offset = node.x + node.w / 2 - prevW / 2;
        x = nextW / 2 - node.w / 2 + offset;
      } else if (c.pinRight) {
        x = nextW - right - node.w;
      }

      if (c.scaleY && prevH > 0) {
        const scaleY = nextH / prevH;
        y = node.y * scaleY;
        h = node.h * scaleY;
      } else if (c.pinTop && c.pinBottom) {
        y = top;
        h = Math.max(1, nextH - top - bottom);
      } else if (c.centerY) {
        const offset = node.y + node.h / 2 - prevH / 2;
        y = nextH / 2 - node.h / 2 + offset;
      } else if (c.pinBottom) {
        y = nextH - bottom - node.h;
      }

      return clampNodeToCanvas({ ...node, x, y, w, h }, { width: nextW, height: nextH });
    });
  }

  function resizeCanvas(nextW: number, nextH: number) {
    const prev = docMetaRef.current;
    const nextNodes = applyConstraintsOnResize(nodesRef.current, prev.width, prev.height, nextW, nextH);
    setPresent(nextNodes, true);
    setDocMeta({ width: nextW, height: nextH, nodes: nextNodes });
    if (activeSceneId) {
      setScenes((prevScenes) =>
        prevScenes.map((s) => (s.id === activeSceneId ? { ...s, width: nextW, height: nextH } : s)),
      );
    }
  }

  function updateConstraint(id: string, patch: Record<string, boolean>) {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    const next = { ...(node.constraints ?? {}), ...patch };
    updateNode(id, { constraints: next });
  }

  function toggleConstraintExclusive(
    id: string,
    key: "pinLeft" | "pinRight" | "centerX" | "scaleX" | "pinTop" | "pinBottom" | "centerY" | "scaleY",
    clear: Array<keyof NonNullable<CanvasNode["constraints"]>>,
  ) {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    const current = node.constraints ?? {};
    const nextValue = !current[key];
    const next: Record<string, boolean> = { ...current, [key]: nextValue };
    if (nextValue) {
      clear.forEach((k) => {
        if (k !== key) next[k] = false;
      });
    }
    updateNode(id, { constraints: next });
  }

  function updateNode(id: string, patch: Partial<CanvasNode>, commit = true) {
    const { width, height } = docMetaRef.current;
    const nextNodes = nodesRef.current.map((node) =>
      node.id === id ? clampNodeToCanvas({ ...node, ...patch }, { width, height }) : node,
    );
    setPresent(nextNodes, commit);
  }

  function updateNodeProps(id: string, patch: Record<string, unknown>, commit = true) {
    const nextNodes = nodesRef.current.map((node) => {
      if (node.id !== id) return node;
      const mapped = mapInspectorPropsForRender(node.type, patch);
      const nextProps = { ...(node.props ?? {}), ...mapped };
      const nextAction = resolveActionForNode(node.type, nextProps, node.action);
      return { ...node, props: nextProps, action: nextAction };
    });
    setPresent(nextNodes, commit);
  }

  function resolveActionForNode(
    nodeType: CanvasNodeType,
    props: Record<string, unknown>,
    currentAction: BuilderAction | undefined,
  ): BuilderAction | undefined {
    if (nodeType === "button") {
      const kind = String(props.actionKind ?? "none");
      if (kind === "url") {
        const href = String(props.href ?? "").trim();
        return href ? { type: "link", url: href } : { type: "none" };
      }
      if (kind === "scene") {
        const sid = String(props.sceneId ?? "").trim();
        return sid ? { type: "scene", sceneId: sid } : { type: "none" };
      }
      return { type: "none" };
    }
    if (nodeType === "link") {
      const href = String(props.href ?? "").trim();
      return href ? { type: "link", url: href } : { type: "none" };
    }
    return currentAction;
  }

  function replaceNodeProps(ids: Set<string>, nextPropsById: Map<string, Record<string, unknown>>) {
    const nextNodes = nodesRef.current.map((node) => {
      if (!ids.has(node.id)) return node;
      const nextPropsRaw = nextPropsById.get(node.id);
      if (!nextPropsRaw) return node;
      const mapped = mapInspectorPropsForRender(node.type, nextPropsRaw);
      const nextProps = { ...mapped };
      const nextAction = resolveActionForNode(node.type, nextProps, node.action);
      return { ...node, props: nextProps, action: nextAction };
    });
    setPresent(nextNodes, true);
  }

  function updateNodeBindKey(id: string, key: string) {
    const node = nodesRef.current.find((n) => n.id === id);
    const nextBind = { ...(node?.bind ?? {}), key: key.trim() ? key.trim() : undefined };
    updateNode(id, { bind: nextBind });
  }

  function updateFillState(
    nodeId: string,
    fillKey: "background" | "fill",
    next: {
      mode?: string;
      from?: string;
      to?: string;
      angle?: number;
      fillType?: string;
      centerX?: number;
      centerY?: number;
      stops?: FillStop[];
    },
  ) {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    const current = getFillControlState(node, fillKey);
    const mode = next.mode ?? current.mode;
    const from = next.from ?? current.from;
    const to = next.to ?? current.to;
    const angle = typeof next.angle === "number" ? next.angle : current.angle;
    const fillType = next.fillType ?? current.fillType;
    const centerX = typeof next.centerX === "number" ? next.centerX : current.centerX;
    const centerY = typeof next.centerY === "number" ? next.centerY : current.centerY;
    const stops = next.stops ?? current.stops;
    const normalizedStops =
      stops && stops.length
        ? stops.map((s) => ({ color: s.color, pos: Math.max(0, Math.min(100, Number(s.pos) || 0)) }))
        : [
            { color: from, pos: 0 },
            { color: to, pos: 100 },
          ];
    const patch: Record<string, unknown> = {
      fillMode: mode,
      fillFrom: normalizedStops[0]?.color ?? from,
      fillTo: normalizedStops[normalizedStops.length - 1]?.color ?? to,
      fillAngle: angle,
      fillType,
      fillCenterX: centerX,
      fillCenterY: centerY,
      fillStops: normalizedStops,
    };
    patch[fillKey] = mode === "gradient" ? buildLinearGradient(angle, from, to) : from;
    updateNodeProps(nodeId, patch);
  }

  function updatePathPoints(nodeId: string, points: Array<[number, number]>) {
    updateNodeProps(nodeId, { points });
  }

  function getPathAbsoluteRing(node: CanvasNode): number[][] {
    const pts = parsePathPointsToArray(node.props.points);
    if (pts.length < 3) return [];
    return pts.map(([x, y]) => [node.x + x * node.w, node.y + y * node.h]);
  }

  function getBooleanRingForNode(node: CanvasNode): number[][] | null {
    if (node.type === "path") {
      const ring = getPathAbsoluteRing(node);
      if (ring.length < 3) return null;
      const closed = Boolean(node.props.closed);
      if (!closed) ring.push([ring[0][0], ring[0][1]]);
      return ring;
    }
    if (node.type === "shape_rect") {
      return [
        [node.x, node.y],
        [node.x + node.w, node.y],
        [node.x + node.w, node.y + node.h],
        [node.x, node.y + node.h],
        [node.x, node.y],
      ];
    }
    if (node.type === "shape_ellipse") {
      const pts = makeEllipsePoints(32);
      const ring = pts.map(([x, y]) => [node.x + x * node.w, node.y + y * node.h] as [number, number]);
      ring.push([ring[0][0], ring[0][1]]);
      return ring;
    }
    return null;
  }

  function normalizeAbsolutePoints(points: number[][]) {
    if (points.length === 0) return { x: 0, y: 0, w: 1, h: 1, normalized: [] as Array<[number, number]> };
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const normalized = points.map(([x, y]) => [(x - minX) / w, (y - minY) / h] as [number, number]);
    return { x: minX, y: minY, w, h, normalized };
  }

  function runPathBoolean(op: BooleanOp) {
    const selected = selectedIdsRef.current;
    const targets = nodesRef.current.filter(
      (n) =>
        selected.includes(n.id) && (n.type === "path" || n.type === "shape_rect" || n.type === "shape_ellipse"),
    );
    if (targets.length < 2) {
      setMessage("불리언 연산은 2개 이상 선택해야 합니다.");
      return;
    }
    const rings = targets
      .map(getBooleanRingForNode)
      .filter((ring): ring is number[][] => ring !== null);
    if (rings.length < 2) {
      setMessage("선택된 도형의 점이 충분하지 않습니다.");
      return;
    }
    const d = runBooleanMultiple(rings, op);
    if (!d) {
      setMessage("불리언 연산에 실패했습니다.");
      return;
    }
    const ring = pathDataToPolygon(d);
    if (!ring || ring.length < 3) {
      setMessage("불리언 결과가 비어 있습니다.");
      return;
    }
    const bounds = pathDataToBounds(d, 0);
    const w = Math.max(1, bounds.w);
    const h = Math.max(1, bounds.h);
    const normalized = ring.map(([x, y]) => [(x - bounds.x) / w, (y - bounds.y) / h] as [number, number]);
    const base = targets[0];
    const nextNode: CanvasNode = {
      ...base,
      id: genNodeId("node"),
      type: "path",
      x: bounds.x,
      y: bounds.y,
      w,
      h,
      props: { ...(base.props ?? {}), points: normalized, closed: true },
      componentId: undefined,
      componentInstanceId: undefined,
      componentVariantId: undefined,
    };
    const nextNodes = nodesRef.current.filter((n) => !selected.includes(n.id));
    setPresent([...nextNodes, nextNode], true);
    setSelectedIds([nextNode.id]);
    setMessage("불리언 연산 완료");
  }

  function joinSelectedPaths() {
    const selected = selectedIdsRef.current;
    const paths = nodesRef.current.filter((n) => selected.includes(n.id) && n.type === "path");
    if (paths.length < 2) {
      setMessage("패스는 2개 이상 선택해야 합니다.");
      return;
    }
    const absPointsList = paths.map((node) => ({
      node,
      points: parsePathPointsToArray(node.props.points).map(([x, y]) => [node.x + x * node.w, node.y + y * node.h] as [
        number,
        number,
      ]),
    }));
    if (absPointsList.some((p) => p.points.length < 2)) {
      setMessage("패스 점이 충분하지 않습니다.");
      return;
    }

    const used = new Set<string>();
    let chain = absPointsList[0].points.slice();
    used.add(absPointsList[0].node.id);

    const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

    while (used.size < absPointsList.length) {
      let best: { idx: number; reverse: boolean; d: number } | null = null;
      const end = chain[chain.length - 1];
      for (let i = 0; i < absPointsList.length; i++) {
        const entry = absPointsList[i];
        if (used.has(entry.node.id)) continue;
        const pts = entry.points;
        const dStart = dist(end, pts[0]);
        const dEnd = dist(end, pts[pts.length - 1]);
        if (!best || dStart < best.d) best = { idx: i, reverse: false, d: dStart };
        if (!best || dEnd < best.d) best = { idx: i, reverse: true, d: dEnd };
      }
      if (!best) break;
      const nextEntry = absPointsList[best.idx];
      const nextPoints = best.reverse ? [...nextEntry.points].reverse() : nextEntry.points;
      if (dist(chain[chain.length - 1], nextPoints[0]) < 1) {
        chain = [...chain, ...nextPoints.slice(1)];
      } else {
        chain = [...chain, ...nextPoints];
      }
      used.add(nextEntry.node.id);
    }

    const { x, y, w, h, normalized } = normalizeAbsolutePoints(chain);
    const base = paths[0];
    const nextNode: CanvasNode = {
      ...base,
      id: genNodeId("node"),
      x,
      y,
      w,
      h,
      type: "path",
      props: { ...(base.props ?? {}), points: normalized, closed: false },
    };
    const nextNodes = nodesRef.current.filter((n) => !selected.includes(n.id));
    setPresent([...nextNodes, nextNode], true);
    setSelectedIds([nextNode.id]);
    setMessage("패스 연결 완료");
  }

  function offsetPath(nodeId: string, amount: number) {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    const ring = getPathAbsoluteRing(node);
    if (ring.length < 3) return;
    const cx = ring.reduce((acc, p) => acc + p[0], 0) / ring.length;
    const cy = ring.reduce((acc, p) => acc + p[1], 0) / ring.length;
    const nextAbs = ring.map(([x, y]) => {
      const dx = x - cx;
      const dy = y - cy;
      const len = Math.hypot(dx, dy) || 1;
      return [x + (dx / len) * amount, y + (dy / len) * amount] as [number, number];
    });
    const { x, y, w, h, normalized } = normalizeAbsolutePoints(nextAbs);
    updateNode(nodeId, { x, y, w, h, props: { ...(node.props ?? {}), points: normalized } });
  }

  function smoothPathPoints(points: Array<[number, number]>, closed: boolean, iterations: number) {
    let pts = points;
    const iters = Math.max(1, Math.min(5, Math.floor(iterations)));
    for (let iter = 0; iter < iters; iter++) {
      const next: Array<[number, number]> = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        next.push([0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]]);
        next.push([0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]]);
      }
      if (closed && pts.length > 2) {
        const p0 = pts[pts.length - 1];
        const p1 = pts[0];
        next.push([0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]]);
        next.push([0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]]);
      } else if (pts.length > 0) {
        next.unshift(pts[0]);
        next.push(pts[pts.length - 1]);
      }
      pts = next.map(([x, y]) => [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
    }
    return pts;
  }

  function simplifyPathPoints(points: Array<[number, number]>, epsilon: number) {
    if (points.length < 3 || epsilon <= 0) return points;
    const sqEps = epsilon * epsilon;
    const out: Array<[number, number]> = [];
    const stack: Array<[number, number]> = [[0, points.length - 1]];

    const sqDist = (p: [number, number], a: [number, number], b: [number, number]) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      if (dx === 0 && dy === 0) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
      const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
      const clamped = Math.max(0, Math.min(1, t));
      const projX = a[0] + clamped * dx;
      const projY = a[1] + clamped * dy;
      return (p[0] - projX) ** 2 + (p[1] - projY) ** 2;
    };

    const keep = new Set<number>();
    keep.add(0);
    keep.add(points.length - 1);

    while (stack.length) {
      const [start, end] = stack.pop()!;
      let maxDist = 0;
      let index = -1;
      for (let i = start + 1; i < end; i++) {
        const d = sqDist(points[i], points[start], points[end]);
        if (d > maxDist) {
          maxDist = d;
          index = i;
        }
      }
      if (index !== -1 && maxDist > sqEps) {
        keep.add(index);
        stack.push([start, index], [index, end]);
      }
    }

    const sorted = Array.from(keep).sort((a, b) => a - b);
    for (const i of sorted) out.push(points[i]);
    return out;
  }

  function smoothPath(nodeId: string, iterations: number) {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    const pts = parsePathPointsToArray(node.props.points);
    if (pts.length < 3) return;
    const closed = Boolean(node.props.closed);
    const next = smoothPathPoints(pts, closed, iterations);
    updateNodeProps(nodeId, { points: next });
  }

  function simplifyPath(nodeId: string, tolerance: number) {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    const pts = parsePathPointsToArray(node.props.points);
    if (pts.length < 3) return;
    const next = simplifyPathPoints(pts, tolerance);
    updateNodeProps(nodeId, { points: next });
  }

  function makeEllipsePoints(segments = 24): Array<[number, number]> {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      pts.push([0.5 + 0.5 * Math.cos(t), 0.5 + 0.5 * Math.sin(t)]);
    }
    return pts;
  }

  function convertSelectedToPath() {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const targets = nodesRef.current.filter(
      (n) => ids.includes(n.id) && (n.type === "shape_rect" || n.type === "shape_ellipse" || n.type === "line"),
    );
    if (targets.length === 0) {
      setMessage("패스로 변환 가능한 도형이 없습니다.");
      return;
    }
    const nextNodes = nodesRef.current.filter((n) => !targets.some((t) => t.id === n.id));
    const created: CanvasNode[] = [];
    for (const node of targets) {
      const fill = String((node.props as Record<string, unknown>)?.fill ?? (node.props as Record<string, unknown>)?.background ?? "#EDEDED");
      const stroke = String(
        (node.props as Record<string, unknown>)?.stroke ??
          (node.props as Record<string, unknown>)?.borderColor ??
          "#111111",
      );
      const strokeWidth = Number(
        (node.props as Record<string, unknown>)?.strokeWidth ??
          (node.props as Record<string, unknown>)?.borderWidth ??
          1,
      );
      let points: Array<[number, number]> = [];
      let closed = true;
      if (node.type === "line") {
        points = [
          [0, 0.5],
          [1, 0.5],
        ];
        closed = false;
      } else if (node.type === "shape_ellipse") {
        points = makeEllipsePoints(24);
        closed = true;
      } else {
        points = [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ];
        closed = true;
      }
      created.push({
        ...node,
        id: genNodeId("node"),
        type: "path",
        props: {
          ...(node.props ?? {}),
          points,
          closed,
          fill: node.type === "line" ? "none" : fill,
          stroke,
          strokeWidth: Number.isFinite(strokeWidth) ? strokeWidth : 1,
          lineCap: (node.props as Record<string, unknown>)?.lineCap ?? "round",
          lineJoin: (node.props as Record<string, unknown>)?.lineJoin ?? "round",
        },
      });
    }
    setPresent([...nextNodes, ...created], true);
    setSelectedIds(created.map((n) => n.id));
    setMessage("패스로 변환했습니다.");
  }

  function renderFillControls(node: CanvasNode, fillKey: "background" | "fill", label = "채우기") {
    const state = getFillControlState(node, fillKey);
    return (
      <div className="space-y-2">
        <SelectField
          label={`${label} 유형`}
          value={state.mode}
          onChange={(value) => updateFillState(node.id, fillKey, { mode: value })}
          options={[
            { value: "solid", label: "단색" },
            { value: "gradient", label: "그라디언트" },
          ]}
        />
        {state.mode === "gradient" ? (
          <div className="space-y-2">
            <SelectField
              label="유형"
              value={state.fillType}
              onChange={(value) => updateFillState(node.id, fillKey, { fillType: value })}
              options={[
                { value: "linear", label: "선형" },
                { value: "radial", label: "원형" },
                { value: "conic", label: "원추" },
              ]}
            />
            {state.fillType !== "radial" ? (
              <PropertyField
                label="각도"
                value={state.angle}
                onChange={(value) => updateFillState(node.id, fillKey, { angle: value })}
              />
            ) : null}
            {state.fillType !== "linear" ? (
              <div className="grid grid-cols-2 gap-2">
                <PropertyField
                  label="중심 X(%)"
                  value={state.centerX}
                  onChange={(value) => updateFillState(node.id, fillKey, { centerX: value })}
                />
                <PropertyField
                  label="중심 Y(%)"
                  value={state.centerY}
                  onChange={(value) => updateFillState(node.id, fillKey, { centerY: value })}
                />
              </div>
            ) : null}
            <div className="rounded-[10px] border border-neutral-200 p-2">
              <div className="text-[10px] font-semibold text-neutral-500">스톱</div>
              <div className="mt-2 space-y-2">
                {state.stops.map((stop, idx) => (
                  <div key={`stop-${idx}`} className="grid grid-cols-[1fr_80px_auto] gap-2">
                    <ColorField
                      label={`색상 ${idx + 1}`}
                      value={stop.color}
                      onChange={(value) => {
                        const nextStops = state.stops.map((s, i) => (i === idx ? { ...s, color: value } : s));
                        updateFillState(node.id, fillKey, { stops: nextStops });
                      }}
                    />
                    <PropertyField
                      label="%"
                      value={Number(stop.pos)}
                      onChange={(value) => {
                        const nextStops = state.stops.map((s, i) =>
                          i === idx ? { ...s, pos: Math.max(0, Math.min(100, Number(value))) } : s,
                        );
                        updateFillState(node.id, fillKey, { stops: nextStops });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const nextStops = state.stops.filter((_, i) => i !== idx);
                        updateFillState(node.id, fillKey, { stops: nextStops.length ? nextStops : state.stops });
                      }}
                      className="rounded border border-neutral-200 px-2 py-1 text-[10px]"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  updateFillState(node.id, fillKey, {
                    stops: [...state.stops, { color: "#FFFFFF", pos: 100 }],
                  })
                }
                className="mt-2 rounded-full border px-2 py-1 text-[10px]"
              >
                스톱 추가
              </button>
            </div>
          </div>
        ) : (
          <ColorField
            label={label}
            value={state.from}
            onChange={(value) => updateFillState(node.id, fillKey, { from: value })}
          />
        )}
      </div>
    );
  }

  function applyStyleToSelection(styleProps: Record<string, unknown>) {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const nextNodes = nodesRef.current.map((node) => {
      if (!idSet.has(node.id)) return node;
      const keys = getStyleKeysForType(node.type);
      const patch: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in styleProps) patch[key] = styleProps[key];
      }
      const normalized = normalizeStylePatchForNode(node.type, patch);
      if (Object.keys(normalized).length === 0) return node;
      const mapped = mapInspectorPropsForRender(node.type, normalized);
      return { ...node, props: { ...(node.props ?? {}), ...mapped } };
    });
    setPresent(nextNodes, true);
  }

  function copyStyleFromSelection() {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const node = nodesRef.current.find((n) => n.id === ids[0]) ?? null;
    if (!node) return;
    styleClipboardRef.current = extractStyleProps(node);
    setMessage("스타일을 복사했습니다.");
  }

  function pasteStyleToSelection() {
    const style = styleClipboardRef.current;
    if (!style) {
      setMessage("복사된 스타일이 없습니다.");
      return;
    }
    applyStyleToSelection(style);
    setMessage("스타일을 적용했습니다.");
  }

  function saveStylePreset() {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const node = nodesRef.current.find((n) => n.id === ids[0]) ?? null;
    if (!node) return;
    const props = extractStyleProps(node);
    if (Object.keys(props).length === 0) {
      setMessage("저장할 스타일이 없습니다.");
      return;
    }
    const nextName = presetName.trim()
      ? presetName.trim()
      : `프리셋 ${pickSmallestMissingPositive(stylePresets.map((p) => Number(p.name.replace(/[^\d]/g, ""))))}`;
    const nextPreset: StylePreset = { id: genNodeId("style"), name: nextName, props };
    setStylePresets((prev) => [...prev, nextPreset]);
    setPresetName("");
    setMessage("스타일 프리셋을 저장했습니다.");
  }

  function deleteStylePreset(id: string) {
    setStylePresets((prev) => prev.filter((p) => p.id !== id));
  }

  function addColorToken() {
    if (!colorTokenDraft.name.trim()) {
      setMessage("토큰 이름을 입력하세요.");
      return;
    }
    const next: ColorToken = { id: genNodeId("color"), name: colorTokenDraft.name.trim(), value: colorTokenDraft.value };
    setStyleTokens((prev) => ({ ...prev, colors: [...prev.colors, next] }));
    setColorTokenDraft({ name: "", value: "#111111" });
  }

  function addRadiusToken() {
    if (!radiusTokenDraft.name.trim()) {
      setMessage("토큰 이름을 입력하세요.");
      return;
    }
    const next: NumberToken = {
      id: genNodeId("radius"),
      name: radiusTokenDraft.name.trim(),
      value: Math.max(0, Number(radiusTokenDraft.value) || 0),
    };
    setStyleTokens((prev) => ({ ...prev, radii: [...prev.radii, next] }));
    setRadiusTokenDraft({ name: "", value: 12 });
  }

  function addTextSizeToken() {
    if (!textSizeTokenDraft.name.trim()) {
      setMessage("토큰 이름을 입력하세요.");
      return;
    }
    const next: NumberToken = {
      id: genNodeId("text"),
      name: textSizeTokenDraft.name.trim(),
      value: Math.max(1, Number(textSizeTokenDraft.value) || 1),
    };
    setStyleTokens((prev) => ({ ...prev, textSizes: [...prev.textSizes, next] }));
    setTextSizeTokenDraft({ name: "", value: 14 });
  }

  function addShadowToken() {
    if (!shadowTokenDraft.name.trim()) {
      setMessage("토큰 이름을 입력하세요.");
      return;
    }
    const next: TextToken = { id: genNodeId("shadow"), name: shadowTokenDraft.name.trim(), value: shadowTokenDraft.value.trim() };
    setStyleTokens((prev) => ({ ...prev, shadows: [...prev.shadows, next] }));
    setShadowTokenDraft({ name: "", value: "0 12px 30px rgba(0,0,0,0.15)" });
  }

  function addFontToken() {
    if (!fontTokenDraft.name.trim()) {
      setMessage("토큰 이름을 입력하세요.");
      return;
    }
    const next: TextToken = { id: genNodeId("font"), name: fontTokenDraft.name.trim(), value: fontTokenDraft.value.trim() };
    setStyleTokens((prev) => ({ ...prev, fonts: [...prev.fonts, next] }));
    setFontTokenDraft({ name: "", value: "" });
  }

  function updateTokenName<K extends keyof StyleTokens>(key: K, id: string, name: string) {
    setStyleTokens((prev) => ({
      ...prev,
      [key]: prev[key].map((token) => (token.id === id ? { ...token, name } : token)) as StyleTokens[K],
    }));
  }

  function updateTokenValue<K extends keyof StyleTokens>(key: K, id: string, value: string | number) {
    setStyleTokens((prev) => ({
      ...prev,
      [key]: prev[key].map((token) => (token.id === id ? { ...token, value } : token)) as StyleTokens[K],
    }));
  }

  function deleteToken<K extends keyof StyleTokens>(key: K, id: string) {
    setStyleTokens((prev) => ({
      ...prev,
      [key]: prev[key].filter((token) => token.id !== id) as StyleTokens[K],
    }));
  }

  function getBoundsForNodes(nodes: CanvasNode[]) {
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + n.w));
    const maxY = Math.max(...nodes.map((n) => n.y + n.h));
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  function normalizeLayoutSettings(raw?: Partial<LayoutSettings>): LayoutSettings {
    const pad = raw?.padding ?? DEFAULT_LAYOUT_SETTINGS.padding;
    const asNum = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
    const dir = raw?.dir === "column" ? "column" : "row";
    const align = ["start", "center", "end", "stretch"].includes(String(raw?.align))
      ? (raw?.align as LayoutSettings["align"])
      : DEFAULT_LAYOUT_SETTINGS.align;
    const justify = ["start", "center", "end", "space-between"].includes(String(raw?.justify))
      ? (raw?.justify as LayoutSettings["justify"])
      : DEFAULT_LAYOUT_SETTINGS.justify;
    return {
      dir,
      gap: asNum(raw?.gap, DEFAULT_LAYOUT_SETTINGS.gap),
      align,
      justify,
      wrap: Boolean(raw?.wrap),
      padding: {
        t: asNum(pad?.t, DEFAULT_LAYOUT_SETTINGS.padding.t),
        r: asNum(pad?.r, DEFAULT_LAYOUT_SETTINGS.padding.r),
        b: asNum(pad?.b, DEFAULT_LAYOUT_SETTINGS.padding.b),
        l: asNum(pad?.l, DEFAULT_LAYOUT_SETTINGS.padding.l),
      },
      auto: raw?.auto !== undefined ? Boolean(raw?.auto) : DEFAULT_LAYOUT_SETTINGS.auto,
      wrapSize: typeof raw?.wrapSize === "number" && Number.isFinite(raw.wrapSize) ? raw.wrapSize : undefined,
    };
  }

  function applyLayoutGroupToNodes(nodes: CanvasNode[], group: LayoutGroup): CanvasNode[] {
    const settings = normalizeLayoutSettings(group.settings);
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const items = group.nodeIds.map((id) => nodeMap.get(id)).filter(Boolean) as CanvasNode[];
    if (items.length === 0) return nodes;
    const bounds = getBoundsForNodes(items);
    const padding = settings.padding;
    const containerMain =
      settings.wrap && settings.wrapSize && settings.wrapSize > 0
        ? settings.wrapSize
        : settings.dir === "row"
          ? Math.max(1, bounds.w)
          : Math.max(1, bounds.h);
    const availableMain =
      settings.dir === "row"
        ? Math.max(1, containerMain - padding.l - padding.r)
        : Math.max(1, containerMain - padding.t - padding.b);

    type LineItem = { node: CanvasNode };
    type Line = { items: LineItem[]; main: number; cross: number };
    const lines: Line[] = [];
    let current: Line = { items: [], main: 0, cross: 0 };

    for (const node of items) {
      const mainSize = settings.dir === "row" ? node.w : node.h;
      const crossSize = settings.dir === "row" ? node.h : node.w;
      const gap = current.items.length ? settings.gap : 0;
      if (settings.wrap && current.items.length && current.main + gap + mainSize > availableMain) {
        lines.push(current);
        current = { items: [], main: 0, cross: 0 };
      }
      current.items.push({ node });
      current.main += gap + mainSize;
      current.cross = Math.max(current.cross, crossSize);
    }
    if (current.items.length) lines.push(current);

    const updates = new Map<string, Partial<CanvasNode>>();
    let crossOffset = settings.dir === "row" ? bounds.minY + padding.t : bounds.minX + padding.l;

    for (const line of lines) {
      const sumMain = line.items.reduce(
        (acc, item) => acc + (settings.dir === "row" ? item.node.w : item.node.h),
        0,
      );
      let gapBetween = settings.gap;
      let mainOffset = settings.dir === "row" ? bounds.minX + padding.l : bounds.minY + padding.t;
      const remaining = availableMain - line.main;

      if (settings.justify === "center") mainOffset += remaining / 2;
      if (settings.justify === "end") mainOffset += remaining;
      if (settings.justify === "space-between" && line.items.length > 1) {
        gapBetween = (availableMain - sumMain) / (line.items.length - 1);
      }

      for (const item of line.items) {
        const node = item.node;
        let x = node.x;
        let y = node.y;
        let w = node.w;
        let h = node.h;
        if (settings.dir === "row") {
          x = mainOffset;
          if (settings.align === "center") y = crossOffset + (line.cross - node.h) / 2;
          else if (settings.align === "end") y = crossOffset + (line.cross - node.h);
          else y = crossOffset;
          if (settings.align === "stretch") h = Math.max(1, line.cross);
          mainOffset += node.w + gapBetween;
        } else {
          y = mainOffset;
          if (settings.align === "center") x = crossOffset + (line.cross - node.w) / 2;
          else if (settings.align === "end") x = crossOffset + (line.cross - node.w);
          else x = crossOffset;
          if (settings.align === "stretch") w = Math.max(1, line.cross);
          mainOffset += node.h + gapBetween;
        }
        updates.set(node.id, { x, y, w, h });
      }
      crossOffset += line.cross + (settings.wrap ? settings.gap : 0);
    }

    if (updates.size === 0) return nodes;
    return nodes.map((node) => (updates.has(node.id) ? { ...node, ...updates.get(node.id) } : node));
  }

  function applyAutoLayoutGroups(nodesNext: CanvasNode[]) {
    const groups = layoutGroupsRef.current;
    if (!groups.length) return nodesNext;
    let next = nodesNext;
    for (const group of groups) {
      if (!group.settings?.auto) continue;
      next = applyLayoutGroupToNodes(next, group);
    }
    return next;
  }

  function createLayoutGroupFromSelection() {
    const ids = selectedIdsRef.current;
    if (ids.length < 2) {
      setMessage("레이아웃 그룹은 2개 이상 선택해야 합니다.");
      return;
    }
    const name = layoutGroupNameDraft.trim()
      ? layoutGroupNameDraft.trim()
      : `레이아웃 ${pickSmallestMissingPositive(layoutGroups.map((g) => Number(g.name.replace(/[^\d]/g, ""))))}`;
    const next: LayoutGroup = { id: genNodeId("layout"), name, nodeIds: [...ids], settings: { ...DEFAULT_LAYOUT_SETTINGS } };
    setLayoutGroups((prev) => [...prev, next]);
    setLayoutGroupNameDraft("");
    const nextNodes = applyLayoutGroupToNodes(nodesRef.current, next);
    setPresent(nextNodes, true);
    setMessage("레이아웃 그룹을 생성했습니다.");
  }

  function updateLayoutGroupSettings(id: string, patch: Partial<LayoutSettings>) {
    setLayoutGroups((prev) =>
      prev.map((g) =>
        g.id === id ? { ...g, settings: normalizeLayoutSettings({ ...g.settings, ...patch }) } : g,
      ),
    );
  }

  function updateLayoutGroupNodes(id: string, nodeIds: string[]) {
    setLayoutGroups((prev) => prev.map((g) => (g.id === id ? { ...g, nodeIds: [...nodeIds] } : g)));
  }

  function applyLayoutGroupNow(id: string) {
    const group = layoutGroupsRef.current.find((g) => g.id === id);
    if (!group) return;
    const nextNodes = applyLayoutGroupToNodes(nodesRef.current, group);
    setPresent(nextNodes, true);
  }

  function deleteLayoutGroup(id: string) {
    setLayoutGroups((prev) => prev.filter((g) => g.id !== id));
  }

  function makeComponentNodes(nodes: CanvasNode[], bounds: { minX: number; minY: number }) {
    return nodes.map((n) => ({
      ...n,
      id: n.componentNodeId ?? n.id,
      x: n.x - bounds.minX,
      y: n.y - bounds.minY,
      props: { ...(n.props ?? {}) },
      componentId: undefined,
      componentInstanceId: undefined,
      componentVariantId: undefined,
      componentNodeId: undefined,
    }));
  }

  function createComponentFromSelection() {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) {
      setMessage("선택된 요소가 없습니다.");
      return;
    }
    const selected = nodesRef.current.filter((n) => ids.includes(n.id));
    const bounds = getBoundsForNodes(selected);
    const name = componentNameDraft.trim()
      ? componentNameDraft.trim()
      : `컴포넌트 ${pickSmallestMissingPositive(components.map((c) => Number(c.name.replace(/[^\d]/g, ""))))}`;
    const next: ComponentDefinition = {
      id: genNodeId("component"),
      name,
      nodes: makeComponentNodes(selected, bounds),
      size: { w: bounds.w, h: bounds.h },
      variants: [],
    };
    setComponents((prev) => [...prev, next]);
    setComponentNameDraft("");
    const instanceId = genNodeId("instance");
    const idSet = new Set(ids);
    const nextNodes = nodesRef.current.map((node) =>
      idSet.has(node.id)
        ? {
            ...node,
            componentId: next.id,
            componentInstanceId: instanceId,
            componentVariantId: undefined,
            componentNodeId: node.componentNodeId ?? node.id,
          }
        : node,
    );
    setPresent(nextNodes, true);
    setMessage("컴포넌트를 저장하고 인스턴스로 연결했습니다.");
  }

  function cloneComponentNodes(
    defNodes: CanvasNode[],
    origin: { x: number; y: number },
    componentId: string,
    instanceId: string,
    variantId?: string,
  ) {
    return defNodes.map((n) => ({
      ...n,
      id: genNodeId("node"),
      x: origin.x + n.x,
      y: origin.y + n.y,
      props: { ...(n.props ?? {}) },
      componentId,
      componentInstanceId: instanceId,
      componentVariantId: variantId,
      componentNodeId: n.id,
    }));
  }

  function insertComponent(componentId: string, variantId?: string) {
    const component = components.find((c) => c.id === componentId);
    if (!component) return;
    const variant = variantId ? component.variants.find((v) => v.id === variantId) : null;
    const defNodes = variant ? variant.nodes : component.nodes;
    const size = variant ? variant.size : component.size;
    const origin = { x: docMetaRef.current.width / 2 - size.w / 2, y: docMetaRef.current.height / 2 - size.h / 2 };
    const instanceId = genNodeId("instance");
    const clones = cloneComponentNodes(defNodes, origin, componentId, instanceId, variant?.id);
    const nextNodes = [...nodesRef.current, ...clones];
    setPresent(nextNodes, true);
    setSelectedIds(clones.map((n) => n.id));
    setMessage("컴포넌트를 추가했습니다.");
  }

  function replaceInstances(
    componentId: string,
    variantId: string | undefined,
    defNodes: CanvasNode[],
    preserveOverrides = true,
  ) {
    const nodes = nodesRef.current;
    const matches = nodes.filter((n) =>
      n.componentId === componentId &&
      (variantId ? n.componentVariantId === variantId : !n.componentVariantId),
    );
    if (matches.length === 0) return nodes;
    const defMap = new Map(defNodes.map((d) => [d.id, d]));
    const instanceMap = new Map<string, CanvasNode[]>();
    for (const node of matches) {
      const inst = node.componentInstanceId ?? node.id;
      const arr = instanceMap.get(inst) ?? [];
      arr.push(node);
      instanceMap.set(inst, arr);
    }
    const overridesByInstance = new Map<string, Map<string, Record<string, unknown>>>();
    if (preserveOverrides) {
      for (const [instId, instNodes] of instanceMap) {
        const overrides = new Map<string, Record<string, unknown>>();
        for (const node of instNodes) {
          const sourceId = node.componentNodeId ?? node.id;
          const defNode = defMap.get(sourceId);
          if (!defNode) continue;
          const baseProps = defNode.props ?? {};
          const currentProps = node.props ?? {};
          const diff: Record<string, unknown> = {};
          for (const key of Object.keys(currentProps)) {
            if (!isValueEqual(currentProps[key], (baseProps as Record<string, unknown>)[key])) diff[key] = currentProps[key];
          }
          if (Object.keys(diff).length > 0) overrides.set(sourceId, diff);
        }
        overridesByInstance.set(instId, overrides);
      }
    }
    const clonesByInstance = new Map<string, CanvasNode[]>();
    for (const [instId, instNodes] of instanceMap) {
      const bounds = getBoundsForNodes(instNodes);
      const origin = { x: bounds.minX, y: bounds.minY };
      const overrides = overridesByInstance.get(instId);
      const clones = cloneComponentNodes(defNodes, origin, componentId, instId, variantId).map((clone) => {
        const override = clone.componentNodeId ? overrides?.get(clone.componentNodeId) : null;
        if (override && Object.keys(override).length > 0) {
          return { ...clone, props: { ...(clone.props ?? {}), ...override } };
        }
        return clone;
      });
      clonesByInstance.set(instId, clones);
    }
    const idsToReplace = new Set(matches.map((n) => n.id));
    const nextNodes: CanvasNode[] = [];
    const inserted = new Set<string>();
    for (const node of nodes) {
      if (!idsToReplace.has(node.id)) {
        nextNodes.push(node);
        continue;
      }
      const inst = node.componentInstanceId ?? node.id;
      if (inserted.has(inst)) continue;
      const clones = clonesByInstance.get(inst);
      if (clones) {
        nextNodes.push(...clones);
      }
      inserted.add(inst);
    }
    return nextNodes;
  }

  function updateComponentFromSelection(componentId: string, variantId?: string) {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) {
      setMessage("선택된 요소가 없습니다.");
      return;
    }
    const selected = nodesRef.current.filter((n) => ids.includes(n.id));
    const bounds = getBoundsForNodes(selected);
    const defNodes = makeComponentNodes(selected, bounds);
    setComponents((prev) =>
      prev.map((c) => {
        if (c.id !== componentId) return c;
        if (variantId) {
          return {
            ...c,
            variants: c.variants.map((v) =>
              v.id === variantId ? { ...v, nodes: defNodes, size: { w: bounds.w, h: bounds.h } } : v,
            ),
          };
        }
        return { ...c, nodes: defNodes, size: { w: bounds.w, h: bounds.h } };
      }),
    );
    const nextNodes = replaceInstances(componentId, variantId, defNodes);
    setPresent(nextNodes, true);
    setMessage("컴포넌트를 업데이트했습니다.");
  }

  function createVariantFromSelection(componentId: string) {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) {
      setMessage("선택된 요소가 없습니다.");
      return;
    }
    const selected = nodesRef.current.filter((n) => ids.includes(n.id));
    const bounds = getBoundsForNodes(selected);
    const name = variantNameDraft.trim()
      ? variantNameDraft.trim()
      : `변형 ${pickSmallestMissingPositive(
          (components.find((c) => c.id === componentId)?.variants ?? []).map((v) => Number(v.name.replace(/[^\d]/g, ""))),
        )}`;
    const variant: ComponentVariant = {
      id: genNodeId("variant"),
      name,
      nodes: makeComponentNodes(selected, bounds),
      size: { w: bounds.w, h: bounds.h },
    };
    setComponents((prev) =>
      prev.map((c) => (c.id === componentId ? { ...c, variants: [...c.variants, variant] } : c)),
    );
    setVariantNameDraft("");
    setMessage("변형을 저장했습니다.");
  }

  function applyVariantToInstance(
    componentId: string,
    variantId: string | null,
    instanceId: string,
    preserveOverrides = true,
  ) {
    const component = components.find((c) => c.id === componentId);
    if (!component) return;
    const variant = variantId ? component.variants.find((v) => v.id === variantId) : null;
    const defNodes = variant ? variant.nodes : component.nodes;
    const resolvedVariantId = variant ? variant.id : undefined;
    const instanceNodes = nodesRef.current.filter(
      (n) => n.componentId === componentId && n.componentInstanceId === instanceId,
    );
    if (instanceNodes.length === 0) return;
    const defMap = new Map(defNodes.map((d) => [d.id, d]));
    const overrides = new Map<string, Record<string, unknown>>();
    if (preserveOverrides) {
      for (const node of instanceNodes) {
        const sourceId = node.componentNodeId ?? node.id;
        const defNode = defMap.get(sourceId);
        if (!defNode) continue;
        const baseProps = defNode.props ?? {};
        const currentProps = node.props ?? {};
        const diff: Record<string, unknown> = {};
        for (const key of Object.keys(currentProps)) {
          if (!isValueEqual(currentProps[key], (baseProps as Record<string, unknown>)[key])) diff[key] = currentProps[key];
        }
        if (Object.keys(diff).length > 0) overrides.set(sourceId, diff);
      }
    }
    const bounds = getBoundsForNodes(instanceNodes);
    const origin = { x: bounds.minX, y: bounds.minY };
    const clones = cloneComponentNodes(defNodes, origin, componentId, instanceId, resolvedVariantId).map((clone) => {
      const override = clone.componentNodeId ? overrides.get(clone.componentNodeId) : null;
      if (override && Object.keys(override).length > 0) {
        return { ...clone, props: { ...(clone.props ?? {}), ...override } };
      }
      return clone;
    });
    const idsToReplace = new Set(instanceNodes.map((n) => n.id));
    const nextNodes: CanvasNode[] = [];
    let inserted = false;
    for (const node of nodesRef.current) {
      if (!idsToReplace.has(node.id)) {
        nextNodes.push(node);
        continue;
      }
      if (!inserted) {
        nextNodes.push(...clones);
        inserted = true;
      }
    }
    setPresent(nextNodes, true);
    setSelectedIds(clones.map((n) => n.id));
    setMessage("변형을 적용했습니다.");
  }

  function resetInstanceOverrides(componentId: string, variantId: string | null, instanceId: string) {
    applyVariantToInstance(componentId, variantId, instanceId, false);
    setMessage("오버라이드를 초기화했습니다.");
  }

  function getComponentDefinitionNodes(componentId: string, variantId?: string | null) {
    const component = components.find((c) => c.id === componentId);
    if (!component) return [];
    if (variantId) {
      const variant = component.variants.find((v) => v.id === variantId);
      return variant ? variant.nodes : component.nodes;
    }
    return component.nodes;
  }

  function resetInstanceNodeOverrides(
    componentId: string,
    variantId: string | null,
    instanceId: string,
    targetNodeId?: string,
  ) {
    const defNodes = getComponentDefinitionNodes(componentId, variantId);
    if (defNodes.length === 0) return;
    const defMap = new Map(defNodes.map((n) => [n.id, n]));
    const ids = new Set<string>();
    const nextProps = new Map<string, Record<string, unknown>>();
    for (const node of nodesRef.current) {
      if (node.componentId !== componentId || node.componentInstanceId !== instanceId) continue;
      if (targetNodeId && node.id !== targetNodeId) continue;
      const sourceId = node.componentNodeId ?? node.id;
      const defNode = defMap.get(sourceId);
      if (!defNode) continue;
      ids.add(node.id);
      nextProps.set(node.id, defNode.props ?? {});
    }
    if (ids.size === 0) return;
    replaceNodeProps(ids, nextProps);
    setMessage("인스턴스 오버라이드를 초기화했습니다.");
  }

  function detachComponentInstance(instanceId: string) {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const nextNodes = nodesRef.current.map((node) => {
      if (!idSet.has(node.id)) return node;
      if (node.componentInstanceId !== instanceId) return node;
      return {
        ...node,
        componentId: undefined,
        componentInstanceId: undefined,
        componentVariantId: undefined,
        componentNodeId: undefined,
      };
    });
    setPresent(nextNodes, true);
    setMessage("인스턴스를 분리했습니다.");
  }

  function deleteComponent(componentId: string) {
    setComponents((prev) => prev.filter((c) => c.id !== componentId));
    const nextNodes = nodesRef.current.map((node) =>
      node.componentId === componentId
        ? {
            ...node,
            componentId: undefined,
            componentInstanceId: undefined,
            componentVariantId: undefined,
            componentNodeId: undefined,
          }
        : node,
    );
    setPresent(nextNodes, true);
    setMessage("컴포넌트를 삭제했습니다.");
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  function setSingleSelect(id: string) {
    setSelectedIds([id]);
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  /** Set node hidden state. */
  function setNodeHidden(id: string, hidden: boolean) {
    updateNode(id, { hidden });
  }

  /** Set node locked state. */
  function setNodeLocked(id: string, locked: boolean) {
    updateNode(id, { locked });
  }

  function computeAlignmentSnapForMove(
    proposedX: number,
    proposedY: number,
    primary: CanvasNode,
    others: CanvasNode[],
    canvas: { width: number; height: number },
    gridEnabled: boolean,
  ): { x: number; y: number; guides: GuideLine[] } {
    const p = rectOf({ ...primary, x: proposedX, y: proposedY });
    const candidatesX: Array<{ v: number; guide: GuideLine }> = [];
    const candidatesY: Array<{ v: number; guide: GuideLine }> = [];

    for (const o of others) {
      const r = rectOf(o);
      // x edges/center
      candidatesX.push({ v: r.l, guide: { kind: "v", x: r.l } });
      candidatesX.push({ v: r.cx, guide: { kind: "v", x: r.cx } });
      candidatesX.push({ v: r.r, guide: { kind: "v", x: r.r } });
      // y edges/center
      candidatesY.push({ v: r.t, guide: { kind: "h", y: r.t } });
      candidatesY.push({ v: r.cy, guide: { kind: "h", y: r.cy } });
      candidatesY.push({ v: r.b, guide: { kind: "h", y: r.b } });
    }

    // Canvas edges/center guides.
    const canvasGuidesX = [
      { v: 0, guide: { kind: "v" as const, x: 0 } },
      { v: canvas.width / 2, guide: { kind: "v" as const, x: canvas.width / 2 } },
      { v: canvas.width, guide: { kind: "v" as const, x: canvas.width } },
    ];
    const canvasGuidesY = [
      { v: 0, guide: { kind: "h" as const, y: 0 } },
      { v: canvas.height / 2, guide: { kind: "h" as const, y: canvas.height / 2 } },
      { v: canvas.height, guide: { kind: "h" as const, y: canvas.height } },
    ];
    for (const c of canvasGuidesX) candidatesX.push(c);
    for (const c of canvasGuidesY) candidatesY.push(c);

    let snappedX = proposedX;
    let snappedY = proposedY;
    let didSnapX = false;
    let didSnapY = false;
    const outGuides: GuideLine[] = [];

    // Try snap X with l/cx/r
    const px = [
      { k: "l" as const, v: p.l },
      { k: "cx" as const, v: p.cx },
      { k: "r" as const, v: p.r },
    ];
    let bestDx = Infinity;
    let bestX: number | null = null;
    let bestGuideX: GuideLine | null = null;
    for (const pv of px) {
      for (const c of candidatesX) {
        const dx = c.v - pv.v;
        const adx = Math.abs(dx);
        if (adx <= SNAP_THRESHOLD && adx < bestDx) {
          bestDx = adx;
          bestGuideX = c.guide;
          // adjust x based on which anchor matched
          if (pv.k === "l") bestX = proposedX + dx;
          if (pv.k === "cx") bestX = proposedX + dx;
          if (pv.k === "r") bestX = proposedX + dx;
        }
      }
    }
    if (bestX != null && bestGuideX) {
      snappedX = bestX;
      didSnapX = true;
      outGuides.push(bestGuideX);
    }

    // Try snap Y with t/cy/b
    const py = [
      { k: "t" as const, v: p.t },
      { k: "cy" as const, v: p.cy },
      { k: "b" as const, v: p.b },
    ];
    let bestDy = Infinity;
    let bestY: number | null = null;
    let bestGuideY: GuideLine | null = null;
    for (const pv of py) {
      for (const c of candidatesY) {
        const dy = c.v - pv.v;
        const ady = Math.abs(dy);
        if (ady <= SNAP_THRESHOLD && ady < bestDy) {
          bestDy = ady;
          bestGuideY = c.guide;
          bestY = proposedY + dy;
        }
      }
    }
    if (bestY != null && bestGuideY) {
      snappedY = bestY;
      didSnapY = true;
      outGuides.push(bestGuideY);
    }

    // Only if no other-node snap happened (feels right)
    if (!didSnapX) {
      const p2 = rectOf({ ...primary, x: snappedX, y: snappedY });
      const anchors = [p2.l, p2.cx, p2.r];
      let best = Infinity;
      let bestAdj: number | null = null;
      let bestGuide: GuideLine | null = null;
      for (const a of anchors) {
        for (const c of canvasGuidesX) {
          const d = c.v - a;
          const ad = Math.abs(d);
          if (ad <= SNAP_THRESHOLD && ad < best) {
            best = ad;
            bestGuide = c.guide;
            bestAdj = snappedX + d;
          }
        }
      }
      if (bestAdj != null && bestGuide) {
        snappedX = bestAdj;
        outGuides.push(bestGuide);
      }
    }

    if (!didSnapY) {
      const p2 = rectOf({ ...primary, x: snappedX, y: snappedY });
      const anchors = [p2.t, p2.cy, p2.b];
      let best = Infinity;
      let bestAdj: number | null = null;
      let bestGuide: GuideLine | null = null;
      for (const a of anchors) {
        for (const c of canvasGuidesY) {
          const d = c.v - a;
          const ad = Math.abs(d);
          if (ad <= SNAP_THRESHOLD && ad < best) {
            best = ad;
            bestGuide = c.guide;
            bestAdj = snappedY + d;
          }
        }
      }
      if (bestAdj != null && bestGuide) {
        snappedY = bestAdj;
        outGuides.push(bestGuide);
      }
    }

    // Grid snap last, but only if axis didn't snap to a guide
    if (gridEnabled) {
      if (!outGuides.some((g) => g.kind === "v")) snappedX = snapToGrid(snappedX, GRID_SIZE);
      if (!outGuides.some((g) => g.kind === "h")) snappedY = snapToGrid(snappedY, GRID_SIZE);
    }

    // clamp to canvas
    snappedX = clamp(snappedX, 0, canvas.width - primary.w);
    snappedY = clamp(snappedY, 0, canvas.height - primary.h);

    return { x: snappedX, y: snappedY, guides: uniq(outGuides.map((g) => (g.kind === "v" ? `v:${g.x}` : `h:${g.y}`))).map((k) => {
      const [kind, v] = k.split(":");
      if (kind === "v") return { kind: "v", x: Number(v) } as GuideLine;
      return { kind: "h", y: Number(v) } as GuideLine;
    }) };
  }

  function startMoveDrag(event: ReactPointerEvent<HTMLDivElement>, id: string) {
    event.preventDefault();

    const nowNodes = nodesRef.current;
    const clicked = nowNodes.find((n) => n.id === id);
    if (!clicked) return;
    if (clicked.locked) return;

    const ids = selectedIdsRef.current.includes(id) ? selectedIdsRef.current : [id];
    const origins: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const nid of ids) {
      const n = nowNodes.find((x) => x.id === nid);
      if (n) origins[nid] = { x: n.x, y: n.y, w: n.w, h: n.h };
    }

    dragRef.current = {
      mode: "move",
      primaryId: id,
      ids,
      startX: event.clientX,
      startY: event.clientY,
      origins,
      didBeginHistory: false,
    };
  }

  function startResize(event: ReactPointerEvent<HTMLElement>, id: string, handle: "nw" | "ne" | "sw" | "se") {
    event.preventDefault();
    event.stopPropagation();
    const node = nodesRef.current.find((item) => item.id === id);
    if (!node) return;
    if (node.locked) return;

    dragRef.current = {
      mode: "resize",
      id,
      startX: event.clientX,
      startY: event.clientY,
      origin: { x: node.x, y: node.y, w: node.w, h: node.h },
      handle,
      didBeginHistory: false,
    };
  }

  useEffect(() => {
    function handleMove(ev: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;

      beginGestureHistoryOnce();

      const dx = ev.clientX - drag.startX;
      const dy = ev.clientY - drag.startY;

      const nowNodes = nodesRef.current;
      const { width, height } = docMetaRef.current;
      const gridEnabled = gridSnapRef.current;

      if (drag.mode === "move") {
        const primaryNow = nowNodes.find((n) => n.id === drag.primaryId);
        if (!primaryNow) return;

        // others = all nodes except selected
        const selected = new Set(drag.ids);
        const others = nowNodes.filter((n) => !selected.has(n.id));

        const originPrimary = drag.origins[drag.primaryId] ?? { x: primaryNow.x, y: primaryNow.y, w: primaryNow.w, h: primaryNow.h };

        const proposedX = originPrimary.x + dx;
        const proposedY = originPrimary.y + dy;

        const snap = computeAlignmentSnapForMove(
          proposedX,
          proposedY,
          { ...primaryNow, x: originPrimary.x, y: originPrimary.y },
          others,
          { width, height },
          gridEnabled,
        );

        setGuides(snap.guides);

        const appliedDx = snap.x - originPrimary.x;
        const appliedDy = snap.y - originPrimary.y;

        const nextNodes = nowNodes.map((n) => {
          if (!selected.has(n.id)) return n;
          const o = drag.origins[n.id];
          if (!o) return n;
          const nextXRaw = o.x + appliedDx;
          const nextYRaw = o.y + appliedDy;
          const nextX = clamp(nextXRaw, 0, width - n.w);
          const nextY = clamp(nextYRaw, 0, height - n.h);
          return { ...n, x: nextX, y: nextY };
        });

        setPresent(nextNodes, false);
        return;
      }

      // resize (single)
      const nodeNow = nowNodes.find((n) => n.id === drag.id);
      if (!nodeNow) return;

      const minSize = 24;
      let nextX = drag.origin.x;
      let nextY = drag.origin.y;
      let nextW = drag.origin.w;
      let nextH = drag.origin.h;

      const h = drag.handle;

      if (h.includes("e")) nextW = clamp(drag.origin.w + dx, minSize, width - drag.origin.x);
      if (h.includes("s")) nextH = clamp(drag.origin.h + dy, minSize, height - drag.origin.y);
      if (h.includes("w")) {
        nextW = clamp(drag.origin.w - dx, minSize, drag.origin.w + drag.origin.x);
        nextX = drag.origin.x + (drag.origin.w - nextW);
      }
      if (h.includes("n")) {
        nextH = clamp(drag.origin.h - dy, minSize, drag.origin.h + drag.origin.y);
        nextY = drag.origin.y + (drag.origin.h - nextH);
      }

      if (gridEnabled) {
        nextX = snapToGrid(nextX, GRID_SIZE);
        nextY = snapToGrid(nextY, GRID_SIZE);
        nextW = snapToGrid(nextW, GRID_SIZE);
        nextH = snapToGrid(nextH, GRID_SIZE);
      }

      // clamp
      nextX = clamp(nextX, 0, width - minSize);
      nextY = clamp(nextY, 0, height - minSize);
      nextW = clamp(nextW, minSize, width);
      nextH = clamp(nextH, minSize, height);

      const nextNodes = nowNodes.map((n) =>
        n.id === drag.id ? { ...n, x: nextX, y: nextY, w: nextW, h: nextH } : n,
      );

      setGuides([]);
      setPresent(nextNodes, false);
    }

    function handleUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      setGuides([]);
      // gesture ended: present already set; history past already created in beginGestureHistoryOnce()
      setHistory((prev) => ({ ...prev, future: [] }));
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  
  function normalizeToV2(content: unknown): ContentV2 {
    const record = content && typeof content === "object" ? (content as Record<string, unknown>) : null;
    const recordWidth = record?.["width"];
    const recordHeight = record?.["height"];
    const baseWidth = typeof recordWidth === "number" && Number.isFinite(recordWidth) ? recordWidth : DEFAULT_CANVAS.width;
    const baseHeight = typeof recordHeight === "number" && Number.isFinite(recordHeight) ? recordHeight : DEFAULT_CANVAS.height;

    if (record && record["schema"] === "canvas_v2" && Array.isArray(record["scenes"])) {
      const scenes: Scene[] = (record["scenes"] as unknown[])
        .filter((scene): scene is Record<string, unknown> => !!scene && typeof scene === "object")
        .map((scene, idx) => {
          const sceneId = typeof scene["id"] === "string" && scene["id"] ? scene["id"] : genSceneId(`scene${idx + 1}`);
          const sceneName =
            typeof scene["name"] === "string" && scene["name"].trim() ? scene["name"].slice(0, 40) : `씬 ${idx + 1}`;
          const sceneWidth =
            typeof scene["width"] === "number" && Number.isFinite(scene["width"]) ? (scene["width"] as number) : baseWidth;
          const sceneHeight =
            typeof scene["height"] === "number" && Number.isFinite(scene["height"]) ? (scene["height"] as number) : baseHeight;
          const nodes = Array.isArray(scene["nodes"]) ? (scene["nodes"] as CanvasNode[]) : [];
          return {
            id: sceneId,
            name: sceneName,
            width: sceneWidth,
            height: sceneHeight,
            nodes,
          };
        });

      const start =
        typeof record["startSceneId"] === "string" && record["startSceneId"]
          ? (record["startSceneId"] as string)
          : scenes[0]?.id ?? genSceneId();

      return {
        schema: "canvas_v2",
        startSceneId: scenes.some((s) => s.id === start) ? start : scenes[0]?.id ?? start,
        scenes: scenes.length
          ? scenes
          : [
              {
                id: start,
                name: "씬 1",
                width: baseWidth,
                height: baseHeight,
                nodes: Array.isArray(record["nodes"]) ? (record["nodes"] as CanvasNode[]) : [],
              },
            ],
      };
    }

    const nodes = record && Array.isArray(record["nodes"]) ? (record["nodes"] as CanvasNode[]) : [];
    const sid = genSceneId();
    return { schema: "canvas_v2", startSceneId: sid, scenes: [{ id: sid, name: "씬 1", width: baseWidth, height: baseHeight, nodes }] };
  }

  function getActiveScene(v2: ContentV2, sid: string | null) {
    const id = sid && v2.scenes.some((s) => s.id === sid) ? sid : v2.startSceneId;
    return v2.scenes.find((s) => s.id === id) ?? v2.scenes[0];
  }

  function extractPageId(data: unknown): string | null {
    const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const pageRecord = record["page"] && typeof record["page"] === "object" ? (record["page"] as Record<string, unknown>) : {};
    const candidates = [pageRecord["id"], record["pageId"], record["id"], pageRecord["pageId"]];
    const found = candidates.find((v): v is string => typeof v === "string" && v.length > 0);
    return found ?? null;
  }

  function extractError(data: unknown): string {
    if (!data || typeof data !== "object") return "Request failed.";
    const record = data as Record<string, unknown>;
    const msg = record["error"] ?? record["message"] ?? record["detail"];
    return typeof msg === "string" && msg ? msg : "Request failed.";
  }

  async function saveDraft(): Promise<string | null> {
    if (status !== "idle") return pageId;
    setStatus("saving");
    setMessage(null);

    // NOTE: comment removed (encoding issue).
    // NOTE: comment removed (encoding issue).
    const scenesLatest = scenes.map((s) =>
      s.id === (activeSceneId ?? s.id) ? { ...s, nodes: nodesRef.current } : s,
    );
    const fallbackSceneId = activeSceneId ?? startSceneId ?? "scene_1";
    const scenesForSave =
      scenesLatest.length > 0
        ? scenesLatest
        : [
            {
              id: fallbackSceneId,
              name: "씬 1",
              width: docMetaRef.current.width,
              height: docMetaRef.current.height,
              nodes: nodesRef.current,
            },
          ];
    const startPageId = activeSceneId ?? startSceneId ?? scenesForSave[0]?.id ?? "";

    const payload = {
      title: title.trim() ? title.trim() : null,
      content: {
        // NOTE: comment removed (encoding issue).
        schema: "null_canvas",
        startPageId,
        pages: scenesForSave.map((s) => ({
          id: s.id,
          name: s.name,
          viewport: {
            kind: s.width >= 800 ? "web" : s.width <= 420 ? "mobile" : "app",
            width: s.width,
            height: s.height,
          },
          nodes: s.nodes,
        })),
        state: {},
        stylePresets,
        styleTokens,
        components,
        layoutGroups,

        // Preserve width/height/nodes snapshot when duplicating the doc
        width: docMeta.width,
        height: docMeta.height,
        nodes: nodesRef.current,
      },
    };

    try {
      if (!pageId) {
        const res = await fetch("/api/pages", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setMessage(extractError(data));
          return null;
        }
        const createdId = extractPageId(data);
        if (!createdId) {
          setMessage("저장 실패: pageId가 없습니다.");
          return null;
        }
        setPageId(createdId);
        router.replace(`/editor?pageId=${createdId}`);
        setMessage("임시 저장 완료");
        return createdId;
      }

      const res = await fetch(`/api/pages/${pageId}/version`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(extractError(data));
        return null;
      }

      setMessage("버전 저장 완료");
      return pageId;
    } catch {
      setMessage("저장 실패");
      return null;
    } finally {
      setStatus("idle");
    }
  }

  function openPublishModal() {
    if (status !== "idle") return;
    setMessage(null);
    setShowPublishModal(true);
  }

  async function doPublish() {
    if (status !== "idle") return;
    setShowPublishModal(false);
    setMessage(null);

    try {
      const targetId = await saveDraft();
      if (!targetId) return;

      setStatus("publishing");

      const res = await fetch(`/api/pages/${targetId}/publish`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error ?? data?.message ?? "배포 실패");
        return;
      }

      const liveId = data?.page?.id ?? data?.pageId ?? targetId;
      router.push(`/p/${liveId}`);
    } catch {
      setMessage("배포 실패");
    } finally {
      setStatus("idle");
    }
  }

  function preview() {
    setShowPreview(true);
  }

  // NOTE: comment removed (encoding issue).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;

      const meta = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;

      // Esc
      if (e.key === "Escape") {
        if (showPreview) setShowPreview(false);
        else clearSelection();
        return;
      }

      // Save: Ctrl/Cmd+S
      if (meta && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void saveDraft();
        return;
      }

      // Publish: Ctrl/Cmd+Enter
      if (meta && e.key === "Enter") {
        e.preventDefault();
        openPublishModal();
        return;
      }

      // Undo/Redo
      if (meta && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (shift) redo();
        else undo();
        return;
      }
      if (meta && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
        return;
      }

      // Duplicate
      if (meta && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        duplicateSelected();
        return;
      }

      if (meta && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        const allIds = nodesRef.current.map((n) => n.id);
        if (allIds.length > 0) setSelectedIds(allIds);
        return;
      }

      // Copy: keep selected nodes in buffer
      if (meta && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        const ids = selectedIdsRef.current;
        if (ids.length > 0) {
          const buf = nodesRef.current.filter((n) => ids.includes(n.id));
          copyBufferRef.current = buf.length > 0 ? buf : null;
        }
        return;
      }

      // NOTE: comment removed (encoding issue).
      if (meta && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        const buf = copyBufferRef.current;
        if (!buf || buf.length === 0) return;
        const offset = gridSnapRef.current ? GRID_SIZE : 8;
        const newNodes = remapComponentInstances(buf.map((n) => ({
          ...n,
          id: genNodeId("node"),
          x: n.x + offset,
          y: n.y + offset,
        })));
        const next = [...nodesRef.current, ...newNodes];
        setPresent(next, true);
        setSelectedIds(newNodes.map((n) => n.id));
        setMessage("붙여넣기 완료");
        return;
      }

      // NOTE: comment removed (encoding issue).
      if (meta && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        const ids = selectedIdsRef.current;
        if (ids.length > 0) {
          const buf = nodesRef.current.filter((n) => ids.includes(n.id));
          if (buf.length > 0) {
            copyBufferRef.current = buf;
            deleteSelected();
            setMessage("잘라내기 완료");
          }
        }
        return;
      }

      // Layer
      if (meta && (e.key === "]" || e.key === "[")) {
        e.preventDefault();
        if (e.key === "]") {
          if (shift) bringToFront();
          else bringForward();
        } else {
          if (shift) sendToBack();
          else sendBackward();
        }
        return;
      }

      // Delete
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIdsRef.current.length > 0) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }

      // Arrow nudge
      const stepBase = gridSnapRef.current ? GRID_SIZE : 1;
      const step = shift ? stepBase * 10 : stepBase;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudgeSelected(-step, 0);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        nudgeSelected(step, 0);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        nudgeSelected(0, -step);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        nudgeSelected(0, step);
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreview, status, pageId, title, docMeta.width, docMeta.height]);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 text-sm">
          <div className="flex items-center gap-4">
            <span className="text-lg font-semibold">NULL</span>

            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="페이지 제목"
              aria-label="페이지 제목"
              className="w-56 rounded-[10px] border border-neutral-200 px-3 py-2 text-xs"
            />

            <div className="hidden items-center gap-2 text-xs text-neutral-600 md:flex">
              <button type="button" onClick={undo} disabled={!canUndo} className="rounded-full border px-3 py-1 disabled:opacity-40">
                실행 취소
              </button>
              <button type="button" onClick={redo} disabled={!canRedo} className="rounded-full border px-3 py-1 disabled:opacity-40">
                다시 실행
              </button>
              <button type="button" onClick={duplicateSelected} disabled={selectedCount === 0} className="rounded-full border px-3 py-1 disabled:opacity-40">
                복제
              </button>
              <button type="button" onClick={deleteSelected} disabled={selectedCount === 0} className="rounded-full border px-3 py-1 disabled:opacity-40">
                삭제
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setGridSnap((prev) => !prev)} className="rounded-full border px-3 py-2 text-xs">
              그리드: {gridSnap ? "켜짐" : "꺼짐"}
            </button>

            <div className="hidden items-center gap-2 md:flex">
              <button type="button" onClick={sendBackward} disabled={selectedCount === 0} className="rounded-full border px-3 py-2 text-xs disabled:opacity-40">
                뒤로
              </button>
              <button type="button" onClick={bringForward} disabled={selectedCount === 0} className="rounded-full border px-3 py-2 text-xs disabled:opacity-40">
                앞으로
              </button>
            </div>

            <button
              type="button"
              onClick={saveDraft}
              disabled={status !== "idle"}
              className="rounded-full border border-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-900 disabled:opacity-50"
              title="Ctrl/Cmd+S"
            >
              {status === "saving" ? "저장 중..." : "저장"}
            </button>

            <button
              type="button"
              onClick={openPublishModal}
              disabled={status !== "idle"}
              className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              title="Ctrl/Cmd+Enter"
            >
              {status === "publishing" ? "배포 중..." : "배포"}
            </button>

            <button type="button" onClick={preview} className="rounded-full border px-3 py-2 text-xs">
              미리보기
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[180px_minmax(0,1fr)_280px]">
        {/* 도구함 */}
        <aside className="rounded-[14px] border border-neutral-200 p-4 text-xs text-neutral-700">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">도구함</div>
          <div className="mt-2 text-[11px] text-neutral-600">
            제한: 버튼 {constraintCounts.buttonCount}/{features.maxButtons} · 텍스트 {constraintCounts.textCount}/{features.maxTexts} · 이미지{" "}
            {constraintCounts.imageCount}/{features.maxImages}
          </div>
          <div className="mt-4 rounded-[12px] border border-neutral-200 p-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-neutral-700">씬</div>
              <button
                type="button"
                onClick={addScene}
                className="rounded-full border border-neutral-200 px-2 py-1 text-[11px]"
              >
                + 추가
              </button>
            </div>

            <div className="mt-2 flex flex-col gap-1">
              {scenes.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center gap-2 rounded-[10px] border px-2 py-1 ${
                    s.id === activeSceneId ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 bg-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => switchScene(s.id)}
                    className="flex-1 truncate text-left text-[11px] text-neutral-900"
                    title={s.name}
                  >
                    {s.name}
                  </button>

                  <button
                    type="button"
                    onClick={() => duplicateScene(s.id)}
                    className="rounded-full border border-neutral-200 px-2 py-1 text-[10px]"
                    title="복제"
                  >
                    복제
                  </button>
                </div>
              ))}
            </div>

            {activeSceneId ? (
              <div className="mt-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">이름 변경</div>
                <input
                  type="text"
                  value={scenes.find((s) => s.id === activeSceneId)?.name ?? ""}
                  onChange={(e) => renameScene(activeSceneId, e.target.value)}
                  onBlur={() => {
                    if (!activeSceneId) return;
                    const idx = scenes.findIndex((s) => s.id === activeSceneId);
                    const cur = scenes.find((s) => s.id === activeSceneId);
                    if (!cur) return;
                    if (cur.name.trim().length === 0) {
                      const fallback = `씬 ${idx >= 0 ? idx + 1 : 1}`;
                      setScenes((prev) => prev.map((s) => (s.id === activeSceneId ? { ...s, name: fallback } : s)));
                      setMessage("씬 이름은 비워둘 수 없습니다.");
                    }
                  }}
                  className="mt-2 w-full rounded-[10px] border border-neutral-200 px-3 py-2 text-[11px]"
                  aria-label="씬 이름"
                />
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-col gap-4">
            {TOOLBOX_GROUPS.map((group) => (
              <div key={group.title}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">{group.title}</div>
                <div className="mt-2 flex flex-col gap-2">
                  {group.items.map((type) => {
                    const atLimit =
                      (type === "button" && constraintCounts.buttonCount >= features.maxButtons) ||
                      (type === "text" && constraintCounts.textCount >= features.maxTexts) ||
                      (type === "image" && constraintCounts.imageCount >= features.maxImages) ||
                      constraintCounts.totalElements >= features.maxElements;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => addNode(type)}
                        disabled={atLimit}
                        className="flex items-center justify-between rounded-[10px] border border-neutral-200 px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {NODE_TYPE_LABELS[type] ?? type}
                        <span className="text-[10px] text-neutral-400">+</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {components.length > 0 ? (
            <div className="mt-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">컴포넌트</div>
              <div className="mt-2 flex flex-col gap-2">
                {components.map((component) => (
                  <div key={component.id} className="rounded-[10px] border border-neutral-200 p-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={component.name}
                        onChange={(e) =>
                          setComponents((prev) =>
                            prev.map((c) => (c.id === component.id ? { ...c, name: e.target.value } : c)),
                          )
                        }
                        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() => insertComponent(component.id)}
                        className="rounded-full border px-2 py-1 text-[10px]"
                      >
                        추가
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteComponent(component.id)}
                        className="rounded-full border px-2 py-1 text-[10px]"
                      >
                        삭제
                      </button>
                    </div>
                    {component.variants.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {component.variants.map((variant) => (
                          <button
                            key={variant.id}
                            type="button"
                            onClick={() => insertComponent(component.id, variant.id)}
                            className="rounded-full border px-2 py-1 text-[10px]"
                          >
                            {variant.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 레이어 목록: 표시/잠금/이름 */}
          {nodes.length > 0 ? (
            <div className="mt-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">레이어</div>
              <ul className="mt-2 flex flex-col gap-0.5">
                {[...nodes].reverse().map((node) => {
                  const isSelected = selectedSet.has(node.id);
                  const name = String((node.props as Record<string, unknown>)?.layerName ?? NODE_TYPE_LABELS[node.type] ?? node.type);
                  const isEditing = editingLayerId === node.id;
                  return (
                    <li
                      key={node.id}
                      className={`flex items-center gap-1 rounded-[8px] border px-2 py-1 text-[11px] ${
                        isSelected ? "border-neutral-900 bg-neutral-100" : "border-transparent hover:bg-neutral-50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setNodeHidden(node.id, !node.hidden)}
                        className="shrink-0 rounded p-0.5 hover:bg-neutral-200"
                        title={node.hidden ? "표시" : "숨김"}
                        aria-label={node.hidden ? "표시" : "숨김"}
                      >
                        {node.hidden ? (
                          <span className="text-neutral-400">H</span>
                        ) : (
                          <span className="text-neutral-600">V</span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNodeLocked(node.id, !node.locked)}
                        className="shrink-0 rounded p-0.5 hover:bg-neutral-200"
                        title={node.locked ? "잠금 해제" : "잠금"}
                        aria-label={node.locked ? "잠금 해제" : "잠금"}
                      >
                        {node.locked ? (
                          <span className="text-neutral-600">L</span>
                        ) : (
                          <span className="text-neutral-400">U</span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left"
                        onClick={() => setSingleSelect(node.id)}
                        onDoubleClick={() => setEditingLayerId(node.id)}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            value={name}
                            autoFocus
                            className="w-full rounded border border-neutral-300 px-1 py-0.5 text-[11px]"
                            onChange={(e) => updateNodeProps(node.id, { layerName: e.target.value })}
                            onBlur={() => setEditingLayerId(null)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") setEditingLayerId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="block truncate">{name || node.type}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="mt-6 rounded-[12px] bg-neutral-50 p-3 text-[11px] text-neutral-600">
            <div className="font-semibold text-neutral-700">단축키</div>
            <div className="mt-2 space-y-1">
              <div>Ctrl/Cmd+A: 모두 선택 | Esc: 선택 해제</div>
              <div>Shift+클릭: 다중 선택 | 드래그: 박스 선택</div>
              <div>Ctrl/Cmd+C/V/X: 복사/붙여넣기/잘라내기</div>
              <div>Del/Backspace: 삭제 | Ctrl/Cmd+D: 복제</div>
              <div>Ctrl/Cmd+Z / Shift+Z: 실행 취소/다시 실행</div>
              <div>방향키: 미세 이동 (Shift: 10px)</div>
              <div>Ctrl/Cmd+[ ]: 레이어 순서 (Shift: 맨앞/맨뒤)</div>
              <div>Ctrl/Cmd+S: 저장 | Ctrl/Cmd+Enter: 배포</div>
              <div>속성: X,Y,W,H | 회전 | 투명도 | 캔버스 W,H</div>
              <div>스마트 가이드: 오브젝트/캔버스 기준 자동 정렬 스냅</div>
              <div>Space+드래그: 패닝 | Ctrl+휠: 줌</div>
            </div>
          </div>
        </aside>

        {/* Canvas */}
        <section className="flex min-w-0 flex-col items-center gap-4">
          {message ? (
            <div className="w-full text-right text-[11px] text-red-500" role="status" aria-live="polite">
              {message}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setZoom((z) => ZOOM_STEPS[Math.max(0, ZOOM_STEPS.indexOf(z) - 1)] ?? z)}
              className="rounded-full border px-3 py-1"
              title="축소"
            >
              -
            </button>
            <button type="button" onClick={() => setZoom(1)} className="rounded-full border px-3 py-1" title="100%">
              100%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS.indexOf(z) + 1)] ?? z)}
              className="rounded-full border px-3 py-1"
              title="확대"
            >
              +
            </button>
            <span className="text-neutral-500">{Math.round(zoom * 100)}%</span>
          </div>
          <div
            className="w-full max-w-full overflow-auto rounded-[16px] border border-neutral-200 bg-neutral-50 p-6"
            style={{ maxHeight: "70vh" }}
            onWheel={(e) => {
              if (!e.ctrlKey) return;
              e.preventDefault();
              if (e.deltaY < 0) setZoom((z) => ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS.indexOf(z) + 1)] ?? z);
              else setZoom((z) => ZOOM_STEPS[Math.max(0, ZOOM_STEPS.indexOf(z) - 1)] ?? z);
            }}
          >
            <div
              style={{ width: docMeta.width * zoom + 400, height: docMeta.height * zoom + 400, transform: `translate(${pan.x}px, ${pan.y}px)` }}
            >
              <div
                ref={canvasRef}
                className="relative"
                style={{
                  width: docMeta.width,
                  height: docMeta.height,
                  transform: `scale(${zoom})`,
                  transformOrigin: "0 0",
                }}
                onPointerDown={(e) => {
                  if ((e as { shiftKey?: boolean }).shiftKey) return;
                  const el = canvasRef.current;
                  if (!el) return;
                  const rect = el.getBoundingClientRect();
                  const canvasX = (e.clientX - rect.left) / zoom;
                  const canvasY = (e.clientY - rect.top) / zoom;
                  if (spaceKeyRef.current) {
                    panStartRef.current = { clientX: e.clientX, clientY: e.clientY, panX: pan.x, panY: pan.y };
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    return;
                  }
                  setBoxSelect({ startX: canvasX, startY: canvasY, currentX: canvasX, currentY: canvasY });
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (panStartRef.current) {
                    setPan({
                      x: panStartRef.current.panX + e.clientX - panStartRef.current.clientX,
                      y: panStartRef.current.panY + e.clientY - panStartRef.current.clientY,
                    });
                    return;
                  }
                  if (!boxSelect) return;
                  const el = canvasRef.current;
                  if (!el) return;
                  const rect = el.getBoundingClientRect();
                  const x = (e.clientX - rect.left) / zoom;
                  const y = (e.clientY - rect.top) / zoom;
                  setBoxSelect((prev) =>
                    prev ? { ...prev, currentX: x, currentY: y } : null,
                  );
                }}
              onPointerUp={(e) => {
                if (panStartRef.current) {
                  panStartRef.current = null;
                  try {
                    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                  } catch {}
                  return;
                }
                if (!boxSelect) return;
                const nodesList = nodesRef.current;
                const minX = Math.min(boxSelect.startX, boxSelect.currentX);
                const maxX = Math.max(boxSelect.startX, boxSelect.currentX);
                const minY = Math.min(boxSelect.startY, boxSelect.currentY);
                const maxY = Math.max(boxSelect.startY, boxSelect.currentY);
                const isClick = maxX - minX < 5 && maxY - minY < 5;
                const ids = isClick
                  ? []
                  : nodesList
                      .filter(
                        (n) =>
                          n.x < maxX &&
                          n.x + n.w > minX &&
                          n.y < maxY &&
                          n.y + n.h > minY,
                      )
                      .map((n) => n.id);
                setSelectedIds(ids);
                setBoxSelect(null);
                try {
                  (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                } catch {}
              }}
              onPointerCancel={(e) => {
                panStartRef.current = null;
                if (boxSelect) {
                  setBoxSelect(null);
                }
                try {
                  (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                } catch {}
              }}
            >
              {/* Render content */}
              <div className="pointer-events-none">
                <CanvasRender doc={docMeta} showGrid={gridSnap} className="shadow-none" />
              </div>

              {/* Guides */}
              {guides.map((g, idx) =>
                g.kind === "v" ? (
                  <div
                    key={`g-v-${idx}-${g.x}`}
                    className="pointer-events-none absolute top-0 z-30 h-full w-px bg-neutral-900/40"
                    style={{ left: g.x }}
                  />
                ) : (
                  <div
                    key={`g-h-${idx}-${g.y}`}
                    className="pointer-events-none absolute left-0 z-30 w-full h-px bg-neutral-900/40"
                    style={{ top: g.y }}
                  />
                ),
              )}

              {/* NOTE: comment removed (encoding issue). */}
              {boxSelect ? (
                <div
                  className="pointer-events-none absolute z-10 border-2 border-neutral-900/60 bg-neutral-900/10"
                  style={{
                    left: Math.min(boxSelect.startX, boxSelect.currentX),
                    top: Math.min(boxSelect.startY, boxSelect.currentY),
                    width: Math.abs(boxSelect.currentX - boxSelect.startX),
                    height: Math.abs(boxSelect.currentY - boxSelect.startY),
                  }}
                />
              ) : null}

              {/* Selection overlays */}
              {nodes.map((node) => {
                const isSelected = selectedSet.has(node.id);
                const showHandles = isSelected && selectedCount === 1;
                return (
                  <div
                    key={node.id}
                    role="presentation"
                    className={`absolute z-20 border ${
                      isSelected ? "border-neutral-900" : "border-transparent"
                    }`}
                    style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
                    onPointerDown={(event) => {
                      event.stopPropagation();

                      // Preview: run basic actions when preview mode is enabled.
                      if (showPreview && (node.type === "button" || node.type === "link")) {
                        const props = node.props as Record<string, unknown>;
                        if (node.type === "link") {
                          const href = String(props.href ?? "");
                          if (href.trim()) window.open(href.trim(), "_blank", "noopener,noreferrer");
                          return;
                        }
                        const kind = String(props.actionKind ?? "none");
                        if (kind === "url") {
                          const href = String(props.href ?? "");
                          if (href.trim()) window.open(href.trim(), "_blank", "noopener,noreferrer");
                          return;
                        }
                        if (kind === "scene") {
                          const sid = String(props.sceneId ?? "");
                          if (sid) switchScene(sid);
                          return;
                        }
                        // actionKind === "none": no preview action
                        return;
                      }


                      const shift = (event as { shiftKey?: boolean }).shiftKey === true;
                      if (shift) {
                        toggleSelect(node.id);
                        // Shift + click toggles selection and keeps a stable set
                        const nextSel = selectedIdsRef.current.includes(node.id)
                          ? selectedIdsRef.current.filter((x) => x !== node.id)
                          : [...selectedIdsRef.current, node.id];
                        const stable = nextSel.length ? nextSel : [node.id];
                        // Avoid empty selection to keep drag behavior stable
                        setSelectedIds(stable);
                        startMoveDrag(event, node.id);
                        return;
                      }

                      // Single click: select then drag
                      if (!selectedIdsRef.current.includes(node.id) || selectedIdsRef.current.length !== 1) {
                        setSingleSelect(node.id);
                      }
                      startMoveDrag(event, node.id);
                    }}
                  >
                    {showHandles ? (
                      <>
                        {(["nw", "ne", "sw", "se"] as const).map((handle) => (
                          <span
                            key={handle}
                            role="presentation"
                            className="absolute h-2 w-2 rounded-full bg-neutral-900"
                            style={{
                              left: handle.includes("w") ? -4 : "auto",
                              right: handle.includes("e") ? -4 : "auto",
                              top: handle.includes("n") ? -4 : "auto",
                              bottom: handle.includes("s") ? -4 : "auto",
                            }}
                            onPointerDown={(event) => startResize(event, node.id, handle)}
                          />
                        ))}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        </section>

        {/* 속성 */}
        <aside className="rounded-[14px] border border-neutral-200 p-4 text-xs text-neutral-600">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">속성</div>

          {/* Multi select */}
          {selectedCount > 1 ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-[12px] bg-neutral-50 p-3">
                <div className="text-xs font-semibold text-neutral-800">{selectedCount}개 선택됨</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={bringToFront} className="rounded-full border px-3 py-1 text-[11px]">
                    맨 앞으로
                  </button>
                  <button type="button" onClick={sendToBack} className="rounded-full border px-3 py-1 text-[11px]">
                    맨 뒤로
                  </button>
                  <button type="button" onClick={bringForward} className="rounded-full border px-3 py-1 text-[11px]">
                    앞으로
                  </button>
                  <button type="button" onClick={sendBackward} className="rounded-full border px-3 py-1 text-[11px]">
                    뒤로
                  </button>
                  <button type="button" onClick={duplicateSelected} className="rounded-full border px-3 py-1 text-[11px]">
                    복제
                  </button>
                  <button type="button" onClick={deleteSelected} className="rounded-full border px-3 py-1 text-[11px]">
                    삭제
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 border-t border-neutral-200 pt-2">
                  <span className="w-full text-[10px] text-neutral-500">정렬</span>
                  <button
                    type="button"
                    onClick={() => alignSelected("left", null)}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    title="왼쪽 정렬"
                  >
                    왼쪽
                  </button>
                  <button
                    type="button"
                    onClick={() => alignSelected("center", null)}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    title="가운데 정렬"
                  >
                    가운데
                  </button>
                  <button
                    type="button"
                    onClick={() => alignSelected("right", null)}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    title="오른쪽 정렬"
                  >
                    오른쪽
                  </button>
                  <button
                    type="button"
                    onClick={() => alignSelected(null, "top")}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    title="위쪽 정렬"
                  >
                    위
                  </button>
                  <button
                    type="button"
                    onClick={() => alignSelected(null, "middle")}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    title="가운데 정렬"
                  >
                    가운데
                  </button>
                  <button
                    type="button"
                    onClick={() => alignSelected(null, "bottom")}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    title="아래쪽 정렬"
                  >
                    아래
                  </button>
                  <button
                    type="button"
                    onClick={() => distributeSelected("horizontal")}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    title="가로 분배"
                  >
                    가로 분배
                  </button>
                  <button
                    type="button"
                    onClick={() => distributeSelected("vertical")}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    title="세로 분배"
                  >
                    세로 분배
                  </button>
                  <span className="w-full text-[10px] text-neutral-500">캔버스 정렬</span>
                  <button
                    type="button"
                    onClick={() => alignToCanvas("left", null)}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    title="캔버스 왼쪽"
                  >
                    왼쪽
                  </button>
                  <button
                    type="button"
                    onClick={() => alignToCanvas("center", null)}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    title="캔버스 가로 가운데"
                  >
                    가운데
                  </button>
                  <button
                    type="button"
                    onClick={() => alignToCanvas("right", null)}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    title="캔버스 오른쪽"
                  >
                    오른쪽
                  </button>
                  <button
                    type="button"
                    onClick={() => alignToCanvas(null, "top")}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    title="캔버스 위쪽"
                  >
                    위
                  </button>
                  <button
                    type="button"
                    onClick={() => alignToCanvas(null, "middle")}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    title="캔버스 세로 가운데"
                  >
                    가운데
                  </button>
                  <button
                    type="button"
                    onClick={() => alignToCanvas(null, "bottom")}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    title="캔버스 아래쪽"
                  >
                    아래
                  </button>
                  <span className="w-full text-[10px] text-neutral-500">크기 맞춤</span>
                  <button
                    type="button"
                    onClick={() => matchSelectedSize("width")}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    title="너비 맞춤"
                  >
                    너비
                  </button>
                  <button
                    type="button"
                    onClick={() => matchSelectedSize("height")}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    title="높이 맞춤"
                  >
                    높이
                  </button>
                  <button
                    type="button"
                    onClick={() => matchSelectedSize("both")}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    title="가로·세로 맞춤"
                  >
                    둘 다
                  </button>
                </div>
              </div>

              <div className="rounded-[12px] bg-neutral-50 p-3 text-[11px] text-neutral-600">
                <div className="font-semibold text-neutral-700">이동</div>
                <div className="mt-2">화살표 키로 이동, Shift = 10px, 그리드 스냅 = 8px.</div>
              </div>
            </div>
          ) : null}

          {/* Single select */}
          {selectedNode ? (
            <div className="mt-4 flex flex-col gap-3">
              {/* NOTE: comment removed (encoding issue). */}
              <div className="rounded-[12px] bg-neutral-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">변형</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <PropertyField label="X" value={selectedNode.x} onChange={(v) => updateNode(selectedNode.id, { x: v })} />
                  <PropertyField label="Y" value={selectedNode.y} onChange={(v) => updateNode(selectedNode.id, { y: v })} />
                  <PropertyField label="W" value={selectedNode.w} onChange={(v) => updateNode(selectedNode.id, { w: v })} />
                  <PropertyField label="H" value={selectedNode.h} onChange={(v) => updateNode(selectedNode.id, { h: v })} />
                  <PropertyField label="회전" value={typeof selectedNode.rotation === "number" ? selectedNode.rotation : 0} onChange={(v) => updateNode(selectedNode.id, { rotation: v })} />
                  <PropertyField label="투명도" value={typeof selectedNode.opacity === "number" ? selectedNode.opacity : 1} onChange={(v) => updateNode(selectedNode.id, { opacity: Math.max(0, Math.min(1, Number(v))) })} />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={sendBackward} className="rounded-full border px-3 py-1 text-[11px]">
                    뒤로
                  </button>
                  <button type="button" onClick={bringForward} className="rounded-full border px-3 py-1 text-[11px]">
                    앞으로
                  </button>
                  <button type="button" onClick={duplicateSelected} className="rounded-full border px-3 py-1 text-[11px]">
                    복제
                  </button>
                  <button type="button" onClick={deleteSelected} className="rounded-full border px-3 py-1 text-[11px]">
                    삭제
                  </button>
                  <button type="button" onClick={() => rotateSelected(-90)} className="rounded-full border px-3 py-1 text-[11px]">
                    90° 왼쪽
                  </button>
                  <button type="button" onClick={() => rotateSelected(90)} className="rounded-full border px-3 py-1 text-[11px]">
                    90° 오른쪽
                  </button>
                </div>
              </div>

              <div className="rounded-[12px] bg-neutral-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">제약</div>
                <div className="mt-3 space-y-2 text-[10px] text-neutral-600">
                  <div className="font-semibold text-neutral-700">가로</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toggleConstraintExclusive(selectedNode.id, "pinLeft", ["centerX", "scaleX"])}
                      className={`rounded-full border px-2 py-1 ${selectedNode.constraints?.pinLeft ? "bg-neutral-900 text-white" : ""}`}
                    >
                      왼쪽
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleConstraintExclusive(selectedNode.id, "centerX", ["pinLeft", "pinRight", "scaleX"])}
                      className={`rounded-full border px-2 py-1 ${selectedNode.constraints?.centerX ? "bg-neutral-900 text-white" : ""}`}
                    >
                      가운데
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleConstraintExclusive(selectedNode.id, "pinRight", ["centerX", "scaleX"])}
                      className={`rounded-full border px-2 py-1 ${selectedNode.constraints?.pinRight ? "bg-neutral-900 text-white" : ""}`}
                    >
                      오른쪽
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleConstraintExclusive(selectedNode.id, "scaleX", ["pinLeft", "pinRight", "centerX"])}
                      className={`rounded-full border px-2 py-1 ${selectedNode.constraints?.scaleX ? "bg-neutral-900 text-white" : ""}`}
                    >
                      스케일
                    </button>
                    <button
                      type="button"
                      onClick={() => updateConstraint(selectedNode.id, { pinLeft: true, pinRight: true, centerX: false, scaleX: false })}
                      className={`rounded-full border px-2 py-1 ${
                        selectedNode.constraints?.pinLeft && selectedNode.constraints?.pinRight ? "bg-neutral-900 text-white" : ""
                      }`}
                    >
                      좌우 고정
                    </button>
                  </div>
                  <div className="font-semibold text-neutral-700">세로</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toggleConstraintExclusive(selectedNode.id, "pinTop", ["centerY", "scaleY"])}
                      className={`rounded-full border px-2 py-1 ${selectedNode.constraints?.pinTop ? "bg-neutral-900 text-white" : ""}`}
                    >
                      위
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleConstraintExclusive(selectedNode.id, "centerY", ["pinTop", "pinBottom", "scaleY"])}
                      className={`rounded-full border px-2 py-1 ${selectedNode.constraints?.centerY ? "bg-neutral-900 text-white" : ""}`}
                    >
                      가운데
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleConstraintExclusive(selectedNode.id, "pinBottom", ["centerY", "scaleY"])}
                      className={`rounded-full border px-2 py-1 ${selectedNode.constraints?.pinBottom ? "bg-neutral-900 text-white" : ""}`}
                    >
                      아래
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleConstraintExclusive(selectedNode.id, "scaleY", ["pinTop", "pinBottom", "centerY"])}
                      className={`rounded-full border px-2 py-1 ${selectedNode.constraints?.scaleY ? "bg-neutral-900 text-white" : ""}`}
                    >
                      스케일
                    </button>
                    <button
                      type="button"
                      onClick={() => updateConstraint(selectedNode.id, { pinTop: true, pinBottom: true, centerY: false, scaleY: false })}
                      className={`rounded-full border px-2 py-1 ${
                        selectedNode.constraints?.pinTop && selectedNode.constraints?.pinBottom ? "bg-neutral-900 text-white" : ""
                      }`}
                    >
                      상하 고정
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-[12px] bg-neutral-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">효과</div>
                <div className="mt-3 space-y-3">
                  <TextField
                    label="그림자"
                    value={String(selectedNode.props.shadow ?? "")}
                    onChange={(value) => updateNodeProps(selectedNode.id, { shadow: value })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <PropertyField
                      label="블러(px)"
                      value={Number(selectedNode.props.blur ?? 0)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { blur: Math.max(0, Number(value)) })}
                    />
                    <SelectField
                      label="블렌드"
                      value={String(selectedNode.props.blendMode ?? "normal")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { blendMode: value })}
                      options={BLEND_MODE_OPTIONS}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <PropertyField
                      label="밝기(%)"
                      value={Number(selectedNode.props.filterBrightness ?? 100)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { filterBrightness: Number(value) })}
                    />
                    <PropertyField
                      label="대비(%)"
                      value={Number(selectedNode.props.filterContrast ?? 100)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { filterContrast: Number(value) })}
                    />
                    <PropertyField
                      label="채도(%)"
                      value={Number(selectedNode.props.filterSaturate ?? 100)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { filterSaturate: Number(value) })}
                    />
                    <PropertyField
                      label="색상 회전(°)"
                      value={Number(selectedNode.props.filterHue ?? 0)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { filterHue: Number(value) })}
                    />
                    <PropertyField
                      label="흑백(%)"
                      value={Number(selectedNode.props.filterGrayscale ?? 0)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { filterGrayscale: Number(value) })}
                    />
                  </div>
                  <div className="text-[10px] text-neutral-400">예시: 0 12px 30px rgba(0,0,0,0.15)</div>
                </div>
              </div>

              <div className="rounded-[12px] bg-neutral-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">스타일</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={copyStyleFromSelection} className="rounded-full border px-3 py-1 text-[11px]">
                    스타일 복사
                  </button>
                  <button type="button" onClick={pasteStyleToSelection} className="rounded-full border px-3 py-1 text-[11px]">
                    스타일 붙여넣기
                  </button>
                  <button type="button" onClick={saveStylePreset} className="rounded-full border px-3 py-1 text-[11px]">
                    프리셋 저장
                  </button>
                </div>
                <div className="mt-3">
                  <TextField label="프리셋 이름" value={presetName} onChange={(value) => setPresetName(value)} />
                </div>
                <div className="mt-3 space-y-2">
                  {stylePresets.length === 0 ? (
                    <div className="text-[10px] text-neutral-400">저장된 프리셋이 없습니다.</div>
                  ) : (
                    stylePresets.map((preset) => (
                      <div key={preset.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={preset.name}
                          onChange={(e) =>
                            setStylePresets((prev) =>
                              prev.map((p) => (p.id === preset.id ? { ...p, name: e.target.value } : p)),
                            )
                          }
                          className="flex-1 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                        />
                        <button
                          type="button"
                          onClick={() => applyStyleToSelection(preset.props)}
                          className="rounded-full border px-2 py-1 text-[10px]"
                        >
                          적용
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteStylePreset(preset.id)}
                          className="rounded-full border px-2 py-1 text-[10px]"
                        >
                          삭제
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[12px] bg-neutral-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">스타일 토큰</div>
                <div className="mt-3 space-y-4">
                  <div>
                    <div className="text-[10px] font-semibold text-neutral-500">색상</div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={colorTokenDraft.name}
                        onChange={(e) => setColorTokenDraft((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="이름"
                        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                      />
                      <input
                        type="color"
                        value={colorTokenDraft.value}
                        onChange={(e) => setColorTokenDraft((prev) => ({ ...prev, value: e.target.value }))}
                        className="h-7 w-9 rounded border border-neutral-200 bg-white"
                      />
                      <button type="button" onClick={addColorToken} className="rounded-full border px-2 py-1 text-[10px]">
                        추가
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {styleTokens.colors.length === 0 ? (
                        <div className="text-[10px] text-neutral-400">등록된 색상이 없습니다.</div>
                      ) : (
                        styleTokens.colors.map((token) => (
                          <div key={token.id} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={token.name}
                              onChange={(e) => updateTokenName("colors", token.id, e.target.value)}
                              className="w-20 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                            />
                            <input
                              type="color"
                              value={token.value}
                              onChange={(e) => updateTokenValue("colors", token.id, e.target.value)}
                              className="h-7 w-9 rounded border border-neutral-200 bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => applyStyleToSelection({ fill: token.value })}
                              className="rounded-full border px-2 py-1 text-[10px]"
                            >
                              채우기
                            </button>
                            <button
                              type="button"
                              onClick={() => applyStyleToSelection({ borderColor: token.value })}
                              className="rounded-full border px-2 py-1 text-[10px]"
                            >
                              테두리
                            </button>
                            <button
                              type="button"
                              onClick={() => applyStyleToSelection({ color: token.value })}
                              className="rounded-full border px-2 py-1 text-[10px]"
                            >
                              텍스트
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteToken("colors", token.id)}
                              className="rounded-full border px-2 py-1 text-[10px]"
                            >
                              삭제
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-semibold text-neutral-500">모서리</div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={radiusTokenDraft.name}
                        onChange={(e) => setRadiusTokenDraft((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="이름"
                        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                      />
                      <input
                        type="number"
                        value={radiusTokenDraft.value}
                        onChange={(e) => setRadiusTokenDraft((prev) => ({ ...prev, value: Number(e.target.value) }))}
                        className="w-20 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                      />
                      <button type="button" onClick={addRadiusToken} className="rounded-full border px-2 py-1 text-[10px]">
                        추가
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {styleTokens.radii.length === 0 ? (
                        <div className="text-[10px] text-neutral-400">등록된 모서리가 없습니다.</div>
                      ) : (
                        styleTokens.radii.map((token) => (
                          <div key={token.id} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={token.name}
                              onChange={(e) => updateTokenName("radii", token.id, e.target.value)}
                              className="w-20 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                            />
                            <input
                              type="number"
                              value={token.value}
                              onChange={(e) => updateTokenValue("radii", token.id, Number(e.target.value))}
                              className="w-20 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                            />
                            <button
                              type="button"
                              onClick={() => applyStyleToSelection({ radius: token.value })}
                              className="rounded-full border px-2 py-1 text-[10px]"
                            >
                              적용
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteToken("radii", token.id)}
                              className="rounded-full border px-2 py-1 text-[10px]"
                            >
                              삭제
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-semibold text-neutral-500">텍스트 크기</div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={textSizeTokenDraft.name}
                        onChange={(e) => setTextSizeTokenDraft((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="이름"
                        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                      />
                      <input
                        type="number"
                        value={textSizeTokenDraft.value}
                        onChange={(e) => setTextSizeTokenDraft((prev) => ({ ...prev, value: Number(e.target.value) }))}
                        className="w-20 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                      />
                      <button type="button" onClick={addTextSizeToken} className="rounded-full border px-2 py-1 text-[10px]">
                        추가
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {styleTokens.textSizes.length === 0 ? (
                        <div className="text-[10px] text-neutral-400">등록된 크기가 없습니다.</div>
                      ) : (
                        styleTokens.textSizes.map((token) => (
                          <div key={token.id} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={token.name}
                              onChange={(e) => updateTokenName("textSizes", token.id, e.target.value)}
                              className="w-20 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                            />
                            <input
                              type="number"
                              value={token.value}
                              onChange={(e) => updateTokenValue("textSizes", token.id, Number(e.target.value))}
                              className="w-20 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                            />
                            <button
                              type="button"
                              onClick={() => applyStyleToSelection({ fontSize: token.value })}
                              className="rounded-full border px-2 py-1 text-[10px]"
                            >
                              적용
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteToken("textSizes", token.id)}
                              className="rounded-full border px-2 py-1 text-[10px]"
                            >
                              삭제
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-semibold text-neutral-500">그림자</div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={shadowTokenDraft.name}
                        onChange={(e) => setShadowTokenDraft((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="이름"
                        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                      />
                      <input
                        type="text"
                        value={shadowTokenDraft.value}
                        onChange={(e) => setShadowTokenDraft((prev) => ({ ...prev, value: e.target.value }))}
                        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                      />
                      <button type="button" onClick={addShadowToken} className="rounded-full border px-2 py-1 text-[10px]">
                        추가
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {styleTokens.shadows.length === 0 ? (
                        <div className="text-[10px] text-neutral-400">등록된 그림자가 없습니다.</div>
                      ) : (
                        styleTokens.shadows.map((token) => (
                          <div key={token.id} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={token.name}
                              onChange={(e) => updateTokenName("shadows", token.id, e.target.value)}
                              className="w-20 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                            />
                            <input
                              type="text"
                              value={token.value}
                              onChange={(e) => updateTokenValue("shadows", token.id, e.target.value)}
                              className="flex-1 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                            />
                            <button
                              type="button"
                              onClick={() => applyStyleToSelection({ shadow: token.value })}
                              className="rounded-full border px-2 py-1 text-[10px]"
                            >
                              적용
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteToken("shadows", token.id)}
                              className="rounded-full border px-2 py-1 text-[10px]"
                            >
                              삭제
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-semibold text-neutral-500">글꼴</div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={fontTokenDraft.name}
                        onChange={(e) => setFontTokenDraft((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="이름"
                        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                      />
                      <input
                        type="text"
                        value={fontTokenDraft.value}
                        onChange={(e) => setFontTokenDraft((prev) => ({ ...prev, value: e.target.value }))}
                        placeholder="예: Pretendard"
                        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                      />
                      <button type="button" onClick={addFontToken} className="rounded-full border px-2 py-1 text-[10px]">
                        추가
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {styleTokens.fonts.length === 0 ? (
                        <div className="text-[10px] text-neutral-400">등록된 글꼴이 없습니다.</div>
                      ) : (
                        styleTokens.fonts.map((token) => (
                          <div key={token.id} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={token.name}
                              onChange={(e) => updateTokenName("fonts", token.id, e.target.value)}
                              className="w-20 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                            />
                            <input
                              type="text"
                              value={token.value}
                              onChange={(e) => updateTokenValue("fonts", token.id, e.target.value)}
                              className="flex-1 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                            />
                            <button
                              type="button"
                              onClick={() => applyStyleToSelection({ fontFamily: token.value })}
                              className="rounded-full border px-2 py-1 text-[10px]"
                            >
                              적용
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteToken("fonts", token.id)}
                              className="rounded-full border px-2 py-1 text-[10px]"
                            >
                              삭제
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[12px] bg-neutral-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">컴포넌트</div>
                <div className="mt-3 space-y-3">
                  <div>
                    <div className="text-[10px] font-semibold text-neutral-500">선택에서 생성</div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={componentNameDraft}
                        onChange={(e) => setComponentNameDraft(e.target.value)}
                        placeholder="컴포넌트 이름"
                        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={createComponentFromSelection}
                        className="rounded-full border px-2 py-1 text-[10px]"
                      >
                        생성
                      </button>
                    </div>
                  </div>

                  {activeComponent ? (
                    <div className="rounded-[10px] border border-neutral-200 bg-white p-2">
                      <div className="text-[10px] font-semibold text-neutral-500">선택 컴포넌트</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={activeComponent.name}
                          onChange={(e) =>
                            setComponents((prev) =>
                              prev.map((c) => (c.id === activeComponent.id ? { ...c, name: e.target.value } : c)),
                            )
                          }
                          className="flex-1 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                        />
                        <button
                          type="button"
                          onClick={() => updateComponentFromSelection(activeComponent.id, selectionVariantId ?? undefined)}
                          className="rounded-full border px-2 py-1 text-[10px]"
                        >
                          업데이트
                        </button>
                        {selectionInstanceId ? (
                          <button
                            type="button"
                            onClick={() => detachComponentInstance(selectionInstanceId)}
                            className="rounded-full border px-2 py-1 text-[10px]"
                          >
                            분리
                          </button>
                        ) : null}
                        {selectionInstanceId ? (
                          <button
                            type="button"
                            onClick={() => resetInstanceOverrides(activeComponent.id, selectionVariantId ?? null, selectionInstanceId)}
                            className="rounded-full border px-2 py-1 text-[10px]"
                          >
                            오버라이드 초기화
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 text-[10px] text-neutral-400">
                        {selectionInstanceId ? `인스턴스: ${selectionInstanceId}` : "인스턴스가 아닙니다."}
                        {selectionVariantId
                          ? ` / 변형: ${activeComponent.variants.find((v) => v.id === selectionVariantId)?.name ?? "알 수 없음"}`
                          : " / 기본"}
                      </div>
                      {selectionInstanceId ? (
                        <div className="mt-3">
                          <div className="text-[10px] font-semibold text-neutral-500">변형 적용</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => applyVariantToInstance(activeComponent.id, null, selectionInstanceId)}
                              className={`rounded-full border px-2 py-1 text-[10px] ${
                                !selectionVariantId ? "bg-neutral-900 text-white" : ""
                              }`}
                            >
                              기본
                            </button>
                            {activeComponent.variants.map((variant) => (
                              <button
                                key={variant.id}
                                type="button"
                                onClick={() => applyVariantToInstance(activeComponent.id, variant.id, selectionInstanceId)}
                                className={`rounded-full border px-2 py-1 text-[10px] ${
                                  selectionVariantId === variant.id ? "bg-neutral-900 text-white" : ""
                                }`}
                              >
                                {variant.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {selectionInstanceId ? (
                        <div className="mt-3 rounded-[10px] border border-neutral-200 bg-white p-2">
                          <div className="text-[10px] font-semibold text-neutral-500">오버라이드</div>
                          {instanceOverrideSummary.length === 0 ? (
                            <div className="mt-2 text-[10px] text-neutral-400">변경된 오버라이드가 없습니다.</div>
                          ) : (
                            <div className="mt-2 space-y-2">
                              {instanceOverrideSummary.map((entry) => (
                                <div key={entry.nodeId} className="rounded border border-neutral-100 bg-neutral-50 p-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-[11px] font-medium text-neutral-700">{entry.label}</div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        resetInstanceNodeOverrides(
                                          activeComponent.id,
                                          selectionVariantId ?? null,
                                          selectionInstanceId,
                                          entry.nodeId,
                                        )
                                      }
                                      className="rounded-full border px-2 py-1 text-[10px]"
                                    >
                                      노드 초기화
                                    </button>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {entry.keys.map((key) => (
                                      <span key={key} className="rounded-full bg-white px-2 py-0.5 text-[10px] text-neutral-500">
                                        {key}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}

                      <div className="mt-3">
                        <div className="text-[10px] font-semibold text-neutral-500">변형 생성</div>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="text"
                            value={variantNameDraft}
                            onChange={(e) => setVariantNameDraft(e.target.value)}
                            placeholder="변형 이름"
                            className="flex-1 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                          />
                          <button
                            type="button"
                            onClick={() => createVariantFromSelection(activeComponent.id)}
                            className="rounded-full border px-2 py-1 text-[10px]"
                          >
                            추가
                          </button>
                        </div>
                      </div>
                      {activeComponent.variants.length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {activeComponent.variants.map((variant) => (
                            <div key={variant.id} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={variant.name}
                                onChange={(e) =>
                                  setComponents((prev) =>
                                    prev.map((c) =>
                                      c.id === activeComponent.id
                                        ? {
                                            ...c,
                                            variants: c.variants.map((v) =>
                                              v.id === variant.id ? { ...v, name: e.target.value } : v,
                                            ),
                                          }
                                        : c,
                                    ),
                                  )
                                }
                                className="flex-1 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                              />
                              <button
                                type="button"
                                onClick={() => updateComponentFromSelection(activeComponent.id, variant.id)}
                                className="rounded-full border px-2 py-1 text-[10px]"
                              >
                                업데이트
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-[10px] text-neutral-400">선택된 컴포넌트가 없습니다.</div>
                  )}
                </div>
              </div>



              <div className="rounded-[12px] bg-neutral-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">레이아웃 그룹</div>
                <div className="mt-3 space-y-3">
                  <div>
                    <div className="text-[10px] font-semibold text-neutral-500">선택에서 생성</div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={layoutGroupNameDraft}
                        onChange={(e) => setLayoutGroupNameDraft(e.target.value)}
                        placeholder="그룹 이름"
                        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={createLayoutGroupFromSelection}
                        className="rounded-full border px-2 py-1 text-[10px]"
                      >
                        생성
                      </button>
                    </div>
                  </div>
                  {layoutGroups.length === 0 ? (
                    <div className="text-[10px] text-neutral-400">레이아웃 그룹이 없습니다.</div>
                  ) : (
                    layoutGroups.map((group) => (
                      <div key={group.id} className="rounded-[10px] border border-neutral-200 bg-white p-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={group.name}
                            onChange={(e) =>
                              setLayoutGroups((prev) =>
                                prev.map((g) => (g.id === group.id ? { ...g, name: e.target.value } : g)),
                              )
                            }
                            className="flex-1 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                          />
                          <button
                            type="button"
                            onClick={() => applyLayoutGroupNow(group.id)}
                            className="rounded-full border px-2 py-1 text-[10px]"
                          >
                            적용
                          </button>
                          <button
                            type="button"
                            onClick={() => selectedCount > 0 && updateLayoutGroupNodes(group.id, selectedIds)}
                            disabled={selectedCount === 0}
                            className="rounded-full border px-2 py-1 text-[10px] disabled:opacity-50"
                          >
                            선택 반영
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteLayoutGroup(group.id)}
                            className="rounded-full border px-2 py-1 text-[10px]"
                          >
                            삭제
                          </button>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <SelectField
                            label="방향"
                            value={group.settings.dir}
                            onChange={(value) =>
                              updateLayoutGroupSettings(group.id, { dir: value === "column" ? "column" : "row" })
                            }
                            options={[
                              { value: "row", label: "가로" },
                              { value: "column", label: "세로" },
                            ]}
                          />
                          <PropertyField
                            label="간격"
                            value={Number(group.settings.gap ?? 0)}
                            onChange={(value) => updateLayoutGroupSettings(group.id, { gap: Number(value) })}
                          />
                          <SelectField
                            label="정렬(교차축)"
                            value={group.settings.align}
                            onChange={(value) =>
                              updateLayoutGroupSettings(group.id, {
                                align: ["start", "center", "end", "stretch"].includes(value) ? (value as LayoutSettings["align"]) : "start",
                              })
                            }
                            options={[
                              { value: "start", label: "시작" },
                              { value: "center", label: "중앙" },
                              { value: "end", label: "끝" },
                              { value: "stretch", label: "채우기" },
                            ]}
                          />
                          <SelectField
                            label="정렬(주축)"
                            value={group.settings.justify}
                            onChange={(value) =>
                              updateLayoutGroupSettings(group.id, {
                                justify: ["start", "center", "end", "space-between"].includes(value)
                                  ? (value as LayoutSettings["justify"])
                                  : "start",
                              })
                            }
                            options={[
                              { value: "start", label: "시작" },
                              { value: "center", label: "중앙" },
                              { value: "end", label: "끝" },
                              { value: "space-between", label: "균등" },
                            ]}
                          />
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={Boolean(group.settings.auto)}
                              onChange={(e) => updateLayoutGroupSettings(group.id, { auto: e.target.checked })}
                            />
                            자동 정렬
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={Boolean(group.settings.wrap)}
                              onChange={(e) => updateLayoutGroupSettings(group.id, { wrap: e.target.checked })}
                            />
                            줄바꿈
                          </label>
                        </div>
                        {group.settings.wrap ? (
                          <div className="mt-2">
                            <PropertyField
                              label="줄 너비"
                              value={Number(group.settings.wrapSize ?? 0)}
                              onChange={(value) =>
                                updateLayoutGroupSettings(group.id, { wrapSize: Number(value) || undefined })
                              }
                            />
                          </div>
                        ) : null}
                        <div className="mt-2 grid grid-cols-4 gap-2">
                          <PropertyField
                            label="패딩 T"
                            value={Number(group.settings.padding?.t ?? 0)}
                            onChange={(value) =>
                              updateLayoutGroupSettings(group.id, {
                                padding: { ...group.settings.padding, t: Number(value) },
                              })
                            }
                          />
                          <PropertyField
                            label="패딩 R"
                            value={Number(group.settings.padding?.r ?? 0)}
                            onChange={(value) =>
                              updateLayoutGroupSettings(group.id, {
                                padding: { ...group.settings.padding, r: Number(value) },
                              })
                            }
                          />
                          <PropertyField
                            label="패딩 B"
                            value={Number(group.settings.padding?.b ?? 0)}
                            onChange={(value) =>
                              updateLayoutGroupSettings(group.id, {
                                padding: { ...group.settings.padding, b: Number(value) },
                              })
                            }
                          />
                          <PropertyField
                            label="패딩 L"
                            value={Number(group.settings.padding?.l ?? 0)}
                            onChange={(value) =>
                              updateLayoutGroupSettings(group.id, {
                                padding: { ...group.settings.padding, l: Number(value) },
                              })
                            }
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>


              {multiBooleanSelection ? (
                <div className="rounded-[12px] bg-neutral-50 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">경로 불리언</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => runPathBoolean("union")} className="rounded-full border px-2 py-1 text-[10px]">
                      합치기
                    </button>
                    <button type="button" onClick={() => runPathBoolean("subtract")} className="rounded-full border px-2 py-1 text-[10px]">
                      빼기
                    </button>
                    <button type="button" onClick={() => runPathBoolean("intersect")} className="rounded-full border px-2 py-1 text-[10px]">
                      교집합
                    </button>
                    <button type="button" onClick={() => runPathBoolean("exclude")} className="rounded-full border px-2 py-1 text-[10px]">
                      제외
                    </button>
                  </div>
                  {multiPathSelection ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={joinSelectedPaths} className="rounded-full border px-2 py-1 text-[10px]">
                        경로 연결
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}


              {convertibleSelection ? (
                <div className="rounded-[12px] bg-neutral-50 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">경로 변환</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={convertSelectedToPath} className="rounded-full border px-2 py-1 text-[10px]">
                      경로로 변환
                    </button>
                  </div>
                </div>
              ) : null}
              {/* Node details */}
              {selectedNode.type === "text" ? (
                <div className="rounded-[12px] bg-white">
                  <TextField
                    label="텍스트"
                    value={String(selectedNode.props.text ?? "")}
                    onChange={(value) => updateNodeProps(selectedNode.id, { text: value })}
                  />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ColorField
                      label="색상"
                      value={String(selectedNode.props.color ?? "#111111")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { color: value })}
                    />
                    <SelectField
                      label="정렬"
                      value={String(selectedNode.props.align ?? "left")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { align: value })}
                      options={TEXT_ALIGN_OPTIONS}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <PropertyField
                      label="글자 크기"
                      value={resolveFontSize(selectedNode.props as Record<string, unknown>, 16)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontSize: value })}
                    />
                    <PropertyField
                      label="굵기"
                      value={resolveFontWeight(selectedNode.props as Record<string, unknown>, 500)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontWeight: value })}
                    />
                    <PropertyField
                      label="줄 간격"
                      value={Number(selectedNode.props.lineHeight ?? 1.4)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { lineHeight: value })}
                    />
                    <PropertyField
                      label="자간"
                      value={Number(selectedNode.props.letterSpacing ?? 0)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { letterSpacing: value })}
                    />
                  </div>
                  <div className="mt-3">
                    <TextField
                      label="글꼴"
                      value={String(selectedNode.props.fontFamily ?? "")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontFamily: value })}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <SelectField
                      label="기울임"
                      value={String(selectedNode.props.fontStyle ?? "normal")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontStyle: value })}
                      options={FONT_STYLE_OPTIONS}
                    />
                    <SelectField
                      label="변환"
                      value={String(selectedNode.props.textTransform ?? "none")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { textTransform: value })}
                      options={TEXT_TRANSFORM_OPTIONS}
                    />
                  </div>
                </div>
              ) : null}

              {selectedNode.type === "button" ? (
                <div className="rounded-[12px] bg-white">
                  <TextField
                    label="라벨"
                    value={String(selectedNode.props.label ?? "")}
                    onChange={(value) => updateNodeProps(selectedNode.id, { label: value })}
                  />
                  <div className="mt-3">
                    {renderFillControls(selectedNode, "fill", "채우기")}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ColorField
                      label="텍스트 색상"
                      value={String(selectedNode.props.color ?? "#FFFFFF")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { color: value })}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <PropertyField
                      label="모서리"
                      value={Number(selectedNode.props.radius ?? 999)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { radius: value })}
                    />
                    <PropertyField
                      label="글자 크기"
                      value={resolveFontSize(selectedNode.props as Record<string, unknown>, 13)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontSize: value })}
                    />
                    <PropertyField
                      label="굵기"
                      value={resolveFontWeight(selectedNode.props as Record<string, unknown>, 600)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontWeight: value })}
                    />
                    <PropertyField
                      label="자간"
                      value={Number(selectedNode.props.letterSpacing ?? 0)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { letterSpacing: value })}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <SelectField
                      label="정렬"
                      value={String(selectedNode.props.textAlign ?? "center")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { textAlign: value })}
                      options={TEXT_ALIGN_OPTIONS}
                    />
                    <SelectField
                      label="변환"
                      value={String(selectedNode.props.textTransform ?? "none")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { textTransform: value })}
                      options={TEXT_TRANSFORM_OPTIONS}
                    />
                  </div>
                  <div className="mt-3">
                    <TextField
                      label="글꼴"
                      value={String(selectedNode.props.fontFamily ?? "")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontFamily: value })}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <SelectField
                      label="스타일"
                      value={String(selectedNode.props.variant ?? "primary")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { variant: value })}
                      options={[
                        { value: "primary", label: "기본" },
                        { value: "outline", label: "아웃라인" },
                      ]}
                    />
                    <SelectField
                      label="기울임"
                      value={String(selectedNode.props.fontStyle ?? "normal")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontStyle: value })}
                      options={FONT_STYLE_OPTIONS}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <SelectField
                      label="테두리 스타일"
                      value={String(selectedNode.props.borderStyle ?? "solid")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderStyle: value })}
                      options={BORDER_STYLE_OPTIONS}
                    />
                    <PropertyField
                      label="테두리 두께"
                      value={Number(selectedNode.props.borderWidth ?? 1)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderWidth: value })}
                    />
                    <ColorField
                      label="테두리 색상"
                      value={String(selectedNode.props.borderColor ?? selectedNode.props.fill ?? "#111111")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderColor: value })}
                    />
                  </div>

                  {/* Transition (Phase1) */}
                  <div className="mt-4 border-t border-neutral-100 pt-3">
                    <SelectField
                      label="동작"
                      value={String(selectedNode.props.actionKind ?? "none")}
                      onChange={(value) =>
                        updateNodeProps(selectedNode.id, {
                          actionKind: value,
                        })
                      }
                      options={[
                        { value: "none", label: "없음" },
                        { value: "url", label: "URL 이동" },
                        { value: "scene", label: "씬 전환" },
                      ]}
                    />

                    {String(selectedNode.props.actionKind ?? "none") === "url" ? (
                      <div className="mt-3">
                        <TextField
                          label="URL"
                          value={String(selectedNode.props.href ?? "")}
                          onChange={(value) => updateNodeProps(selectedNode.id, { href: value })}
                        />
                      </div>
                    ) : null}

                    {String(selectedNode.props.actionKind ?? "none") === "scene" ? (
                      <div className="mt-3">
                        <SelectField
                          label="씬"
                          value={String(selectedNode.props.sceneId ?? "")}
                          onChange={(value) => updateNodeProps(selectedNode.id, { sceneId: value })}
                          options={scenes.map((s) => ({ value: s.id, label: s.name }))}
                        />
                    <div className="mt-2 text-[11px] text-neutral-400">
                      목록에서 씬 ID를 선택하세요.
                    </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {selectedNode.type === "image" ? (
                <div className="rounded-[12px] bg-white">
                  <TextField
                    label="이미지 URL"
                    value={String(selectedNode.props.url ?? "")}
                    onChange={(value) => updateNodeProps(selectedNode.id, { url: value })}
                  />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <SelectField
                      label="맞춤"
                      value={String(selectedNode.props.fit ?? "cover")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fit: value })}
                      options={[
                        { value: "cover", label: "채우기" },
                        { value: "contain", label: "맞춤" },
                        { value: "fill", label: "늘이기" },
                        { value: "scale-down", label: "축소 맞춤" },
                      ]}
                    />
                    <PropertyField
                      label="모서리"
                      value={Number(selectedNode.props.radius ?? 12)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { radius: value })}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ColorField
                      label="테두리"
                      value={String(selectedNode.props.borderColor ?? selectedNode.props.stroke ?? "#E5E5E5")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderColor: value })}
                    />
                    <PropertyField
                      label="테두리 두께"
                      value={Number(selectedNode.props.borderWidth ?? selectedNode.props.strokeWidth ?? 1)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderWidth: value })}
                    />
                    <SelectField
                      label="테두리 스타일"
                      value={String(selectedNode.props.borderStyle ?? "solid")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderStyle: value })}
                      options={BORDER_STYLE_OPTIONS}
                    />
                  </div>
                  <div className="mt-2 text-[10px] text-neutral-400">직접 접근 가능한 HTTPS 이미지 URL을 사용하세요.</div>
                </div>
              ) : null}

              {selectedNode.type === "box" ? (
                <div className="rounded-[12px] bg-white">
                  {renderFillControls(selectedNode, "background", "배경")}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ColorField
                      label="테두리"
                      value={String(selectedNode.props.borderColor ?? selectedNode.props.stroke ?? "")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderColor: value })}
                    />
                    <PropertyField
                      label="테두리 두께"
                      value={Number(selectedNode.props.borderWidth ?? selectedNode.props.strokeWidth ?? 0)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderWidth: value })}
                    />
                    <SelectField
                      label="테두리 스타일"
                      value={String(selectedNode.props.borderStyle ?? "solid")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderStyle: value })}
                      options={BORDER_STYLE_OPTIONS}
                    />
                    <PropertyField
                      label="모서리"
                      value={Number(selectedNode.props.radius ?? 12)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { radius: value })}
                    />
                  </div>
                </div>
              ) : null}

              {selectedNode.type === "frame" ? (
                <div className="rounded-[12px] bg-white">
                  {renderFillControls(selectedNode, "background", "배경")}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ColorField
                      label="테두리"
                      value={String(selectedNode.props.borderColor ?? selectedNode.props.stroke ?? "#E5E5E5")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderColor: value })}
                    />
                    <PropertyField
                      label="테두리 두께"
                      value={Number(selectedNode.props.borderWidth ?? selectedNode.props.strokeWidth ?? 1)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderWidth: value })}
                    />
                    <SelectField
                      label="테두리 스타일"
                      value={String(selectedNode.props.borderStyle ?? "solid")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderStyle: value })}
                      options={BORDER_STYLE_OPTIONS}
                    />
                    <PropertyField
                      label="모서리"
                      value={Number(selectedNode.props.radius ?? 14)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { radius: value })}
                    />
                  </div>
                </div>
              ) : null}

              {selectedNode.type === "link" ? (
                <div className="rounded-[12px] bg-white">
                  <TextField
                    label="라벨"
                    value={String(selectedNode.props.label ?? "")}
                    onChange={(value) => updateNodeProps(selectedNode.id, { label: value })}
                  />
                  <TextField
                    label="URL"
                    value={String(selectedNode.props.href ?? "")}
                    onChange={(value) => updateNodeProps(selectedNode.id, { href: value })}
                  />
                  <div className="mt-3">
                    {renderFillControls(selectedNode, "background", "배경")}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ColorField
                      label="테두리"
                      value={String(selectedNode.props.border ?? "#3B82F6")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { border: value })}
                    />
                    <ColorField
                      label="텍스트 색상"
                      value={String(selectedNode.props.color ?? selectedNode.props.border ?? "#3B82F6")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { color: value })}
                    />
                    <PropertyField
                      label="모서리"
                      value={Number(selectedNode.props.radius ?? 12)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { radius: value })}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <PropertyField
                      label="글자 크기"
                      value={resolveFontSize(selectedNode.props as Record<string, unknown>, 10)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontSize: value })}
                    />
                    <PropertyField
                      label="굵기"
                      value={resolveFontWeight(selectedNode.props as Record<string, unknown>, 500)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontWeight: value })}
                    />
                    <PropertyField
                      label="자간"
                      value={Number(selectedNode.props.letterSpacing ?? 0)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { letterSpacing: value })}
                    />
                    <SelectField
                      label="변환"
                      value={String(selectedNode.props.textTransform ?? "none")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { textTransform: value })}
                      options={TEXT_TRANSFORM_OPTIONS}
                    />
                  </div>
                  <div className="mt-3">
                    <TextField
                      label="글꼴"
                      value={String(selectedNode.props.fontFamily ?? "")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontFamily: value })}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <SelectField
                      label="테두리 스타일"
                      value={String(selectedNode.props.borderStyle ?? "dashed")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderStyle: value })}
                      options={BORDER_STYLE_OPTIONS}
                    />
                    <PropertyField
                      label="테두리 두께"
                      value={Number(selectedNode.props.borderWidth ?? 1)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderWidth: value })}
                    />
                    <SelectField
                      label="기울임"
                      value={String(selectedNode.props.fontStyle ?? "normal")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontStyle: value })}
                      options={FONT_STYLE_OPTIONS}
                    />
                  </div>
                </div>
              ) : null}

              {selectedNode.type === "shape_rect" ? (
                <div className="rounded-[12px] bg-white">
                  {renderFillControls(selectedNode, "fill", "채우기")}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ColorField
                      label="선"
                      value={String(selectedNode.props.stroke ?? "#111111")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { stroke: value })}
                    />
                    <PropertyField
                      label="선 두께"
                      value={Number(selectedNode.props.strokeWidth ?? 0)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { strokeWidth: value })}
                    />
                    <SelectField
                      label="선 스타일"
                      value={String(selectedNode.props.borderStyle ?? "solid")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderStyle: value })}
                      options={BORDER_STYLE_OPTIONS}
                    />
                    <PropertyField
                      label="모서리"
                      value={Number(selectedNode.props.radius ?? 16)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { radius: value })}
                    />
                  </div>
                </div>
              ) : null}

              {selectedNode.type === "shape_ellipse" ? (
                <div className="rounded-[12px] bg-white">
                  {renderFillControls(selectedNode, "fill", "채우기")}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ColorField
                      label="선"
                      value={String(selectedNode.props.stroke ?? "#111111")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { stroke: value })}
                    />
                    <PropertyField
                      label="선 두께"
                      value={Number(selectedNode.props.strokeWidth ?? 0)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { strokeWidth: value })}
                    />
                    <SelectField
                      label="선 스타일"
                      value={String(selectedNode.props.borderStyle ?? "solid")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderStyle: value })}
                      options={BORDER_STYLE_OPTIONS}
                    />
                  </div>
                </div>
              ) : null}

              {selectedNode.type === "line" ? (
                <div className="rounded-[12px] bg-white">
                  <ColorField
                    label="선"
                    value={String(selectedNode.props.stroke ?? "#111111")}
                    onChange={(value) => updateNodeProps(selectedNode.id, { stroke: value })}
                  />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <PropertyField
                      label="선 두께"
                      value={Number(selectedNode.props.strokeWidth ?? 2)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { strokeWidth: value })}
                    />
                    <TextField
                      label="대시"
                      value={String(selectedNode.props.dash ?? "")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { dash: value })}
                    />
                    <SelectField
                      label="끝 모양"
                      value={String(selectedNode.props.lineCap ?? "round")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { lineCap: value })}
                      options={LINE_CAP_OPTIONS}
                    />
                  </div>
                </div>
              ) : null}

              {selectedNode.type === "path" ? (
                <div className="rounded-[12px] bg-white">
                  <ColorField
                    label="선"
                    value={String(selectedNode.props.stroke ?? "#111111")}
                    onChange={(value) => updateNodeProps(selectedNode.id, { stroke: value })}
                  />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <PropertyField
                      label="선 두께"
                      value={Number(selectedNode.props.strokeWidth ?? 2)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { strokeWidth: value })}
                    />
                    <TextField
                      label="대시"
                      value={String(selectedNode.props.dash ?? "")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { dash: value })}
                    />
                    <ColorField
                      label="채우기"
                      value={String(selectedNode.props.fill ?? "rgba(0,0,0,0)")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fill: value })}
                    />
                    <SelectField
                      label="닫힘"
                      value={String(selectedNode.props.closed ?? false)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { closed: value === "true" })}
                      options={[
                        { value: "false", label: "열림" },
                        { value: "true", label: "닫힘" },
                      ]}
                    />
                    <SelectField
                      label="끝 모양"
                      value={String(selectedNode.props.lineCap ?? "round")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { lineCap: value })}
                      options={LINE_CAP_OPTIONS}
                    />
                    <SelectField
                      label="모서리"
                      value={String(selectedNode.props.lineJoin ?? "round")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { lineJoin: value })}
                      options={LINE_JOIN_OPTIONS}
                    />
                  </div>
                  <div className="mt-3">
                    <TextAreaField
                      label="포인트"
                      value={formatPathPoints(selectedNode.props.points)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { points: value })}
                      rows={3}
                    />
                    <div className="mt-2 text-[10px] text-neutral-400">형식: 0.1,0.2; 0.9,0.8 (0~1 또는 0~100)</div>
                  </div>
                  {(() => {
                    const pts = parsePathPointsToArray(selectedNode.props.points);
                    return (
                      <div className="mt-3 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => updatePathPoints(selectedNode.id, [...pts, [0.5, 0.5]])}
                            className="rounded-full border px-2 py-1 text-[10px]"
                          >
                            포인트 추가
                          </button>
                          <button
                            type="button"
                            onClick={() => updatePathPoints(selectedNode.id, [...pts].reverse())}
                            className="rounded-full border px-2 py-1 text-[10px]"
                          >
                            반전
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updatePathPoints(
                                selectedNode.id,
                                pts.map(([x, y]) => [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]),
                              )
                            }
                            className="rounded-full border px-2 py-1 text-[10px]"
                          >
                            정규화
                          </button>
                        </div>
                        {pts.length === 0 ? (
                          <div className="text-[10px] text-neutral-400">포인트가 없습니다.</div>
                        ) : (
                          pts.map(([x, y], idx) => (
                            <div key={`pt-${idx}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                              <input
                                type="number"
                                step="0.01"
                                value={Number.isFinite(x) ? x : 0}
                                onChange={(e) => {
                                  const next = [...pts];
                                  next[idx] = [Number(e.target.value), next[idx][1]];
                                  updatePathPoints(selectedNode.id, next);
                                }}
                                className="rounded border border-neutral-200 px-2 py-1 text-[11px]"
                              />
                              <input
                                type="number"
                                step="0.01"
                                value={Number.isFinite(y) ? y : 0}
                                onChange={(e) => {
                                  const next = [...pts];
                                  next[idx] = [next[idx][0], Number(e.target.value)];
                                  updatePathPoints(selectedNode.id, next);
                                }}
                                className="rounded border border-neutral-200 px-2 py-1 text-[11px]"
                              />
                              <button
                                type="button"
                                onClick={() => updatePathPoints(selectedNode.id, pts.filter((_, i) => i !== idx))}
                                className="rounded border border-neutral-200 px-2 py-1 text-[10px]"
                              >
                                삭제
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })()}
                  <div className="mt-3 space-y-2">
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <PropertyField
                        label="오프셋(px)"
                        value={pathOffsetDraft}
                        onChange={(value) => setPathOffsetDraft(Number(value))}
                      />
                      <button
                        type="button"
                        onClick={() => offsetPath(selectedNode.id, Number(pathOffsetDraft) || 0)}
                        className="rounded border border-neutral-200 px-2 py-1 text-[10px]"
                      >
                        오프셋 적용
                      </button>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <PropertyField
                        label="스무딩(회)"
                        value={pathSmoothDraft}
                        onChange={(value) => setPathSmoothDraft(Number(value))}
                      />
                      <button
                        type="button"
                        onClick={() => smoothPath(selectedNode.id, Number(pathSmoothDraft) || 1)}
                        className="rounded border border-neutral-200 px-2 py-1 text-[10px]"
                      >
                        스무딩
                      </button>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <PropertyField
                        label="단순화(0~1)"
                        value={pathSimplifyDraft}
                        onChange={(value) => setPathSimplifyDraft(Number(value))}
                      />
                      <button
                        type="button"
                        onClick={() => simplifyPath(selectedNode.id, Number(pathSimplifyDraft) || 0.02)}
                        className="rounded border border-neutral-200 px-2 py-1 text-[10px]"
                      >
                        단순화
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedNode.type === "input" ? (
                <div className="rounded-[12px] bg-white">
                  <TextField
                    label="플레이스홀더"
                    value={String(selectedNode.props.placeholder ?? "")}
                    onChange={(value) => updateNodeProps(selectedNode.id, { placeholder: value })}
                  />
                  <div className="mt-3">
                    {renderFillControls(selectedNode, "fill", "채우기")}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ColorField
                      label="테두리"
                      value={String(selectedNode.props.borderColor ?? selectedNode.props.stroke ?? "#E5E5E5")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderColor: value })}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <SelectField
                      label="테두리 스타일"
                      value={String(selectedNode.props.borderStyle ?? "solid")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderStyle: value })}
                      options={BORDER_STYLE_OPTIONS}
                    />
                    <PropertyField
                      label="테두리 두께"
                      value={Number(selectedNode.props.borderWidth ?? selectedNode.props.strokeWidth ?? 1)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderWidth: value })}
                    />
                    <PropertyField
                      label="모서리"
                      value={Number(selectedNode.props.radius ?? 12)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { radius: value })}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ColorField
                      label="텍스트 색상"
                      value={String(selectedNode.props.color ?? "#111111")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { color: value })}
                    />
                    <PropertyField
                      label="글자 크기"
                      value={resolveFontSize(selectedNode.props as Record<string, unknown>, 13)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontSize: value })}
                    />
                    <PropertyField
                      label="자간"
                      value={Number(selectedNode.props.letterSpacing ?? 0)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { letterSpacing: value })}
                    />
                    <SelectField
                      label="정렬"
                      value={String(selectedNode.props.textAlign ?? "left")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { textAlign: value })}
                      options={TEXT_ALIGN_OPTIONS}
                    />
                  </div>
                  <div className="mt-3">
                    <TextField
                      label="글꼴"
                      value={String(selectedNode.props.fontFamily ?? "")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontFamily: value })}
                    />
                  </div>
                  <div className="mt-3">
                    <TextField
                      label="바인딩 키"
                      value={String(selectedNode.bind?.key ?? "")}
                      onChange={(value) => updateNodeBindKey(selectedNode.id, value)}
                    />
                  </div>
                </div>
              ) : null}

              {selectedNode.type === "textarea" ? (
                <div className="rounded-[12px] bg-white">
                  <TextField
                    label="플레이스홀더"
                    value={String(selectedNode.props.placeholder ?? "")}
                    onChange={(value) => updateNodeProps(selectedNode.id, { placeholder: value })}
                  />
                  <div className="mt-3">
                    {renderFillControls(selectedNode, "fill", "채우기")}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ColorField
                      label="테두리"
                      value={String(selectedNode.props.borderColor ?? selectedNode.props.stroke ?? "#E5E5E5")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderColor: value })}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <SelectField
                      label="테두리 스타일"
                      value={String(selectedNode.props.borderStyle ?? "solid")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderStyle: value })}
                      options={BORDER_STYLE_OPTIONS}
                    />
                    <PropertyField
                      label="테두리 두께"
                      value={Number(selectedNode.props.borderWidth ?? selectedNode.props.strokeWidth ?? 1)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderWidth: value })}
                    />
                    <PropertyField
                      label="모서리"
                      value={Number(selectedNode.props.radius ?? 12)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { radius: value })}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ColorField
                      label="텍스트 색상"
                      value={String(selectedNode.props.color ?? "#111111")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { color: value })}
                    />
                    <PropertyField
                      label="글자 크기"
                      value={resolveFontSize(selectedNode.props as Record<string, unknown>, 13)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontSize: value })}
                    />
                    <PropertyField
                      label="자간"
                      value={Number(selectedNode.props.letterSpacing ?? 0)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { letterSpacing: value })}
                    />
                    <SelectField
                      label="정렬"
                      value={String(selectedNode.props.textAlign ?? "left")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { textAlign: value })}
                      options={TEXT_ALIGN_OPTIONS}
                    />
                  </div>
                  <div className="mt-3">
                    <TextField
                      label="글꼴"
                      value={String(selectedNode.props.fontFamily ?? "")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontFamily: value })}
                    />
                  </div>
                  <div className="mt-3">
                    <TextField
                      label="바인딩 키"
                      value={String(selectedNode.bind?.key ?? "")}
                      onChange={(value) => updateNodeBindKey(selectedNode.id, value)}
                    />
                  </div>
                </div>
              ) : null}

              {selectedNode.type === "checkbox" ? (
                <div className="rounded-[12px] bg-white">
                  <TextField
                    label="라벨"
                    value={String(selectedNode.props.label ?? "")}
                    onChange={(value) => updateNodeProps(selectedNode.id, { label: value })}
                  />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ColorField
                      label="색상"
                      value={String(selectedNode.props.color ?? "#111111")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { color: value })}
                    />
                    <PropertyField
                      label="글자 크기"
                      value={resolveFontSize(selectedNode.props as Record<string, unknown>, 13)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontSize: value })}
                    />
                    <PropertyField
                      label="굵기"
                      value={resolveFontWeight(selectedNode.props as Record<string, unknown>, 500)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontWeight: value })}
                    />
                    <PropertyField
                      label="자간"
                      value={Number(selectedNode.props.letterSpacing ?? 0)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { letterSpacing: value })}
                    />
                  </div>
                  <div className="mt-3">
                    <TextField
                      label="글꼴"
                      value={String(selectedNode.props.fontFamily ?? "")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontFamily: value })}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <SelectField
                      label="변환"
                      value={String(selectedNode.props.textTransform ?? "none")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { textTransform: value })}
                      options={TEXT_TRANSFORM_OPTIONS}
                    />
                    <SelectField
                      label="기울임"
                      value={String(selectedNode.props.fontStyle ?? "normal")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontStyle: value })}
                      options={FONT_STYLE_OPTIONS}
                    />
                  </div>
                  <div className="mt-3">
                    <TextField
                      label="바인딩 키"
                      value={String(selectedNode.bind?.key ?? "")}
                      onChange={(value) => updateNodeBindKey(selectedNode.id, value)}
                    />
                  </div>
                </div>
              ) : null}

              {selectedNode.type === "select" ? (
                <div className="rounded-[12px] bg-white">
                  <TextField
                    label="옵션"
                    value={formatOptionList(selectedNode.props.options)}
                    onChange={(value) => updateNodeProps(selectedNode.id, { options: parseOptionList(value) })}
                  />
                  <div className="mt-3">
                    {renderFillControls(selectedNode, "fill", "채우기")}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ColorField
                      label="테두리"
                      value={String(selectedNode.props.borderColor ?? selectedNode.props.stroke ?? "#E5E5E5")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderColor: value })}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <SelectField
                      label="테두리 스타일"
                      value={String(selectedNode.props.borderStyle ?? "solid")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderStyle: value })}
                      options={BORDER_STYLE_OPTIONS}
                    />
                    <PropertyField
                      label="테두리 두께"
                      value={Number(selectedNode.props.borderWidth ?? selectedNode.props.strokeWidth ?? 1)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { borderWidth: value })}
                    />
                    <PropertyField
                      label="모서리"
                      value={Number(selectedNode.props.radius ?? 12)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { radius: value })}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ColorField
                      label="텍스트 색상"
                      value={String(selectedNode.props.color ?? "#111111")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { color: value })}
                    />
                    <PropertyField
                      label="글자 크기"
                      value={resolveFontSize(selectedNode.props as Record<string, unknown>, 13)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontSize: value })}
                    />
                    <PropertyField
                      label="자간"
                      value={Number(selectedNode.props.letterSpacing ?? 0)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { letterSpacing: value })}
                    />
                    <SelectField
                      label="정렬"
                      value={String(selectedNode.props.textAlign ?? "left")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { textAlign: value })}
                      options={TEXT_ALIGN_OPTIONS}
                    />
                  </div>
                  <div className="mt-3">
                    <TextField
                      label="글꼴"
                      value={String(selectedNode.props.fontFamily ?? "")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontFamily: value })}
                    />
                  </div>
                  <div className="mt-3">
                    <TextField
                      label="바인딩 키"
                      value={String(selectedNode.bind?.key ?? "")}
                      onChange={(value) => updateNodeBindKey(selectedNode.id, value)}
                    />
                  </div>
                </div>
              ) : null}

              {selectedNode.type === "slider" ? (
                <div className="rounded-[12px] bg-white">
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <PropertyField
                      label="최소"
                      value={Number(selectedNode.props.min ?? 0)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { min: value })}
                    />
                    <PropertyField
                      label="최대"
                      value={Number(selectedNode.props.max ?? 100)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { max: value })}
                    />
                    <PropertyField
                      label="단계"
                      value={Number(selectedNode.props.step ?? 1)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { step: value })}
                    />
                  </div>
                  <div className="mt-3">
                    <TextField
                      label="바인딩 키"
                      value={String(selectedNode.bind?.key ?? "")}
                      onChange={(value) => updateNodeBindKey(selectedNode.id, value)}
                    />
                  </div>
                </div>
              ) : null}

              {selectedNode.type === "divider" ? (
                <div className="rounded-[12px] bg-white">
                  <ColorField
                    label="색상"
                    value={String(selectedNode.props.color ?? "#EAEAEA")}
                    onChange={(value) => updateNodeProps(selectedNode.id, { color: value })}
                  />
                  <div className="mt-3">
                    <PropertyField
                      label="두께"
                      value={Number(selectedNode.props.thickness ?? 1)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { thickness: value })}
                    />
                  </div>
                </div>
              ) : null}

              {selectedNode.type === "badge" ? (
                <div className="rounded-[12px] bg-white">
                  <TextField
                    label="라벨"
                    value={String(selectedNode.props.label ?? "")}
                    onChange={(value) => updateNodeProps(selectedNode.id, { label: value })}
                  />
                  <div className="mt-3">
                    {renderFillControls(selectedNode, "background", "배경")}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ColorField
                      label="색상"
                      value={String(selectedNode.props.color ?? "#111111")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { color: value })}
                    />
                    <PropertyField
                      label="모서리"
                      value={Number(selectedNode.props.radius ?? 999)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { radius: value })}
                    />
                    <PropertyField
                      label="글자 크기"
                      value={resolveFontSize(selectedNode.props as Record<string, unknown>, 10)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontSize: value })}
                    />
                    <PropertyField
                      label="굵기"
                      value={resolveFontWeight(selectedNode.props as Record<string, unknown>, 600)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontWeight: value })}
                    />
                    <PropertyField
                      label="자간"
                      value={Number(selectedNode.props.letterSpacing ?? 0)}
                      onChange={(value) => updateNodeProps(selectedNode.id, { letterSpacing: value })}
                    />
                  </div>
                  <div className="mt-3">
                    <TextField
                      label="글꼴"
                      value={String(selectedNode.props.fontFamily ?? "")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontFamily: value })}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <SelectField
                      label="변환"
                      value={String(selectedNode.props.textTransform ?? "none")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { textTransform: value })}
                      options={TEXT_TRANSFORM_OPTIONS}
                    />
                    <SelectField
                      label="기울임"
                      value={String(selectedNode.props.fontStyle ?? "normal")}
                      onChange={(value) => updateNodeProps(selectedNode.id, { fontStyle: value })}
                      options={FONT_STYLE_OPTIONS}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {selectedCount === 0 ? (
            <div className="mt-4 text-[11px] text-neutral-500">레이어를 선택해 편집하세요. (Shift로 다중 선택)</div>
          ) : null}

          <div className="mt-4 rounded-[12px] bg-neutral-50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">캔버스 크기</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <PropertyField
                label="W"
                value={docMeta.width}
                onChange={(v) => {
                  const w = Math.max(100, Math.min(2000, Number(v)));
                  resizeCanvas(w, docMetaRef.current.height);
                }}
              />
              <PropertyField
                label="H"
                value={docMeta.height}
                onChange={(v) => {
                  const h = Math.max(100, Math.min(2000, Number(v)));
                  resizeCanvas(docMetaRef.current.width, h);
                }}
              />
            </div>
          </div>
          <div className="mt-2 text-[11px] text-neutral-500">텍스트 입력은 미리보기에서 표시됩니다.</div>
          {status !== "idle" ? <div className="mt-3 text-[11px]">처리 중...</div> : null}
        </aside>
      </div>

      {showPreview ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6">
          <div className="relative rounded-[16px] bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className="absolute right-4 top-4 rounded-full border border-neutral-200 px-3 py-1 text-xs"
            >
              닫기
            </button>
            <div className="pt-6">
              <CanvasRender doc={docMeta} className="shadow-none" />
            </div>
          </div>
        </div>
      ) : null}

      {showPublishModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-sm rounded-[14px] bg-white p-6 shadow-xl">
            <p className="text-sm text-neutral-700">배포하면 24시간 동안 공개됩니다. 계속할까요?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPublishModal(false)}
                className="rounded-full border border-neutral-200 px-4 py-2 text-xs"
              >
                취소
              </button>
              <button
                type="button"
                onClick={doPublish}
                className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white"
              >
                지금 배포
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
