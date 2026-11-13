import type {
  RenderItem,
  RenderList,
  RenderPaint,
  RenderTransform,
} from "@/v2/editor/contracts";

export const WEBGL_INSTANCE_FLOATS = 20;

export type RenderColor = readonly [number, number, number, number];

export type WebGlPrimitiveBatch = {
  instances: Float32Array;
  instanceCount: number;
  supportedCommandIds: string[];
  unsupportedCommandIds: string[];
  skippedCommandIds: string[];
  invalidPaintCommandIds: string[];
};

type MutableRenderColor = [number, number, number, number];

type QuadInstance = {
  transform: RenderTransform;
  width: number;
  height: number;
  fill: RenderColor;
  stroke: RenderColor;
  strokeWidth: number;
  cornerRadius: number;
  shapeKind: 0 | 1;
};

const TRANSPARENT: RenderColor = [0, 0, 0, 0];

function clampUnit(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function byteToUnit(value: string) {
  return Number.parseInt(value, 16) / 255;
}

function parseHexColor(value: string): MutableRenderColor | null {
  const hex = value.slice(1);
  if (hex.length === 3 || hex.length === 4) {
    const channels = [...hex].map((channel) => byteToUnit(`${channel}${channel}`));
    return [channels[0], channels[1], channels[2], channels[3] ?? 1];
  }
  if (hex.length === 6 || hex.length === 8) {
    return [
      byteToUnit(hex.slice(0, 2)),
      byteToUnit(hex.slice(2, 4)),
      byteToUnit(hex.slice(4, 6)),
      hex.length === 8 ? byteToUnit(hex.slice(6, 8)) : 1,
    ];
  }
  return null;
}

function parseRgbChannel(value: string) {
  const normalized = value.trim();
  if (normalized.endsWith("%")) {
    return clampUnit(Number.parseFloat(normalized) / 100);
  }
  return clampUnit(Number.parseFloat(normalized) / 255);
}

function parseAlphaChannel(value: string) {
  const normalized = value.trim();
  if (normalized.endsWith("%")) {
    return clampUnit(Number.parseFloat(normalized) / 100);
  }
  return clampUnit(Number.parseFloat(normalized));
}

function parseRgbColor(value: string): MutableRenderColor | null {
  const match = value.match(/^rgba?\((.*)\)$/i);
  if (!match) {
    return null;
  }
  const slashParts = match[1].split(/\s*\/\s*/);
  if (slashParts.length > 2) {
    return null;
  }
  const channels = slashParts[0].includes(",")
    ? slashParts[0].split(",").map((channel) => channel.trim())
    : slashParts[0].split(/\s+/).filter(Boolean);
  if (slashParts[1]) {
    channels.push(slashParts[1]);
  }
  if (channels.length !== 3 && channels.length !== 4) {
    return null;
  }
  const red = parseRgbChannel(channels[0]);
  const green = parseRgbChannel(channels[1]);
  const blue = parseRgbChannel(channels[2]);
  const alpha = channels[3] === undefined ? 1 : parseAlphaChannel(channels[3]);
  if (![red, green, blue, alpha].every(Number.isFinite)) {
    return null;
  }
  return [red, green, blue, alpha];
}

export function parseRenderColor(value: string | undefined): RenderColor | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "transparent") {
    return TRANSPARENT;
  }
  if (normalized === "black") {
    return [0, 0, 0, 1];
  }
  if (normalized === "white") {
    return [1, 1, 1, 1];
  }
  if (normalized.startsWith("#")) {
    return parseHexColor(normalized);
  }
  return parseRgbColor(normalized);
}

function applyOpacity(color: RenderColor | null, opacity: number): RenderColor {
  if (!color) {
    return TRANSPARENT;
  }
  return [color[0], color[1], color[2], clampUnit(color[3] * opacity)];
}

function multiplyTransforms(left: RenderTransform, right: RenderTransform): RenderTransform {
  return {
    m11: left.m11 * right.m11 + left.m21 * right.m12,
    m12: left.m12 * right.m11 + left.m22 * right.m12,
    m21: left.m11 * right.m21 + left.m21 * right.m22,
    m22: left.m12 * right.m21 + left.m22 * right.m22,
    dx: left.m11 * right.dx + left.m21 * right.dy + left.dx,
    dy: left.m12 * right.dx + left.m22 * right.dy + left.dy,
  };
}

