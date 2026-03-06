"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** N4: 이미지 로드 실패 시 placeholder·경고 표시 */
function MediaImageWithError({
  nodeId,
  href,
  fw,
  fh,
  offsetX,
  offsetY,
  scale,
  preserve,
  clipId,
  filterUrl,
}: {
  nodeId: string;
  href: string;
  fw: number;
  fh: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  preserve: string;
  clipId: string;
  filterUrl?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <g>
        <rect
          x={0}
          y={0}
          width={fw}
          height={fh}
          fill="#F3F3F3"
          stroke="#E57373"
          strokeWidth={1}
          strokeDasharray="6 4"
        />
        <line x1={0} y1={0} x2={fw} y2={fh} stroke="#E57373" strokeWidth={1} />
        <line x1={fw} y1={0} x2={0} y2={fh} stroke="#E57373" strokeWidth={1} />
        <text x={fw / 2} y={fh / 2} textAnchor="middle" dominantBaseline="middle" fill="#C62828" fontSize={12}>
          이미지 로드 실패
        </text>
      </g>
    );
  }
  return (
    <image
      href={href}
      xlinkHref={href}
      x={offsetX}
      y={offsetY}
      width={fw * scale}
      height={fh * scale}
      preserveAspectRatio={preserve}
      clipPath={`url(#${clipId})`}
      filter={filterUrl}
      onError={() => setFailed(true)}
    />
  );
}

function MediaVideo({
  href,
  fw,
  fh,
  offsetX,
  offsetY,
  scale,
  fit,
  radius,
  brightness,
  contrast,
  autoplay,
  loop,
  muted,
  controls,
  poster,
}: {
  href: string;
  fw: number;
  fh: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  fit: "cover" | "contain" | "fill";
  radius: number;
  brightness: number;
  contrast: number;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  poster?: string;
}) {
  if (!href) {
    return (
      <g>
        <rect
          x={0}
          y={0}
          width={fw}
          height={fh}
          fill="#F3F3F3"
          stroke="#B8B8B8"
          strokeWidth={1}
          strokeDasharray="6 4"
        />
        <line x1={0} y1={0} x2={fw} y2={fh} stroke="#B8B8B8" strokeWidth={1} />
        <line x1={fw} y1={0} x2={0} y2={fh} stroke="#B8B8B8" strokeWidth={1} />
        <text x={fw / 2} y={fh / 2} textAnchor="middle" dominantBaseline="middle" fill="#666666" fontSize={12}>
          Video
        </text>
      </g>
    );
  }
  const fitValue = fit === "fill" ? "fill" : fit;
  const filter = `brightness(${brightness}) contrast(${contrast})`;
  const safeControls = controls !== false;
  const safeAutoplay = Boolean(autoplay);
  const effectiveMuted = Boolean(muted) || safeAutoplay;
  return (
    <foreignObject x={0} y={0} width={fw} height={fh}>
      <div
        style={{
          width: fw,
          height: fh,
          overflow: "hidden",
          borderRadius: radius || 0,
        }}
      >
        <video
          src={href}
          poster={poster}
          controls={safeControls}
          loop={Boolean(loop)}
          muted={effectiveMuted}
          autoPlay={safeAutoplay}
          playsInline
          style={{
            width: fw * scale,
            height: fh * scale,
            transform: `translate(${offsetX}px, ${offsetY}px)`,
            objectFit: fitValue,
            filter: filter,
          }}
        />
      </div>
    </foreignObject>
  );
}

function normalizeImageSrc(raw?: string) {
  const src = (raw ?? "").trim();
  if (!src) return "";
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;
  try {
    return encodeURI(src);
  } catch {
    return src;
  }
}

const fileUrlCache = new WeakMap<File, string>();
function getFileObjectUrl(file: File) {
  const cached = fileUrlCache.get(file);
  if (cached) return cached;
  const url = URL.createObjectURL(file);
  fileUrlCache.set(file, url);
  return url;
}

type ImageFill = Extract<Fill, { type: "image" }>;
function isImageFill(fill: Fill | null | undefined): fill is ImageFill {
  return !!fill && fill.type === "image";
}
import { hydrateDoc } from "../doc/scene";
import { layoutDoc } from "../layout/engine";
import type { Doc, Node, SerializableDoc, Fill, Stroke, StyleToken, TextStyle, PrototypeAction, PrototypeTrigger, PrototypeInteraction, Variable } from "../doc/scene";
import { getPageContentBounds, getNodeChildrenBounds } from "./bounds";
import { getCustomNodeRenderer } from "./plugins";

function getEffectFilterId(prefix: string, nodeId: string) {
  return `${prefix}-${nodeId}`;
}

/** §5.1 element_label_hash: 라벨 해시 (개인정보 유의) */
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

export type NavigateEvent = {
  pageId: string;
  nodeId: string;
  trigger: PrototypeTrigger;
  action: PrototypeAction;
};

const DEFAULT_FONT_FAMILY = "Space Grotesk, 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

let textMeasureCanvas: HTMLCanvasElement | null = null;
function getTextMeasureContext() {
  if (typeof document === "undefined") return null;
  if (!textMeasureCanvas) textMeasureCanvas = document.createElement("canvas");
  return textMeasureCanvas.getContext("2d");
}

function measureTextWidth(text: string, style: TextStyle) {
  const fontSize = style.fontSize ?? 16;
  const fontWeight = style.fontWeight ?? 400;
  const fontFamily = style.fontFamily ?? DEFAULT_FONT_FAMILY;
  const ctx = getTextMeasureContext();
  if (!ctx) return text.length * fontSize * 0.6;
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const base = ctx.measureText(text).width;
  const spacing = style.letterSpacing ?? 0;
  const extra = text.length > 1 ? (text.length - 1) * spacing : 0;
  return base + extra;
}

function wrapTextLines(text: string, style: TextStyle, maxWidth: number) {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return text.split("\n");
  const lines: string[] = [];
  const paragraphs = text.split("\n");
  paragraphs.forEach((paragraph) => {
    if (!paragraph) {
      lines.push("");
      return;
    }
    const words = paragraph.split(/\s+/);
    let current = "";
    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (!current) {
        current = candidate;
        return;
      }
      if (measureTextWidth(candidate, style) <= maxWidth) {
        current = candidate;
        return;
      }
      lines.push(current);
      if (measureTextWidth(word, style) > maxWidth) {
        let chunk = "";
        for (const char of word) {
          const nextChunk = chunk + char;
          if (measureTextWidth(nextChunk, style) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = char;
          } else {
            chunk = nextChunk;
          }
        }
        if (chunk) lines.push(chunk);
        current = "";
        return;
      }
      current = word;
    });
    if (current) lines.push(current);
  });
  return lines;
}

type Props = {
  doc: Doc | SerializableDoc;
  activePageId?: string;
  interactive?: boolean;
  onNavigate?: (event: NavigateEvent) => void;
  svgRef?: React.Ref<SVGSVGElement>;
  fitToContent?: boolean;
  controlState?: Record<string, boolean>;
  onToggleControl?: (rootId: string) => void;
  controlTextState?: Record<string, string>;
  controlFileState?: Record<string, File[]>;
  onChangeControlText?: (rootId: string, value: string) => void;
  onChangeControlFile?: (rootId: string, files: File[]) => void;
  invalidControlIds?: Set<string>;
  disabledControlIds?: Set<string>;
  hiddenNodeIds?: Set<string>;
  childOrderOverrides?: Record<string, string[]>;
  textOverrides?: Record<string, string>;
  headerCompact?: boolean;
  activeSubmitButtonIds?: Set<string>;
  activeSubmitButtonFill?: string;
  activeSubmitButtonTextFill?: string;
  variableRuntime?: VariableRuntime;
  /** 런타임 변형 오버라이드: instanceId -> variantId (프로토타입 setVariant 액션용) */
  instanceVariantOverrides?: Record<string, string>;
  /** NOCODE 3: 작품(페이지) ID. 컬렉션 바인딩 시 /api/app/[appPageId]/[model] 호출용 */
  appPageId?: string;
  /** C1: 팀 라이브러리·파일 간 컴포넌트. libraryId → 해당 라이브러리 Doc. */
  getLibraryDoc?: (libraryId: string) => Doc | undefined;
};

export type ControlRole =
  | { type: "checkbox"; role: "root" | "box"; rootId: string; boxId: string }
  | { type: "toggle"; role: "root" | "track" | "knob"; rootId: string; trackId: string; knobId: string; knobOnX: number; knobOffX: number }
  | { type: "choice"; role: "root" | "label"; rootId: string; labelId?: string }
  | {
      type: "input";
      role: "root" | "placeholder";
      rootId: string;
      placeholder: string;
      multiline: boolean;
      inputType: "text" | "email" | "password" | "number" | "tel" | "url" | "date" | "file";
      padding: { t: number; r: number; b: number; l: number };
      font: { family: string; size: number; weight: number; color: string; lineHeight: number };
    };

function findStyleToken(doc: Doc, id: string | undefined, type: StyleToken["type"]) {
  if (!id) return null;
  const token = doc.styles.find((item) => item.id === id && item.type === type);
  return token ?? null;
}

export type VariableRuntime = {
  mode?: string;
  variableOverrides?: Record<string, string | number | boolean>;
  /** NOCODE 3: 리스트/테이블 바인딩 시 현재 행 데이터. 텍스트에서 {{ row.필드명 }} 으로 참조 */
  rowContext?: Record<string, unknown>;
};

function resolveVariableValue(doc: Doc, variable: Variable, variableRuntime?: VariableRuntime) {
  if (variableRuntime?.variableOverrides && variable.id in variableRuntime.variableOverrides) {
    const v = variableRuntime.variableOverrides[variable.id];
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
    return undefined;
  }
  const mode = variableRuntime?.mode ?? doc.variableMode;
  if (mode && variable.modes && mode in variable.modes) {
    return variable.modes[mode];
  }
  return variable.value;
}

function resolveVariableColor(doc: Doc, id: string | undefined, variableRuntime?: VariableRuntime) {
  if (!id) return null;
  const variable = doc.variables.find((item) => item.id === id && item.type === "color");
  if (!variable) return null;
  const value = resolveVariableValue(doc, variable, variableRuntime);
  return typeof value === "string" ? value : null;
}


function resolveNumberOverride(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function resolveTextScale(variableRuntime?: VariableRuntime) {
  const overrides = variableRuntime?.variableOverrides ?? {};
  return (
    resolveNumberOverride(overrides.textScale) ??
    resolveNumberOverride(overrides.fontScale) ??
    resolveNumberOverride(overrides.text_scale) ??
    1
  );
}

function resolveHighContrast(variableRuntime?: VariableRuntime) {
  const overrides = variableRuntime?.variableOverrides ?? {};
  const raw = overrides.highContrast ?? overrides.high_contrast ?? overrides.contrast;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw > 0;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (["true", "1", "yes", "on", "high"].includes(normalized)) return true;
    if (["false", "0", "no", "off", "normal"].includes(normalized)) return false;
  }
  return false;
}

function resolveTooltipTimeout(variableRuntime?: VariableRuntime) {
  const overrides = variableRuntime?.variableOverrides ?? {};
  return (
    resolveNumberOverride(overrides.tooltipTimeout) ??
    resolveNumberOverride(overrides.tooltip_timeout) ??
    resolveNumberOverride(overrides.tooltipDelay) ??
    3500
  );
}

function resolveFill(doc: Doc, node: Node): Fill[] {
  const token = findStyleToken(doc, node.style.fillStyleId, "fill");
  if (token && Array.isArray(token.value)) return token.value as Fill[];
  return node.style.fills;
}

