import type { TextNodeData, TextRange, TextStylePatch } from "@/v2/editor/contracts";

export type ResolvedTextStyle = Omit<TextNodeData, "content" | "sizing" | "ranges">;

export type ResolvedTextRun = {
  text: string;
  style: ResolvedTextStyle;
};

export type ResolvedTextParagraph = {
  runs: ResolvedTextRun[];
};

function clampIndex(value: number, max: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(max, Math.floor(value)));
}

function toBaseStyle(text: TextNodeData): ResolvedTextStyle {
  const { content: _content, sizing: _sizing, ranges: _ranges, ...style } = text;
  return style;
}

function mergeTextStyle(base: ResolvedTextStyle, patch: TextStylePatch | undefined): ResolvedTextStyle {
  if (!patch) {
    return { ...base };
  }
  return {
    ...base,
    ...(patch.fontFamily !== undefined ? { fontFamily: patch.fontFamily } : {}),
    ...(patch.fontSize !== undefined ? { fontSize: Math.max(patch.fontSize, 1) } : {}),
    ...(patch.fontWeight !== undefined ? { fontWeight: patch.fontWeight } : {}),
    ...(patch.lineHeight !== undefined ? { lineHeight: Math.max(patch.lineHeight, 1) } : {}),
    ...(patch.letterSpacing !== undefined ? { letterSpacing: patch.letterSpacing } : {}),
    ...(patch.paragraphSpacing !== undefined
      ? { paragraphSpacing: Math.max(patch.paragraphSpacing, 0) }
      : {}),
    ...(patch.align !== undefined ? { align: patch.align } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {}),
  };
}

function styleKey(style: ResolvedTextStyle) {
  return JSON.stringify(style);
}

export function normalizeTextRanges(
  content: string,
  ranges: TextRange[] | undefined,
): TextRange[] | undefined {
  if (!ranges?.length) {
    return undefined;
  }

  const length = content.length;
  const normalized = ranges
    .map((range) => ({
      start: clampIndex(range.start, length),
      end: clampIndex(range.end, length),
      ...(range.style ? { style: { ...range.style } } : {}),
    }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => (left.start === right.start ? left.end - right.end : left.start - right.start));

  return normalized.length ? normalized : undefined;
}

export function resolveRichTextRuns(text: TextNodeData): ResolvedTextRun[] {
  const ranges = normalizeTextRanges(text.content, text.ranges);
  const baseStyle = toBaseStyle(text);

  if (!ranges?.length) {
    return [{ text: text.content, style: baseStyle }];
  }

  const boundaries = new Set<number>([0, text.content.length]);
  ranges.forEach((range) => {
    boundaries.add(range.start);
    boundaries.add(range.end);
  });

  const sortedBoundaries = Array.from(boundaries).sort((left, right) => left - right);
  const runs: ResolvedTextRun[] = [];

  for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
    const start = sortedBoundaries[index]!;
    const end = sortedBoundaries[index + 1]!;
    if (end <= start) {
      continue;
    }

    const segment = text.content.slice(start, end);
    const style = ranges
      .filter((range) => range.start <= start && range.end >= end)
      .reduce((current, range) => mergeTextStyle(current, range.style), { ...baseStyle });

    const previous = runs[runs.length - 1];
    if (previous && styleKey(previous.style) === styleKey(style)) {
      previous.text += segment;
      continue;
    }

    runs.push({
      text: segment,
      style,
    });
  }

  return runs.length ? runs : [{ text: text.content, style: baseStyle }];
}

export function splitRichTextRunsByParagraph(runs: ResolvedTextRun[]): ResolvedTextParagraph[] {
  if (!runs.length) {
    return [{ runs: [] }];
  }

  const paragraphs: ResolvedTextParagraph[] = [];
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
