import type { TextRange, TextStyle } from "../doc/scene";
import { applyTextCaseTransform } from "./textLayout";

export type ResolvedTextRun = {
  text: string;
  style: TextStyle;
  fill?: string;
};

export type ResolvedRichTextParagraph = {
  runs: ResolvedTextRun[];
};

function clampIndex(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.floor(value)));
}

function mergeTextStyle(base: TextStyle, patch: Partial<TextStyle> | undefined): TextStyle {
  return patch ? { ...base, ...patch } : { ...base };
}

function styleKey(style: TextStyle, fill?: string) {
  return JSON.stringify({ style, fill: fill ?? null });
}

export function hasRichTextRanges(ranges: TextRange[] | undefined): boolean {
  return Boolean(ranges?.some((range) => range.end > range.start));
}

export function normalizeTextRanges(value: string, ranges: TextRange[] | undefined): TextRange[] | undefined {
  if (!ranges?.length) return undefined;
  const length = value.length;
  const normalized = ranges
    .map((range) => ({
      start: clampIndex(range.start, length),
      end: clampIndex(range.end, length),
      style: range.style ? { ...range.style } : undefined,
      fill: range.fill,
      fillRef: range.fillRef,
      styleBindings: range.styleBindings ? { ...range.styleBindings } : undefined,
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => (a.start === b.start ? a.end - b.end : a.start - b.start));
  return normalized.length ? normalized : undefined;
}

export function resolveRichTextRuns(value: string, baseStyle: TextStyle, ranges: TextRange[] | undefined): ResolvedTextRun[] {
  const normalizedRanges = normalizeTextRanges(value, ranges);
  if (!normalizedRanges?.length) {
    return [{ text: applyTextCaseTransform(value, baseStyle), style: { ...baseStyle } }];
  }

  const boundaries = new Set<number>([0, value.length]);
  normalizedRanges.forEach((range) => {
    boundaries.add(range.start);
    boundaries.add(range.end);
  });
  const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);
  const runs: ResolvedTextRun[] = [];

  for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
    const start = sortedBoundaries[index]!;
    const end = sortedBoundaries[index + 1]!;
    if (end <= start) continue;
    const segment = value.slice(start, end);
    const active = normalizedRanges.filter((range) => range.start <= start && range.end >= end);
    const style = active.reduce((acc, range) => mergeTextStyle(acc, range.style), { ...baseStyle });
    const fill = active.reduce<string | undefined>((acc, range) => range.fill ?? acc, undefined);
    const text = applyTextCaseTransform(segment, style);
    if (!text) continue;
    const previous = runs[runs.length - 1];
    if (previous && styleKey(previous.style, previous.fill) === styleKey(style, fill)) {
      previous.text += text;
      continue;
    }
    runs.push({ text, style, fill });
  }

  return runs.length ? runs : [{ text: applyTextCaseTransform(value, baseStyle), style: { ...baseStyle } }];
}

export function splitRichTextRunsByParagraph(runs: ResolvedTextRun[]): ResolvedRichTextParagraph[] {
  if (!runs.length) return [{ runs: [] }];
  const paragraphs: ResolvedRichTextParagraph[] = [];
  let current: ResolvedTextRun[] = [];

  const pushCurrent = () => {
    paragraphs.push({ runs: current });
    current = [];
  };

  runs.forEach((run) => {
    const parts = run.text.split("\n");
    parts.forEach((part, index) => {
      if (part) {
        current.push({
          ...run,
          text: part,
        });
      }
      if (index < parts.length - 1) {
        pushCurrent();
      }
    });
  });

  if (current.length || !paragraphs.length) {
    pushCurrent();
  }

  return paragraphs;
}