function pickFill(doc: Doc, node: Node, variableRuntime?: VariableRuntime): string {
  const variableColor = resolveVariableColor(doc, node.style.fillRef, variableRuntime);
  if (variableColor) return variableColor;
  const fills = resolveFill(doc, node);
  if (!fills.length) return "transparent";
  const fill = fills[0];
  if (fill.type === "solid") return fill.color;
  if (fill.type === "linear") return `url(#${GRADIENT_PREFIX}-${node.id})`;
  if (fill.type === "image" && normalizeImageSrc(fill.src)) return `url(#${IMAGE_FILL_PATTERN_PREFIX}-${node.id})`;
  return "#E5E7EB";
}

/** I5: 세그먼트별 fills에서 fill 문자열 반환 (gradient/image는 nodeId-segIdx 사용) */
function pickFillFromFills(
  doc: Doc,
  nodeId: string,
  fills: Fill[],
  segmentIndex: number,
  variableRuntime?: VariableRuntime,
): string {
  if (!fills.length) return "transparent";
  const fill = fills[0];
  if (fill.type === "solid") return fill.color;
  if (fill.type === "linear") return `url(#${GRADIENT_PREFIX}-${nodeId}-seg-${segmentIndex})`;
  if (fill.type === "image" && normalizeImageSrc(fill.src)) return `url(#${IMAGE_FILL_PATTERN_PREFIX}-${nodeId}-seg-${segmentIndex})`;
  return "#E5E7EB";
}

function pickStroke(doc: Doc, node: Node): {
  color: string;
  width: number;
  dash: number[];
  align?: Stroke["align"];
  cap?: "butt" | "round" | "square";
  join?: "miter" | "round" | "bevel";
  miter?: number;
} {
  const token = findStyleToken(doc, node.style.strokeStyleId, "stroke");
  const strokes = token && Array.isArray(token.value) ? (token.value as Stroke[]) : node.style.strokes;
  if (!strokes.length) return { color: "transparent", width: 0, dash: [] };
  const stroke = strokes[0];
  return {
    color: stroke.color,
    width: stroke.width,
    dash: stroke.dash ?? [],
    align: stroke.align,
    cap: node.style.strokeCap ?? "butt",
    join: node.style.strokeJoin ?? "miter",
    miter: node.style.strokeMiter ?? 4,
  };
}

function resolveTextStyle(doc: Doc, node: Node): TextStyle | null {
  const token = findStyleToken(doc, node.text?.styleRef, "text");
  if (token && token.value && typeof token.value === "object") return token.value as TextStyle;
  return node.text?.style ?? null;
}

function resolveTextTokens(doc: Doc, value: string, variableRuntime?: VariableRuntime) {
  if (!value) return value;
  return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, raw) => {
    const key = String(raw ?? "").trim();
    if (!key) return "";
    if (key.startsWith("row.")) {
      const field = key.slice(4).trim();
      const row = variableRuntime?.rowContext;
      const val = row && field ? (row as Record<string, unknown>)[field] : undefined;
      if (val == null) return "";
      if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") return String(val);
      return JSON.stringify(val);
    }
    if (!doc.variables.length) return "";
    const variable =
      doc.variables.find((item) => item.id === key) ??
      doc.variables.find((item) => item.name.toLowerCase() === key.toLowerCase());
    if (!variable) return "";
    const val = resolveVariableValue(doc, variable, variableRuntime);
    if (val == null) return "";
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      return String(val);
    }
    return JSON.stringify(val);
  });
}

function resolveEffects(doc: Doc, node: Node) {
  const token = findStyleToken(doc, node.style.effectStyleId, "effect");
  if (token && Array.isArray(token.value)) return token.value as NonNullable<Node["style"]>["effects"];
  return node.style.effects ?? [];
}

function renderShape(
  doc: Doc,
  node: Node,
  options?: {
    frame?: Node["frame"];
    fill?: string;
    stroke?: {
      color: string;
      width: number;
      dash?: number[];
      align?: Stroke["align"];
      cap?: "butt" | "round" | "square";
      join?: "miter" | "round" | "bevel";
      miter?: number;
    };
    filterId?: string;
  },
  variableRuntime?: VariableRuntime,
  textOverrides?: Record<string, string>,
) {
  const fill = options?.fill ?? pickFill(doc, node, variableRuntime);
  const baseStroke = options?.stroke ? { ...options.stroke, dash: options.stroke.dash ?? [] } : pickStroke(doc, node);
  const stroke = {
    ...baseStroke,
    cap: baseStroke.cap ?? node.style.strokeCap ?? "butt",
    join: baseStroke.join ?? node.style.strokeJoin ?? "miter",
    miter: baseStroke.miter ?? node.style.strokeMiter ?? 4,
  };
  const frame = options?.frame ?? node.frame;
  const filterId = options?.filterId;
  const strokeAlign = stroke.align ?? "center";
  const strokeInset =
    strokeAlign === "inside" ? stroke.width / 2 : strokeAlign === "outside" ? -stroke.width / 2 : 0;
  const strokeLinecap = stroke.cap ?? "butt";
  const strokeLinejoin = stroke.join ?? "miter";
  const strokeMiterlimit = stroke.miter ?? 4;

  switch (node.type) {
    case "rect":
    case "frame":
    case "section":
    case "component":
    case "instance":
    case "hotspot":
    case "table": {
      const radius = typeof node.style.radius === "number" ? node.style.radius : 0;
      const adjW = Math.max(0, frame.w - strokeInset * 2);
      const adjH = Math.max(0, frame.h - strokeInset * 2);
      return (
        <rect
          x={strokeInset}
          y={strokeInset}
          width={adjW}
          height={adjH}
          rx={Math.max(0, radius - strokeInset)}
          ry={Math.max(0, radius - strokeInset)}
          fill={fill}
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeDasharray={stroke.dash.join(" ")}
          strokeLinecap={strokeLinecap}
          strokeLinejoin={strokeLinejoin}
          strokeMiterlimit={strokeMiterlimit}
          filter={filterId ? `url(#${filterId})` : undefined}
        />
      );
    }
    case "ellipse": {
      const adjW = Math.max(0, frame.w - strokeInset * 2);
      const adjH = Math.max(0, frame.h - strokeInset * 2);
      return (
        <ellipse
          cx={frame.w / 2}
          cy={frame.h / 2}
          rx={Math.max(0, adjW / 2)}
          ry={Math.max(0, adjH / 2)}
          fill={fill}
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeDasharray={stroke.dash.join(" ")}
          strokeLinecap={strokeLinecap}
          strokeLinejoin={strokeLinejoin}
          strokeMiterlimit={strokeMiterlimit}
          filter={filterId ? `url(#${filterId})` : undefined}
        />
      );
    }
    case "polygon": {
      const sides = Math.max(3, Math.round(node.shape?.polygonSides ?? 6));
      const cx = frame.w / 2;
      const cy = frame.h / 2;
      const r = Math.max(0, Math.min(frame.w, frame.h) / 2 - strokeInset);
      const points = Array.from({ length: sides }).map((_, i) => {
        const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
      });
      return (
        <polygon
          points={points.join(" ")}
          fill={fill}
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeDasharray={stroke.dash.join(" ")}
          strokeLinecap={strokeLinecap}
          strokeLinejoin={strokeLinejoin}
          strokeMiterlimit={strokeMiterlimit}
          filter={filterId ? `url(#${filterId})` : undefined}
        />
      );
    }
    case "star": {
      const spikes = Math.max(3, Math.round(node.shape?.starPoints ?? 5));
      const cx = frame.w / 2;
      const cy = frame.h / 2;
      const outer = Math.max(0, Math.min(frame.w, frame.h) / 2 - strokeInset);
      const innerRatio = Math.max(0.1, Math.min(0.9, node.shape?.starInnerRatio ?? 0.5));
      const inner = outer * innerRatio;
      const points: string[] = [];
      for (let i = 0; i < spikes * 2; i += 1) {
        const radius = i % 2 === 0 ? outer : inner;
        const angle = (Math.PI * i) / spikes - Math.PI / 2;
        points.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
      }
      return (
        <polygon
          points={points.join(" ")}
          fill={fill}
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeDasharray={stroke.dash.join(" ")}
          strokeLinecap={strokeLinecap}
          strokeLinejoin={strokeLinejoin}
          strokeMiterlimit={strokeMiterlimit}
          filter={filterId ? `url(#${filterId})` : undefined}
        />
      );
    }
    case "path": {
      const w = frame.w;
      const h = frame.h;
      const defaultPath = `M 0 ${h * 0.8} C ${w * 0.2} ${h * 0.1}, ${w * 0.8} ${h * 0.9}, ${w} ${h * 0.2}`;
      const segments = node.shape?.segments;
      if (segments?.length) {
        return (
          <g>
            {segments.map((seg, i) => (
              <path
                key={i}
                d={seg.d.trim() || defaultPath}
                fill={pickFillFromFills(doc, node.id, seg.fills, i, variableRuntime)}
                stroke={stroke.color}
                strokeWidth={Math.max(1, stroke.width)}
                strokeDasharray={stroke.dash.join(" ")}
                strokeLinecap={strokeLinecap}
                strokeLinejoin={strokeLinejoin}
                strokeMiterlimit={strokeMiterlimit}
                filter={filterId ? `url(#${filterId})` : undefined}
              />
            ))}
          </g>
        );
      }
      const d = (node.shape?.pathData ?? "").trim() || defaultPath;
      return (
        <path
          d={d}
          fill={fill}
          stroke={stroke.color}
          strokeWidth={Math.max(1, stroke.width)}
          strokeDasharray={stroke.dash.join(" ")}
          strokeLinecap={strokeLinecap}
          strokeLinejoin={strokeLinejoin}
          strokeMiterlimit={strokeMiterlimit}
          filter={filterId ? `url(#${filterId})` : undefined}
        />
      );
    }
    case "line": {
      return (
        <line
          x1={0}
          y1={0}
          x2={frame.w}
          y2={frame.h}
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeDasharray={stroke.dash.join(" ")}
          strokeLinecap={strokeLinecap}
          strokeLinejoin={strokeLinejoin}
          strokeMiterlimit={strokeMiterlimit}
          filter={filterId ? `url(#${filterId})` : undefined}
        />
      );
    }
    case "arrow": {
      return (
        <line
          x1={0}
          y1={0}
          x2={frame.w}
          y2={frame.h}
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeDasharray={stroke.dash.join(" ")}
          markerEnd="url(#adv-arrow)"
          strokeLinecap={strokeLinecap}
          strokeLinejoin={strokeLinejoin}
          strokeMiterlimit={strokeMiterlimit}
          filter={filterId ? `url(#${filterId})` : undefined}
        />
      );
    }
    case "text": {
      const rawText = textOverrides && node.id in textOverrides ? textOverrides[node.id] : node.text?.value ?? "";
      const textValue = typeof rawText === "string" ? rawText : rawText != null && typeof rawText === "object" ? "" : String(rawText ?? "");
      const text = resolveTextTokens(doc, textValue);
      const style = resolveTextStyle(doc, node) ?? {
        fontFamily: DEFAULT_FONT_FAMILY,
        fontSize: 16,
        fontWeight: 500,
        lineHeight: 1.4,
        letterSpacing: 0,
        align: "left",
      };
      const textScale = resolveTextScale(variableRuntime);
      const fontSize = style.fontSize ?? 16;
      const scaledFontSize = Math.max(6, fontSize * textScale);
      const align = style.align ?? "left";
      const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
      const textX = align === "center" ? frame.w / 2 : align === "right" ? frame.w : 0;
      const lineHeightRatio = style.lineHeight ?? 1.4;
      const lineHeight = (Number.isFinite(lineHeightRatio) && lineHeightRatio > 0 ? lineHeightRatio : 1.4) * scaledFontSize;
      const wrapEnabled = node.text?.wrap !== false;
      const scaledStyle = { ...style, fontSize: scaledFontSize };
      const lines = wrapEnabled ? wrapTextLines(text, scaledStyle, Math.max(4, frame.w)) : text.split("\n");
      const effectiveFill = resolveHighContrast(variableRuntime) ? "#000000" : fill;
      return (
        <text
          x={textX}
          y={scaledFontSize}
          fill={effectiveFill}
          fontFamily={style.fontFamily ?? DEFAULT_FONT_FAMILY}
          fontSize={scaledFontSize}
          fontWeight={style.fontWeight ?? 500}
          fontStyle={style.italic ? "italic" : "normal"}
          style={{
            textDecoration: [style.underline && "underline", style.lineThrough && "line-through"].filter(Boolean).join(" ") || undefined,
            textTransform: style.textCase === "upper" ? "uppercase" : style.textCase === "lower" ? "lowercase" : style.textCase === "capitalize" ? "capitalize" : undefined,
            letterSpacing: style.letterSpacing ?? 0,
            fontFeatureSettings: style.fontFeatureSettings?.trim() || undefined,
            fontVariationSettings: style.fontVariationSettings?.trim() || undefined,
          }}
          textAnchor={anchor}
          filter={filterId ? `url(#${filterId})` : undefined}
        >
          {lines.map((line, index) => (
            <tspan key={`${node.id}-line-${index}`} x={textX} dy={index === 0 ? 0 : lineHeight}>
              {line || " "}
            </tspan>
          ))}
        </text>
      );
    }
    case "image":
    case "video": {
      const media = node.type === "video" ? node.video : node.image;
      const href = normalizeImageSrc(media?.src);
      const fit = media?.fit ?? "cover";
      const scale = media?.scale ?? 1;
      const offsetX = media?.offsetX ?? 0;
      const offsetY = media?.offsetY ?? 0;
      const preserve = fit === "contain" ? "xMidYMid meet" : fit === "fill" ? "none" : "xMidYMid slice";
      const fw = frame.w;
      const fh = frame.h;
      const clipId = `rt-media-clip-${node.id}`;
      const radius = typeof node.style.radius === "number" ? node.style.radius : 0;
      const crop = media?.crop;
      const cropRect = crop && crop.w > 0 && crop.h > 0 ? { x: crop.x * fw, y: crop.y * fh, w: crop.w * fw, h: crop.h * fh } : null;
      const brightness = media?.brightness ?? 1;
      const contrast = media?.contrast ?? 1;
      const needBcFilter = Math.abs(brightness - 1) > 0.01 || Math.abs(contrast - 1) > 0.01;
      const bcFilterId = needBcFilter ? `rt-media-bc-${node.id}-${brightness}-${contrast}` : undefined;

      if (node.type === "video") {
        return (
          <MediaVideo
            href={href}
            fw={fw}
            fh={fh}
            offsetX={offsetX}
            offsetY={offsetY}
            scale={scale}
            fit={fit}
            radius={radius}
            brightness={brightness}
            contrast={contrast}
            autoplay={media?.autoplay}
            loop={media?.loop}
            muted={media?.muted}
            controls={media?.controls}
            poster={media?.poster}
          />
        );
      }

      if (!href) {
        return (
          <g>
            <rect
              x={0}
              y={0}
              width={frame.w}
              height={frame.h}
              fill="#F3F3F3"
              stroke="#B8B8B8"
              strokeWidth={1}
              strokeDasharray="6 4"
            />
            <line x1={0} y1={0} x2={frame.w} y2={frame.h} stroke="#B8B8B8" strokeWidth={1} />
            <line x1={frame.w} y1={0} x2={0} y2={frame.h} stroke="#B8B8B8" strokeWidth={1} />
          </g>
        );
      }
      return (
        <g>
          <defs>
            <clipPath id={clipId}>
              <rect x={cropRect?.x ?? 0} y={cropRect?.y ?? 0} width={cropRect?.w ?? fw} height={cropRect?.h ?? fh} rx={radius} ry={radius} />
            </clipPath>
            {needBcFilter ? (
              <filter id={bcFilterId}>
                <feComponentTransfer>
                  <feFuncR type="linear" slope={brightness * contrast} intercept={(1 - contrast) * 0.5} />
                  <feFuncG type="linear" slope={brightness * contrast} intercept={(1 - contrast) * 0.5} />
                  <feFuncB type="linear" slope={brightness * contrast} intercept={(1 - contrast) * 0.5} />
                </feComponentTransfer>
              </filter>
            ) : null}
          </defs>
          <MediaImageWithError
            nodeId={node.id}
            href={href}
            fw={fw}
            fh={fh}
            offsetX={offsetX}
            offsetY={offsetY}
            scale={scale}
            preserve={preserve}
            clipId={clipId}
            filterUrl={bcFilterId ? `url(#${bcFilterId})` : filterId ? `url(#${filterId})` : undefined}
          />
        </g>
      );
    }
    default: {
      return (
        <rect
          x={0}
          y={0}
          width={frame.w}
          height={frame.h}
          fill={fill}
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeDasharray={stroke.dash.join(" ")}
          filter={filterId ? `url(#${filterId})` : undefined}
        />
      );
    }
  }
}

