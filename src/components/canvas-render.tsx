import React from "react";
import ImageWithFallback from "@/components/image-with-fallback";
import type { BuilderAction, CanvasDocument, CanvasNode } from "@/lib/canvas";

type Runtime = {
  state?: Record<string, unknown>;
  setState?: (patch: Record<string, unknown>) => void;
  onAction?: (action: BuilderAction, node: CanvasNode) => void;
};

type Props = {
  doc: CanvasDocument;
  className?: string;
  showGrid?: boolean;
  interactive?: boolean;
  runtime?: Runtime;
};

function nodeStyle(node: CanvasNode) {
  const opacity = typeof node.opacity === "number" ? node.opacity : 1;
  const rotation = typeof node.rotation === "number" ? node.rotation : 0;
  return {
    left: node.x,
    top: node.y,
    width: node.w,
    height: node.h,
    opacity,
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    transformOrigin: "center",
  } as const;
}

function s(v: unknown, fallback = "") {
  if (typeof v !== "string") return fallback;
  const t = v.trim();
  return t.length ? v : fallback;
}

function pickFill(props: Record<string, unknown>, fallback: string) {
  // editor-view often writes `background`, renderer reads `fill`.
  // accept both so style controls remain stable.
  return s(props.fill, s(props.background, fallback));
}
type FillStop = { color: string; pos: number };

function normalizeStops(props: Record<string, unknown>, fallback: string): FillStop[] {
  const raw = Array.isArray(props.fillStops) ? (props.fillStops as FillStop[]) : [];
  if (raw.length > 0) {
    return raw.map((stop) => ({
      color: s(stop.color, fallback),
      pos: Math.max(0, Math.min(100, Number(stop.pos) || 0)),
    }));
  }
  const from = s(props.fillFrom, fallback);
  const to = s(props.fillTo, "#111111");
  return [
    { color: from, pos: 0 },
    { color: to, pos: 100 },
  ];
}

function buildCssGradient(props: Record<string, unknown>, fallback: string) {
  const type = s(props.fillType, "linear");
  const angle = n(props.fillAngle, 135);
  const cx = n(props.fillCenterX, 50);
  const cy = n(props.fillCenterY, 50);
  const stops = normalizeStops(props, fallback).sort((a, b) => a.pos - b.pos);
  const stopStr = stops.map((stop) => `${stop.color} ${stop.pos}%`).join(", ");
  if (type === "radial") return `radial-gradient(circle at ${cx}% ${cy}%, ${stopStr})`;
  if (type === "conic") return `conic-gradient(from ${angle}deg at ${cx}% ${cy}%, ${stopStr})`;
  return `linear-gradient(${angle}deg, ${stopStr})`;
}

