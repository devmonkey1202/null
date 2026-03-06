
export type BuilderAction =
  | { type: "none" }
  | { type: "link"; url?: string }
  | { type: "scene"; sceneId?: string };

export type CanvasNodeType =
  | "box"
  | "frame"
  | "text"
  | "button"
  | "image"
  | "divider"
  | "badge"
  | "link"
  | "shape_rect"
  | "shape_ellipse"
  | "line"
  | "path"
  | "input"
  | "textarea"
  | "checkbox"
  | "select"
  | "slider";

export type CanvasNode = {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  w: number;
  h: number;
  props: Record<string, unknown>;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  hidden?: boolean;
  action?: BuilderAction;
  bind?: { key?: string };
  componentId?: string;
  componentInstanceId?: string;
  componentVariantId?: string;
  componentNodeId?: string;
  constraints?: {
    pinLeft?: boolean;
    pinRight?: boolean;
    pinTop?: boolean;
    pinBottom?: boolean;
    centerX?: boolean;
    centerY?: boolean;
    scaleX?: boolean;
    scaleY?: boolean;
  };
};

export type CanvasDocument = {
  width: number;
  height: number;
  nodes: CanvasNode[];
};

type DefaultDef = {
  type: CanvasNodeType;
  w: number;
  h: number;
  props: Record<string, unknown>;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  hidden?: boolean;
  action?: BuilderAction;
};

export const ELEMENT_DEFAULTS: Record<CanvasNodeType, DefaultDef> = {
  box: {
    type: "box",
    w: 240,
    h: 140,
    props: { background: "#F5F5F5", radius: 12 },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    action: { type: "none" },
  },
  frame: {
    type: "frame",
    w: 320,
    h: 240,
    props: { background: "#FFFFFF", radius: 14, stroke: "#E5E5E5", strokeWidth: 1 },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    action: { type: "none" },
  },
  text: {
    type: "text",
    w: 240,
    h: 44,
    props: {
      text: "텍스트",
      color: "#111111",
      fontSize: 16,
      fontWeight: 500,
      align: "left",
      lineHeight: 1.4,
      letterSpacing: 0,
      fontStyle: "normal",
      textTransform: "none",
    },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    action: { type: "none" },
  },
  button: {
    type: "button",
    w: 160,
    h: 44,
    props: {
      label: "버튼",
      fill: "#111111",
      color: "#FFFFFF",
      radius: 999,
      fontSize: 13,
      fontWeight: 600,
      textAlign: "center",
      letterSpacing: 0,
      fontStyle: "normal",
      textTransform: "none",
    },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    action: { type: "none" },
  },
  image: {
    type: "image",
    w: 280,
    h: 180,
    props: { url: "", fit: "cover", radius: 12 },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    action: { type: "none" },
  },
  divider: {
    type: "divider",
    w: 260,
    h: 8,
    props: { color: "#EAEAEA", thickness: 1 },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    action: { type: "none" },
  },
  badge: {
    type: "badge",
    w: 90,
    h: 28,
    props: {
      label: "배지",
      color: "#111111",
      background: "#F1F1F1",
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: 0,
      fontStyle: "normal",
      textTransform: "none",
    },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    action: { type: "none" },
  },

  link: {
    type: "link",
    w: 180,
    h: 44,
    props: {
      label: "링크",
      border: "#3B82F6",
      background: "rgba(59,130,246,0.10)",
      color: "#3B82F6",
      borderWidth: 1,
      borderStyle: "dashed",
      radius: 12,
      fontSize: 10,
      fontWeight: 500,
      textAlign: "center",
      letterSpacing: 0,
      fontStyle: "normal",
      textTransform: "none",
    },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    action: { type: "none" },
  },
  shape_rect: {
    type: "shape_rect",
    w: 180,
    h: 120,
    props: { fill: "#EDEDED", stroke: "#111111", strokeWidth: 0, radius: 16 },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    action: { type: "none" },
  },
  shape_ellipse: {
    type: "shape_ellipse",
    w: 140,
    h: 140,
    props: { fill: "#EDEDED", stroke: "#111111", strokeWidth: 0 },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    action: { type: "none" },
  },
  line: {
    type: "line",
    w: 220,
    h: 40,
    props: { stroke: "#111111", strokeWidth: 2, dash: "", lineCap: "round" },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    action: { type: "none" },
  },
  path: {
    type: "path",
    w: 240,
    h: 160,
    props: {
      stroke: "#111111",
      strokeWidth: 2,
      points: [[0.05, 0.5], [0.25, 0.2], [0.6, 0.8], [0.9, 0.35]],
      lineCap: "round",
      lineJoin: "round",
      closed: false,
    },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    action: { type: "none" },
  },

  input: {
    type: "input",
    w: 280,
    h: 44,
    props: {
      placeholder: "입력...",
      fill: "#FFFFFF",
      stroke: "#E5E5E5",
      strokeWidth: 1,
      radius: 12,
      color: "#111111",
      fontSize: 13,
      textAlign: "left",
      letterSpacing: 0,
      fontStyle: "normal",
    },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    action: { type: "none" },
  },
  textarea: {
    type: "textarea",
    w: 280,
    h: 110,
    props: {
      placeholder: "입력...",
      fill: "#FFFFFF",
      stroke: "#E5E5E5",
      strokeWidth: 1,
      radius: 12,
      color: "#111111",
      fontSize: 13,
      textAlign: "left",
      letterSpacing: 0,
      fontStyle: "normal",
    },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    action: { type: "none" },
  },
  checkbox: {
    type: "checkbox",
    w: 160,
    h: 24,
    props: {
      label: "옵션",
      color: "#111111",
      fontSize: 13,
      fontWeight: 500,
      letterSpacing: 0,
      fontStyle: "normal",
      textTransform: "none",
    },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    action: { type: "none" },
  },
  select: {
    type: "select",
    w: 260,
    h: 44,
    props: {
      options: ["옵션 1", "옵션 2"],
      fill: "#FFFFFF",
      stroke: "#E5E5E5",
      strokeWidth: 1,
      radius: 12,
      color: "#111111",
      fontSize: 13,
      textAlign: "left",
      letterSpacing: 0,
      fontStyle: "normal",
    },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    action: { type: "none" },
  },
  slider: {
    type: "slider",
    w: 260,
    h: 44,
    props: { min: 0, max: 100, step: 1 },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    action: { type: "none" },
  },
};

