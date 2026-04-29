import {
  DEFAULT_TEXT_STYLE,
  type NodeText,
  type TextPath,
  type TextRange,
  type TextStyle,
  type TextStyleVariableBindings,
} from "../doc/scene";
import { normalizeTextRanges } from "../geom/richTextModel";
import { clampTextPathStartOffsetValue } from "../geom/textPathLayout";

export const DEFAULT_TEXT_PATH_DATA = "M 12 40 C 72 4 148 4 208 40";
export const TEXT_PATH_PRESETS = {
  arc: "M 12 44 C 76 4 144 4 208 44",
  wave: "M 12 40 C 44 8 76 8 108 40 S 172 72 208 40",
  line: "M 12 40 L 208 40",
} as const;

export const OPEN_TYPE_FEATURE_PRESETS = [
  { tag: "liga", label: "Ligatures" },
  { tag: "kern", label: "Kerning" },
  { tag: "smcp", label: "Small Caps" },
  { tag: "calt", label: "Contextual" },
  { tag: "onum", label: "Oldstyle" },
  { tag: "tnum", label: "Tabular" },
  { tag: "zero", label: "Slashed Zero" },
  { tag: "ss01", label: "Stylistic 01" },
] as const;

export type OpenTypeFeatureTag = (typeof OPEN_TYPE_FEATURE_PRESETS)[number]["tag"];

function cloneTextRange(range: TextRange): TextRange {
  return {
    start: range.start,
    end: range.end,
    style: range.style ? { ...range.style } : undefined,
    fill: range.fill,
    fillRef: range.fillRef,
    styleBindings: range.styleBindings ? { ...range.styleBindings } : undefined,
  };
}

function cloneTextPath(textPath: TextPath | undefined): TextPath | undefined {
  if (!textPath) return undefined;
  return {
    pathData: textPath.pathData,
    startOffset: textPath.startOffset,
    side: textPath.side,
  };
}

function cleanStylePatch(style: Partial<TextStyle> | undefined): Partial<TextStyle> | undefined {
  if (!style) return undefined;
  const next = Object.fromEntries(
    Object.entries(style).filter(([, value]) => value !== undefined),
  ) as Partial<TextStyle>;
  return Object.keys(next).length ? next : undefined;
}

function cleanStyleBindings(bindings: TextStyleVariableBindings | undefined) {
  if (!bindings) return undefined;
  const next = Object.fromEntries(Object.entries(bindings).filter(([, value]) => Boolean(value))) as TextStyleVariableBindings;
  return Object.keys(next).length ? next : undefined;
}

export function parseFontFeatureSettings(value: string | undefined) {
  const source = value?.trim();
  const features = new Map<string, number>();
  if (!source) return features;
  const pattern = /"([A-Za-z0-9]{4})"\s*([+-]?\d+(?:\.\d+)?)?/g;
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(source))) {
    const tag = match[1]?.trim();
    if (!tag) continue;
    const rawValue = match[2];
    features.set(tag, rawValue == null ? 1 : Number(rawValue));
  }
  return features;
}

export function stringifyFontFeatureSettings(features: Map<string, number>) {
  return Array.from(features.entries())
    .filter(([, value]) => Number.isFinite(value) && value !== 0)
    .map(([tag, value]) => `"${tag}" ${value}`)
    .join(", ") || undefined;
}

export function hasTextStyleOpenTypeFeature(style: Partial<TextStyle> | null | undefined, tag: string) {
  const features = parseFontFeatureSettings(style?.fontFeatureSettings);
  return (features.get(tag) ?? 0) !== 0;
}

export function toggleNodeTextOpenTypeFeature(
  text: NodeText | undefined,
  tag: string,
  enabled?: boolean,
): NodeText {
  const base = ensureNodeText(text);
  const features = parseFontFeatureSettings(base.style.fontFeatureSettings);
  const nextEnabled = enabled ?? !hasTextStyleOpenTypeFeature(base.style, tag);
  if (nextEnabled) {
    features.set(tag, 1);
  } else {
    features.delete(tag);
  }
  return {
    ...base,
    style: {
      ...base.style,
      fontFeatureSettings: stringifyFontFeatureSettings(features),
    },
  };
}

function cleanTextPath(textPath: TextPath | undefined): TextPath | undefined {
  if (!textPath) return undefined;
  const pathData = textPath.pathData.trim();
  if (!pathData) return undefined;
  return {
    pathData,
    startOffset: clampTextPathStartOffsetValue(textPath.startOffset),
    side: textPath.side === "right" ? "right" : "left",
  };
}

export function cloneNodeText(text?: NodeText): NodeText | undefined {
  if (!text) return undefined;
  return {
    value: text.value,
    style: { ...text.style },
    styleRef: text.styleRef,
    wrap: text.wrap,
    autoSize: text.autoSize,
    ranges: text.ranges?.map(cloneTextRange),
    textPath: cloneTextPath(text.textPath),
    valueRef: text.valueRef,
    styleBindings: text.styleBindings ? { ...text.styleBindings } : undefined,
  };
}

