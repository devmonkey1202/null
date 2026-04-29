import type { Fill, NodeImage } from "../doc/scene";

export const MEDIA_PATTERN_BOX = 100;

type CropRect = { x: number; y: number; w: number; h: number };

type MediaLayoutInput = {
  width: number;
  height: number;
  fit: "cover" | "contain" | "fill";
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  crop?: CropRect;
  focalX?: number;
  focalY?: number;
};

export type MediaLayout = {
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
  clipX: number;
  clipY: number;
  clipWidth: number;
  clipHeight: number;
  preserveAspectRatio: string;
};

type ImageFill = Extract<Fill, { type: "image" }>;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeCrop(width: number, height: number, crop?: CropRect): CropRect {
  if (!crop) return { x: 0, y: 0, w: width, h: height };
  const x = clamp(crop.x, 0, 1) * width;
  const y = clamp(crop.y, 0, 1) * height;
  const w = clamp(crop.w, 0.01, 1) * width;
  const h = clamp(crop.h, 0.01, 1) * height;
  return {
    x: clamp(x, 0, width),
    y: clamp(y, 0, height),
    w: clamp(w, 1, width),
    h: clamp(h, 1, height),
  };
}

function getAlignKeyword(value: number | undefined, axis: "x" | "y") {
  const normalized = clamp(value ?? 0.5, 0, 1);
  if (axis === "x") {
    if (normalized <= 0.33) return "xMin";
    if (normalized >= 0.67) return "xMax";
    return "xMid";
  }
  if (normalized <= 0.33) return "YMin";
  if (normalized >= 0.67) return "YMax";
  return "YMid";
}

export function getMediaPreserveAspectRatio(
  fit: "cover" | "contain" | "fill",
  focalX?: number,
  focalY?: number,
) {
  if (fit === "fill") return "none";
  return `${getAlignKeyword(focalX, "x")}${getAlignKeyword(focalY, "y")} ${fit === "contain" ? "meet" : "slice"}`;
}

export function resolveMediaLayout(input: MediaLayoutInput): MediaLayout {
  const width = Math.max(1, input.width);
  const height = Math.max(1, input.height);
  const scale = clamp(input.scale ?? 1, 0.05, 20);
  const clip = normalizeCrop(width, height, input.crop);
  const imageWidth = width * scale;
  const imageHeight = height * scale;
  const focalX = clamp(input.focalX ?? 0.5, 0, 1);
  const focalY = clamp(input.focalY ?? 0.5, 0, 1);
  const overflowX = Math.max(0, imageWidth - clip.w);
  const overflowY = Math.max(0, imageHeight - clip.h);
  return {
    imageX: clip.x + (input.offsetX ?? 0) - overflowX * focalX,
    imageY: clip.y + (input.offsetY ?? 0) - overflowY * focalY,
    imageWidth,
    imageHeight,
    clipX: clip.x,
    clipY: clip.y,
    clipWidth: clip.w,
    clipHeight: clip.h,
    preserveAspectRatio: getMediaPreserveAspectRatio(input.fit, focalX, focalY),
  };
}

export function resolveNodeMediaLayout(width: number, height: number, media?: Partial<NodeImage>) {
  return resolveMediaLayout({
    width,
    height,
    fit: media?.fit ?? "cover",
    scale: media?.scale,
    offsetX: media?.offsetX,
    offsetY: media?.offsetY,
    crop: media?.crop,
    focalX: media?.focalX,
    focalY: media?.focalY,
  });
}

export function resolveImageFillLayout(fill: ImageFill, size = MEDIA_PATTERN_BOX) {
  return resolveMediaLayout({
    width: size,
    height: size,
    fit: fill.fit,
    scale: fill.scale,
    offsetX: fill.offsetX,
    offsetY: fill.offsetY,
    crop: fill.crop,
    focalX: fill.focalX,
    focalY: fill.focalY,
  });
}