function resolveFill(props: Record<string, unknown>, fallback: string) {
  const mode = s(props.fillMode, "solid");
  if (mode === "gradient") {
    const gradient = buildCssGradient(props, fallback);
    return {
      value: gradient,
      gradient: {
        type: s(props.fillType, "linear"),
        angle: n(props.fillAngle, 135),
        centerX: n(props.fillCenterX, 50),
        centerY: n(props.fillCenterY, 50),
        stops: normalizeStops(props, fallback),
      },
    };
  }
  return { value: pickFill(props, fallback), gradient: null as null };
}
function pickStroke(props: Record<string, unknown>, fallback = "") {
  return s(props.stroke, s(props.borderColor, s(props.border, fallback)));
}
function pickStrokeWidth(props: Record<string, unknown>, fallback = 0) {
  const sw = n(props.strokeWidth, NaN);
  if (Number.isFinite(sw)) return sw;
  const bw = n(props.borderWidth, NaN);
  if (Number.isFinite(bw)) return bw;
  return fallback;
}
function pickBorderStyle(props: Record<string, unknown>, fallback = "solid") {
  const style = s(props.borderStyle, s(props.strokeStyle, fallback));
  return ["solid", "dashed", "dotted"].includes(style) ? style : fallback;
}
function pickLineCap(props: Record<string, unknown>, fallback = "round") {
  const cap = s(props.lineCap, s(props.strokeLinecap, fallback));
  return ["round", "butt", "square"].includes(cap) ? cap : fallback;
}
function pickLineJoin(props: Record<string, unknown>, fallback = "round") {
  const join = s(props.lineJoin, s(props.strokeLinejoin, fallback));
  return ["round", "bevel", "miter"].includes(join) ? join : fallback;
}
function pickShadow(props: Record<string, unknown>) {
  return s(props.shadow, "");
}
function pickBlendMode(props: Record<string, unknown>) {
  const blend = s(props.blendMode, "normal");
  return blend === "normal" ? "" : blend;
}
function pickBlur(props: Record<string, unknown>) {
  const blur = n(props.blur, 0);
  return Number.isFinite(blur) && blur > 0 ? blur : 0;
}
function pickFontSize(props: Record<string, unknown>, fallback: number) {
  const fs = n(props.fontSize, NaN);
  if (Number.isFinite(fs)) return fs;
  const preset = s(props.size, "");
  if (preset === "sm") return 14;
  if (preset === "md") return 16;
  if (preset === "lg") return 20;
  return fallback;
}
function pickFontWeight(props: Record<string, unknown>, fallback: number) {
  const fw = n(props.fontWeight, NaN);
  if (Number.isFinite(fw)) return fw;
  const preset = s(props.weight, "");
  if (preset === "light") return 300;
  if (preset === "medium") return 500;
  if (preset === "bold") return 700;
  return fallback;
}
function pickLineHeight(props: Record<string, unknown>) {
  const lh = n(props.lineHeight, NaN);
  return Number.isFinite(lh) && lh > 0 ? lh : undefined;
}
function pickLetterSpacing(props: Record<string, unknown>) {
  const ls = n(props.letterSpacing, NaN);
  return Number.isFinite(ls) ? ls : undefined;
}
function pickFontFamily(props: Record<string, unknown>) {
  const ff = s(props.fontFamily, "");
  return ff.trim().length ? ff : undefined;
}
function pickTextTransform(props: Record<string, unknown>) {
  const value = s(props.textTransform, "none");
  return ["none", "uppercase", "lowercase", "capitalize"].includes(value) ? value : "none";
}
function pickFontStyle(props: Record<string, unknown>) {
  const value = s(props.fontStyle, "normal");
  return ["normal", "italic", "oblique"].includes(value) ? value : "normal";
}

function applyEffects(props: Record<string, unknown>, isText = false) {
  const style: React.CSSProperties = {};
  const shadow = pickShadow(props);
  const blend = pickBlendMode(props);
  const blur = pickBlur(props);
  const brightness = n(props.filterBrightness, 100);
  const contrast = n(props.filterContrast, 100);
  const saturate = n(props.filterSaturate, 100);
  const hue = n(props.filterHue, 0);
  const grayscale = n(props.filterGrayscale, 0);
  if (shadow) {
    if (isText) style.textShadow = shadow;
    else style.boxShadow = shadow;
  }
  if (blend) style.mixBlendMode = blend as React.CSSProperties["mixBlendMode"];
  const filters: string[] = [];
  if (blur > 0) filters.push(`blur(${blur}px)`);
  if (Number.isFinite(brightness) && brightness !== 100) filters.push(`brightness(${brightness}%)`);
  if (Number.isFinite(contrast) && contrast !== 100) filters.push(`contrast(${contrast}%)`);
  if (Number.isFinite(saturate) && saturate !== 100) filters.push(`saturate(${saturate}%)`);
  if (Number.isFinite(hue) && hue !== 0) filters.push(`hue-rotate(${hue}deg)`);
  if (Number.isFinite(grayscale) && grayscale !== 0) filters.push(`grayscale(${grayscale}%)`);
  if (filters.length > 0) style.filter = filters.join(" ");
  return style;
}

function renderSvgGradient(
  id: string,
  gradient: { type: string; angle: number; centerX: number; centerY: number; stops: FillStop[] },
) {
  const stops = gradient.stops.sort((a, b) => a.pos - b.pos);
  if (gradient.type === "radial") {
    const cx = gradient.centerX / 100;
    const cy = gradient.centerY / 100;
    return (
      <radialGradient id={id} cx={cx} cy={cy} r={0.5}>
        {stops.map((stop, idx) => (
          <stop key={`${id}-stop-${idx}`} offset={`${stop.pos}%`} stopColor={stop.color} />
        ))}
      </radialGradient>
    );
  }
  if (gradient.type === "conic") return null;
  const rad = ((gradient.angle ?? 0) - 90) * (Math.PI / 180);
  const vx = Math.cos(rad);
  const vy = Math.sin(rad);
  const x1 = 0.5 - 0.5 * vx;
  const y1 = 0.5 - 0.5 * vy;
  const x2 = 0.5 + 0.5 * vx;
  const y2 = 0.5 + 0.5 * vy;
  return (
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
      {stops.map((stop, idx) => (
        <stop key={`${id}-stop-${idx}`} offset={`${stop.pos}%`} stopColor={stop.color} />
      ))}
    </linearGradient>
  );
}
function n(v: unknown, fallback = 0) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function b(v: unknown, fallback = false) {
  return typeof v === "boolean" ? v : fallback;
}