export function ensureNodeText(text?: NodeText): NodeText {
  const base = cloneNodeText(text) ?? {
    value: "",
    style: { ...DEFAULT_TEXT_STYLE },
  };
  return {
    ...base,
    style: { ...base.style },
    ranges: normalizeTextRanges(base.value, base.ranges),
    textPath: cleanTextPath(base.textPath),
  };
}

export function setNodeTextValue(text: NodeText | undefined, value: string): NodeText {
  const base = ensureNodeText(text);
  return {
    ...base,
    value,
    ranges: normalizeTextRanges(value, base.ranges),
  };
}

export function setNodeTextValueRef(text: NodeText | undefined, valueRef: string | undefined): NodeText {
  const base = ensureNodeText(text);
  return {
    ...base,
    valueRef: valueRef?.trim() || undefined,
  };
}

export function setNodeTextStyleBinding(
  text: NodeText | undefined,
  key: keyof TextStyleVariableBindings,
  variableId: string | undefined,
): NodeText {
  const base = ensureNodeText(text);
  return {
    ...base,
    styleBindings: cleanStyleBindings({
      ...(base.styleBindings ?? {}),
      [key]: variableId?.trim() || undefined,
    }),
  };
}

export function addTextRange(text: NodeText | undefined): NodeText {
  const base = ensureNodeText(text);
  const length = base.value.length;
  if (length <= 0) return base;
  const existing = base.ranges ?? [];
  const lastRange = existing[existing.length - 1];
  const start = lastRange ? Math.min(Math.max(0, lastRange.end), Math.max(0, length - 1)) : 0;
  const end = Math.min(length, Math.max(start + 1, length));
  const nextRanges = normalizeTextRanges(base.value, [
    ...existing.map(cloneTextRange),
    { start, end, style: { fontWeight: 700 } },
  ]);
  return {
    ...base,
    ranges: nextRanges,
  };
}

export function duplicateTextRange(text: NodeText | undefined, index: number): NodeText {
  const base = ensureNodeText(text);
  const source = base.ranges?.[index];
  if (!source) return base;
  const nextRanges = [...(base.ranges ?? []).map(cloneTextRange)];
  nextRanges.splice(index + 1, 0, cloneTextRange(source));
  return {
    ...base,
    ranges: normalizeTextRanges(base.value, nextRanges),
  };
}

export function removeTextRange(text: NodeText | undefined, index: number): NodeText {
  const base = ensureNodeText(text);
  if (!base.ranges?.length) return base;
  const nextRanges = base.ranges.filter((_, rangeIndex) => rangeIndex !== index).map(cloneTextRange);
  return {
    ...base,
    ranges: nextRanges.length ? nextRanges : undefined,
  };
}

export function patchTextRange(
  text: NodeText | undefined,
  index: number,
  patch: Partial<TextRange>,
): NodeText {
  const base = ensureNodeText(text);
  if (!base.ranges?.[index]) return base;
  const nextRanges = base.ranges.map((range, rangeIndex) =>
    rangeIndex === index
      ? {
          start: patch.start ?? range.start,
          end: patch.end ?? range.end,
          style: cleanStylePatch(patch.style ?? range.style),
          fill: patch.fill === "" ? undefined : (patch.fill ?? range.fill),
          fillRef: patch.fillRef === "" ? undefined : (patch.fillRef ?? range.fillRef),
          styleBindings: cleanStyleBindings(patch.styleBindings ?? range.styleBindings),
        }
      : cloneTextRange(range),
  );
  return {
    ...base,
    ranges: normalizeTextRanges(base.value, nextRanges),
  };
}

export function patchTextRangeStyle(
  text: NodeText | undefined,
  index: number,
  patch: Partial<TextStyle>,
): NodeText {
  const base = ensureNodeText(text);
  const range = base.ranges?.[index];
  if (!range) return base;
  return patchTextRange(base, index, {
    style: cleanStylePatch({
      ...(range.style ?? {}),
      ...patch,
    }),
  });
}

export function setTextRangeFill(
  text: NodeText | undefined,
  index: number,
  fill: string | undefined,
): NodeText {
  const base = ensureNodeText(text);
  return patchTextRange(base, index, {
    fill: fill?.trim() ? fill : undefined,
  });
}

export function setTextRangeFillRef(
  text: NodeText | undefined,
  index: number,
  variableId: string | undefined,
): NodeText {
  const base = ensureNodeText(text);
  return patchTextRange(base, index, {
    fillRef: variableId?.trim() || undefined,
  });
}

export function setTextRangeStyleBinding(
  text: NodeText | undefined,
  index: number,
  key: keyof TextStyleVariableBindings,
  variableId: string | undefined,
): NodeText {
  const base = ensureNodeText(text);
  const range = base.ranges?.[index];
  if (!range) return base;
  return patchTextRange(base, index, {
    styleBindings: cleanStyleBindings({
      ...(range.styleBindings ?? {}),
      [key]: variableId?.trim() || undefined,
    }),
  });
}

