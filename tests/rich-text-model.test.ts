import { describe, expect, it } from "vitest";

import { DEFAULT_TEXT_STYLE } from "../src/advanced/doc/scene";
import { resolveRichTextRuns, splitRichTextRunsByParagraph } from "../src/advanced/geom/richTextModel";
import { normalizeTextPathStartOffset, normalizeTextPathText } from "../src/advanced/geom/textPathLayout";

describe("richTextModel", () => {
  it("splits text into styled runs and preserves fill overrides", () => {
    const runs = resolveRichTextRuns(
      "Hello World",
      { ...DEFAULT_TEXT_STYLE, fontFamily: "Inter", fontSize: 16 },
      [
        { start: 0, end: 5, style: { fontWeight: 700 } },
        { start: 6, end: 11, fill: "#ff0000", style: { italic: true } },
      ],
    );

    expect(runs).toEqual([
      expect.objectContaining({ text: "Hello", style: expect.objectContaining({ fontWeight: 700 }) }),
      expect.objectContaining({ text: " ", style: expect.objectContaining({ fontWeight: 500 }) }),
      expect.objectContaining({ text: "World", fill: "#ff0000", style: expect.objectContaining({ italic: true }) }),
    ]);
  });

  it("normalizes text-path text and offsets", () => {
    expect(normalizeTextPathText("Hello\n  World")).toBe("Hello World");
    expect(normalizeTextPathStartOffset(140)).toBe("100%");
    expect(normalizeTextPathStartOffset(-5)).toBe("0%");
  });

  it("splits rich text runs into paragraph groups", () => {
    const paragraphs = splitRichTextRunsByParagraph([
      { text: "Hello\n", style: { ...DEFAULT_TEXT_STYLE } },
      { text: "World", style: { ...DEFAULT_TEXT_STYLE, fontWeight: 700 } },
    ]);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.runs.map((run) => run.text)).toEqual(["Hello"]);
    expect(paragraphs[1]?.runs.map((run) => run.text)).toEqual(["World"]);
  });
});
