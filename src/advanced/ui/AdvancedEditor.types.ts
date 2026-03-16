import type { Frame, Node, NodeType } from "../doc/scene";

export type Tool =
  | "select"
  | "hand"
  | "frame"
  | "section"
  | "slice"
  | "table"
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
  | "comment";

export type DragState =
  | {
      mode: "move";
      pointerId: number;
      startX: number;
      startY: number;
      ids: string[];
      origins: Record<string, Frame>;
      capture: Element | null;
    }
  | {
      mode: "resize";
      pointerId: number;
      startX: number;
      startY: number;
      id: string;
      handle: "nw" | "ne" | "sw" | "se";
      origin: Frame;
      capture: Element | null;
    }
  | {
      mode: "draw";
      pointerId: number;
      startX: number;
      startY: number;
      id: string;
      capture: Element | null;
    }
  | {
      mode: "pan";
      pointerId: number;
      startX: number;
      startY: number;
      startPanX: number;
      startPanY: number;
      capture: Element | null;
    }
  | {
      mode: "pathAdd";
      pointerId: number;
      startX: number;
      startY: number;
      nodeId: string;
      capture: Element | null;
    }
  | {
      mode: "pathEdit";
      pointerId: number;
      startX: number;
      startY: number;
      nodeId: string;
      anchorIndex: number;
      kind: "anchor" | "handle1" | "handle2";
      /** 드래그 시작 시점 앵커 배열(원본 기준 delta 적용용) */
      originAnchors: Array<{ x: number; y: number; handle1X?: number; handle1Y?: number; handle2X?: number; handle2Y?: number }>;
      capture: Element | null;
    };

export type Rect = { x: number; y: number; w: number; h: number; rotation?: number };

export type Status = "idle" | "saving" | "publishing";

export type ClipboardPayload = {
  rootIds: string[];
  nodes: Record<string, Node>;
  rootParents: Record<string, string | null>;
};

export type NodeOverride = NonNullable<Node["overrides"]>;

export type PresetBuildResult = {
  rootId: string;
  nodes: Record<string, Node>;
};

export type PresetDefinition = {
  id: string;
  label: string;
  description?: string;
  tags?: string[];
  version?: string;
  size: { w: number; h: number };
  build: (origin: { x: number; y: number }) => PresetBuildResult;
};

export type ContextMenuState = {
  x: number;
  y: number;
  targetId: string | null;
};

