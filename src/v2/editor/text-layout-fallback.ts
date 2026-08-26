import type {
  SceneNode,
  TextCaretGeometry,
  TextGraphemeBox,
  TextLayout,
  TextLayoutLine,
  TextNodeData,
  TextStylePatch,
} from "@/v2/editor/contracts";

type MeasuredStyle = Pick<
  TextNodeData,
  "fontFamily" | "fontSize" | "fontWeight" | "lineHeight" | "letterSpacing" | "italic" | "textCase"
>;

type Cluster = {
  start: number;
  end: number;
  text: string;
  width: number;
  height: number;
  fontSize: number;
  whitespace: boolean;
  breakAfter: boolean;
};

function baseMeasuredStyle(text: TextNodeData): MeasuredStyle {
  return {
    fontFamily: text.fontFamily,
    fontSize: text.fontSize,
    fontWeight: text.fontWeight,
    lineHeight: text.lineHeight,
    letterSpacing: text.letterSpacing,
    italic: text.italic,
    textCase: text.textCase,
  };
}

function applyMeasuredPatch(style: MeasuredStyle, patch: TextStylePatch | undefined) {
  if (!patch) {
    return style;
  }
  return {
    ...style,
    ...(patch.fontFamily !== undefined ? { fontFamily: patch.fontFamily } : {}),
    ...(patch.fontSize !== undefined ? { fontSize: Math.max(patch.fontSize, 1) } : {}),
    ...(patch.fontWeight !== undefined ? { fontWeight: patch.fontWeight } : {}),
    ...(patch.lineHeight !== undefined ? { lineHeight: Math.max(patch.lineHeight, 1) } : {}),
    ...(patch.letterSpacing !== undefined ? { letterSpacing: patch.letterSpacing } : {}),
    ...(patch.italic !== undefined ? { italic: patch.italic } : {}),
    ...(patch.textCase !== undefined ? { textCase: patch.textCase } : {}),
  };
}

function styleAt(text: TextNodeData, offset: number) {
  return (text.ranges ?? [])
    .filter((range) => range.start <= offset && offset < range.end)
    .reduce((style, range) => applyMeasuredPatch(style, range.style), baseMeasuredStyle(text));
}

function segmentGraphemes(content: string) {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(content), (entry) => ({
      text: entry.segment,
      start: entry.index,
      end: entry.index + entry.segment.length,
    }));
  }

  let offset = 0;
  return Array.from(content, (text) => {
    const start = offset;
    offset += text.length;
    return { text, start, end: offset };
  });
}

function transformForMeasurement(value: string, style: MeasuredStyle, wordStart: boolean) {
  switch (style.textCase) {
    case "upper":
      return value.toUpperCase();
    case "lower":
      return value.toLowerCase();
    case "capitalize":
      return wordStart ? value.toUpperCase() : value;
    default:
      return value;
  }
}

function isWideGrapheme(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      codePoint >= 0x1100 ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7af) ||
      (codePoint >= 0x1f000 && codePoint <= 0x1faff)
    );
  });
}

