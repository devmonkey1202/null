import type { CSSProperties } from "react";

import type { Doc, Frame, Node, PrototypeAction, PrototypeTransitionType } from "../doc/scene";

type OverlayAction = Extract<PrototypeAction, { type: "overlay" }>;
type OverlayPosition = NonNullable<OverlayAction["position"]>;

export type OverlayPresentation = {
  position: OverlayPosition;
  overlayWidth?: number;
  overlayHeight?: number;
  dim: number;
};

export type SmartAnimatePlan = {
  matchCount: number;
  coverage: number;
  shiftX: number;
  shiftY: number;
  scaleX: number;
  scaleY: number;
  anchor?: {
    fromNodeId: string;
    toNodeId: string;
    fromCenter: { x: number; y: number };
    toCenter: { x: number; y: number };
  };
};

type MotionDoc = Pick<Doc, "pages" | "nodes">;

const DEFAULT_DIM = 0.12;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeSize(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function getNodeKey(node: Node) {
  if (node.sourceId?.trim()) return `source:${node.sourceId.trim()}`;
  if (node.componentId?.trim()) return `component:${node.componentId.trim()}`;
  const name = node.name.trim().toLowerCase();
  if (!name) return null;
  return `${node.type}:${name}`;
}

function getPageById(doc: MotionDoc, pageId: string) {
  return doc.pages.find((page) => page.id === pageId) ?? null;
}

function getAbsoluteFrame(doc: MotionDoc, nodeId: string): Frame | null {
  const node = doc.nodes[nodeId];
  if (!node) return null;
  let x = node.frame.x;
  let y = node.frame.y;
  let parentId = node.parentId;
  while (parentId) {
    const parent = doc.nodes[parentId];
    if (!parent) break;
    x += parent.frame.x;
    y += parent.frame.y;
    parentId = parent.parentId;
  }
  return { ...node.frame, x, y };
}

function collectPageNodeFrames(doc: MotionDoc, pageId: string) {
  const page = getPageById(doc, pageId);
  if (!page) return [] as Array<{ nodeId: string; node: Node; frame: Frame; key: string }>;
  const root = doc.nodes[page.rootId];
  if (!root) return [];
  const out: Array<{ nodeId: string; node: Node; frame: Frame; key: string }> = [];
  const stack = [...root.children];
  while (stack.length) {
    const id = stack.shift()!;
    const node = doc.nodes[id];
    if (!node || node.hidden) continue;
    stack.unshift(...node.children);
    const key = getNodeKey(node);
    const frame = getAbsoluteFrame(doc, id);
    if (!key || !frame) continue;
    out.push({ nodeId: id, node, frame, key });
  }
  return out;
}

export function normalizeOverlayPresentation(action?: PrototypeAction | null): OverlayPresentation {
  if (!action || action.type !== "overlay") {
    return { position: "center", dim: DEFAULT_DIM };
  }
  return {
    position: action.position ?? "center",
    overlayWidth: sanitizeSize(action.overlayWidth),
    overlayHeight: sanitizeSize(action.overlayHeight),
    dim: clamp(typeof action.dim === "number" ? action.dim : DEFAULT_DIM, 0, 0.95),
  };
}

export function deriveSmartAnimatePlan(doc: MotionDoc, fromPageId: string, toPageId: string): SmartAnimatePlan | null {
  const fromNodes = collectPageNodeFrames(doc, fromPageId);
  const toNodes = collectPageNodeFrames(doc, toPageId);
  if (!fromNodes.length || !toNodes.length) return null;

  const fromMap = new Map<string, typeof fromNodes>();
  const toMap = new Map<string, typeof toNodes>();
  fromNodes.forEach((entry) => fromMap.set(entry.key, [...(fromMap.get(entry.key) ?? []), entry]));
  toNodes.forEach((entry) => toMap.set(entry.key, [...(toMap.get(entry.key) ?? []), entry]));

  const matches = Array.from(fromMap.entries())
    .filter(([key]) => toMap.has(key) && fromMap.get(key)?.length === 1 && toMap.get(key)?.length === 1)
    .map(([key]) => {
      const fromEntry = fromMap.get(key)![0]!;
      const toEntry = toMap.get(key)![0]!;
      const fromArea = Math.max(1, fromEntry.frame.w * fromEntry.frame.h);
      const toArea = Math.max(1, toEntry.frame.w * toEntry.frame.h);
      return {
        from: fromEntry,
        to: toEntry,
        area: Math.min(fromArea, toArea),
      };
    })
    .sort((a, b) => b.area - a.area);

  if (!matches.length) return null;

  const anchor = matches[0]!;
  const fromCenter = {
    x: anchor.from.frame.x + anchor.from.frame.w / 2,
    y: anchor.from.frame.y + anchor.from.frame.h / 2,
  };
  const toCenter = {
    x: anchor.to.frame.x + anchor.to.frame.w / 2,
    y: anchor.to.frame.y + anchor.to.frame.h / 2,
  };
  const shiftX = fromCenter.x - toCenter.x;
  const shiftY = fromCenter.y - toCenter.y;
  const scaleX = clamp(anchor.from.frame.w / Math.max(1, anchor.to.frame.w), 0.6, 1.4);
  const scaleY = clamp(anchor.from.frame.h / Math.max(1, anchor.to.frame.h), 0.6, 1.4);
  const coverage = matches.length / Math.max(fromNodes.length, toNodes.length);

  return {
    matchCount: matches.length,
    coverage,
    shiftX,
    shiftY,
    scaleX,
    scaleY,
    anchor: {
      fromNodeId: anchor.from.nodeId,
      toNodeId: anchor.to.nodeId,
      fromCenter,
      toCenter,
    },
  };
}

export function buildPageTransitionAnimationStyle(
  type: PrototypeTransitionType,
  role: "from" | "to",
  isActive: boolean,
  duration: number,
  easing: string,
  smartPlan?: SmartAnimatePlan | null,
): CSSProperties {
  if (type === "fade") {
    return {
      opacity: role === "from" ? (isActive ? 0 : 1) : isActive ? 1 : 0,
      transition: `opacity ${duration}ms ${easing}`,
    };
  }

  if (type === "slide-left") {
    return {
      transform: role === "from" ? `translateX(${isActive ? "-20%" : "0%"})` : `translateX(${isActive ? "0%" : "100%"})`,
      transition: `transform ${duration}ms ${easing}`,
    };
  }

  if (type === "slide-right") {
    return {
      transform: role === "from" ? `translateX(${isActive ? "20%" : "0%"})` : `translateX(${isActive ? "0%" : "-100%"})`,
      transition: `transform ${duration}ms ${easing}`,
    };
  }

  const plan = smartPlan;
  const shiftWeight = clamp((plan?.coverage ?? 0.2) * 1.6, 0.18, 0.42);
  const dx = clamp((plan?.shiftX ?? 0) * shiftWeight, -160, 160);
  const dy = clamp((plan?.shiftY ?? 0) * shiftWeight, -160, 160);
  const sx = plan ? clamp(1 + (plan.scaleX - 1) * 0.12, 0.92, 1.08) : 1;
  const sy = plan ? clamp(1 + (plan.scaleY - 1) * 0.12, 0.92, 1.08) : 1;
  const startScaleX = clamp(2 - sx, 0.92, 1.08);
  const startScaleY = clamp(2 - sy, 0.92, 1.08);
  const transformOrigin = plan?.anchor ? `${plan.anchor.toCenter.x}px ${plan.anchor.toCenter.y}px` : "50% 50%";

  return {
    opacity: role === "from" ? (isActive ? 0 : 1) : isActive ? 1 : 0,
    transform:
      role === "from"
        ? isActive
          ? `translate(${-dx}px, ${-dy}px) scale(${sx}, ${sy})`
          : "translate(0px, 0px) scale(1, 1)"
        : isActive
          ? "translate(0px, 0px) scale(1, 1)"
          : `translate(${dx}px, ${dy}px) scale(${startScaleX}, ${startScaleY})`,
    transformOrigin,
    transition: `transform ${duration}ms ${easing}, opacity ${duration}ms ${easing}`,
    willChange: "transform, opacity",
  };
}

function buildOverlayTranslate(position: OverlayPosition, distance: number) {
  if (position.startsWith("top")) return { x: 0, y: -distance };
  if (position.startsWith("bottom")) return { x: 0, y: distance };
  if (position === "left") return { x: -distance, y: 0 };
  if (position === "right") return { x: distance, y: 0 };
  return { x: 0, y: distance * 0.35 };
}

export function buildOverlayTransitionAnimationStyle(args: {
  type: PrototypeTransitionType;
  mode: "enter" | "exit";
  isActive: boolean;
  duration: number;
  easing: string;
  presentation: OverlayPresentation;
  smartPlan?: SmartAnimatePlan | null;
}): CSSProperties {
  const { type, mode, isActive, duration, easing, presentation, smartPlan } = args;

  if (type === "fade") {
    return {
      opacity: mode === "enter" ? (isActive ? 1 : 0) : isActive ? 0 : 1,
      transition: `opacity ${duration}ms ${easing}`,
    };
  }

  if (type === "slide-left" || type === "slide-right") {
    const offset = buildOverlayTranslate(presentation.position, 80);
    const direction = type === "slide-right" ? -1 : 1;
    const x = offset.x === 0 ? 0 : offset.x * direction;
    const y = offset.y === 0 ? 0 : offset.y * direction;
    const start = `translate(${x}px, ${y}px)`;
    return {
      transform: mode === "enter" ? (isActive ? "translate(0px, 0px)" : start) : isActive ? start : "translate(0px, 0px)",
      transition: `transform ${duration}ms ${easing}`,
    };
  }

  const plan = smartPlan;
  const dx = clamp((plan?.shiftX ?? 0) * 0.18, -120, 120);
  const dy = clamp((plan?.shiftY ?? 0) * 0.18, -120, 120);
  const baseOffset = buildOverlayTranslate(presentation.position, 48);
  const start = `translate(${baseOffset.x + dx}px, ${baseOffset.y + dy}px) scale(0.98)`;
  const end = "translate(0px, 0px) scale(1)";

  return {
    opacity: mode === "enter" ? (isActive ? 1 : 0) : isActive ? 0 : 1,
    transform: mode === "enter" ? (isActive ? end : start) : isActive ? start : end,
    transition: `transform ${duration}ms ${easing}, opacity ${duration}ms ${easing}`,
    willChange: "transform, opacity",
  };
}

export function buildOverlayBackdropStyle(presentation: OverlayPresentation): CSSProperties {
  return {
    backgroundColor: `rgba(15, 23, 42, ${presentation.dim})`,
  };
}

export function buildOverlayShellStyle(presentation: OverlayPresentation): CSSProperties {
  const justifyContent =
    presentation.position === "left" || presentation.position === "top-left" || presentation.position === "bottom-left"
      ? "flex-start"
      : presentation.position === "right" || presentation.position === "top-right" || presentation.position === "bottom-right"
        ? "flex-end"
        : "center";
  const alignItems =
    presentation.position === "top" || presentation.position === "top-left" || presentation.position === "top-right"
      ? "flex-start"
      : presentation.position === "bottom" || presentation.position === "bottom-left" || presentation.position === "bottom-right"
        ? "flex-end"
        : "center";

  return {
    display: "flex",
    justifyContent,
    alignItems,
    padding: 24,
  };
}

export function buildOverlayCardStyle(presentation: OverlayPresentation, frame?: Frame | null): CSSProperties {
  return {
    width: presentation.overlayWidth ?? frame?.w ?? "min(92vw, 960px)",
    height: presentation.overlayHeight ?? frame?.h ?? "auto",
    maxWidth: "92vw",
    maxHeight: "88vh",
    overflow: "hidden",
    borderRadius: 20,
    boxShadow: "0 24px 80px rgba(15, 23, 42, 0.24)",
    background: "#fff",
    pointerEvents: "auto",
  };
}
