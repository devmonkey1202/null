import { createNode, type Frame, type Node, type NodeWidget } from "../doc/scene";
import { DEFAULT_FONT_FAMILY } from "./AdvancedEditor.constants";

export function makeFrameNode(
  name: string,
  frame: Frame,
  options: {
    fill?: string;
    stroke?: { color: string; width: number } | null;
    radius?: number;
    layout?: Node["layout"];
    layoutSizing?: Node["layoutSizing"];
  } = {},
) {
  const node = createNode("frame");
  node.name = name;
  node.frame = { ...node.frame, ...frame };
  node.style = {
    ...node.style,
    fills: options.fill ? [{ type: "solid", color: options.fill }] : node.style.fills,
    strokes:
      options.stroke === null
        ? []
        : options.stroke
          ? [{ color: options.stroke.color, width: options.stroke.width, align: "inside" }]
          : node.style.strokes,
    radius: options.radius ?? node.style.radius,
  };
  if (options.layout) node.layout = options.layout;
  if (options.layoutSizing) node.layoutSizing = { ...options.layoutSizing };
  return node;
}

export function makeRectNode(
  name: string,
  frame: Frame,
  options: {
    fill?: string;
    stroke?: { color: string; width: number };
    radius?: number;
  } = {},
) {
  const node = createNode("rect");
  node.name = name;
  node.frame = { ...node.frame, ...frame };
  node.style = {
    ...node.style,
    fills: options.fill ? [{ type: "solid", color: options.fill }] : node.style.fills,
    strokes: options.stroke ? [{ color: options.stroke.color, width: options.stroke.width, align: "inside" }] : node.style.strokes,
    radius: options.radius ?? node.style.radius,
  };
  return node;
}

export function makeEllipseNode(
  name: string,
  frame: Frame,
  options: {
    fill?: string;
    stroke?: { color: string; width: number };
  } = {},
) {
  const node = createNode("ellipse");
  node.name = name;
  node.frame = { ...node.frame, ...frame };
  node.style = {
    ...node.style,
    fills: options.fill ? [{ type: "solid", color: options.fill }] : node.style.fills,
    strokes: options.stroke ? [{ color: options.stroke.color, width: options.stroke.width, align: "inside" }] : node.style.strokes,
  };
  return node;
}

export function makeGroupNode(name: string, frame: Frame) {
  const node = createNode("group");
  node.name = name;
  node.frame = { ...node.frame, ...frame };
  node.style = { ...node.style, fills: [] };
  return node;
}

export function makeTextNode(
  name: string,
  value: string,
  frame: Frame,
  options: {
    color?: string;
    size?: number;
    weight?: number;
    align?: "left" | "center" | "right";
    layoutSizing?: Node["layoutSizing"];
  } = {},
) {
  const node = createNode("text");
  node.name = name;
  node.frame = { ...node.frame, ...frame };
  const baseStyle = node.text?.style ?? {
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: 16,
    fontWeight: 500,
    lineHeight: 1.4,
    letterSpacing: 0,
    align: "left",
  };
  node.text = {
    value,
    style: {
      ...baseStyle,
      fontSize: options.size ?? baseStyle.fontSize,
      fontWeight: options.weight ?? baseStyle.fontWeight,
      align: options.align ?? baseStyle.align,
    },
    wrap: true,
    autoSize: false,
  };
  node.style = {
    ...node.style,
    fills: [{ type: "solid", color: options.color ?? "#111111" }],
  };
  if (options.layoutSizing) node.layoutSizing = { ...options.layoutSizing };
  return node;
}

export function makeWidgetNode(
  name: string,
  frame: Frame,
  widget: NodeWidget,
) {
  const node = createNode("frame");
  node.name = name;
  node.frame = { ...node.frame, ...frame };
  node.style = { ...node.style, fills: [], strokes: [{ color: "#6366F1", width: 1, align: "inside" }] };
  node.clipContent = true;
  node.widget = widget;
  return node;
}

export function fieldPlaceholder(key: string, label: string) {
  return `[${key}]: ${label}`;
}