function renderClipShape(node: Node, frame: Node["frame"]) {
  const radius = typeof node.style.radius === "number" ? node.style.radius : 0;
  switch (node.type) {
    case "ellipse":
      return <ellipse cx={frame.w / 2} cy={frame.h / 2} rx={Math.max(0, frame.w / 2)} ry={Math.max(0, frame.h / 2)} />;
    case "polygon": {
      const sides = Math.max(3, Math.round(node.shape?.polygonSides ?? 6));
      const cx = frame.w / 2;
      const cy = frame.h / 2;
      const r = Math.min(frame.w, frame.h) / 2;
      const points = Array.from({ length: sides }).map((_, i) => {
        const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
      });
      return <polygon points={points.join(" ")} />;
    }
    case "star": {
      const spikes = Math.max(3, Math.round(node.shape?.starPoints ?? 5));
      const cx = frame.w / 2;
      const cy = frame.h / 2;
      const outer = Math.min(frame.w, frame.h) / 2;
      const innerRatio = Math.max(0.1, Math.min(0.9, node.shape?.starInnerRatio ?? 0.5));
      const inner = outer * innerRatio;
      const points: string[] = [];
      for (let i = 0; i < spikes * 2; i += 1) {
        const radiusVal = i % 2 === 0 ? outer : inner;
        const angle = (Math.PI * i) / spikes - Math.PI / 2;
        points.push(`${cx + radiusVal * Math.cos(angle)},${cy + radiusVal * Math.sin(angle)}`);
      }
      return <polygon points={points.join(" ")} />;
    }
    default:
      return <rect x={0} y={0} width={frame.w} height={frame.h} rx={radius} ry={radius} />;
  }
}

function buildEffectDefs(doc: Doc, prefix: string) {
  const defs: React.ReactElement[] = [];
  Object.values(doc.nodes).forEach((node) => {
    const effects = resolveEffects(doc, node);
    if (!effects.length) return;
    const filterId = getEffectFilterId(prefix, node.id);
    const primitives = effects.map((effect, index) => {
      if (effect.type === "shadow") {
        const opacity = typeof effect.opacity === "number" ? effect.opacity : 0.2;
        return (
          <feDropShadow
            key={`${filterId}-shadow-${index}`}
            dx={effect.x}
            dy={effect.y}
            stdDeviation={Math.max(0, effect.blur)}
            floodColor={effect.color}
            floodOpacity={opacity}
          />
        );
      }
      if (effect.type === "blur") {
        return <feGaussianBlur key={`${filterId}-blur-${index}`} stdDeviation={Math.max(0, effect.blur)} />;
      }
      if (effect.type === "noise") {
        const amount = typeof effect.amount === "number" ? effect.amount : 0.4;
        return (
          <feTurbulence
            key={`${filterId}-noise-${index}`}
            type="fractalNoise"
            baseFrequency={amount}
            numOctaves={2}
            result="noise"
          />
        );
      }
      return null;
    });
    defs.push(
      <filter key={filterId} id={filterId} x="-50%" y="-50%" width="200%" height="200%">
        {primitives}
      </filter>,
    );
  });
  return defs;
}

const GRADIENT_PREFIX = "rt-linear";
const IMAGE_FILL_PATTERN_PREFIX = "rt-imgfill";

function buildImageFillPatternDefs(doc: Doc) {
  const defs: React.ReactElement[] = [];
  Object.values(doc.nodes).forEach((node) => {
    const segments = node.shape?.segments;
    if (segments?.length) {
      segments.forEach((seg, i) => {
        const fill = seg.fills[0];
        if (!isImageFill(fill)) return;
        const src = normalizeImageSrc(fill.src);
        if (!src) return;
        const preserveAspectRatio =
          fill.fit === "cover" ? "xMidYMid slice" : fill.fit === "contain" ? "xMidYMid meet" : "none";
        defs.push(
          <pattern
            key={`${IMAGE_FILL_PATTERN_PREFIX}-${node.id}-seg-${i}`}
            id={`${IMAGE_FILL_PATTERN_PREFIX}-${node.id}-seg-${i}`}
            patternUnits="objectBoundingBox"
            patternContentUnits="objectBoundingBox"
            x={0}
            y={0}
            width={1}
            height={1}
          >
            <image href={src} xlinkHref={src} x={0} y={0} width={1} height={1} preserveAspectRatio={preserveAspectRatio} />
          </pattern>,
        );
      });
      return;
    }
    const fills = resolveFill(doc, node);
    const fill = fills[0];
    if (!isImageFill(fill)) return;
    const src = normalizeImageSrc(fill.src);
    if (!src) return;
    const preserveAspectRatio =
      fill.fit === "cover" ? "xMidYMid slice" : fill.fit === "contain" ? "xMidYMid meet" : "none";
    defs.push(
      <pattern
        key={`${IMAGE_FILL_PATTERN_PREFIX}-${node.id}`}
        id={`${IMAGE_FILL_PATTERN_PREFIX}-${node.id}`}
        patternUnits="objectBoundingBox"
        patternContentUnits="objectBoundingBox"
        x={0}
        y={0}
        width={1}
        height={1}
      >
        <image href={src} xlinkHref={src} x={0} y={0} width={1} height={1} preserveAspectRatio={preserveAspectRatio} />
      </pattern>,
    );
  });
  return defs;
}

