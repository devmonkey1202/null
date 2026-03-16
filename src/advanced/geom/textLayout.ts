import { DEFAULT_TEXT_STYLE, type LayoutSizingAxis, type TextStyle } from "../doc/scene";

let textMeasureCanvas: HTMLCanvasElement | null = null;
const OPEN_PUNCTUATION = new Set(Array.from("([{\"'“‘（［｛〈《「『【"));
const CLOSE_PUNCTUATION = new Set(Array.from(")]}\"'!?.,:;%…、。，．？！：；％）］｝〉》」』】"));
const SEGMENT_DELIMITER_RE = /(?<=[/_\-.])|(?=[/_\-.])/g;
const NEEDS_WORD_SEGMENTATION_RE = /[/_\-.]|[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]|[()[\]{}"'“”‘’!?.,:;%…、。，．？！：；％]/u;

function getTextMeasureContext() {
  if (typeof document === "undefined") return null;
  if (!textMeasureCanvas) textMeasureCanvas = document.createElement("canvas");
  return textMeasureCanvas.getContext("2d");
}

export function normalizeTextInput(text: string) {
  return text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
}

export function applyTextCaseTransform(text: string, style: Partial<TextStyle>) {
  const mode = style.textCase ?? "none";
  if (mode === "upper") return text.toLocaleUpperCase();
  if (mode === "lower") return text.toLocaleLowerCase();
  if (mode === "capitalize") {
    return text.replace(/\b(\p{L})/gu, (match) => match.toLocaleUpperCase());
  }
  return text;
}

function getFontShorthand(style: Partial<TextStyle>, fontSize: number) {
  const fontFamily = style.fontFamily ?? DEFAULT_TEXT_STYLE.fontFamily;
  const fontWeight = style.fontWeight ?? DEFAULT_TEXT_STYLE.fontWeight;
  const fontStyle = style.italic ? "italic " : "";
  return `${fontStyle}${fontWeight} ${fontSize}px ${fontFamily}`;
}

function prepareCanvasTextContext(ctx: CanvasRenderingContext2D, style: Partial<TextStyle>, fontSize: number) {
  ctx.font = getFontShorthand(style, fontSize);
  const ctxWithKerning = ctx as CanvasRenderingContext2D & { fontKerning?: "auto" | "normal" | "none" };
  if ("fontKerning" in ctxWithKerning) {
    ctxWithKerning.fontKerning = "normal";
  }
}

function isOpenPunctuation(char: string) {
  return OPEN_PUNCTUATION.has(char);
}

function isClosePunctuation(char: string) {
  return CLOSE_PUNCTUATION.has(char);
}

function takeTrailingOpenPunctuation(text: string) {
  let index = text.length;
  while (index > 0 && isOpenPunctuation(text[index - 1]!)) {
    index -= 1;
  }
  return index < text.length ? text.slice(index) : "";
}

function segmentWrapToken(token: string) {
  if (!token || /^\s+$/u.test(token)) return [token];
  const delimiterParts = token.split(SEGMENT_DELIMITER_RE).filter(Boolean);
  if (delimiterParts.length > 1) return delimiterParts;
  if (NEEDS_WORD_SEGMENTATION_RE.test(token)) {
    const SegmenterCtor = (Intl as typeof Intl & {
      Segmenter?: new (locales?: string | string[], options?: { granularity?: "word" }) => {
        segment(input: string): Iterable<{ segment: string }>;
      };
    }).Segmenter;
    if (SegmenterCtor) {
      const segmenter = new SegmenterCtor(undefined, { granularity: "word" });
      const segments = Array.from(segmenter.segment(token), (part) => part.segment).filter(Boolean);
      if (segments.length > 1) return segments;
    }
  }
  return [token];
}

function splitOversizedToken(token: string, style: Partial<TextStyle>, maxWidth: number) {
  const chunks: string[] = [];
  let current = "";
  for (const unit of Array.from(token)) {
    const next = current + unit;
    if (!current || measureTextWidth(next, style) <= maxWidth) {
      current = next;
      continue;
    }
    if (isClosePunctuation(unit)) {
      current = next;
      chunks.push(current);
      current = "";
      continue;
    }
    const trailingOpen = takeTrailingOpenPunctuation(current);
    if (trailingOpen && current.length > trailingOpen.length) {
      const head = current.slice(0, -trailingOpen.length);
      if (head) chunks.push(head);
      current = trailingOpen + unit;
      continue;
    }
    chunks.push(current);
    current = unit;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function getTextLineMetrics(style: Partial<TextStyle>) {
  const fontSize = style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize;
  const lineHeightRatio =
    Number.isFinite(style.lineHeight) && (style.lineHeight ?? 0) > 0
      ? (style.lineHeight as number)
      : DEFAULT_TEXT_STYLE.lineHeight;
  const lineHeight = Math.max(fontSize, fontSize * lineHeightRatio);
  const ctx = getTextMeasureContext();
  if (ctx) {
    prepareCanvasTextContext(ctx, style, fontSize);
    const metrics = ctx.measureText(applyTextCaseTransform("Hg", style));
    const ascent = Number.isFinite(metrics.actualBoundingBoxAscent) ? metrics.actualBoundingBoxAscent : 0;
    const descent = Number.isFinite(metrics.actualBoundingBoxDescent) ? metrics.actualBoundingBoxDescent : 0;
    const textHeight = ascent + descent;
    if (textHeight > 0) {
      const leading = Math.max(0, lineHeight - textHeight) / 2;
      return {
        fontSize,
        lineHeightRatio,
        lineHeight,
        leading,
        baselineOffset: leading + ascent,
      };
    }
  }
  const leading = Math.max(0, lineHeight - fontSize) / 2;
  return {
    fontSize,
    lineHeightRatio,
    lineHeight,
    leading,
    baselineOffset: leading + fontSize * 0.8,
  };
}

export function measureTextWidth(text: string, style: Partial<TextStyle>) {
  const normalized = applyTextCaseTransform(normalizeTextInput(text), style);
  if (!normalized) return 0;
  const fontSize = style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize;
  const ctx = getTextMeasureContext();
  if (!ctx) return normalized.length * fontSize * 0.6;
  prepareCanvasTextContext(ctx, style, fontSize);
  const base = ctx.measureText(normalized).width;
  const spacing = style.letterSpacing ?? DEFAULT_TEXT_STYLE.letterSpacing;
  const extra = normalized.length > 1 ? (normalized.length - 1) * spacing : 0;
  return base + extra;
}

export function getParagraphSpacing(style: Partial<TextStyle>) {
  return Math.max(0, style.paragraphSpacing ?? DEFAULT_TEXT_STYLE.paragraphSpacing ?? 0);
}

export function getRenderedTextLines(text: string, style: Partial<TextStyle>, maxWidth?: number, wrap?: boolean) {
  const safeText = normalizeTextInput(text ?? "");
  const wrapped = wrap !== false && Number.isFinite(maxWidth) && (maxWidth ?? 0) > 0;
  const paragraphs = safeText.split("\n");
  const { lineHeight } = getTextLineMetrics(style);
  const paragraphSpacing = getParagraphSpacing(style);
  const lines: string[] = [];
  const lineOffsets: number[] = [];
  let currentOffset = 0;

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const paragraphLines = wrapped ? wrapTextLines(paragraph, style, maxWidth as number) : [paragraph];
    paragraphLines.forEach((line) => {
      lines.push(line);
      lineOffsets.push(currentOffset);
      currentOffset += lineHeight;
    });
    if (paragraphIndex < paragraphs.length - 1) {
      currentOffset += paragraphSpacing;
    }
  });

  if (!lines.length) {
    return { lines: [""], lineOffsets: [0], paragraphSpacing, lineHeight };
  }
  return { lines, lineOffsets, paragraphSpacing, lineHeight };
}

export function wrapTextLines(text: string, style: Partial<TextStyle>, maxWidth: number) {
  const normalizedText = normalizeTextInput(text ?? "");
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return normalizedText.split("\n");
  const lines: string[] = [];
  normalizedText.split("\n").forEach((paragraph) => {
    if (paragraph === "") {
      lines.push("");
      return;
    }
    const tokens = paragraph.match(/\s+|\S+/g) ?? [paragraph];
    let current = "";
    const pushOversizedUnit = (unit: string) => {
      const chunks = splitOversizedToken(unit, style, maxWidth);
      if (!chunks.length) return "";
      if (chunks.length > 1) lines.push(...chunks.slice(0, -1));
      return chunks[chunks.length - 1] ?? "";
    };
    const commitUnit = (unit: string) => {
      const candidate = current + unit;
      if (!current && measureTextWidth(unit, style) <= maxWidth) {
        current = unit;
        return;
      }
      if (current && measureTextWidth(candidate, style) <= maxWidth) {
        current = candidate;
        return;
      }
      if (current && isClosePunctuation(unit)) {
        current = candidate;
        lines.push(current);
        current = "";
        return;
      }
      const trailingOpen = takeTrailingOpenPunctuation(current);
      if (trailingOpen && current.length > trailingOpen.length) {
        lines.push(current.slice(0, -trailingOpen.length));
        current = "";
        commitUnit(trailingOpen + unit);
        return;
      }
      if (current) {
        lines.push(current);
        current = "";
      }
      if (measureTextWidth(unit, style) <= maxWidth) {
        current = unit;
        return;
      }
      current = pushOversizedUnit(unit);
    };

    tokens.forEach((token) => {
      const units = /^\s+$/u.test(token) ? [token] : segmentWrapToken(token);
      units.forEach((unit) => commitUnit(unit));
    });
    lines.push(current);
  });
  return lines.length ? lines : [""];
}

export function measureTextBlock(text: string, style: Partial<TextStyle>, maxWidth?: number, wrap?: boolean) {
  const { lines, lineOffsets, lineHeight } = getRenderedTextLines(text, style, maxWidth, wrap);
  const width = lines.length ? Math.max(...lines.map((line) => measureTextWidth(line, style))) : 0;
  const height = Math.max(1, (lineOffsets[lineOffsets.length - 1] ?? 0) + lineHeight);
  return { width, height, lines, lineOffsets };
}

export function resolveTextContentFrameSize(
  currentFrame: { w: number; h: number },
  text: string,
  style: Partial<TextStyle>,
  options?: {
    wrap?: boolean;
    autoSize?: boolean;
    layoutSizing?: Partial<LayoutSizingAxis>;
    widthPadding?: number;
    heightPadding?: number;
    minWidth?: number;
    minHeight?: number;
  },
) {
  const wrapEnabled = options?.wrap !== false;
  const autoSize = Boolean(options?.autoSize);
  const sizing = options?.layoutSizing;
  const widthPadding = options?.widthPadding ?? 0;
  const heightPadding = options?.heightPadding ?? 0;
  const minWidth = options?.minWidth ?? 1;
  const minHeight = options?.minHeight ?? 1;
  const hugWidth = autoSize || (!wrapEnabled && sizing?.width === "hug");
  const hugHeight = autoSize || sizing?.height === "hug";
  const maxWidth = wrapEnabled && !hugWidth ? currentFrame.w : undefined;
  const measured = measureTextBlock(text, style, maxWidth, wrapEnabled);
  return {
    measured,
    frame: {
      w: hugWidth ? Math.max(minWidth, Math.round(measured.width + widthPadding)) : currentFrame.w,
      h: hugHeight ? Math.max(minHeight, Math.round(measured.height + heightPadding)) : currentFrame.h,
    },
  };
}