function measureGrapheme(value: string, style: MeasuredStyle) {
  let base: number;
  if (value === "\t") {
    base = style.fontSize * 1.32;
  } else if (/^\s+$/u.test(value)) {
    base = style.fontSize * 0.33;
  } else if (isWideGrapheme(value)) {
    base = style.fontSize;
  } else if (/^[ilI.,'`:;!|]+$/u.test(value)) {
    base = style.fontSize * 0.32;
  } else if (/^[MW@#%&]+$/u.test(value)) {
    base = style.fontSize * 0.78;
  } else {
    base = style.fontSize * 0.56;
  }
  const weightFactor =
    1 + Math.max(-0.6, Math.min(1.2, (style.fontWeight - 400) / 500)) * 0.025;
  const italicFactor = style.italic ? 1.01 : 1;
  return Math.max(base * weightFactor * italicFactor + style.letterSpacing, 0);
}

function buildClusters(text: TextNodeData) {
  let wordStart = true;
  return segmentGraphemes(text.content).map((segment): Cluster => {
    const style = styleAt(text, segment.start);
    const measured = transformForMeasurement(segment.text, style, wordStart);
    const whitespace = segment.text !== "\n" && /^\s+$/u.test(segment.text);
    const breakAfter =
      whitespace || /[-/.,;:!?)]$/u.test(segment.text) || isWideGrapheme(segment.text);
    wordStart = whitespace || /^[^\p{L}\p{N}]+$/u.test(segment.text);
    return {
      ...segment,
      width: measureGrapheme(measured, style),
      height: Math.max(style.lineHeight, 1),
      fontSize: Math.max(style.fontSize, 1),
      whitespace,
      breakAfter,
    };
  });
}

function wrapParagraph(clusters: Cluster[], width: number) {
  if (!clusters.length) {
    return [{ clusters: [] as Cluster[], softWrapped: false }];
  }

  const lines: Array<{ clusters: Cluster[]; softWrapped: boolean }> = [];
  let start = 0;
  while (start < clusters.length) {
    let currentWidth = 0;
    let lastBreak: number | null = null;
    let index = start;
    let wrapped = false;
    while (index < clusters.length) {
      const nextWidth = currentWidth + clusters[index]!.width;
      if (index > start && nextWidth > width) {
        const end = lastBreak !== null && lastBreak > start ? lastBreak : index;
        lines.push({ clusters: clusters.slice(start, end), softWrapped: true });
        start = end;
        wrapped = true;
        break;
      }
      currentWidth = nextWidth;
      if (clusters[index]!.breakAfter) {
        lastBreak = index + 1;
      }
      index += 1;
    }
    if (!wrapped) {
      lines.push({ clusters: clusters.slice(start), softWrapped: false });
      break;
    }
  }
  return lines;
}

export function buildFallbackTextLayout(node: SceneNode): TextLayout | null {
  if (node.kind !== "text" || !node.text) {
    return null;
  }

  const text = node.text;
  const width = Math.max(node.frame.w, 1);
  const allClusters = buildClusters(text);
  const paragraphs: Cluster[][] = [[]];
  allClusters.forEach((cluster) => {
    if (cluster.text === "\n") {
      paragraphs.push([]);
    } else {
      paragraphs[paragraphs.length - 1]!.push(cluster);
    }
  });

  const lines: TextLayoutLine[] = [];
  const graphemes: TextGraphemeBox[] = [];
  const carets: TextCaretGeometry[] = [];
  let y = 0;
  let emptyParagraphOffset = 0;

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const slices = wrapParagraph(paragraph, width);
    slices.forEach((slice, sliceIndex) => {
      const lineIndex = lines.length;
      const lineHeight = Math.max(
        1,
        ...slice.clusters.map((cluster) => cluster.height),
        slice.clusters.length ? 0 : text.lineHeight,
      );
      const maxFontSize = Math.max(
        1,
        ...slice.clusters.map((cluster) => cluster.fontSize),
        slice.clusters.length ? 0 : text.fontSize,
      );
      const naturalWidth = slice.clusters.reduce((total, cluster) => total + cluster.width, 0);
      const isLastParagraphLine = sliceIndex === slices.length - 1;
      const justify = text.align === "justify" && slice.softWrapped && !isLastParagraphLine;
      const whitespaceCount = slice.clusters.filter((cluster) => cluster.whitespace).length;
      const justifyExtra =
        justify && whitespaceCount ? Math.max((width - naturalWidth) / whitespaceCount, 0) : 0;
      const renderedWidth = justifyExtra ? width : naturalWidth;
      const x =
        text.align === "center"
          ? Math.max((width - renderedWidth) / 2, 0)
          : text.align === "right"
            ? Math.max(width - renderedWidth, 0)
            : 0;
      const start = slice.clusters[0]?.start ?? emptyParagraphOffset;
      const end = slice.clusters.at(-1)?.end ?? start;
      const hardBreak = paragraphIndex < paragraphs.length - 1 && isLastParagraphLine;

      carets.push({ offset: start, lineIndex, x, y, height: lineHeight, affinity: "downstream" });
      let cursorX = x;
      slice.clusters.forEach((cluster) => {
        const clusterWidth = cluster.width + (cluster.whitespace ? justifyExtra : 0);
        graphemes.push({
          start: cluster.start,
          end: cluster.end,
          lineIndex,
          x: cursorX,
          y,
          width: clusterWidth,
          height: lineHeight,
        });
        cursorX += clusterWidth;
        carets.push({
          offset: cluster.end,
          lineIndex,
          x: cursorX,
          y,
          height: lineHeight,
          affinity: slice.softWrapped && cluster.end === end ? "upstream" : "downstream",
        });
      });

      lines.push({
        index: lineIndex,
        paragraphIndex,
        start,
        end,
        x,
        y,
        width: renderedWidth,
        height: lineHeight,
        baseline: y + Math.max((lineHeight - maxFontSize) / 2, 0) + maxFontSize * 0.8,
        hardBreak,
        softWrapped: slice.softWrapped,
      });
      y += lineHeight;
    });
    emptyParagraphOffset = (paragraph.at(-1)?.end ?? emptyParagraphOffset) + 1;
    if (paragraphIndex < paragraphs.length - 1) {
      y += Math.max(text.paragraphSpacing, 0);
    }
  });

  return {
    engineVersion: 1,
    measurementMode: "deterministic_fallback",
    width,
    height: Math.max(y, text.lineHeight, 1),
    lines,
    graphemes,
    carets,
    fontFallbacks: Array.from(
      new Set([
        text.fontFamily,
        ...(text.ranges ?? []).flatMap((range) =>
          range.style?.fontFamily ? [range.style.fontFamily] : [],
        ),
      ]),
    ),
  };
}

export function fallbackTextAutoHeight(width: number, text: TextNodeData) {
  return (
    buildFallbackTextLayout({
      id: "fallback-text-measurement",
      kind: "text",
      name: "Fallback measurement",
      parentId: null,
      frame: { x: 0, y: 0, w: width, h: text.lineHeight, rotation: 0 },
      text,
    })?.height ?? Math.max(text.lineHeight, 1)
  );
}