function buildGradientDefs(doc: Doc) {
  const defs: React.ReactElement[] = [];
  Object.values(doc.nodes).forEach((node) => {
    const segments = node.shape?.segments;
    if (segments?.length) {
      segments.forEach((seg, i) => {
        const fill = seg.fills[0];
        if (!fill || fill.type !== "linear") return;
        const rad = ((fill.angle ?? 0) * Math.PI) / 180;
        const x1 = 0.5 - 0.5 * Math.cos(rad);
        const y1 = 0.5 - 0.5 * Math.sin(rad);
        const x2 = 0.5 + 0.5 * Math.cos(rad);
        const y2 = 0.5 + 0.5 * Math.sin(rad);
        const stops = fill.stops && fill.stops.length >= 2
          ? fill.stops
          : [{ offset: 0, color: fill.from }, { offset: 1, color: fill.to }];
        defs.push(
          <linearGradient
            key={`${GRADIENT_PREFIX}-${node.id}-seg-${i}`}
            id={`${GRADIENT_PREFIX}-${node.id}-seg-${i}`}
            gradientUnits="objectBoundingBox"
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
          >
            {stops.map((s, j) => (
              <stop key={j} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>,
        );
      });
      return;
    }
    const fills = resolveFill(doc, node);
    const fill = fills[0];
    if (!fill || fill.type !== "linear") return;
    const rad = (fill.angle * Math.PI) / 180;
    const x1 = 0.5 - 0.5 * Math.cos(rad);
    const y1 = 0.5 - 0.5 * Math.sin(rad);
    const x2 = 0.5 + 0.5 * Math.cos(rad);
    const y2 = 0.5 + 0.5 * Math.sin(rad);
    const stops = fill.stops && fill.stops.length >= 2
      ? fill.stops
      : [{ offset: 0, color: fill.from }, { offset: 1, color: fill.to }];
    defs.push(
      <linearGradient
        key={`${GRADIENT_PREFIX}-${node.id}`}
        id={`${GRADIENT_PREFIX}-${node.id}`}
        gradientUnits="objectBoundingBox"
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
      >
        {stops.map((s, i) => (
          <stop key={i} offset={s.offset} stopColor={s.color} />
        ))}
      </linearGradient>,
    );
  });
  return defs;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function isCheckboxName(value: string) {
  const name = normalizeName(value);
  return name.includes("체크") || name.includes("checkbox");
}

function isToggleName(value: string) {
  const name = normalizeName(value);
  return name.includes("토글") || name.includes("toggle") || name.includes("switch");
}

function isInputName(value: string) {
  const name = normalizeName(value);
  return (
    name.includes("입력") ||
    name.includes("input") ||
    name.includes("textfield") ||
    name.includes("text field") ||
    name.includes("upload") ||
    name.includes("file") ||
    name.includes("\uC5C5\uB85C\uB4DC") ||
    name.includes("\uD30C\uC77C") ||
    name.includes("\uB4DC\uB86D") ||
    name.includes("\uC544\uBC14\uD0C0") ||
    name.includes("avatar") ||
    name.includes("\uD504\uB85C\uD544\uC0AC\uC9C4") ||
    name.includes("profile image")
  );
}

function isTextareaName(value: string) {
  const name = normalizeName(value);
  return name.includes("텍스트 영역") || name.includes("textarea") || name.includes("multi") || name.includes("메시지");
}

function isChoiceName(value: string) {
  const name = normalizeName(value);
  return (
    name.includes("chip") ||
    name.includes("tab") ||
    name.includes("page") ||
    name.includes("pagination") ||
    name.includes("pager") ||
    name.includes("date") ||
    name.includes("list item") ||
    name.includes("list-item") ||
    name.includes("menu") ||
    name.includes("option") ||
    name.includes("choice") ||
    name.includes("select") ||
    name.includes("dot") ||
    name.includes("button") ||
    name.includes("btn") ||
    name.includes("cta") ||
    name.includes("버튼") ||
    name.includes("call to action") ||
    name.includes("\uCE69") ||
    name.includes("\uD0ED") ||
    name.includes("\uD398\uC774\uC9C0") ||
    name.includes("\uD398\uC774\uC9C0\uB124\uC774\uC158") ||
    name.includes("\uD398\uC774\uC9C0\uB2E4\uC74C") ||
    name.includes("\uB0A0\uC9DC") ||
    name.includes("\uB9AC\uC2A4\uD2B8 \uC544\uC774\uD15C") ||
    name.includes("\uB9AC\uC2A4\uD2B8") ||
    name.includes("\uBA54\uB274") ||
    name.includes("\uC635\uC158") ||
    name.includes("\uC120\uD0DD") ||
    name.includes("\uC810")
  );
}

function isTooltipBubbleName(value: string) {
  const name = normalizeName(value);
  return (
    name.includes("tooltip") ||
    name.includes("tip") ||
    name.includes("툴팁") ||
    name.includes("도움말") ||
    name.includes("help") ||
    name.includes("info")
  );
}

function isSkipLinkName(value: string) {
  const name = normalizeName(value);
  return name.includes("skip") || name.includes("바로가기") || name.includes("스킵") || name.includes("skiplink");
}

function isBreadcrumbName(value: string) {
  const name = normalizeName(value);
  return name.includes("breadcrumb") || name.includes("경로");
}

function isBreadcrumbSeparatorText(value: string) {
  return /^[\s>\/\u203A\u00BB\u2192\u2794|\u00B7\u2022]+$/.test(value.trim());
}

function isModalOverlayName(value: string) {
  const name = normalizeName(value);
  return name.includes("overlay") || name.includes("오버레이") || name.includes("backdrop") || name.includes("dim");
}

function isDateSliderName(value: string) {
  const name = normalizeName(value);
  return name.includes("날짜") || name.includes("date") || name.includes("slider");
}


function resolveInputType(value: string) {
  const name = normalizeName(value);
  if (
    name.includes("upload") ||
    name.includes("file") ||
    name.includes("\uC5C5\uB85C\uB4DC") ||
    name.includes("\uD30C\uC77C") ||
    name.includes("\uB4DC\uB86D") ||
    name.includes("\uC544\uBC14\uD0C0") ||
    name.includes("avatar") ||
    name.includes("\uD504\uB85C\uD544\uC0AC\uC9C4") ||
    name.includes("profile image")
  )
    return "file";
  if (name.includes("password") || name.includes("비밀번호")) return "password";
  if (name.includes("email") || name.includes("이메일")) return "email";
  if (name.includes("url") || name.includes("링크")) return "url";
  if (name.includes("전화") || name.includes("phone") || name.includes("tel")) return "tel";
  if (name.includes("날짜") || name.includes("date")) return "date";
  if (name.includes("숫자") || name.includes("number")) return "number";
  return "text";
}

export function buildControlRoles(doc: Doc, variableRuntime?: VariableRuntime) {
  const roles: Record<string, ControlRole> = {};
    Object.values(doc.nodes).forEach((node) => {
    if (roles[node.id]) return;
    if (node.type === "rect") {
      const nodeName = node.name ? normalizeName(node.name) : "";
      if (
        nodeName.includes("cell") ||
        nodeName.includes("셀") ||
        nodeName.includes("칸") ||
        nodeName.includes("item") ||
        isModalOverlayName(node.name ?? "")
      ) {
        roles[node.id] = { type: "choice", role: "root", rootId: node.id };
      }
      return;
    }
    if (node.type === "ellipse") {
      const parent = node.parentId ? doc.nodes[node.parentId] : null;
      const parentName = parent?.name ? normalizeName(parent.name) : "";
      const nodeName = node.name ? normalizeName(node.name) : "";
      if (
        parentName.includes("페이지 표시") ||
        parentName.includes("progress") ||
        nodeName.includes("점") ||
        nodeName.includes("dot")
      ) {
        roles[node.id] = { type: "choice", role: "root", rootId: node.id };
      }
      if (!roles[node.id]) {
        const isAvatar =
          nodeName.includes("아바타") ||
          nodeName.includes("avatar") ||
          nodeName.includes("프로필") ||
          nodeName.includes("profile");
        if (isAvatar) {
          roles[node.id] = {
            type: "input",
            role: "root",
            rootId: node.id,
            placeholder: node.name ?? "",
            multiline: false,
            inputType: "file",
            padding: { t: 0, r: 0, b: 0, l: 0 },
            font: { family: DEFAULT_FONT_FAMILY, size: 12, weight: 400, color: "#111111", lineHeight: 1.4 },
          };
        }
      }
      return;
    }
    if (node.type === "text") {
      const parent = node.parentId ? doc.nodes[node.parentId] : null;
      const parentName = parent?.name ? normalizeName(parent.name) : "";
      const nodeName = node.name ? normalizeName(node.name) : "";
      const textValue = node.text?.value ? normalizeName(node.text.value) : "";
      const parentHasChoice = parent?.id ? roles[parent.id]?.type === "choice" : false;
      const isNavText = parentName.includes("네비") || parentName.includes("nav") || parentName.includes("menu");
      const isHeaderText = parentName.includes("헤더") || parentName.includes("header");
      const isSidebarBrand = parentName.includes("사이드바") && (nodeName.includes("브랜드") || textValue.includes("관리자") || textValue.includes("brand"));
      const isMenuLabel = nodeName.includes("메뉴") || textValue.includes("메뉴");
      const isBreadcrumbText = (isBreadcrumbName(parentName) || isBreadcrumbName(nodeName)) && !isBreadcrumbSeparatorText(node.text?.value ?? "");
      const isSkipText = isSkipLinkName(nodeName) || isSkipLinkName(textValue);
      const isModalAction =
        textValue.includes("open") ||
        textValue.includes("close") ||
        textValue.includes("cancel") ||
        textValue.includes("열기") ||
        textValue.includes("닫기") ||
        textValue.includes("취소");
      if (!parentHasChoice && (isNavText || isHeaderText || isSidebarBrand || isMenuLabel || isBreadcrumbText || isSkipText || isModalAction)) {
        roles[node.id] = { type: "choice", role: "root", rootId: node.id, labelId: node.id };
      }
      return;
    }
    if (!["frame", "section", "component", "instance", "group", "slice"].includes(node.type)) return;
    const children = node.children.map((id) => doc.nodes[id]).filter(Boolean) as Node[];
    const name = node.name ?? "";
    const safeNumber = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);
    const defaultPadding = { t: 8, r: 12, b: 8, l: 12 };

    const isTextarea = isTextareaName(name);
    const isInput = !isTextarea && isInputName(name);
    if (isTextarea || isInput) {
      const placeholderNode = children.find((child) => child.type === "text");
      const placeholder = placeholderNode?.text?.value ?? "";
      const inputType = resolveInputType(`${name} ${placeholder}`);
      const placeholderStyle = placeholderNode?.text?.style;
      const placeholderFill = placeholderNode ? pickFill(doc, placeholderNode, variableRuntime) : "#111111";
      const font = {
        family: placeholderStyle?.fontFamily ?? DEFAULT_FONT_FAMILY,
        size: placeholderStyle?.fontSize ?? 14,
        weight: placeholderStyle?.fontWeight ?? 400,
        color: placeholderFill,
        lineHeight: placeholderStyle?.lineHeight ?? 1.4,
      };
      let padding = defaultPadding;
      if (node.layout?.mode === "auto") {
        padding = {
          t: safeNumber(node.layout.padding.t, defaultPadding.t),
          r: safeNumber(node.layout.padding.r, defaultPadding.r),
          b: safeNumber(node.layout.padding.b, defaultPadding.b),
          l: safeNumber(node.layout.padding.l, defaultPadding.l),
        };
      } else if (placeholderNode) {
        const left = safeNumber(placeholderNode.frame.x, defaultPadding.l);
        const top = safeNumber(placeholderNode.frame.y, defaultPadding.t);
        const right = safeNumber(node.frame.w - (placeholderNode.frame.x + placeholderNode.frame.w), defaultPadding.r);
        const bottom = safeNumber(node.frame.h - (placeholderNode.frame.y + placeholderNode.frame.h), defaultPadding.b);
        padding = { t: top, r: Math.max(0, right), b: Math.max(0, bottom), l: Math.max(0, left) };
      }
      roles[node.id] = {
        type: "input",
        role: "root",
        rootId: node.id,
        placeholder,
        multiline: isTextarea,
        inputType,
        padding,
        font,
      };
      if (placeholderNode) {
        roles[placeholderNode.id] = {
          type: "input",
          role: "placeholder",
          rootId: node.id,
          placeholder,
          multiline: isTextarea,
          inputType,
          padding,
          font,
        };
      }
    }

    const rectChild = children.find((child) => child.type === "rect");
    const textChild = children.find((child) => child.type === "text");
    const smallRect = rectChild ? rectChild.frame.w <= 24 && rectChild.frame.h <= 24 : false;
    if (rectChild && (isCheckboxName(name) || (textChild && smallRect))) {
      roles[node.id] = { type: "checkbox", role: "root", rootId: node.id, boxId: rectChild.id };
      roles[rectChild.id] = { type: "checkbox", role: "box", rootId: node.id, boxId: rectChild.id };
    }

    const hasToggle = isToggleName(name) || children.some((child) => isToggleName(child.name ?? ""));
    if (hasToggle) {
      const switchGroup =
        children.find((child) => (child.type === "group" || child.type === "frame") && isToggleName(child.name ?? "")) ??
        children.find((child) => child.type === "group" || child.type === "frame");
      if (!switchGroup) return;
      const switchChildren = switchGroup.children.map((id) => doc.nodes[id]).filter(Boolean) as Node[];
      const track = switchChildren.find((child) => child.type === "rect");
      const knob = switchChildren.find((child) => child.type === "ellipse");
      if (!track || !knob) return;
      const knobOffX = knob.frame.x;
      const knobOnX = Math.max(knobOffX, track.frame.w - knob.frame.w - knobOffX);
      roles[node.id] = {
        type: "toggle",
        role: "root",
        rootId: node.id,
        trackId: track.id,
        knobId: knob.id,
        knobOnX,
        knobOffX,
      };
      roles[track.id] = {
        type: "toggle",
        role: "track",
        rootId: node.id,
        trackId: track.id,
        knobId: knob.id,
        knobOnX,
        knobOffX,
      };
      roles[knob.id] = {
        type: "toggle",
        role: "knob",
        rootId: node.id,
        trackId: track.id,
        knobId: knob.id,
        knobOnX,
        knobOffX,
      };

      return;
    }

    if (isChoiceName(name)) {
      const labelNode = children.find((child) => child.type === "text");
      roles[node.id] = { type: "choice", role: "root", rootId: node.id, labelId: labelNode?.id };
      if (labelNode) {
        roles[labelNode.id] = { type: "choice", role: "label", rootId: node.id, labelId: labelNode.id };
      }
    } else if (name.toLowerCase().includes("플랜 카드") || name.toLowerCase().includes("plan card")) {
      const labelNode = children.find((child) => child.type === "text");
      roles[node.id] = { type: "choice", role: "root", rootId: node.id, labelId: labelNode?.id };
      if (labelNode) {
        roles[labelNode.id] = { type: "choice", role: "label", rootId: node.id, labelId: labelNode.id };
      }
    }
  });
  return roles;
}

function collectDescendants(doc: Doc, rootId: string, out: Set<string>) {
  if (out.has(rootId)) return;
  out.add(rootId);
  const node = doc.nodes[rootId];
  if (!node) return;
  node.children.forEach((childId) => collectDescendants(doc, childId, out));
}

function buildControlRootMap(doc: Doc, roles: Record<string, ControlRole>) {
  const map: Record<string, ControlRole> = {};
  Object.values(roles).forEach((role) => {
    if (role.role !== "root") return;
    const ids = new Set<string>();
    collectDescendants(doc, role.rootId, ids);
    ids.forEach((id) => {
      if (!map[id]) map[id] = role;
    });
  });
  return map;
}

function renderCheckboxMark(frame: Node["frame"], color: string) {
  const x1 = frame.w * 0.2;
  const y1 = frame.h * 0.55;
  const x2 = frame.w * 0.42;
  const y2 = frame.h * 0.75;
  const x3 = frame.w * 0.8;
  const y3 = frame.h * 0.3;
  return <path d={`M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3}`} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
}

/** NOCODE 3: 컬렉션 바인딩 — /api/app/[pageId]/[model] fetch 후 행별 반복 렌더 */
function CollectionBound({
  doc,
  appPageId,
  collectionId,
  limit: bindingLimit,
  offset: bindingOffset,
  orderBy,
  orderDir,
  firstChildId,
  rowHeight,
  variableRuntime,
  renderChildWithRuntime,
}: {
  doc: Doc;
  appPageId: string;
  collectionId: string;
  limit?: number;
  offset?: number;
  orderBy?: "created_at" | "updated_at";
  orderDir?: "asc" | "desc";
  firstChildId: string;
  rowHeight: number;
  variableRuntime?: VariableRuntime;
  renderChildWithRuntime: (childId: string, variableRuntimeOverride?: VariableRuntime) => React.ReactNode;
}) {
  const [items, setItems] = useState<Array<Record<string, unknown> & { id?: string }>>([]);
  const overrides = variableRuntime?.variableOverrides ?? {};
  const resolveNumber = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
    return null;
  };
  const limit =
    resolveNumber(overrides.limit) ??
    resolveNumber(overrides.pageSize) ??
    resolveNumber(overrides.perPage) ??
    resolveNumber(overrides.page_size) ??
    resolveNumber(overrides.per_page) ??
    (typeof bindingLimit === "number" && Number.isFinite(bindingLimit) ? Math.max(1, bindingLimit) : 50);
  const explicitOffset =
    resolveNumber(overrides.offset) ??
    resolveNumber(overrides.collection_offset) ??
    (typeof bindingOffset === "number" && Number.isFinite(bindingOffset) ? Math.max(0, bindingOffset) : null);
  const pageValue = resolveNumber(overrides.page) ?? resolveNumber(overrides.pageIndex);
  const offset = explicitOffset ?? (pageValue ? Math.max(0, (pageValue - 1) * limit) : 0);
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (orderBy) params.set("orderBy", orderBy);
    if (orderDir) params.set("orderDir", orderDir);
    const url = `/api/app/${appPageId}/${collectionId}?${params.toString()}`;
    fetch(url, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items?: Array<Record<string, unknown> & { id?: string }> } | null) => {
        if (cancelled || !data?.items) return;
        setItems(Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [appPageId, collectionId, limit, offset, orderBy, orderDir, bindingLimit, bindingOffset]);

  if (items.length === 0) return null;
  return (
    <>
      {items.map((row, i) => (
        <g key={row.id ?? i} transform={`translate(0 ${i * rowHeight})`}>
          {renderChildWithRuntime(firstChildId, { ...variableRuntime, rowContext: row })}
        </g>
      ))}
    </>
  );
}

/** A1: whileHover 지연 시 액션 실행 예약; mouseLeave 시 취소 */
export type WhileHoverCallbacks = {
  onEnter: (interaction: PrototypeInteraction, nodeId: string, pageId: string) => void;
  onLeave: () => void;
};

function renderNodeTree(
  doc: Doc,
  nodeId: string,
  pageId: string,
  interactive?: boolean,
  onNavigate?: (event: NavigateEvent) => void,
  controlRoles?: Record<string, ControlRole>,
  controlRootMap?: Record<string, ControlRole>,
  controlState?: Record<string, boolean>,
  onToggleControl?: (rootId: string) => void,
  controlTextState?: Record<string, string>,
  controlFileState?: Record<string, File[]>,
  onChangeControlText?: (rootId: string, value: string) => void,
  onChangeControlFile?: (rootId: string, files: File[]) => void,
  invalidControlIds?: Set<string>,
  disabledControlIds?: Set<string>,
  hiddenNodeIds?: Set<string>,
  childOrderOverrides?: Record<string, string[]>,
  textOverrides?: Record<string, string>,
  headerCompact?: boolean,
  activeSubmitButtonIds?: Set<string>,
  activeButtonStyle?: { fill: string; textFill: string },
  variableRuntime?: VariableRuntime,
  instanceVariantOverrides?: Record<string, string>,
  appPageId?: string,
  /** NOCODE 8: 현재 트리가 속한 인스턴스 노드 id. 슬롯 채우기(overrides.slotContents) 조회용 */
  instanceContext?: string,
  /** A1: whileHover 트리거 지연·취소용 */
  whileHoverCallbacks?: WhileHoverCallbacks,
  tooltipState?: { hoveredId: string | null; setHoveredId: React.Dispatch<React.SetStateAction<string | null>> },
  activeTooltipGroupId?: string | null,
  /** C1: 팀 라이브러리 Doc 조회. 인스턴스가 instanceLibraryId 있을 때 사용 */
  getLibraryDoc?: (libraryId: string) => Doc | undefined,
): React.ReactNode {
  const node = doc.nodes[nodeId];
  if (!node || node.hidden) return null;
  if (hiddenNodeIds?.has(nodeId)) return null;

  const isSkipLink = isSkipLinkName(node.name ?? "") || (node.type === "text" && isSkipLinkName(node.text?.value ?? ""));
  const skipLabel = isSkipLink
    ? (node.type === "text" ? node.text?.value ?? node.name ?? "Skip to content" : node.name ?? "Skip to content")
    : undefined;
  const isDateSlider = isDateSliderName(node.name ?? "");
  const role = controlRoles?.[node.id];
  const isTooltipBubble = isTooltipBubbleName(node.name ?? "");
  const hasTooltipChild = node.children?.some((childId) => isTooltipBubbleName(doc.nodes[childId]?.name ?? ""));
  const isTooltipGroup = Boolean(hasTooltipChild);
  const nextTooltipGroupId = isTooltipGroup ? node.id : activeTooltipGroupId;
  const tooltipHidden = Boolean(interactive && isTooltipBubble && activeTooltipGroupId && tooltipState?.hoveredId !== activeTooltipGroupId);
  if (tooltipHidden) return null;
  if (role?.type === "input" && role.role === "placeholder" && interactive && onChangeControlText && role.inputType !== "file") return null;
  const isFilePlaceholder = role?.type === "input" && role.role === "placeholder" && role.inputType === "file";
  const roleChecked = role ? Boolean(controlState?.[role.rootId]) : false;
  const activeButtonFill = activeButtonStyle?.fill ?? "#111111";
  const activeButtonTextFill = activeButtonStyle?.textFill ?? "#FFFFFF";
  const isActiveButton = Boolean(activeSubmitButtonIds?.has(node.id));
  const isActiveButtonText = node.type === "text" && (isActiveButton || (node.parentId ? activeSubmitButtonIds?.has(node.parentId) : false));
  const buttonFill = isActiveButton ? activeButtonFill : undefined;
  const buttonTextFill = isActiveButtonText ? activeButtonTextFill : undefined;
  const isChoiceRoot = role?.type === "choice" && role.role === "root";
  const isChoiceLabel = role?.type === "choice" && (role.role === "label" || (role.role === "root" && node.type === "text"));
  const choiceActive = role?.type === "choice" ? Boolean(controlState?.[role.rootId]) : false;
  const choiceFill = isChoiceRoot && choiceActive ? "#DBEAFE" : undefined;
  const choiceTextFill = isChoiceLabel && choiceActive ? "#2563EB" : undefined;
  const choiceStroke = isChoiceRoot && choiceActive
    ? {
        color: "#2563EB",
        width: Math.max(2, node.style.strokes?.[0]?.width ?? 1),
        dash: node.style.strokes?.[0]?.dash ?? [],
        align: node.style.strokes?.[0]?.align ?? "inside",
      }
    : undefined;
  const inputRole = role && role.type === "input" && role.role === "root" ? role : null;
  const isFileInput = Boolean(inputRole && inputRole.inputType === "file");
  const isInvalidInput = Boolean(inputRole && invalidControlIds?.has(inputRole.rootId));
  const showInput = Boolean(inputRole && interactive && (onChangeControlText || onChangeControlFile));
  const inputValue = inputRole && !isFileInput ? controlTextState?.[inputRole.rootId] ?? "" : "";
  const fileList = isFileInput && inputRole ? controlFileState?.[inputRole.rootId] ?? [] : [];
  const filePreviewUrl = isFileInput && fileList.length ? getFileObjectUrl(fileList[0]) : null;
  const filePreviewClipId = filePreviewUrl ? `rt-file-preview-${node.id}` : null;
  const showFileSummary = Boolean(fileList.length && !filePreviewUrl);
  const fileSummary = fileList.length
    ? `${fileList.slice(0, 3).map((file) => file.name).join("\n")}${fileList.length > 3 ? `\n외 ${fileList.length - 3}개` : ""}`
    : "";
  const overrideFill = node.type === "text"
    ? (buttonTextFill ?? choiceTextFill ?? buttonFill)
    : (buttonFill ?? choiceFill);
  const invalidStroke = isInvalidInput
    ? {
        color: "#DC2626",
        width: (node.style.strokes?.[0]?.width ?? 1),
        dash: node.style.strokes?.[0]?.dash ?? [],
        align: node.style.strokes?.[0]?.align ?? "inside",
      }
    : choiceStroke;
  const clickRole = role ?? controlRootMap?.[node.id];
  const isDisabledControl = Boolean(disabledControlIds?.has(clickRole?.rootId ?? node.id));
  const canInteract = !isDisabledControl;
  const frameOverride =
    role && role.type === "toggle" && role.role === "knob" && roleChecked ? { ...node.frame, x: role.knobOnX } : undefined;
  const baseFrame = frameOverride ?? node.frame;
  const tooltipOffset =
    isTooltipBubble && activeTooltipGroupId
      ? (() => {
          const group = doc.nodes[activeTooltipGroupId];
          if (!group?.children?.length) return null;
          const anchorIds = group.children.filter(
            (id) => id !== node.id && !isTooltipBubbleName(doc.nodes[id]?.name ?? ""),
          );
          if (!anchorIds.length) return null;
          let minX = Number.POSITIVE_INFINITY;
          let minY = Number.POSITIVE_INFINITY;
          let maxX = Number.NEGATIVE_INFINITY;
          let maxY = Number.NEGATIVE_INFINITY;
          anchorIds.forEach((id) => {
            const anchor = doc.nodes[id];
            if (!anchor) return;
            minX = Math.min(minX, anchor.frame.x);
            minY = Math.min(minY, anchor.frame.y);
            maxX = Math.max(maxX, anchor.frame.x + anchor.frame.w);
            maxY = Math.max(maxY, anchor.frame.y + anchor.frame.h);
          });
          if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
          const anchorCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
          const bubbleCenter = { x: baseFrame.x + baseFrame.w / 2, y: baseFrame.y + baseFrame.h / 2 };
          const dy = bubbleCenter.y >= anchorCenter.y ? -8 : 8;
          const dx =
            Math.abs(bubbleCenter.x - anchorCenter.x) > baseFrame.w * 0.25 ? (bubbleCenter.x >= anchorCenter.x ? 8 : -8) : 0;
          return { x: dx, y: dy };
        })()
      : null;
  const frame = tooltipOffset ? { ...baseFrame, x: baseFrame.x + tooltipOffset.x, y: baseFrame.y + tooltipOffset.y } : baseFrame;
  const x = frame.x;
  const y = frame.y;
  const cx = frame.w / 2;
  const cy = frame.h / 2;
  const nodeOpacity = node.style.opacity * (isDisabledControl ? 0.4 : 1);
  const isHeaderNode =
    Boolean(headerCompact) &&
    typeof node.name === "string" &&
    /헤더|header/i.test(node.name) &&
    frame.y <= 40;
  const headerScale = isHeaderNode ? 0.92 : 1;
  const nodeTransform = isHeaderNode
    ? `translate(${x} ${y}) rotate(${frame.rotation} ${cx} ${cy}) translate(${cx} ${cy}) scale(${headerScale}) translate(${-cx} ${-cy})`
    : `translate(${x} ${y}) rotate(${frame.rotation} ${cx} ${cy})`;

  let effectiveChildIds = node.children;
  let resolveDoc: Doc = doc;
  if (node.slotId && instanceContext) {
    const instanceNode = doc.nodes[instanceContext];
    const slotIds = (instanceNode?.overrides as { slotContents?: Record<string, string[]> } | undefined)?.slotContents?.[node.slotId];
    if (Array.isArray(slotIds) && slotIds.length > 0) effectiveChildIds = slotIds;
  }
  if (node.type === "instance" && node.instanceOf && instanceVariantOverrides) {
    const overrideVariantId = instanceVariantOverrides[node.id];
    if (overrideVariantId) {
      const component = doc.nodes[node.instanceOf];
      const variant = component?.variants?.find((v) => v.id === overrideVariantId);
      if (variant?.rootId) effectiveChildIds = [variant.rootId];
    }
  }
  if (node.type === "instance" && node.instanceLibraryId && node.instanceOf && getLibraryDoc) {
    const libDoc = getLibraryDoc(node.instanceLibraryId);
    if (libDoc) {
      const component = libDoc.nodes[node.instanceOf];
      if (component) {
        resolveDoc = libDoc;
        const overrideVariantId = instanceVariantOverrides?.[node.id];
        if (overrideVariantId) {
          const variant = component.variants?.find((v) => v.id === overrideVariantId);
          effectiveChildIds = variant?.rootId ? [variant.rootId] : component.children;
        } else {
          effectiveChildIds = component.children;
        }
      }
    }
  }
  const overrideOrder = childOrderOverrides?.[node.id];
  if (overrideOrder?.length && effectiveChildIds?.length) {
    const allowed = new Set(effectiveChildIds);
    const ordered = overrideOrder.filter((id) => allowed.has(id));
    const rest = effectiveChildIds.filter((id) => !ordered.includes(id));
    effectiveChildIds = [...ordered, ...rest];
  }

  const firstChildId = effectiveChildIds[0];
  const firstChild = firstChildId ? resolveDoc.nodes[firstChildId] : null;
  const useMask = effectiveChildIds.length >= 2 && firstChild?.isMask === true;

  const dataBinding = node.data as {
    type?: string;
    collectionId?: string;
    limit?: number;
    offset?: number;
    orderBy?: "created_at" | "updated_at";
    orderDir?: "asc" | "desc";
  } | undefined;
  if (dataBinding?.type === "collection" && dataBinding.collectionId && appPageId && firstChildId) {
    const rowHeight = firstChild?.frame?.h ?? 50;
    const renderChildWithRuntime = (childId: string, variableRuntimeOverride?: VariableRuntime) =>
      renderNodeTree(
        doc,
        childId,
        pageId,
        interactive,
        onNavigate,
        controlRoles,
        controlRootMap,
        controlState,
        onToggleControl,
        controlTextState,
        controlFileState,
        onChangeControlText,
        onChangeControlFile,
        invalidControlIds,
        disabledControlIds,
        hiddenNodeIds,
        childOrderOverrides,
        textOverrides,
        headerCompact,
        activeSubmitButtonIds,
        activeButtonStyle,
        variableRuntimeOverride ?? variableRuntime,
        instanceVariantOverrides,
        appPageId,
        instanceContext,
        whileHoverCallbacks,
        tooltipState,
        nextTooltipGroupId,
        getLibraryDoc,
      );
    return (
      <g key={node.id} transform={`translate(${frame.x} ${frame.y})`}>
        <CollectionBound
          doc={doc}
          appPageId={appPageId}
          collectionId={dataBinding.collectionId}
          limit={dataBinding.limit}
          offset={dataBinding.offset}
          orderBy={dataBinding.orderBy}
          orderDir={dataBinding.orderDir}
          firstChildId={firstChildId}
          rowHeight={rowHeight}
          variableRuntime={variableRuntime}
          renderChildWithRuntime={renderChildWithRuntime}
        />
      </g>
    );
  }

  const childInstanceContext = node.type === "instance" ? node.id : instanceContext;
  const renderChild = (
    childId: string,
    variableRuntimeOverride?: VariableRuntime,
    instanceContextOverride?: string,
  ) =>
    renderNodeTree(
      resolveDoc,
      childId,
      pageId,
      interactive,
      onNavigate,
      controlRoles,
      controlRootMap,
      controlState,
      onToggleControl,
      controlTextState,
      controlFileState,
      onChangeControlText,
      onChangeControlFile,
      invalidControlIds,
      disabledControlIds,
      hiddenNodeIds,
      childOrderOverrides,
      textOverrides,
      headerCompact,
      activeSubmitButtonIds,
      activeButtonStyle,
      variableRuntimeOverride ?? variableRuntime,
      instanceVariantOverrides,
      appPageId,
      instanceContextOverride ?? childInstanceContext,
      whileHoverCallbacks,
      tooltipState,
      nextTooltipGroupId,
      getLibraryDoc,
    );

  let childrenArray: React.ReactNode[];
  let childrenContent: React.ReactNode;
  if (useMask && firstChild) {
    const maskId = `rt-mask-${firstChildId}`;
    childrenArray = effectiveChildIds.slice(1).map((id) => renderChild(id));
    childrenContent = (
      <>
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
            <g transform={`translate(${firstChild.frame.x} ${firstChild.frame.y})`}>
              {renderShape(resolveDoc, firstChild, { frame: firstChild.frame, fill: "white" }, variableRuntime)}
            </g>
          </mask>
        </defs>
        <g mask={`url(#${maskId})`}>{childrenArray}</g>
      </>
    );
  } else {
    childrenArray = effectiveChildIds.map((id) => renderChild(id));
    childrenContent = childrenArray;
  }

  const overflow = node.overflowScrolling ?? (isDateSlider ? "horizontal" : "none");
  const useOverflow = overflow !== "none" && effectiveChildIds.length > 0;
  if (useOverflow) {
    const boundsParentId = resolveDoc !== doc && node.type === "instance" && node.instanceOf ? node.instanceOf : nodeId;
    const bounds = getNodeChildrenBounds(resolveDoc, boundsParentId);
    const overflowX = overflow === "horizontal" || overflow === "both" ? "auto" : "hidden";
    const overflowY = overflow === "vertical" || overflow === "both" ? "auto" : "hidden";
    const safeW = Math.max(1, bounds.w);
    const safeH = Math.max(1, bounds.h);
    const isHeaderChild = (child?: Node | null) => Boolean(child?.name && /헤더|header/i.test(child.name));
    const hasSticky = effectiveChildIds.some((id) => {
      const child = resolveDoc.nodes[id];
      return child?.sticky || isHeaderChild(child);
    });
    if (isDateSlider) {
      const snapAxis = overflow === "vertical" ? "y" : "x";
      const snapAlign = snapAxis === "y" ? "start" : "center";
      childrenContent = (
        <foreignObject x={0} y={0} width={frame.w} height={frame.h}>
          <div
            {...({ xmlns: "http://www.w3.org/1999/xhtml" } as React.HTMLAttributes<HTMLDivElement>)}
            style={{
              overflowX,
              overflowY,
              width: frame.w,
              height: frame.h,
              margin: 0,
              padding: 0,
              position: "relative",
              scrollSnapType: `${snapAxis} mandatory`,
            }}
          >
            <div style={{ width: safeW, height: safeH, scrollSnapAlign: "none" }} />
            {effectiveChildIds.map((childId) => {
              const child = resolveDoc.nodes[childId];
              if (!child) return null;
              const cw = child.frame.w;
              const ch = child.frame.h;
              const cx = child.frame.x;
              const cy = child.frame.y;
              const childSvg = (
                <svg width={cw} height={ch} viewBox={`0 0 ${cw} ${ch}`} style={{ display: "block" }}>
                  <g transform={`translate(${-cx},${-cy})`}>
                    {renderChild(childId)}
                  </g>
                </svg>
              );
              return (
                <div
                  key={childId}
                  style={{ position: "absolute", left: cx, top: cy, width: cw, height: ch, scrollSnapAlign: snapAlign }}
                >
                  {childSvg}
                </div>
              );
            })}
          </div>
        </foreignObject>
      );
    } else {
      childrenContent = hasSticky ? (
      <foreignObject x={0} y={0} width={frame.w} height={frame.h}>
        <div
          {...({ xmlns: "http://www.w3.org/1999/xhtml" } as React.HTMLAttributes<HTMLDivElement>)}
          style={{
            overflowX,
            overflowY,
            width: frame.w,
            height: frame.h,
            margin: 0,
            padding: 0,
          }}
        >
          <div style={{ position: "relative", width: safeW, height: safeH }}>
            {effectiveChildIds.map((childId) => {
              const child = resolveDoc.nodes[childId];
              if (!child) return null;
              const cw = child.frame.w;
              const ch = child.frame.h;
              const cx = child.frame.x;
              const cy = child.frame.y;
              const childSvg = (
                <svg width={cw} height={ch} viewBox={`0 0 ${cw} ${ch}`} style={{ display: "block" }}>
                  <g transform={`translate(${-cx},${-cy})`}>
                    {renderChild(childId)}
                  </g>
                </svg>
              );
              if (child.sticky) {
                return (
                  <div
                    key={childId}
                    style={{
                      position: "absolute",
                      left: 0,
                      top: cy,
                      width: safeW,
                      height: ch,
                    }}
                  >
                    <div
                      style={{
                        position: "sticky",
                        top: 0,
                        left: cx,
                        width: cw,
                        height: ch,
                        zIndex: 1,
                      }}
                    >
                      {childSvg}
                    </div>
                  </div>
                );
              }
              if (isHeaderChild(child)) {
                return (
                  <div
                    key={childId}
                    style={{
                      position: "absolute",
                      left: 0,
                      top: cy,
                      width: safeW,
                      height: ch,
                    }}
                  >
                    <div
                      style={{
                        position: "sticky",
                        top: 0,
                        left: cx,
                        width: cw,
                        height: ch,
                        zIndex: 1,
                      }}
                    >
                      {childSvg}
                    </div>
                  </div>
                );
              }
              return (
                <div key={childId} style={{ position: "absolute", left: cx, top: cy, width: cw, height: ch }}>
                  {childSvg}
                </div>
              );
            })}
          </div>
        </div>
      </foreignObject>
    ) : (
      <foreignObject x={0} y={0} width={frame.w} height={frame.h}>
        <div
          {...({ xmlns: "http://www.w3.org/1999/xhtml" } as React.HTMLAttributes<HTMLDivElement>)}
          style={{
            overflowX,
            overflowY,
            width: frame.w,
            height: frame.h,
            margin: 0,
            padding: 0,
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={safeW}
            height={safeH}
            viewBox={`${bounds.x} ${bounds.y} ${safeW} ${safeH}`}
            style={{ display: "block" }}
          >
            {childrenContent}
          </svg>
        </div>
      </foreignObject>
    );
    }
  }
  const customRenderer = getCustomNodeRenderer(node.type);
  if (customRenderer) {
    const ctx = {
      doc,
      pageId,
      interactive: !!interactive,
      variableRuntime,
      selectionIds: Array.from(doc.selection),
      pluginAPI: {
        getNode: (id: string) => doc.nodes[id],
        getDoc: () => doc,
        getPageId: () => pageId,
        getVariableMode: () => variableRuntime?.mode,
      },
    };
    const content = customRenderer({ node, ctx, children: childrenArray });
    if (content != null) {
      return (
        <g
          key={node.id}
          transform={nodeTransform}
          opacity={nodeOpacity}
        >
          {content}
        </g>
      );
    }
  }
  const clickInteraction = interactive && canInteract ? node.prototype?.interactions.find((i) => i.trigger === "click") : undefined;
  const hoverInteraction = interactive && canInteract ? node.prototype?.interactions.find((i) => i.trigger === "hover") : undefined;
  const whileHoverInteraction = interactive && canInteract ? node.prototype?.interactions.find((i) => i.trigger === "whileHover") : undefined;
  const onPressInteraction = interactive && canInteract ? node.prototype?.interactions.find((i) => i.trigger === "onPress") : undefined;
  const onDragStartInteraction = interactive && canInteract ? node.prototype?.interactions.find((i) => i.trigger === "onDragStart") : undefined;
  const onDragEndInteraction = interactive && canInteract ? node.prototype?.interactions.find((i) => i.trigger === "onDragEnd") : undefined;
  const handleTrigger = (interaction: { action: PrototypeAction }, trigger: PrototypeTrigger) => {
    if (!onNavigate) return;
    onNavigate({ pageId, nodeId: node.id, trigger, action: interaction.action });
  };
  const canClick = Boolean(clickInteraction || (interactive && canInteract && clickRole));
  const triggerClick = () => {
    if (clickRole && clickRole.type !== "input" && onToggleControl) onToggleControl(clickRole.rootId);
    if (clickInteraction) handleTrigger(clickInteraction, "click");
  };
  const handleClick = canClick
    ? (event: React.MouseEvent<SVGGElement>) => {
        event.stopPropagation();
        triggerClick();
      }
    : undefined;
  const isKeyboardFocusable = Boolean(interactive && canClick && (!clickRole || clickRole.type !== "input"));
  const handleKeyDown = isKeyboardFocusable
    ? (event: React.KeyboardEvent<SVGGElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          triggerClick();
        }
      }
    : undefined;
  const handleMouseEnter = hoverInteraction
    ? () => handleTrigger(hoverInteraction, "hover")
    : whileHoverInteraction && whileHoverCallbacks
      ? () => whileHoverCallbacks.onEnter(whileHoverInteraction!, node.id, pageId)
      : undefined;
  const handleMouseLeave = whileHoverInteraction && whileHoverCallbacks ? () => whileHoverCallbacks.onLeave() : undefined;
  const handleTooltipEnter = isTooltipGroup && tooltipState ? () => tooltipState.setHoveredId(node.id) : undefined;
  const handleTooltipLeave = isTooltipGroup && tooltipState ? () => tooltipState.setHoveredId((prev) => (prev === node.id ? null : prev)) : undefined;
  const mergedMouseEnter = handleMouseEnter || handleTooltipEnter
    ? () => {
        if (handleMouseEnter) handleMouseEnter();
        if (handleTooltipEnter) handleTooltipEnter();
      }
    : undefined;
  const mergedMouseLeave = handleMouseLeave || handleTooltipLeave
    ? () => {
        if (handleMouseLeave) handleMouseLeave();
        if (handleTooltipLeave) handleTooltipLeave();
      }
    : undefined;
  const handleFocus = handleTooltipEnter ? () => handleTooltipEnter() : undefined;
  const handleBlur = handleTooltipLeave ? () => handleTooltipLeave() : undefined;
  const handleMouseDown = onPressInteraction
    ? (event: React.MouseEvent<SVGGElement>) => {
        event.stopPropagation();
        handleTrigger(onPressInteraction, "onPress");
      }
    : undefined;
  const handlePointerDown = onDragStartInteraction
    ? (event: React.PointerEvent<SVGGElement>) => {
        event.stopPropagation();
        handleTrigger(onDragStartInteraction, "onDragStart");
      }
    : undefined;
  const handlePointerUp = onDragEndInteraction
    ? (event: React.PointerEvent<SVGGElement>) => {
        event.stopPropagation();
        handleTrigger(onDragEndInteraction, "onDragEnd");
      }
    : undefined;
  const handlePointerLeave = onDragEndInteraction
    ? (event: React.PointerEvent<SVGGElement>) => {
        handleTrigger(onDragEndInteraction, "onDragEnd");
      }
    : undefined;
  const cursor =
    isDisabledControl
      ? "not-allowed"
      : role?.type === "input"
      ? role.inputType === "file"
        ? "pointer"
        : "text"
      : clickInteraction || hoverInteraction || whileHoverInteraction || onPressInteraction || onDragStartInteraction || onDragEndInteraction || (interactive && clickRole)
        ? "pointer"
        : undefined;
  const blendMode = node.style.blendMode && node.style.blendMode !== "normal" ? node.style.blendMode : undefined;
  const filterId = resolveEffects(doc, node).length ? getEffectFilterId("rt-effect", node.id) : undefined;
  const isCheckboxBox = role?.type === "checkbox" && role.role === "box";
  const isToggleTrack = role?.type === "toggle" && role.role === "track";
  const isToggleKnob = role?.type === "toggle" && role.role === "knob";
  const checkboxFill = isCheckboxBox && roleChecked ? "#111827" : undefined;
  const toggleTrackFill = isToggleTrack && roleChecked ? "#111827" : undefined;
  const renderBase = !(isToggleKnob && roleChecked);
  const normalizedNodeName = node.name ? normalizeName(node.name) : "";
  const normalizedPlaceholder = inputRole?.placeholder ? normalizeName(inputRole.placeholder) : "";
  const isOtpInput = Boolean(inputRole && !isFileInput && normalizedNodeName.includes("코드") && normalizedNodeName.includes("입력"));
  const isPhoneMask = Boolean(
    inputRole &&
      !isFileInput &&
      !inputRole.multiline &&
      (inputRole.inputType === "tel" || normalizedNodeName.includes("전화") || normalizedPlaceholder.includes("010") || normalizedPlaceholder.includes("phone")),
  );
  const isDateMask = Boolean(
    inputRole &&
      !isFileInput &&
      !inputRole.multiline &&
      (inputRole.inputType === "date" || normalizedNodeName.includes("날짜") || normalizedPlaceholder.includes("yyyy") || normalizedPlaceholder.includes("date")),
  );
  const otpGroupId = isOtpInput ? (node.parentId ?? node.id) : null;
  const otpIndex = isOtpInput && node.parentId ? (doc.nodes[node.parentId]?.children ?? []).indexOf(node.id) : -1;
  const allowMultipleFiles = Boolean(
    isFileInput &&
      (normalizedNodeName.includes("multiple") ||
        normalizedPlaceholder.includes("multiple") ||
        normalizedNodeName.includes("\uC5EC\uB7EC") ||
        normalizedPlaceholder.includes("\uC5EC\uB7EC")),
  );
  const focusOtpSibling = (offset: number) => {
    if (!otpGroupId || typeof document === "undefined") return;
    const selector = `input[data-otp-group="${otpGroupId}"]`;
    const nodes = Array.from(document.querySelectorAll<HTMLInputElement>(selector));
    if (!nodes.length) return;
    const byIndex = nodes.sort((a, b) => {
      const ai = Number(a.dataset.otpIndex ?? 0);
      const bi = Number(b.dataset.otpIndex ?? 0);
      return ai - bi;
    });
    const next = byIndex.find((el) => Number(el.dataset.otpIndex ?? -1) === otpIndex + offset);
    next?.focus();
  };
  const handleFileDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isFileInput || !inputRole) return;
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) onChangeControlFile?.(inputRole.rootId, files);
  };
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!inputRole) return;
    if (isFileInput) {
      const target = event.target as HTMLInputElement;
      const files = Array.from(target.files ?? []);
      if (files.length) onChangeControlFile?.(inputRole.rootId, files);
      target.value = "";
      return;
    }
    const rawValue = event.target.value ?? "";
    const maskPhone = (value: string) => {
      const digits = value.replace(/\D/g, "").slice(0, 11);
      if (digits.length <= 3) return digits;
      if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    };
    const maskDate = (value: string) => {
      const digits = value.replace(/\D/g, "").slice(0, 8);
      if (digits.length <= 4) return digits;
      if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
      return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
    };
    let value = rawValue;
    if (isOtpInput) value = rawValue.slice(-1);
    else if (isPhoneMask) value = maskPhone(rawValue);
    else if (isDateMask) value = maskDate(rawValue);
    onChangeControlText?.(inputRole.rootId, value);
    if (isOtpInput && value.length >= 1) {
      focusOtpSibling(1);
    }
  };
  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!isOtpInput) return;
    if (event.key === "Backspace" && (event.currentTarget.value ?? "") === "") {
      focusOtpSibling(-1);
    }
  };
  const shouldClip = Boolean(node.clipContent) && node.children.length > 0;
  const clipId = shouldClip ? `rt-clip-${node.id}` : null;
  const filePreview = filePreviewUrl && filePreviewClipId ? (
    <>
      <defs>
        <clipPath id={filePreviewClipId}>{renderClipShape(node, frame)}</clipPath>
      </defs>
      <image
        href={filePreviewUrl}
        x={0}
        y={0}
        width={frame.w}
        height={frame.h}
        preserveAspectRatio="xMidYMid slice"
        clipPath={`url(#${filePreviewClipId})`}
        style={{ pointerEvents: "none" }}
      />
    </>
  ) : null;
  const content = (
    <>
      {filePreview}
      {showInput && inputRole ? (
        <foreignObject x={0} y={0} width={frame.w} height={frame.h}>
          <div
            style={{ width: "100%", height: "100%", display: "flex", alignItems: inputRole.multiline ? "flex-start" : "center" }}
          >
            {inputRole.multiline ? (
              <textarea
                value={inputValue}
                placeholder={inputRole.placeholder}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                data-otp-group={otpGroupId ?? undefined}
                data-otp-index={otpIndex >= 0 ? String(otpIndex) : undefined}
                inputMode={isOtpInput || isPhoneMask || isDateMask ? "numeric" : undefined}
                autoComplete={isOtpInput ? "one-time-code" : undefined}
                maxLength={isOtpInput ? 1 : isDateMask ? 10 : isPhoneMask ? 13 : undefined}
                style={{
                  width: "100%",
                  height: "100%",
                  padding: `${inputRole.padding.t}px ${inputRole.padding.r}px ${inputRole.padding.b}px ${inputRole.padding.l}px`,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  resize: "none",
                  color: inputRole.font.color,
                  fontFamily: inputRole.font.family,
                  fontSize: inputRole.font.size,
                  fontWeight: inputRole.font.weight,
                  lineHeight: String(inputRole.font.lineHeight),
                }}
              />
            ) : isFileInput ? (
              <div
                onDrop={handleFileDrop}
                onDragOver={(event) => event.preventDefault()}
                style={{ width: "100%", height: "100%", position: "relative" }}
              >
                {showFileSummary ? (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      padding: `${inputRole.padding.t}px ${inputRole.padding.r}px ${inputRole.padding.b}px ${inputRole.padding.l}px`,
                      fontFamily: inputRole.font.family,
                      fontSize: Math.max(10, inputRole.font.size - 2),
                      lineHeight: String(inputRole.font.lineHeight ?? 1.4),
                      color: inputRole.font.color,
                      whiteSpace: "pre-line",
                      overflow: "hidden",
                      pointerEvents: "none",
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      선택된 파일{fileList.length > 1 ? ` (${fileList.length})` : ""}
                    </div>
                    <div>{fileSummary}</div>
                  </div>
                ) : null}
                <input
                  type="file"
                  multiple={allowMultipleFiles || undefined}
                  onChange={handleInputChange}
                  data-otp-group={otpGroupId ?? undefined}
                  data-otp-index={otpIndex >= 0 ? String(otpIndex) : undefined}
                  style={{
                    width: "100%",
                    height: "100%",
                    padding: `${inputRole.padding.t}px ${inputRole.padding.r}px ${inputRole.padding.b}px ${inputRole.padding.l}px`,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    opacity: 0,
                    cursor: "pointer",
                  }}
                />
              </div>
            ) : (
              <input
                type={inputRole.inputType}
                value={inputValue}
                placeholder={inputRole.placeholder}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                data-otp-group={otpGroupId ?? undefined}
                data-otp-index={otpIndex >= 0 ? String(otpIndex) : undefined}
                inputMode={isOtpInput || isPhoneMask || isDateMask ? "numeric" : undefined}
                autoComplete={isOtpInput ? "one-time-code" : undefined}
                maxLength={isOtpInput ? 1 : isDateMask ? 10 : isPhoneMask ? 13 : undefined}
                style={{
                  width: "100%",
                  height: "100%",
                  padding: `${inputRole.padding.t}px ${inputRole.padding.r}px ${inputRole.padding.b}px ${inputRole.padding.l}px`,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: inputRole.font.color,
                  fontFamily: inputRole.font.family,
                  fontSize: inputRole.font.size,
                  fontWeight: inputRole.font.weight,
                  lineHeight: String(inputRole.font.lineHeight),
                }}
              />
            )}
          </div>
        </foreignObject>
      ) : null}
      {childrenContent}
    </>
  );

  const pointerEventsValue = isFilePlaceholder ? "none" : !interactive ? undefined : isDisabledControl ? "none" : "all";
  return (
    <g
      key={node.id}
      data-node-id={node.id}
      data-node-type={node.type}
      data-label-hash={node.name ? simpleHash(node.name) : undefined}
      suppressHydrationWarning
      transform={nodeTransform}
      opacity={nodeOpacity}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseEnter={mergedMouseEnter}
      onMouseLeave={mergedMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      tabIndex={interactive && (isTooltipGroup || isSkipLink || isKeyboardFocusable) ? 0 : undefined}
      onKeyDown={handleKeyDown}
      aria-label={skipLabel}
      role={isSkipLink ? "link" : isKeyboardFocusable ? "button" : undefined}
      style={cursor || blendMode ? { ...(cursor ? { cursor } : {}), ...(blendMode ? { mixBlendMode: blendMode } : {}) } : undefined}
      pointerEvents={pointerEventsValue}
    >
      {node.type !== "group" && renderBase
        ? renderShape(
            doc,
            node,
            node.type === "hotspot" && interactive
              ? { frame, fill: "transparent", stroke: { color: "transparent", width: 0, dash: [], align: "center", cap: "butt", join: "miter", miter: 4 }, filterId }
              : { frame, fill: checkboxFill ?? toggleTrackFill ?? overrideFill ?? undefined, stroke: invalidStroke, filterId },
            variableRuntime,
            textOverrides,
          )
        : null}
      {isCheckboxBox && roleChecked ? renderCheckboxMark(frame, "#FFFFFF") : null}
      {isToggleKnob && roleChecked ? renderShape(doc, node, { frame, filterId }, variableRuntime) : null}
      {shouldClip && clipId ? (
        <>
          <defs>
            <clipPath id={clipId}>{renderClipShape(node, frame)}</clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>{content}</g>
        </>
      ) : (
        content
      )}
    </g>
  );
}