export function clearTextRangeStyling(
  text: NodeText | undefined,
  index: number,
): NodeText {
  const base = ensureNodeText(text);
  if (!base.ranges?.[index]) return base;
  const nextRanges = base.ranges.map((range, rangeIndex) =>
    rangeIndex === index
      ? {
          start: range.start,
          end: range.end,
          style: undefined,
          fill: undefined,
          fillRef: undefined,
          styleBindings: undefined,
        }
      : cloneTextRange(range),
  );
  return {
    ...base,
    ranges: normalizeTextRanges(base.value, nextRanges),
  };
}

export function clearTextRanges(text: NodeText | undefined): NodeText {
  const base = ensureNodeText(text);
  return {
    ...base,
    ranges: undefined,
  };
}

export function buildWordTextRanges(text: NodeText | undefined): NodeText {
  const base = ensureNodeText(text);
  const matches = Array.from(base.value.matchAll(/\S+/gu));
  if (!matches.length) return base;
  return {
    ...base,
    ranges: normalizeTextRanges(
      base.value,
      matches.map((match, index) => ({
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        style: {
          fontWeight: index % 2 === 0 ? 700 : 600,
        },
      })),
    ),
  };
}

export function buildParagraphTextRanges(text: NodeText | undefined): NodeText {
  const base = ensureNodeText(text);
  if (!base.value.length) return base;
  const segments = base.value.split("\n");
  const ranges: TextRange[] = [];
  let cursor = 0;
  segments.forEach((segment, index) => {
    const start = cursor;
    const end = cursor + segment.length;
    if (end > start) {
      ranges.push({
        start,
        end,
        style: {
          fontWeight: index === 0 ? 700 : 500,
          italic: index % 2 === 1 || undefined,
        },
      });
    }
    cursor = end + 1;
  });
  return {
    ...base,
    ranges: normalizeTextRanges(base.value, ranges),
  };
}

export function getTextRangePreview(text: NodeText | undefined, index: number, maxLength = 24) {
  const base = ensureNodeText(text);
  const range = base.ranges?.[index];
  if (!range) return "";
  const preview = base.value.slice(range.start, range.end).replace(/\s+/g, " ").trim();
  if (preview.length <= maxLength) return preview;
  return `${preview.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function setTextPath(
  text: NodeText | undefined,
  patch: Partial<TextPath>,
): NodeText {
  const base = ensureNodeText(text);
  const nextTextPath = cleanTextPath({
    pathData: patch.pathData ?? base.textPath?.pathData ?? DEFAULT_TEXT_PATH_DATA,
    startOffset: patch.startOffset ?? base.textPath?.startOffset,
    side: patch.side ?? base.textPath?.side,
  });
  return {
    ...base,
    textPath: nextTextPath,
  };
}

export function nudgeTextPathOffset(text: NodeText | undefined, delta: number): NodeText {
  const base = ensureNodeText(text);
  return setTextPath(base, {
    startOffset: (base.textPath?.startOffset ?? 0) + delta,
  });
}

export function flipTextPathSide(text: NodeText | undefined): NodeText {
  const base = ensureNodeText(text);
  return setTextPath(base, {
    side: base.textPath?.side === "right" ? "left" : "right",
  });
}

export function clearTextPath(text: NodeText | undefined): NodeText {
  const base = ensureNodeText(text);
  return {
    ...base,
    textPath: undefined,
  };
}

export function resolveTextMeasurementStyle(
  text: NodeText | undefined,
  baseStyle: TextStyle,
): TextStyle {
  const ranges = normalizeTextRanges(text?.value ?? "", text?.ranges);
  if (!ranges?.length) return { ...baseStyle };

  let nextStyle = { ...baseStyle };
  ranges.forEach((range) => {
    const patch = range.style;
    if (!patch) return;
    nextStyle = {
      ...nextStyle,
      fontSize: Math.max(nextStyle.fontSize, patch.fontSize ?? nextStyle.fontSize),
      lineHeight: Math.max(nextStyle.lineHeight, patch.lineHeight ?? nextStyle.lineHeight),
      letterSpacing: Math.max(nextStyle.letterSpacing, patch.letterSpacing ?? nextStyle.letterSpacing),
      paragraphSpacing: Math.max(nextStyle.paragraphSpacing ?? 0, patch.paragraphSpacing ?? nextStyle.paragraphSpacing ?? 0),
      fontWeight: Math.max(nextStyle.fontWeight, patch.fontWeight ?? nextStyle.fontWeight),
      italic: Boolean(nextStyle.italic || patch.italic),
      underline: Boolean(nextStyle.underline || patch.underline),
      lineThrough: Boolean(nextStyle.lineThrough || patch.lineThrough),
    };
  });
  return nextStyle;
}