export const DEFAULT_CANVAS = {
  width: 360,
  height: 640,
  nodes: [],
} as const;

export const GRID_SIZE = 8;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function snapToGrid(value: number, grid = GRID_SIZE) {
  return Math.round(value / grid) * grid;
}

export function genNodeId(prefix = "node") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function countByType(nodes: Array<{ type?: string }>) {
  return nodes.reduce<Record<string, number>>((acc, node) => {
    const t = typeof node.type === "string" ? node.type : "unknown";
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
}

export function clampNodeToCanvas(
  node: CanvasNode,
  doc: { width: number; height: number },
  minSize = 24
): CanvasNode {
  const clampLocal = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const w = clampLocal(node.w, minSize, doc.width);
  const h = clampLocal(node.h, minSize, doc.height);
  const x = clampLocal(node.x, 0, doc.width - w);
  const y = clampLocal(node.y, 0, doc.height - h);

  return { ...node, x, y, w, h };
}

export type CanvasScene = {
  id: string;
  name: string;
  width: number;
  height: number;
  nodes: CanvasNode[];
};

export type CanvasContentV2 = {
  schema: "canvas_v2";
  startSceneId: string;
  scenes: CanvasScene[];
};

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return isObj(value) ? value : null;
}

function toArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function asNumber(v: unknown, fallback: number) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asString(v: unknown, fallback: string) {
  return typeof v === "string" ? v : fallback;
}

export function normalizeContentToV2(raw: unknown): CanvasContentV2 {
  const rawObj = toRecord(raw);

  if (rawObj && rawObj.schema === "canvas_v2" && Array.isArray(rawObj.scenes)) {
    const scenesRaw = toArray(rawObj.scenes) ?? [];
    const scenes: CanvasScene[] = scenesRaw.map((scene, idx) => {
      const sceneObj = toRecord(scene);
      const nodes = Array.isArray(sceneObj?.nodes) ? (sceneObj?.nodes as CanvasNode[]) : [];
      return {
        id: asString(sceneObj?.id, `scene_${idx + 1}`),
        name: asString(sceneObj?.name, `Scene ${idx + 1}`),
        width: asNumber(sceneObj?.width, 390),
        height: asNumber(sceneObj?.height, 844),
        nodes,
      };
    });
    const start = asString(rawObj.startSceneId, scenes[0]?.id ?? "scene_1");
    const startSceneId = scenes.some((s) => s.id === start) ? start : scenes[0]?.id ?? "scene_1";
    return {
      schema: "canvas_v2",
      startSceneId,
      scenes: scenes.length ? scenes : [{ id: "scene_1", name: "Scene 1", width: 390, height: 844, nodes: [] }],
    };
  }

  if (rawObj && rawObj.schema === "null_canvas" && Array.isArray(rawObj.pages)) {
    const pages = toArray(rawObj.pages) ?? [];
    const scenes: CanvasScene[] = pages.map((page, idx) => {
      const pageObj = toRecord(page);
      const viewport = toRecord(pageObj?.viewport);
      const width = asNumber(viewport?.width, asNumber(pageObj?.width, 390));
      const height = asNumber(viewport?.height, asNumber(pageObj?.height, 844));
      const nodes = Array.isArray(pageObj?.nodes) ? (pageObj?.nodes as CanvasNode[]) : [];
      return {
        id: asString(pageObj?.id, `scene_${idx + 1}`),
        name: asString(pageObj?.name, `Scene ${idx + 1}`),
        width,
        height,
        nodes,
      };
    });
    const start = asString(rawObj.startPageId, scenes[0]?.id ?? "scene_1");
    const startSceneId = scenes.some((s) => s.id === start) ? start : scenes[0]?.id ?? "scene_1";
    return {
      schema: "canvas_v2",
      startSceneId,
      scenes: scenes.length ? scenes : [{ id: "scene_1", name: "Scene 1", width: 390, height: 844, nodes: [] }],
    };
  }

  if (rawObj && rawObj.schema === "builder_v3" && Array.isArray(rawObj.pages)) {
    const pages = toArray(rawObj.pages) ?? [];
    const scenes: CanvasScene[] = pages.map((page, idx) => {
      const pageObj = toRecord(page);
      const viewport = toRecord(pageObj?.viewport);
      const nodes = Array.isArray(pageObj?.nodes) ? (pageObj?.nodes as CanvasNode[]) : [];
      return {
        id: asString(pageObj?.id, `scene_${idx + 1}`),
        name: asString(pageObj?.name, `Scene ${idx + 1}`),
        width: asNumber(viewport?.width, 390),
        height: asNumber(viewport?.height, 844),
        nodes,
      };
    });
    const start = asString(rawObj.startPageId, scenes[0]?.id ?? "scene_1");
    const startSceneId = scenes.some((s) => s.id === start) ? start : scenes[0]?.id ?? "scene_1";
    return {
      schema: "canvas_v2",
      startSceneId,
      scenes: scenes.length ? scenes : [{ id: "scene_1", name: "Scene 1", width: 390, height: 844, nodes: [] }],
    };
  }

  const width = rawObj ? asNumber(rawObj.width, 390) : 390;
  const height = rawObj ? asNumber(rawObj.height, 844) : 844;
  const nodes = rawObj && Array.isArray(rawObj.nodes) ? (rawObj.nodes as CanvasNode[]) : [];
  return {
    schema: "canvas_v2",
    startSceneId: "scene_1",
    scenes: [{ id: "scene_1", name: "Scene 1", width, height, nodes }],
  };
}
export function pickScene(content: CanvasContentV2, sceneId: string | null | undefined): CanvasScene {
  const id = typeof sceneId === "string" && sceneId ? sceneId : content.startSceneId;
  return content.scenes.find((s) => s.id === id) ?? content.scenes[0];
}

export function toDocument(scene: CanvasScene): CanvasDocument {
  return { width: scene.width, height: scene.height, nodes: scene.nodes };
}