export default function RuntimeRenderer({
  doc,
  activePageId,
  interactive,
  onNavigate,
  svgRef,
  fitToContent,
  controlState,
  onToggleControl,
  controlTextState,
  controlFileState,
  onChangeControlText,
  onChangeControlFile,
  invalidControlIds,
  disabledControlIds,
  hiddenNodeIds,
  childOrderOverrides,
  textOverrides,
  headerCompact,
  activeSubmitButtonIds,
  activeSubmitButtonFill,
  activeSubmitButtonTextFill,
  variableRuntime,
  instanceVariantOverrides,
  appPageId,
  getLibraryDoc,
}: Props) {
  const hydrated = hydrateDoc(doc);
  const laidOut = layoutDoc(hydrated);

  const root = laidOut.nodes[laidOut.root];
  const preferredPageId = activePageId ?? laidOut.prototype?.startPageId;
  const page = preferredPageId ? laidOut.pages.find((p) => p.id === preferredPageId) ?? laidOut.pages[0] : laidOut.pages[0];
  const pageNode = page ? laidOut.nodes[page.rootId] : null;
  const width = pageNode?.frame.w ?? 1200;
  const height = pageNode?.frame.h ?? 800;
  const pageRootIds = pageNode ? [pageNode.id] : root.children;
  const bounds = getPageContentBounds(laidOut, page?.id ?? null);
  const resolvedBounds = bounds && bounds.w > 0 && bounds.h > 0 ? bounds : null;
  const hasContent = Boolean(pageNode?.children?.length);
  const isLargeCanvas = Boolean(pageNode && (pageNode.frame.w >= 2400 || pageNode.frame.h >= 1800));
  const fitContent = Boolean(resolvedBounds && (fitToContent || (isLargeCanvas && hasContent)));
  const minX = resolvedBounds ? Math.min(0, resolvedBounds.x) : 0;
  const minY = resolvedBounds ? Math.min(0, resolvedBounds.y) : 0;
  const maxX = resolvedBounds ? Math.max(width, resolvedBounds.x + resolvedBounds.w) : width;
  const maxY = resolvedBounds ? Math.max(height, resolvedBounds.y + resolvedBounds.h) : height;
  const extendedWidth = maxX - minX;
  const extendedHeight = maxY - minY;
  const svgWidth = fitContent && resolvedBounds ? resolvedBounds.w : extendedWidth;
  const svgHeight = fitContent && resolvedBounds ? resolvedBounds.h : extendedHeight;
  const viewBox = fitContent && resolvedBounds ? `${resolvedBounds.x} ${resolvedBounds.y} ${resolvedBounds.w} ${resolvedBounds.h}` : `${minX} ${minY} ${extendedWidth} ${extendedHeight}`;
  const controlRoles = useMemo(() => buildControlRoles(laidOut, variableRuntime), [laidOut, variableRuntime]);
  const controlRootMap = useMemo(() => buildControlRootMap(laidOut, controlRoles), [laidOut, controlRoles]);
  const effectDefs = useMemo(() => buildEffectDefs(laidOut, "rt-effect"), [laidOut]);
  const gradientDefs = useMemo(() => buildGradientDefs(laidOut), [laidOut]);
  const imageFillPatternDefs = useMemo(() => buildImageFillPatternDefs(laidOut), [laidOut]);
  const activeButtonStyle = useMemo(
    () => ({
      fill: activeSubmitButtonFill ?? "#111111",
      textFill: activeSubmitButtonTextFill ?? "#FFFFFF",
    }),
    [activeSubmitButtonFill, activeSubmitButtonTextFill],
  );
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredTooltipGroupId, setHoveredTooltipGroupId] = useState<string | null>(null);
  const tooltipTimeoutRef = useRef<number | null>(null);
  const tooltipTimeoutMs = resolveTooltipTimeout(variableRuntime);
  const handleWhileHoverEnter = useCallback<WhileHoverCallbacks["onEnter"]>(
    (interaction, nodeId, pageId) => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      const delay = interaction.hoverDelayMs ?? 0;
      hoverTimeoutRef.current = setTimeout(() => {
        hoverTimeoutRef.current = null;
        onNavigate?.({ pageId, nodeId, trigger: "whileHover", action: interaction.action });
      }, delay);
    },
    [onNavigate],
  );
  const handleWhileHoverLeave = useCallback<WhileHoverCallbacks["onLeave"]>(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);
  const whileHoverCallbacks = useMemo<WhileHoverCallbacks>(
    () => ({
      onEnter: handleWhileHoverEnter,
      onLeave: handleWhileHoverLeave,
    }),
    [handleWhileHoverEnter, handleWhileHoverLeave],
  );

  useEffect(() => {
    if (!interactive) return;
    if (tooltipTimeoutRef.current) {
      window.clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    if (!hoveredTooltipGroupId) return;
    tooltipTimeoutRef.current = window.setTimeout(() => {
      setHoveredTooltipGroupId(null);
      tooltipTimeoutRef.current = null;
    }, tooltipTimeoutMs);
    return () => {
      if (tooltipTimeoutRef.current) {
        window.clearTimeout(tooltipTimeoutRef.current);
        tooltipTimeoutRef.current = null;
      }
    };
  }, [hoveredTooltipGroupId, interactive, tooltipTimeoutMs]);

  return (
    <svg
      ref={svgRef}
      width={svgWidth}
      height={svgHeight}
      viewBox={viewBox}
      preserveAspectRatio="xMinYMin meet"
      style={{ display: "block" }}
    >
      <defs>
        <marker id="adv-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#111111" />
        </marker>
        {gradientDefs}
        {imageFillPatternDefs}
        {effectDefs}
      </defs>
      {/* eslint-disable-next-line react-hooks/refs */}
      {pageRootIds.map((childId) =>
        renderNodeTree(
          laidOut,
          childId,
          page?.id ?? "page",
          interactive,
          onNavigate,
          controlRoles,
          controlRootMap,
          controlState,
          onToggleControl,
          controlTextState,
          controlFileState,
          onChangeControlText,
          onChangeControlFile,
          invalidControlIds,
          disabledControlIds,
          hiddenNodeIds,
          childOrderOverrides,
          textOverrides,
          headerCompact,
          activeSubmitButtonIds,
          activeButtonStyle,
          variableRuntime,
          instanceVariantOverrides,
          appPageId,
          undefined,
          whileHoverCallbacks,
          { hoveredId: hoveredTooltipGroupId, setHoveredId: setHoveredTooltipGroupId },
          null,
          getLibraryDoc,
        ),
      )}
    </svg>
  );
}