function safeArrayOfStrings(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string") as string[];
  if (typeof v === "string") {
    return v
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

function parsePathPoints(points: unknown): Array<[number, number]> {
  if (Array.isArray(points)) {
    const mapped: Array<[number, number]> = [];
    for (const p of points) {
      if (!Array.isArray(p) || p.length < 2) continue;
      const xn = n(p[0], NaN);
      const yn = n(p[1], NaN);
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

function applyAction(runtime: Runtime | undefined, action: BuilderAction | undefined, node: CanvasNode) {
  if (!runtime || !action || action.type === "none") return;
  runtime.onAction?.(action, node);
}

export default function CanvasRender({ doc, className, showGrid = false, interactive = false, runtime }: Props) {
  const svgGradients = doc.nodes
    .filter((node) => node.type === "path" && !node.hidden)
    .map((node) => {
      const fillInfo = resolveFill(node.props, "none");
      if (!fillInfo.gradient || fillInfo.gradient.type === "conic") return null;
      return { id: `grad-${node.id}`, gradient: fillInfo.gradient };
    })
    .filter(Boolean) as Array<{ id: string; gradient: { type: string; angle: number; centerX: number; centerY: number; stops: FillStop[] } }>;

  return (
    <div
      className={[
        "relative overflow-hidden rounded-[14px] border border-neutral-200 bg-white",
        showGrid
          ? "bg-[linear-gradient(#f7f7f7_1px,transparent_1px),linear-gradient(90deg,#f7f7f7_1px,transparent_1px)]"
          : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: doc.width,
        height: doc.height,
        backgroundSize: showGrid ? "8px 8px" : undefined,
      }}
    >
      {/* Vector layer: line/path */}
      <svg className="absolute inset-0" width={doc.width} height={doc.height} viewBox={`0 0 ${doc.width} ${doc.height}`} aria-hidden>
        {svgGradients.length > 0 ? <defs>{svgGradients.map((g) => renderSvgGradient(g.id, g.gradient))}</defs> : null}
        {doc.nodes.map((node) => {
          if (node.hidden) return null;

          if (node.type === "line") {
            const stroke = s(node.props.stroke, "#111111");
            const strokeWidth = n(node.props.strokeWidth, 2);
            const dash = s(node.props.dash, "");
            const lineCap = pickLineCap(node.props, "round");
            const opacity = typeof node.opacity === "number" ? node.opacity : 1;
            const rotation = typeof node.rotation === "number" ? node.rotation : 0;
            const x1 = node.x + 0;
            const y1 = node.y + node.h / 2;
            const x2 = node.x + node.w;
            const y2 = node.y + node.h / 2;
            const cx = node.x + node.w / 2;
            const cy = node.y + node.h / 2;
            return (
              <line
                key={node.id}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeDasharray={dash || undefined}
                strokeLinecap={lineCap as React.SVGProps<SVGLineElement>["strokeLinecap"]}
                opacity={opacity}
                transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}
              />
            );
          }

          if (node.type === "path") {
            const stroke = s(node.props.stroke, "#111111");
            const strokeWidth = n(node.props.strokeWidth, 2);
            const pts = parsePathPoints(node.props.points);
            const mapped: Array<[number, number]> = [];
            for (const [xn, yn] of pts) {
              mapped.push([node.x + xn * node.w, node.y + yn * node.h]);
            }
            if (mapped.length < 2) return null;
            const closed = b(node.props.closed, false);
            const dash = s(node.props.dash, "");
            const lineCap = pickLineCap(node.props, "round");
            const lineJoin = pickLineJoin(node.props, "round");
            const fillInfo = resolveFill(node.props, "none");
            const fill = fillInfo.gradient
              ? fillInfo.gradient.type !== "conic"
                ? `url(#grad-${node.id})`
                : fillInfo.gradient.stops[0]?.color ?? "none"
              : fillInfo.value;
            const opacity = typeof node.opacity === "number" ? node.opacity : 1;
            const rotation = typeof node.rotation === "number" ? node.rotation : 0;
            const cx = node.x + node.w / 2;
            const cy = node.y + node.h / 2;
            const d = mapped.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ") + (closed ? " Z" : "");
            return (
              <path
                key={node.id}
                d={d}
                fill={closed && fill !== "none" ? fill : "none"}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeDasharray={dash || undefined}
                strokeLinecap={lineCap as React.SVGProps<SVGPathElement>["strokeLinecap"]}
                strokeLinejoin={lineJoin as React.SVGProps<SVGPathElement>["strokeLinejoin"]}
                opacity={opacity}
                transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}
              />
            );
          }

          return null;
        })}
      </svg>

      {doc.nodes.map((node) => {
        if (node.hidden) return null;
        const locked = !!node.locked;
        const pe = interactive && !locked ? "auto" : "none";

        if (node.type === "box" || node.type === "frame") {
          const fill = resolveFill(node.props, node.type === "frame" ? "#FFFFFF" : "#F5F5F5").value;
          const radius = n(node.props.radius, 12);
          const stroke = pickStroke(node.props, "");
          const strokeWidth = pickStrokeWidth(node.props, 0);
          const borderStyle = pickBorderStyle(node.props, "solid");
          return (
            <div
              key={node.id}
              className="absolute"
              style={{
                ...nodeStyle(node),
                ...applyEffects(node.props),
                pointerEvents: pe,
                background: fill,
                borderRadius: radius,
                border: strokeWidth > 0 ? `${strokeWidth}px ${borderStyle} ${stroke || "#111111"}` : undefined,
              }}
            />
          );
        }

        if (node.type === "shape_rect") {
          const fill = resolveFill(node.props, "#EDEDED").value;
          const radius = n(node.props.radius, 16);
          const stroke = pickStroke(node.props, "#111111");
          const strokeWidth = pickStrokeWidth(node.props, 0);
          const borderStyle = pickBorderStyle(node.props, "solid");
          return (
            <div
              key={node.id}
              className="absolute"
              style={{
                ...nodeStyle(node),
                ...applyEffects(node.props),
                pointerEvents: pe,
                background: fill,
                borderRadius: radius,
                border: strokeWidth > 0 ? `${strokeWidth}px ${borderStyle} ${stroke}` : undefined,
              }}
            />
          );
        }

        if (node.type === "shape_ellipse") {
          const fill = resolveFill(node.props, "#EDEDED").value;
          const stroke = pickStroke(node.props, "#111111");
          const strokeWidth = pickStrokeWidth(node.props, 0);
          const borderStyle = pickBorderStyle(node.props, "solid");
          return (
            <div
              key={node.id}
              className="absolute"
              style={{
                ...nodeStyle(node),
                ...applyEffects(node.props),
                pointerEvents: pe,
                background: fill,
                borderRadius: 9999,
                border: strokeWidth > 0 ? `${strokeWidth}px ${borderStyle} ${stroke}` : undefined,
              }}
            />
          );
        }

        if (node.type === "text") {
          const text = s(node.props.text, "");
          const color = s(node.props.color, "#111111");
          const fontSize = pickFontSize(node.props, 16);
          const fontWeight = pickFontWeight(node.props, 500);
          const lineHeight = pickLineHeight(node.props);
          const letterSpacing = pickLetterSpacing(node.props);
          const fontFamily = pickFontFamily(node.props);
          const textTransform = pickTextTransform(node.props);
          const fontStyle = pickFontStyle(node.props);
          const align = s(node.props.align, "left");
          return (
            <div
              key={node.id}
              className="absolute"
              style={{
                ...nodeStyle(node),
                ...applyEffects(node.props, true),
                pointerEvents: pe,
                color,
                fontSize,
                fontWeight,
                fontStyle,
                fontFamily,
                lineHeight,
                letterSpacing,
                textTransform,
                display: "flex",
                alignItems: "center",
                justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
                textAlign: align as React.CSSProperties["textAlign"],
                padding: 4,
                whiteSpace: "pre-wrap",
                wordBreak: "keep-all",
                lineBreak: "strict",
              }}
            >
              {text}
            </div>
          );
        }

        if (node.type === "image") {
          const url = s(node.props.url, "");
          const radius = n(node.props.radius, 12);
          const fit = s(node.props.fit, "cover");
          const objectFitOptions = ["cover", "contain", "fill", "scale-down"] as const;
          const objectFit = objectFitOptions.includes(fit as (typeof objectFitOptions)[number])
            ? (fit as (typeof objectFitOptions)[number])
            : "cover";
          const stroke = pickStroke(node.props, "");
          const strokeWidth = pickStrokeWidth(node.props, 0);
          const borderStyle = pickBorderStyle(node.props, "solid");
          return (
            <div
              key={node.id}
              className="absolute overflow-hidden border border-neutral-200 bg-neutral-100"
              style={{
                ...nodeStyle(node),
                ...applyEffects(node.props),
                pointerEvents: pe,
                borderRadius: radius,
                border:
                  strokeWidth > 0
                    ? `${strokeWidth}px ${borderStyle} ${stroke || "#E5E5E5"}`
                    : "1px solid #E5E5E5",
              }}
            >
              {url ? (
                <ImageWithFallback
                  src={url}
                  alt=""
                  className="h-full w-full"
                  style={{ objectFit }}
                  fallbackText="이미지를 불러올 수 없습니다."
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-400">이미지</div>
              )}
            </div>
          );
        }

        if (node.type === "divider") {
          const color = s(node.props.color, "#EAEAEA");
          const thickness = n(node.props.thickness, 1);
          return (
            <div
              key={node.id}
              className="absolute"
              style={{ ...nodeStyle(node), ...applyEffects(node.props), pointerEvents: pe, height: thickness, background: color }}
            />
          );
        }

        if (node.type === "badge") {
          const label = s(node.props.label, "배지");
          const fill = resolveFill(node.props, "#F1F1F1").value;
          const color = s(node.props.color, "#111111");
          const radius = n(node.props.radius, 999);
          const fontSize = pickFontSize(node.props, 10);
          const fontWeight = pickFontWeight(node.props, 600);
          const fontFamily = pickFontFamily(node.props);
          const letterSpacing = pickLetterSpacing(node.props);
          const textTransform = pickTextTransform(node.props);
          const fontStyle = pickFontStyle(node.props);
          return (
            <div
              key={node.id}
              className="absolute flex items-center justify-center px-2 text-[10px] font-medium"
              style={{
                ...nodeStyle(node),
                ...applyEffects(node.props),
                pointerEvents: pe,
                background: fill,
                color,
                borderRadius: radius,
                fontSize,
                fontWeight,
                fontFamily,
                letterSpacing,
                textTransform,
                fontStyle,
              }}
            >
              {label}
            </div>
          );
        }

        if (node.type === "button") {
          const label = s(node.props.label, "버튼");
          const variant = s(node.props.variant, "primary");
          const fill = resolveFill(node.props, "#111111").value;
          const color = s(node.props.color, "#FFFFFF");
          const radius = n(node.props.radius, 999);
          const fontSize = pickFontSize(node.props, 13);
          const fontWeight = pickFontWeight(node.props, 600);
          const fontFamily = pickFontFamily(node.props);
          const letterSpacing = pickLetterSpacing(node.props);
          const textTransform = pickTextTransform(node.props);
          const fontStyle = pickFontStyle(node.props);
          const textAlign = s(node.props.textAlign, "center");
          const outline = variant === "outline";
          const borderColor = s(node.props.borderColor, fill);
          const borderWidth = n(node.props.borderWidth, outline ? 1 : 0);
          const borderStyle = pickBorderStyle(node.props, "solid");
          const justifyContent = textAlign === "left" ? "flex-start" : textAlign === "right" ? "flex-end" : "center";
          const textColor = outline ? (s(node.props.color, "") || fill) : color;
          return (
            <button
              key={node.id}
              type="button"
              className="absolute"
              style={{
                ...nodeStyle(node),
                ...applyEffects(node.props),
                pointerEvents: interactive && !locked ? "auto" : "none",
                background: outline ? "transparent" : fill,
                color: textColor,
                borderRadius: radius,
                fontSize,
                fontWeight,
                fontFamily,
                letterSpacing,
                textTransform,
                fontStyle,
                justifyContent,
                display: "flex",
                alignItems: "center",
                border:
                  borderWidth > 0
                    ? `${borderWidth}px ${borderStyle} ${outline ? borderColor : borderColor || fill}`
                    : outline
                      ? `1px ${borderStyle} ${fill}`
                      : undefined,
              }}
              onClick={() => {
                if (node.action && node.action.type !== "none") {
                  applyAction(runtime, node.action, node);
                  return;
                }
                const kind = s(node.props.actionKind, "none");
                if (kind === "url") {
                  const href = s(node.props.href, "");
                  if (href) runtime?.onAction?.({ type: "link", url: href }, node);
                  return;
                }
                if (kind === "scene") {
                  const sceneId = s(node.props.sceneId, "");
                  if (sceneId) runtime?.onAction?.({ type: "scene", sceneId }, node);
                }
              }}
            >
              {label}
            </button>
          );
        }

        if (node.type === "link") {
          const label = s(node.props.label, "링크");
          const border = s(node.props.border, s(node.props.borderColor, "#3B82F6"));
          const background = resolveFill(node.props, "rgba(59,130,246,0.10)").value;
          const color = s(node.props.color, border);
          const radius = n(node.props.radius, 12);
          const href = s(node.props.href, "");
          const fontSize = pickFontSize(node.props, 10);
          const fontWeight = pickFontWeight(node.props, 500);
          const fontFamily = pickFontFamily(node.props);
          const letterSpacing = pickLetterSpacing(node.props);
          const textTransform = pickTextTransform(node.props);
          const fontStyle = pickFontStyle(node.props);
          const textAlign = s(node.props.textAlign, "center");
          const borderWidth = n(node.props.borderWidth, 1);
          const borderStyle = pickBorderStyle(node.props, "dashed");
          const justifyContent = textAlign === "left" ? "flex-start" : textAlign === "right" ? "flex-end" : "center";
          return (
            <div
              key={node.id}
              className="absolute flex items-center justify-center text-[10px] font-medium"
              style={{
                ...nodeStyle(node),
                ...applyEffects(node.props),
                pointerEvents: pe,
                borderRadius: radius,
                border: `${borderWidth}px ${borderStyle} ${border}`,
                background,
                color,
                fontSize,
                fontWeight,
                fontFamily,
                letterSpacing,
                textTransform,
                fontStyle,
                justifyContent,
              }}
              onClick={() => {
                if (node.action && node.action.type !== "none") {
                  applyAction(runtime, node.action, node);
                  return;
                }
                if (href) runtime?.onAction?.({ type: "link", url: href }, node);
              }}
              role={interactive ? "button" : undefined}
            >
              {label}
            </div>
          );
        }

        // ---- Forms ----
        if (node.type === "input" || node.type === "textarea") {
          const placeholder = s(node.props.placeholder, "입력");
          const fill = resolveFill(node.props, "#FFFFFF").value;
          const stroke = pickStroke(node.props, "#E5E5E5");
          const strokeWidth = pickStrokeWidth(node.props, 1);
          const borderStyle = pickBorderStyle(node.props, "solid");
          const radius = n(node.props.radius, 12);
          const fontSize = pickFontSize(node.props, 13);
          const fontFamily = pickFontFamily(node.props);
          const letterSpacing = pickLetterSpacing(node.props);
          const textTransform = pickTextTransform(node.props);
          const fontStyle = pickFontStyle(node.props);
          const textColor = s(node.props.color, "#111111");
          const textAlign = s(node.props.textAlign, "left") as React.CSSProperties["textAlign"];

          const bindKey = node.bind?.key;
          const value = bindKey && runtime?.state ? String(runtime.state[bindKey] ?? "") : "";

          const commonStyle: React.CSSProperties = {
            ...nodeStyle(node),
            ...applyEffects(node.props),
            pointerEvents: interactive && !locked ? "auto" : "none",
            background: fill,
            border: `${strokeWidth}px ${borderStyle} ${stroke}`,
            borderRadius: radius,
            padding: 10,
            fontSize,
            color: textColor,
            fontFamily,
            letterSpacing,
            textTransform,
            fontStyle,
            textAlign,
            outline: "none",
          };

          const onChange = (nextValue: string) => {
            if (!interactive || locked) return;
            if (!bindKey || !runtime?.setState) return;
            runtime.setState({ [bindKey]: nextValue });
          };

          if (node.type === "textarea") {
            return (
              <textarea
                key={node.id}
                style={commonStyle}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
            );
          }

          return (
            <input
              key={node.id}
              style={commonStyle}
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          );
        }

        if (node.type === "checkbox") {
          const label = s(node.props.label, "동의");
          const color = s(node.props.color, "#111111");
          const fontSize = pickFontSize(node.props, 13);
          const fontWeight = pickFontWeight(node.props, 500);
          const fontFamily = pickFontFamily(node.props);
          const letterSpacing = pickLetterSpacing(node.props);
          const textTransform = pickTextTransform(node.props);
          const fontStyle = pickFontStyle(node.props);
          const bindKey = node.bind?.key;
          const checked = bindKey && runtime?.state ? !!runtime.state[bindKey] : false;

          const onToggle = (v: boolean) => {
            if (!interactive || locked) return;
            if (!bindKey || !runtime?.setState) return;
            runtime.setState({ [bindKey]: v });
          };

          return (
            <label
              key={node.id}
              className="absolute flex items-center gap-2 text-sm"
              style={{
                ...nodeStyle(node),
                ...applyEffects(node.props),
                pointerEvents: interactive && !locked ? "auto" : "none",
                color,
                fontSize,
                fontWeight,
                fontFamily,
                letterSpacing,
                textTransform,
                fontStyle,
              }}
            >
              <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
              <span>{label}</span>
            </label>
          );
        }

        if (node.type === "select") {
          const options = safeArrayOfStrings(node.props.options);
          const fill = resolveFill(node.props, "#FFFFFF").value;
          const stroke = pickStroke(node.props, "#E5E5E5");
          const strokeWidth = pickStrokeWidth(node.props, 1);
          const borderStyle = pickBorderStyle(node.props, "solid");
          const radius = n(node.props.radius, 12);
          const fontSize = pickFontSize(node.props, 13);
          const fontFamily = pickFontFamily(node.props);
          const letterSpacing = pickLetterSpacing(node.props);
          const textTransform = pickTextTransform(node.props);
          const fontStyle = pickFontStyle(node.props);
          const textColor = s(node.props.color, "#111111");
          const textAlign = s(node.props.textAlign, "left") as React.CSSProperties["textAlign"];
          const bindKey = node.bind?.key;
          const value = bindKey && runtime?.state ? String(runtime.state[bindKey] ?? "") : "";

          const onChange = (nextValue: string) => {
            if (!interactive || locked) return;
            if (!bindKey || !runtime?.setState) return;
            runtime.setState({ [bindKey]: nextValue });
          };

          return (
            <select
              key={node.id}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="absolute text-sm"
              style={{
                ...nodeStyle(node),
                ...applyEffects(node.props),
                pointerEvents: interactive && !locked ? "auto" : "none",
                background: fill,
                border: `${strokeWidth}px ${borderStyle} ${stroke}`,
                borderRadius: radius,
                padding: "0 10px",
                fontSize,
                color: textColor,
                fontFamily,
                letterSpacing,
                textTransform,
                fontStyle,
                textAlign,
              }}
            >
              <option value="">선택</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          );
        }

        if (node.type === "slider") {
          const min = n(node.props.min, 0);
          const max = n(node.props.max, 100);
          const step = n(node.props.step, 1);
          const bindKey = node.bind?.key;
          const value = bindKey && runtime?.state ? Number(runtime.state[bindKey] ?? min) : min;

          const onChange = (nextValue: number) => {
            if (!interactive || locked) return;
            if (!bindKey || !runtime?.setState) return;
            runtime.setState({ [bindKey]: nextValue });
          };

          return (
            <input
              key={node.id}
              type="range"
              min={min}
              max={max}
              step={step}
              value={Number.isFinite(value) ? value : min}
              onChange={(e) => onChange(Number(e.target.value))}
              className="absolute"
              style={{ ...nodeStyle(node), ...applyEffects(node.props), pointerEvents: interactive && !locked ? "auto" : "none" }}
            />
          );
        }

        return null;
      })}
    </div>
  );
}
