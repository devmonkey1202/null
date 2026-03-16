import { describe, expect, it, vi } from "vitest";

import { DEFAULT_TEXT_STYLE } from "../src/advanced/doc/scene";
import { getRenderedTextLines, getTextLineMetrics, measureTextWidth, resolveTextContentFrameSize, wrapTextLines } from "../src/advanced/geom/textLayout";

describe("textLayout", () => {
  const style = {
    ...DEFAULT_TEXT_STYLE,
    fontFamily: "Inter, sans-serif",
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0,
  };

  it("preserves repeated spaces when wrapping text", () => {
    const maxWidth = measureTextWidth("A  ", style) + 0.5;
    expect(wrapTextLines("A  B", style, maxWidth)).toEqual(["A  ", "B"]);
  });

  it("splits oversized tokens by character without collapsing content", () => {
    const maxWidth = measureTextWidth("AB", style) + 0.5;
    expect(wrapTextLines("ABCD", style, maxWidth)).toEqual(["AB", "CD"]);
  });

  it("keeps closing punctuation attached to the previous wrapped line", () => {
    const maxWidth = measureTextWidth("ABCDE", style) + 0.5;
    expect(wrapTextLines("ABCDE)FG", style, maxWidth)).toEqual(["ABCDE)", "FG"]);
  });

  it("avoids starting wrapped CJK lines with closing punctuation", () => {
    const maxWidth = measureTextWidth("안녕하", style) + 0.5;
    const lines = wrapTextLines("안녕하세요?다음", style, maxWidth);
    expect(lines.some((line) => /^[)\]}!?.,:;%…、。，．？！：；％）］｝〉》」』】]/u.test(line))).toBe(false);
    expect(lines.join("")).toBe("안녕하세요?다음");
  });

  it("reports stable line metrics for baseline math", () => {
    const metrics = getTextLineMetrics({ fontSize: 20, lineHeight: 1.2 });
    expect(metrics.lineHeight).toBe(24);
    expect(metrics.leading).toBe(2);
    expect(metrics.baselineOffset).toBe(18);
  });

  it("uses canvas ascent/descent when available for baseline math", () => {
    const originalDocument = (globalThis as { document?: Document }).document;
    const measureText = vi.fn(() => ({
      width: 40,
      actualBoundingBoxAscent: 14,
      actualBoundingBoxDescent: 6,
    }));
    const fakeCanvas = {
      getContext: vi.fn(
        () =>
          ({
            font: "",
            measureText,
          }) as unknown as CanvasRenderingContext2D,
      ),
    };
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: vi.fn(() => fakeCanvas),
      },
    });
    try {
      const metrics = getTextLineMetrics({ fontSize: 20, lineHeight: 1.2, fontFamily: "Inter, sans-serif" });
      expect(metrics.lineHeight).toBe(24);
      expect(metrics.leading).toBe(2);
      expect(metrics.baselineOffset).toBe(16);
      expect(measureText).toHaveBeenCalled();
    } finally {
      if (originalDocument) {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: originalDocument,
        });
      } else {
        delete (globalThis as { document?: Document }).document;
      }
    }
  });

  it("keeps width fixed while growing hug height for wrapped text", () => {
    const maxWidth = measureTextWidth("Wrapped", style) + 0.5;
    const resolved = resolveTextContentFrameSize(
      { w: Math.ceil(maxWidth), h: 20 },
      "Wrapped text grows",
      style,
      {
        wrap: true,
        autoSize: false,
        layoutSizing: { width: "fixed", height: "hug" },
        widthPadding: 4,
        heightPadding: 2,
        minWidth: 20,
        minHeight: 20,
      },
    );
    expect(resolved.frame.w).toBe(Math.ceil(maxWidth));
    expect(resolved.frame.h).toBeGreaterThan(20);
  });

  it("hugs both axes for auto-size text", () => {
    const resolved = resolveTextContentFrameSize(
      { w: 40, h: 20 },
      "Auto size text",
      style,
      {
        wrap: false,
        autoSize: true,
        layoutSizing: { width: "fixed", height: "fixed" },
        widthPadding: 4,
        heightPadding: 2,
        minWidth: 20,
        minHeight: 20,
      },
    );
    expect(resolved.frame.w).toBeGreaterThan(40);
    expect(resolved.frame.h).toBeGreaterThan(20);
  });

  it("measures text using the resolved text case transform", () => {
    const upperWidth = measureTextWidth("hello world", { ...style, textCase: "upper" });
    const transformedWidth = measureTextWidth("HELLO WORLD", style);
    expect(upperWidth).toBe(transformedWidth);
  });

  it("keeps wrap decisions aligned with the rendered text case", () => {
    const maxWidth = measureTextWidth("HELLO", style) + 0.5;
    expect(
      wrapTextLines("hello hello", { ...style, textCase: "upper" }, maxWidth).map((line) => line.length),
    ).toEqual(
      wrapTextLines("HELLO HELLO", style, maxWidth).map((line) => line.length),
    );
  });

  it("adds paragraph spacing between rendered paragraphs", () => {
    const rendered = getRenderedTextLines("First\nSecond", { ...style, paragraphSpacing: 12 }, undefined, false);
    expect(rendered.lines).toEqual(["First", "Second"]);
    expect(rendered.lineOffsets[0]).toBe(0);
    expect(rendered.lineOffsets[1]).toBe(rendered.lineHeight + 12);
  });
});
