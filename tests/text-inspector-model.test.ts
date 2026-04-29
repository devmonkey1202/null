import { describe, expect, it } from "vitest";

import { DEFAULT_TEXT_STYLE } from "../src/advanced/doc/scene";
import {
  DEFAULT_TEXT_PATH_DATA,
  addTextRange,
  buildParagraphTextRanges,
  buildWordTextRanges,
  clearTextPath,
  clearTextRangeStyling,
  clearTextRanges,
  duplicateTextRange,
  ensureNodeText,
  flipTextPathSide,
  getTextRangePreview,
  hasTextStyleOpenTypeFeature,
  nudgeTextPathOffset,
  patchTextRange,
  patchTextRangeStyle,
  parseFontFeatureSettings,
  removeTextRange,
  resolveTextMeasurementStyle,
  setNodeTextValue,
  stringifyFontFeatureSettings,
  setTextPath,
  setTextRangeFill,
  toggleNodeTextOpenTypeFeature,
} from "../src/advanced/ui/textInspectorModel";

describe("textInspectorModel", () => {
  it("keeps rich text ranges normalized when text value shrinks", () => {
    const next = setNodeTextValue(
      {
        value: "Hello World",
        style: { ...DEFAULT_TEXT_STYLE },
        ranges: [{ start: 6, end: 11, style: { fontWeight: 700 } }],
      },
      "Hello",
    );

    expect(next.value).toBe("Hello");
    expect(next.ranges).toBeUndefined();
  });

  it("adds, patches, fills, and removes text ranges", () => {
    const added = addTextRange({
      value: "Hello World",
      style: { ...DEFAULT_TEXT_STYLE },
    });
    expect(added.ranges).toHaveLength(1);

    const patched = patchTextRange(added, 0, { start: 1, end: 5 });
    expect(patched.ranges?.[0]).toEqual(
      expect.objectContaining({
        start: 1,
        end: 5,
      }),
    );

    const styled = patchTextRangeStyle(patched, 0, { italic: true, fontSize: 24 });
    expect(styled.ranges?.[0]?.style).toEqual(
      expect.objectContaining({
        italic: true,
        fontSize: 24,
      }),
    );

    const filled = setTextRangeFill(styled, 0, "#ff0000");
    expect(filled.ranges?.[0]?.fill).toBe("#ff0000");

    const reset = clearTextRangeStyling(filled, 0);
    expect(reset.ranges?.[0]).toEqual(
      expect.objectContaining({
        start: 1,
        end: 5,
        style: undefined,
        fill: undefined,
      }),
    );

    const removed = removeTextRange(reset, 0);
    expect(removed.ranges).toBeUndefined();
  });

  it("clears rich text ranges without touching the base text model", () => {
    const cleared = clearTextRanges({
      value: "Sample",
      style: { ...DEFAULT_TEXT_STYLE },
      ranges: [{ start: 0, end: 6, style: { fontWeight: 700 } }],
    });

    expect(cleared).toEqual({
      value: "Sample",
      style: { ...DEFAULT_TEXT_STYLE },
      ranges: undefined,
    });
  });

  it("creates and clears text path state with clamped offsets", () => {
    const withPath = setTextPath(
      {
        value: "Path text",
        style: { ...DEFAULT_TEXT_STYLE },
      },
      {
        pathData: DEFAULT_TEXT_PATH_DATA,
        startOffset: 180,
        side: "right",
      },
    );
    expect(withPath.textPath).toEqual({
      pathData: DEFAULT_TEXT_PATH_DATA,
      startOffset: 100,
      side: "right",
    });

    const cleared = clearTextPath(withPath);
    expect(cleared.textPath).toBeUndefined();
  });

  it("duplicates ranges and builds quick ranges from words and paragraphs", () => {
    const duplicated = duplicateTextRange(
      {
        value: "Hello brave new world",
        style: { ...DEFAULT_TEXT_STYLE },
        ranges: [{ start: 0, end: 5, style: { fontWeight: 700 } }],
      },
      0,
    );
    expect(duplicated.ranges).toHaveLength(2);
    expect(getTextRangePreview(duplicated, 0)).toBe("Hello");

    const words = buildWordTextRanges({
      value: "Hello brave new world",
      style: { ...DEFAULT_TEXT_STYLE },
    });
    expect(words.ranges?.length).toBe(4);
    expect(getTextRangePreview(words, 1)).toBe("brave");

    const paragraphs = buildParagraphTextRanges({
      value: "First line\nSecond line",
      style: { ...DEFAULT_TEXT_STYLE },
    });
    expect(paragraphs.ranges).toHaveLength(2);
    expect(getTextRangePreview(paragraphs, 1)).toBe("Second line");
  });

  it("nudges and flips text path controls", () => {
    const next = nudgeTextPathOffset(
      {
        value: "Path text",
        style: { ...DEFAULT_TEXT_STYLE },
        textPath: {
          pathData: DEFAULT_TEXT_PATH_DATA,
          startOffset: 20,
          side: "left",
        },
      },
      15,
    );
    expect(next.textPath?.startOffset).toBe(35);
    expect(flipTextPathSide(next).textPath?.side).toBe("right");
  });

  it("uses the strongest rich text metrics for hug measurement", () => {
    const measurementStyle = resolveTextMeasurementStyle(
      ensureNodeText({
        value: "Hello World",
        style: { ...DEFAULT_TEXT_STYLE, fontSize: 16, lineHeight: 1.2, letterSpacing: 0, fontWeight: 400 },
        ranges: [
          { start: 0, end: 5, style: { fontSize: 28, lineHeight: 1.6 } },
          { start: 6, end: 11, style: { fontWeight: 700, italic: true, letterSpacing: 1.5 } },
        ],
      }),
      { ...DEFAULT_TEXT_STYLE, fontSize: 16, lineHeight: 1.2, letterSpacing: 0, fontWeight: 400 },
    );

    expect(measurementStyle).toEqual(
      expect.objectContaining({
        fontSize: 28,
        lineHeight: 1.6,
        letterSpacing: 1.5,
        fontWeight: 700,
        italic: true,
      }),
    );
  });

  it("parses, stringifies, and toggles OpenType feature settings", () => {
    const parsed = parseFontFeatureSettings('"liga" 1, "ss01" 1, "kern" 0');
    expect(parsed.get("liga")).toBe(1);
    expect(parsed.get("ss01")).toBe(1);
    expect(parsed.get("kern")).toBe(0);

    const stringified = stringifyFontFeatureSettings(parsed);
    expect(stringified).toBe('"liga" 1, "ss01" 1');

    const withFeature = toggleNodeTextOpenTypeFeature(
      {
        value: "Feature",
        style: { ...DEFAULT_TEXT_STYLE },
      },
      "smcp",
      true,
    );
    expect(hasTextStyleOpenTypeFeature(withFeature.style, "smcp")).toBe(true);

    const cleared = toggleNodeTextOpenTypeFeature(withFeature, "smcp", false);
    expect(hasTextStyleOpenTypeFeature(cleared.style, "smcp")).toBe(false);
    expect(cleared.style.fontFeatureSettings).toBeUndefined();
  });
});