function paintColors(paint: RenderPaint) {
  const fill = paint.fill ? parseRenderColor(paint.fill) : TRANSPARENT;
  const stroke = paint.stroke ? parseRenderColor(paint.stroke) : TRANSPARENT;
  return {
    fill: applyOpacity(fill, paint.opacity),
    stroke: applyOpacity(stroke, paint.opacity),
    invalid: (Boolean(paint.fill) && !fill) || (Boolean(paint.stroke) && !stroke),
  };
}

function shapeInstance(item: RenderItem): { instance: QuadInstance | null; invalidPaint: boolean } | null {
  const primitive = item.primitive;
  if (primitive.kind === "rect" || primitive.kind === "ellipse") {
    const colors = paintColors(primitive.paint);
    const width = Math.max(primitive.width, 0);
    const height = Math.max(primitive.height, 0);
    if (width === 0 || height === 0) {
      return { instance: null, invalidPaint: colors.invalid };
    }
    return {
      instance: {
        transform: item.transform,
        width,
        height,
        fill: colors.fill,
        stroke: colors.stroke,
        strokeWidth: Math.max(primitive.paint.strokeWidth, 0),
        cornerRadius:
          primitive.kind === "ellipse"
            ? 0
            : Math.min(Math.max(primitive.cornerRadius, 0), width / 2, height / 2),
        shapeKind: primitive.kind === "ellipse" ? 1 : 0,
      },
      invalidPaint: colors.invalid,
    };
  }

  if (primitive.kind !== "line") {
    return null;
  }

  const deltaX = primitive.x2 - primitive.x1;
  const deltaY = primitive.y2 - primitive.y1;
  const length = Math.hypot(deltaX, deltaY);
  const strokeWidth = Math.max(primitive.paint.strokeWidth, 0);
  const stroke = primitive.paint.stroke
    ? parseRenderColor(primitive.paint.stroke)
    : parseRenderColor(primitive.paint.fill);
  const invalidPaint = Boolean(primitive.paint.stroke || primitive.paint.fill) && !stroke;
  if (length === 0 || strokeWidth === 0) {
    return { instance: null, invalidPaint };
  }

  const cosine = deltaX / length;
  const sine = deltaY / length;
  const halfStroke = strokeWidth / 2;
  const lineTransform: RenderTransform = {
    m11: cosine,
    m12: sine,
    m21: -sine,
    m22: cosine,
    dx: primitive.x1 + sine * halfStroke,
    dy: primitive.y1 - cosine * halfStroke,
  };
  return {
    instance: {
      transform: multiplyTransforms(item.transform, lineTransform),
      width: length,
      height: strokeWidth,
      fill: applyOpacity(stroke, primitive.paint.opacity),
      stroke: TRANSPARENT,
      strokeWidth: 0,
      cornerRadius: halfStroke,
      shapeKind: 0,
    },
    invalidPaint,
  };
}

function writeInstance(target: Float32Array, index: number, instance: QuadInstance) {
  const offset = index * WEBGL_INSTANCE_FLOATS;
  target.set(
    [
      instance.transform.m11,
      instance.transform.m12,
      instance.transform.m21,
      instance.transform.m22,
      instance.transform.dx,
      instance.transform.dy,
      instance.width,
      instance.height,
      ...instance.fill,
      ...instance.stroke,
      instance.strokeWidth,
      instance.cornerRadius,
      instance.shapeKind,
      0,
    ],
    offset,
  );
}

export function buildWebGlPrimitiveBatch(renderList: RenderList): WebGlPrimitiveBatch {
  const prepared: Array<{ item: RenderItem; instance: QuadInstance }> = [];
  const supportedCommandIds: string[] = [];
  const unsupportedCommandIds: string[] = [];
  const skippedCommandIds: string[] = [];
  const invalidPaintCommandIds: string[] = [];

  for (const item of renderList.items) {
    const result = shapeInstance(item);
    if (!result) {
      unsupportedCommandIds.push(item.commandId);
      continue;
    }
    supportedCommandIds.push(item.commandId);
    if (result.invalidPaint) {
      invalidPaintCommandIds.push(item.commandId);
    }
    if (!result.instance) {
      skippedCommandIds.push(item.commandId);
      continue;
    }
    prepared.push({ item, instance: result.instance });
  }

  prepared.sort((left, right) => left.item.zIndex - right.item.zIndex);
  const instances = new Float32Array(prepared.length * WEBGL_INSTANCE_FLOATS);
  prepared.forEach(({ instance }, index) => writeInstance(instances, index, instance));

  return {
    instances,
    instanceCount: prepared.length,
    supportedCommandIds,
    unsupportedCommandIds,
    skippedCommandIds,
    invalidPaintCommandIds,
  };
}
