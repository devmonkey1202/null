import { describe, expect, it } from "vitest";
import { figmaNodesToNullDoc } from "../src/lib/figmaToNull";
import type { FigmaNode, FigmaPaint, FigmaLocalVariableCollection, FigmaLocalVariable } from "../src/lib/figma";

describe("figmaToNull", () => {
  describe("figmaNodesToNullDoc", () => {
    it("returns empty doc when root has no children", () => {
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [],
      };
      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      expect(doc.schema).toBe("null_advanced_v1");
      expect(doc.root).toBe("root");
      expect(doc.pages).toHaveLength(1);
      expect(Object.keys(doc.nodes)).toContain("root");
    });

    it("converts a single FRAME to page content", () => {
      const frame: FigmaNode = {
        id: "1:0",
        name: "Frame 1",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
        children: [],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };
      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      expect(doc.pages).toHaveLength(1);
      expect(doc.pages[0]!.rootId).toBe("figma_page_1");
      const pageNode = doc.nodes["figma_page_1"];
      expect(pageNode).toBeDefined();
      expect(pageNode?.type).toBe("frame");
      expect(pageNode?.frame).toEqual({ x: 0, y: 0, w: 400, h: 300, rotation: 0 });
    });

    it("converts RECTANGLE with fill to rect node", () => {
      const rect: FigmaNode = {
        id: "2:0",
        name: "Rectangle",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 10, y: 20, width: 100, height: 50 },
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
        children: [],
      };
      const frame: FigmaNode = {
        id: "1:0",
        name: "Frame",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
        children: [rect],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };
      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const nodeIds = Object.keys(doc.nodes).filter((id) => id.startsWith("figma_") && id !== "figma_page_1");
      expect(nodeIds.length).toBeGreaterThanOrEqual(1);
      const rectNode = Object.values(doc.nodes).find((n) => n.type === "rect");
      expect(rectNode).toBeDefined();
      expect(rectNode?.frame).toEqual({ x: 10, y: 20, w: 100, h: 50, rotation: 0 });
      expect(rectNode?.style?.fills).toHaveLength(1);
      expect(rectNode?.style?.fills?.[0]).toMatchObject({ type: "solid", color: "#ff0000" });
    });

    it("uses options.fileName for page name", () => {
      const frame: FigmaNode = {
        id: "1:0",
        name: "Frame",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        children: [],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };
      const doc = figmaNodesToNullDoc("fileKey", docRoot, { fileName: "My Design" });
      expect(doc.pages[0]!.name).toBe("My Design");
      expect(doc.nodes["figma_page_1"]?.name).toBe("My Design");
    });

    it("applies imageUrlMap to image-type nodes", () => {
      const rectWithImage: FigmaNode = {
        id: "2:0",
        name: "Image",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 150 },
        fills: [{ type: "IMAGE", imageRef: "ref", opacity: 1 }] as FigmaPaint[],
        children: [],
      };
      const frame: FigmaNode = {
        id: "1:0",
        name: "Frame",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
        children: [rectWithImage],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };
      const imageUrlMap: Record<string, string> = { "2:0": "https://example.com/image.png" };
      const doc = figmaNodesToNullDoc("fileKey", docRoot, { imageUrlMap });
      const imgNode = Object.values(doc.nodes).find((n) => n.type === "image");
      expect(imgNode).toBeDefined();
      expect(imgNode?.image?.src).toBe("https://example.com/image.png");
    });

    it("preserves SECTION nodes instead of downcasting them to frame", () => {
      const section: FigmaNode = {
        id: "1:0",
        name: "Hero Section",
        type: "SECTION",
        absoluteBoundingBox: { x: 0, y: 0, width: 640, height: 360 },
        children: [],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [section],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const pageNode = doc.nodes["figma_page_1"];

      expect(pageNode).toBeDefined();
      expect(pageNode?.type).toBe("section");
      expect(pageNode?.name).toBe("Hero Section");
      expect(pageNode?.frame).toEqual({ x: 0, y: 0, w: 640, h: 360, rotation: 0 });
    });

    it("creates one NULL page per Figma canvas and preserves the canvas hierarchy", () => {
      const marketingFrame: FigmaNode = {
        id: "10:0",
        name: "Landing",
        type: "FRAME",
        absoluteBoundingBox: { x: 100, y: 200, width: 1200, height: 800 },
        children: [],
      };
      const appSection: FigmaNode = {
        id: "20:0",
        name: "Dashboard Section",
        type: "SECTION",
        absoluteBoundingBox: { x: 40, y: 60, width: 900, height: 700 },
        children: [],
      };
      const pageA: FigmaNode = {
        id: "1:0",
        name: "Marketing",
        type: "CANVAS",
        children: [marketingFrame],
      };
      const pageB: FigmaNode = {
        id: "2:0",
        name: "App",
        type: "CANVAS",
        children: [appSection],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [pageA, pageB],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);

      expect(doc.pages).toHaveLength(2);
      expect(doc.pages.map((page) => page.name)).toEqual(["Marketing", "App"]);
      expect(doc.root).toBe("root");
      expect(doc.nodes.root?.children).toEqual(["figma_page_1", "figma_page_2"]);
      expect(doc.prototype?.startPageId).toBe("figma_page_1");

      const marketingPage = doc.nodes["figma_page_1"];
      const appPage = doc.nodes["figma_page_2"];
      expect(marketingPage?.type).toBe("frame");
      expect(appPage?.type).toBe("frame");
      expect(marketingPage?.children).toEqual(["figma_10_0"]);
      expect(appPage?.children).toEqual(["figma_20_0"]);
      expect(doc.nodes["figma_10_0"]?.parentId).toBe("figma_page_1");
      expect(doc.nodes["figma_20_0"]?.parentId).toBe("figma_page_2");
      expect(doc.nodes["figma_10_0"]?.frame).toEqual({ x: 0, y: 0, w: 1200, h: 800, rotation: 0 });
      expect(doc.nodes["figma_20_0"]?.type).toBe("section");
      expect(doc.nodes["figma_20_0"]?.frame).toEqual({ x: 0, y: 0, w: 900, h: 700, rotation: 0 });
      expect(marketingPage?.frame).toEqual({ x: 100, y: 200, w: 1200, h: 800, rotation: 0 });
      expect(appPage?.frame).toEqual({ x: 40, y: 60, w: 900, h: 700, rotation: 0 });
    });

    it("imports Figma flowStartingPoints and official interactions into NULL prototype data", () => {
      const pageOneButton: FigmaNode = {
        id: "2:0",
        name: "Prototype Trigger",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 20, y: 20, width: 140, height: 48 },
        interactions: [
          {
            trigger: { type: "ON_CLICK" },
            actions: [
              {
                type: "NODE",
                destinationId: "4:0",
                navigation: "NAVIGATE",
                transition: { type: "SMART_ANIMATE", duration: 280, easing: { type: "EASE_OUT" } },
              },
            ],
          },
          {
            trigger: { type: "ON_HOVER" },
            actions: [
              {
                type: "NODE",
                destinationId: "4:0",
                navigation: "OVERLAY",
                transition: { type: "DISSOLVE", duration: 180, easing: { type: "EASE_IN_AND_OUT" } },
              },
            ],
          },
          {
            trigger: { type: "ON_CLICK" },
            actions: [{ type: "URL", url: "https://example.com" }],
          },
          {
            trigger: { type: "AFTER_TIMEOUT", timeout: 150 },
            actions: [{ type: "BACK" }],
          },
          {
            trigger: { type: "ON_CLICK" },
            actions: [
              {
                type: "NODE",
                destinationId: "3:0",
                navigation: "SCROLL_TO",
                transition: { type: "DISSOLVE", duration: 0, easing: { type: "LINEAR" } },
              },
            ],
          },
        ],
        children: [],
      };
      const pageOneAnchor: FigmaNode = {
        id: "3:0",
        name: "Scroll Anchor",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 20, y: 160, width: 100, height: 64 },
        children: [],
      };
      const pageOne: FigmaNode = {
        id: "1:0",
        name: "Page 1",
        type: "CANVAS",
        flowStartingPoints: [{ nodeId: "2:0", name: "Main Flow" }],
        prototypeStartNodeID: "2:0",
        children: [pageOneButton, pageOneAnchor],
      };
      const pageTwoScreen: FigmaNode = {
        id: "4:0",
        name: "Target Screen",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 240 },
        children: [],
      };
      const pageTwo: FigmaNode = {
        id: "5:0",
        name: "Page 2",
        type: "CANVAS",
        children: [pageTwoScreen],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [pageOne, pageTwo],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const triggerNode = Object.values(doc.nodes).find((node) => node.name === "Prototype Trigger");
      const targetPage = doc.pages.find((page) => page.name === "Page 2");
      const anchorNode = Object.values(doc.nodes).find((node) => node.name === "Scroll Anchor");

      expect(doc.prototype?.startPageId).toBe("figma_page_1");
      expect(targetPage).toBeTruthy();
      expect(triggerNode?.prototype?.interactions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            trigger: "click",
            action: expect.objectContaining({
              type: "navigate",
              targetPageId: targetPage?.id,
              transition: expect.objectContaining({ type: "smart", duration: 280 }),
            }),
          }),
          expect.objectContaining({
            trigger: "hover",
            action: expect.objectContaining({
              type: "overlay",
              targetPageId: targetPage?.id,
              transition: expect.objectContaining({ type: "fade", duration: 180 }),
            }),
          }),
          expect.objectContaining({
            trigger: "click",
            action: expect.objectContaining({
              type: "url",
              url: "https://example.com",
            }),
          }),
          expect.objectContaining({
            trigger: "load",
            action: expect.objectContaining({
              type: "back",
              delayMs: 150,
            }),
          }),
          expect.objectContaining({
            trigger: "click",
            action: expect.objectContaining({
              type: "scrollTo",
              targetNodeId: anchorNode?.id,
            }),
          }),
        ]),
      );
    });

    it("imports stroke dash arrays into NULL stroke definitions", () => {
      const rect: FigmaNode = {
        id: "2:0",
        name: "Dashed Rectangle",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 10, y: 20, width: 100, height: 50 },
        strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
        strokeWeight: 2,
        strokeAlign: "CENTER",
        strokeDashes: [8, 4],
        children: [],
      };
      const frame: FigmaNode = {
        id: "1:0",
        name: "Frame",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
        children: [rect],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const rectNode = Object.values(doc.nodes).find((node) => node.name === "Dashed Rectangle");

      expect(rectNode?.style.strokes).toEqual([{ color: "#000000", width: 2, align: "center", dash: [8, 4] }]);
    });

    it("maps auto-layout sizing modes into NULL layoutSizing", () => {
      const frame: FigmaNode = {
        id: "1:0",
        name: "Auto Layout",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 300, height: 120 },
        layoutMode: "HORIZONTAL",
        primaryAxisSizingMode: "AUTO",
        counterAxisSizingMode: "FIXED",
        children: [],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const pageNode = doc.nodes["figma_page_1"];

      expect(pageNode?.layoutSizing).toEqual({ width: "hug", height: "fixed" });
    });

    it("imports Figma auto-layout justify, wrap spacing, stroke-in-layout, and min-max sizing", () => {
      const child: FigmaNode = {
        id: "2:0",
        name: "Card",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 24, y: 24, width: 120, height: 48 },
        layoutSizingHorizontal: "FILL",
        layoutSizingVertical: "FIXED",
        minWidth: 120,
        maxWidth: 260,
        minHeight: 48,
        maxHeight: 96,
        children: [],
      };
      const frame: FigmaNode = {
        id: "1:0",
        name: "Auto Layout",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 180 },
        layoutMode: "HORIZONTAL",
        layoutWrap: "WRAP",
        itemSpacing: 12,
        counterAxisSpacing: 24,
        paddingTop: 16,
        paddingRight: 20,
        paddingBottom: 18,
        paddingLeft: 22,
        primaryAxisAlignItems: "CENTER",
        counterAxisAlignItems: "STRETCH",
        counterAxisAlignContent: "SPACE_BETWEEN",
        strokesIncludedInLayout: true,
        layoutSizingHorizontal: "HUG",
        layoutSizingVertical: "FILL",
        minWidth: 280,
        maxWidth: 640,
        minHeight: 100,
        maxHeight: 320,
        children: [child],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const pageNode = doc.nodes["figma_page_1"];
      const childNode = doc.nodes["figma_2_0"];

      expect(pageNode?.layout).toEqual({
        mode: "auto",
        dir: "row",
        gap: 12,
        gapMode: "fixed",
        justify: "center",
        padding: { t: 16, r: 20, b: 18, l: 22 },
        align: "stretch",
        wrap: true,
        wrapGap: 24,
        wrapAlign: "space-between",
        includeStrokeInBounds: true,
      });
      expect(pageNode?.layoutSizing).toEqual({
        width: "hug",
        height: "fill",
        minWidth: 280,
        minHeight: 100,
        maxWidth: 640,
        maxHeight: 320,
      });
      expect(childNode?.layoutSizing).toEqual({
        width: "fill",
        height: "fixed",
        minWidth: 120,
        minHeight: 48,
        maxWidth: 260,
        maxHeight: 96,
      });
    });

    it("imports Ignore Auto Layout as absolute positioning for auto-layout children", () => {
      const child: FigmaNode = {
        id: "2:0",
        name: "Floating Card",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 96, y: 18, width: 120, height: 48 },
        layoutPositioning: "ABSOLUTE",
        layoutGrow: 1,
        children: [],
      };
      const frame: FigmaNode = {
        id: "1:0",
        name: "Auto Layout",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 180 },
        layoutMode: "HORIZONTAL",
        children: [child],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const childNode = doc.nodes["figma_2_0"];

      expect(childNode?.layoutPositioning).toBe("absolute");
      expect(childNode?.layoutSizing).toEqual({
        width: "fixed",
        height: "fixed",
        minWidth: undefined,
        minHeight: undefined,
        maxWidth: undefined,
        maxHeight: undefined,
      });
      expect(childNode?.frame).toMatchObject({ x: 96, y: 18, w: 120, h: 48 });
    });

    it("imports SPACE_BETWEEN main-axis alignment as gapMode and justify", () => {
      const frame: FigmaNode = {
        id: "1:0",
        name: "Space Between",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 300, height: 120 },
        layoutMode: "HORIZONTAL",
        itemSpacing: 16,
        primaryAxisAlignItems: "SPACE_BETWEEN",
        children: [],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const pageNode = doc.nodes["figma_page_1"];

      expect(pageNode?.layout).toMatchObject({
        gap: 16,
        gapMode: "space-between",
        justify: "space-between",
      });
    });

    it("derives child fill sizing from parent auto-layout direction when Figma child uses layoutGrow/layoutAlign", () => {
      const rowChild: FigmaNode = {
        id: "2:0",
        name: "Row Fill",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 12, y: 12, width: 80, height: 32 },
        layoutGrow: 1,
        layoutAlign: "INHERIT",
        children: [],
      };
      const rowFrame: FigmaNode = {
        id: "1:0",
        name: "Row Auto",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 240, height: 80 },
        layoutMode: "HORIZONTAL",
        children: [rowChild],
      };
      const columnChild: FigmaNode = {
        id: "4:0",
        name: "Column Fill",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 12, y: 112, width: 80, height: 32 },
        layoutGrow: 1,
        layoutAlign: "INHERIT",
        children: [],
      };
      const stretchChild: FigmaNode = {
        id: "5:0",
        name: "Stretch Cross",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 100, y: 112, width: 80, height: 32 },
        layoutAlign: "STRETCH",
        children: [],
      };
      const columnFrame: FigmaNode = {
        id: "3:0",
        name: "Column Auto",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 100, width: 240, height: 180 },
        layoutMode: "VERTICAL",
        children: [columnChild, stretchChild],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [rowFrame, columnFrame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);

      expect(doc.nodes["figma_2_0"]?.layoutSizing).toEqual({
        width: "fill",
        height: "fixed",
        minWidth: undefined,
        minHeight: undefined,
        maxWidth: undefined,
        maxHeight: undefined,
      });
      expect(doc.nodes["figma_4_0"]?.layoutSizing).toEqual({
        width: "fixed",
        height: "fill",
        minWidth: undefined,
        minHeight: undefined,
        maxWidth: undefined,
        maxHeight: undefined,
      });
      expect(doc.nodes["figma_5_0"]?.layoutSizing).toEqual({
        width: "fill",
        height: "fixed",
        minWidth: undefined,
        minHeight: undefined,
        maxWidth: undefined,
        maxHeight: undefined,
      });
    });

    it("maps Figma text auto-resize and line-height ratios into NULL text behavior", () => {
      const autoWidthText: FigmaNode = {
        id: "2:0",
        name: "Auto Width",
        type: "TEXT",
        absoluteBoundingBox: { x: 20, y: 20, width: 140, height: 32 },
        characters: "Auto Width",
        style: {
          fontSize: 16,
          fontWeight: 600,
          lineHeightPercentFontSize: 150,
          textAutoResize: "WIDTH_AND_HEIGHT",
          textCase: "UPPER",
          textDecoration: "UNDERLINE",
          fontFeatureSettings: "\"liga\" 1, \"ss01\" 1",
          fontVariationSettings: "\"wght\" 650, \"wdth\" 95",
        },
        children: [],
      };
      const fixedBoxText: FigmaNode = {
        id: "3:0",
        name: "Fixed Box",
        type: "TEXT",
        absoluteBoundingBox: { x: 20, y: 64, width: 160, height: 80 },
        characters: "Wrapped paragraph",
        style: {
          fontSize: 20,
          fontWeight: 400,
          lineHeightPercent: 120,
          textAutoResize: "HEIGHT",
          textDecoration: "STRIKETHROUGH",
        },
        children: [],
      };
      const frame: FigmaNode = {
        id: "1:0",
        name: "Frame",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 240 },
        children: [autoWidthText, fixedBoxText],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const autoNode = doc.nodes["figma_2_0"];
      const fixedNode = doc.nodes["figma_3_0"];

      expect(autoNode?.text).toMatchObject({
        value: "Auto Width",
        wrap: false,
        autoSize: true,
      });
      expect(autoNode?.layoutSizing).toMatchObject({
        width: "hug",
        height: "hug",
      });
      expect(autoNode?.text?.style).toMatchObject({
        fontSize: 16,
        fontWeight: 600,
        lineHeight: 1.5,
        underline: true,
        textCase: "upper",
        fontFeatureSettings: "\"liga\" 1, \"ss01\" 1",
        fontVariationSettings: "\"wght\" 650, \"wdth\" 95",
      });
      expect(fixedNode?.text).toMatchObject({
        value: "Wrapped paragraph",
        wrap: true,
        autoSize: false,
      });
      expect(fixedNode?.layoutSizing).toMatchObject({
        width: "fixed",
        height: "hug",
      });
      expect(fixedNode?.text?.style).toMatchObject({
        fontSize: 20,
        lineHeight: 1.2,
        lineThrough: true,
      });
    });

    it("maps Figma JUSTIFIED text alignment into NULL justify text align", () => {
      const textNode: FigmaNode = {
        id: "2:0",
        name: "Justified Copy",
        type: "TEXT",
        absoluteBoundingBox: { x: 20, y: 20, width: 200, height: 80 },
        characters: "Long paragraph text",
        style: {
          fontSize: 16,
          fontWeight: 400,
          textAlignHorizontal: "JUSTIFIED",
        },
        children: [],
      };
      const frame: FigmaNode = {
        id: "1:0",
        name: "Frame",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 180 },
        children: [textNode],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      expect(doc.nodes["figma_2_0"]?.text?.style.align).toBe("justify");
    });

    it("imports text style override tables into NULL rich text ranges", () => {
      const textNode: FigmaNode = {
        id: "2:0",
        name: "Rich Copy",
        type: "TEXT",
        absoluteBoundingBox: { x: 20, y: 20, width: 220, height: 48 },
        characters: "Hello World",
        style: {
          fontFamily: "Inter",
          fontSize: 18,
          fontWeight: 400,
          paragraphSpacing: 18,
        },
        characterStyleOverrides: [1, 1, 1, 1, 1, 0, 2, 2, 2, 2, 2],
        styleOverrideTable: {
          "1": {
            fontFamily: "Inter",
            fontSize: 18,
            fontWeight: 700,
          },
          "2": {
            fontFamily: "Inter",
            fontSize: 18,
            fontWeight: 400,
            italic: true,
            fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
          },
        },
        children: [],
      };
      const frame: FigmaNode = {
        id: "1:0",
        name: "Frame",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 180 },
        children: [textNode],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const imported = doc.nodes["figma_2_0"]?.text;

      expect(imported?.ranges).toEqual([
        { start: 0, end: 5, style: { fontWeight: 700 }, fill: undefined },
        { start: 6, end: 11, style: { italic: true }, fill: "#ff0000" },
      ]);
      expect(doc.nodes["figma_2_0"]?.text?.style.paragraphSpacing).toBe(18);
    });

    it("imports shared style refs into NULL style tokens and node style ids", () => {
      const rectNode: FigmaNode = {
        id: "2:0",
        name: "Styled Rect",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 20, y: 20, width: 120, height: 60 },
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
        strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
        strokeWeight: 2,
        styles: {
          FILL: "S:fill_primary",
          STROKE: "S:stroke_primary",
          EFFECT: "S:effect_soft",
        },
        effects: [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, radius: 12, visible: true }],
        children: [],
      };
      const textNode: FigmaNode = {
        id: "3:0",
        name: "Styled Text",
        type: "TEXT",
        absoluteBoundingBox: { x: 20, y: 100, width: 160, height: 40 },
        characters: "Styled copy",
        style: {
          fontSize: 16,
          fontWeight: 500,
        },
        styles: {
          TEXT: "S:text_body",
        },
        children: [],
      };
      const frame: FigmaNode = {
        id: "1:0",
        name: "Frame",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 220 },
        children: [rectNode, textNode],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot, {
        figmaStyles: {
          "S:fill_primary": { name: "Paint/Primary", style_type: "FILL" },
          "S:stroke_primary": { name: "Stroke/Primary", style_type: "FILL" },
          "S:text_body": { name: "Text/Body", style_type: "TEXT" },
          "S:effect_soft": { name: "Effect/Soft Shadow", style_type: "EFFECT" },
        },
      });

      expect(doc.nodes["figma_2_0"]?.style.fillStyleId).toBe("figma_style_fill_S_fill_primary");
      expect(doc.nodes["figma_2_0"]?.style.strokeStyleId).toBe("figma_style_stroke_S_stroke_primary");
      expect(doc.nodes["figma_2_0"]?.style.effectStyleId).toBe("figma_style_effect_S_effect_soft");
      expect(doc.nodes["figma_3_0"]?.text?.styleRef).toBe("figma_style_text_S_text_body");
      expect(doc.styles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "figma_style_fill_S_fill_primary", name: "Paint/Primary", type: "fill" }),
          expect.objectContaining({ id: "figma_style_stroke_S_stroke_primary", name: "Stroke/Primary", type: "stroke" }),
          expect.objectContaining({ id: "figma_style_effect_S_effect_soft", name: "Effect/Soft Shadow", type: "effect" }),
          expect.objectContaining({ id: "figma_style_text_S_text_body", name: "Text/Body", type: "text" }),
        ]),
      );
    });

    it("imports local variables, modes, alias values, and color fill/stroke bindings", () => {
      const variableCollections: Record<string, FigmaLocalVariableCollection> = {
        "VariableCollectionId:theme": {
          id: "VariableCollectionId:theme",
          name: "Theme",
          defaultModeId: "mode_light",
          modes: [
            { modeId: "mode_light", name: "Light" },
            { modeId: "mode_dark", name: "Dark" },
          ],
        },
      };
      const variables: Record<string, FigmaLocalVariable> = {
        "VariableID:brand": {
          id: "VariableID:brand",
          name: "Brand",
          variableCollectionId: "VariableCollectionId:theme",
          resolvedType: "COLOR",
          valuesByMode: {
            mode_light: { r: 1, g: 0, b: 0, a: 1 },
            mode_dark: { r: 0, g: 0, b: 1, a: 1 },
          },
        },
        "VariableID:accent": {
          id: "VariableID:accent",
          name: "Accent",
          variableCollectionId: "VariableCollectionId:theme",
          resolvedType: "COLOR",
          valuesByMode: {
            mode_light: { type: "VARIABLE_ALIAS", id: "VariableID:brand" },
            mode_dark: { type: "VARIABLE_ALIAS", id: "VariableID:brand" },
          },
        },
        "VariableID:gap": {
          id: "VariableID:gap",
          name: "Gap",
          variableCollectionId: "VariableCollectionId:theme",
          resolvedType: "FLOAT",
          valuesByMode: {
            mode_light: 12,
            mode_dark: 10,
          },
        },
        "VariableID:border": {
          id: "VariableID:border",
          name: "Border",
          variableCollectionId: "VariableCollectionId:theme",
          resolvedType: "COLOR",
          valuesByMode: {
            mode_light: { r: 0, g: 0, b: 0, a: 1 },
            mode_dark: { r: 1, g: 1, b: 1, a: 1 },
          },
        },
      };
      const rectNode: FigmaNode = {
        id: "2:0",
        name: "Variable Rect",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 0, y: 0, width: 160, height: 80 },
        fills: [
          {
            type: "SOLID",
            color: { r: 1, g: 1, b: 1, a: 1 },
            boundVariables: {
              color: { type: "VARIABLE_ALIAS", id: "VariableID:accent" },
            },
          },
        ],
        strokes: [
          {
            type: "SOLID",
            color: { r: 0, g: 0, b: 0, a: 1 },
            boundVariables: {
              color: { type: "VARIABLE_ALIAS", id: "VariableID:border" },
            },
          },
        ],
        strokeWeight: 2,
        children: [],
      };
      const frame: FigmaNode = {
        id: "1:0",
        name: "Frame",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 220 },
        children: [rectNode],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot, {
        figmaVariableCollections: variableCollections,
        figmaVariables: variables,
      });

      expect(doc.variableModes).toEqual(["Light", "Dark"]);
      expect(doc.variableMode).toBe("Light");
      expect(doc.variables).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "figma_var_VariableID_brand",
            name: "Brand",
            type: "color",
            value: "#ff0000",
            modes: { Light: "#ff0000", Dark: "#0000ff" },
          }),
          expect.objectContaining({
            id: "figma_var_VariableID_accent",
            name: "Accent",
            type: "color",
            value: "#ff0000",
            modes: { Light: "#ff0000", Dark: "#0000ff" },
            aliasOf: "figma_var_VariableID_brand",
            modeAliases: { Light: "figma_var_VariableID_brand", Dark: "figma_var_VariableID_brand" },
          }),
          expect.objectContaining({
            id: "figma_var_VariableID_gap",
            name: "Gap",
            type: "number",
            value: 12,
            modes: { Light: 12, Dark: 10 },
          }),
          expect.objectContaining({
            id: "figma_var_VariableID_border",
            name: "Border",
            type: "color",
            value: "#000000",
            modes: { Light: "#000000", Dark: "#ffffff" },
          }),
        ]),
      );
      expect(doc.nodes["figma_2_0"]?.style.fillRef).toBe("figma_var_VariableID_accent");
      expect(doc.nodes["figma_2_0"]?.style.strokeRef).toBe("figma_var_VariableID_border");
    });

    it("imports text value/style bindings and gradient stop bindings", () => {
      const variableCollections: Record<string, FigmaLocalVariableCollection> = {
        "VariableCollectionId:theme": {
          id: "VariableCollectionId:theme",
          name: "Theme",
          defaultModeId: "mode_light",
          modes: [{ modeId: "mode_light", name: "Light" }],
        },
      };
      const variables: Record<string, FigmaLocalVariable> = {
        "VariableID:label": {
          id: "VariableID:label",
          name: "Label",
          variableCollectionId: "VariableCollectionId:theme",
          resolvedType: "STRING",
          valuesByMode: { mode_light: "Deploy" },
        },
        "VariableID:size": {
          id: "VariableID:size",
          name: "Font Size",
          variableCollectionId: "VariableCollectionId:theme",
          resolvedType: "FLOAT",
          valuesByMode: { mode_light: 24 },
        },
        "VariableID:start": {
          id: "VariableID:start",
          name: "Gradient Start",
          variableCollectionId: "VariableCollectionId:theme",
          resolvedType: "COLOR",
          valuesByMode: { mode_light: { r: 0.133, g: 0.773, b: 0.369, a: 1 } },
        },
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "1:0",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "2:0",
                name: "Headline",
                type: "TEXT",
                absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 40 },
                characters: "Fallback",
                boundVariables: {
                  characters: { type: "VARIABLE_ALIAS", id: "VariableID:label" },
                },
                style: {
                  fontSize: 16,
                  fontWeight: 600,
                  boundVariables: {
                    fontSize: { type: "VARIABLE_ALIAS", id: "VariableID:size" },
                  },
                },
                children: [],
              },
              {
                id: "3:0",
                name: "Gradient Rect",
                type: "RECTANGLE",
                absoluteBoundingBox: { x: 0, y: 60, width: 160, height: 80 },
                fills: [
                  {
                    type: "GRADIENT_LINEAR",
                    gradientHandlePositions: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }],
                    gradientStops: [
                      {
                        position: 0,
                        color: { r: 1, g: 0, b: 0, a: 1 },
                        boundVariables: { color: { type: "VARIABLE_ALIAS", id: "VariableID:start" } },
                      },
                      { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
                    ],
                  },
                ],
                children: [],
              },
            ],
          },
        ],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot, {
        figmaVariableCollections: variableCollections,
        figmaVariables: variables,
      });

      expect(doc.nodes["figma_2_0"]?.text?.valueRef).toBe("figma_var_VariableID_label");
      expect(doc.nodes["figma_2_0"]?.text?.styleBindings?.fontSize).toBe("figma_var_VariableID_size");
      expect(doc.nodes["figma_3_0"]?.style.fills[0]).toMatchObject({
        type: "linear",
        stops: [
          expect.objectContaining({ colorRef: "figma_var_VariableID_start" }),
          expect.any(Object),
        ],
      });
    });

    it("preserves multiple vector fillGeometry paths as editable segments", () => {
      const vector: FigmaNode = {
        id: "2:0",
        name: "Vector",
        type: "VECTOR",
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
        fillGeometry: [{ path: "M0 0L10 0L10 10Z" }, { path: "M20 20L30 20L30 30Z" }],
        children: [],
      };
      const frame: FigmaNode = {
        id: "1:0",
        name: "Frame",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
        children: [vector],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const vectorNode = Object.values(doc.nodes).find((node) => node.name === "Vector");

      expect(vectorNode?.type).toBe("path");
      expect(vectorNode?.shape?.segments).toEqual([
        { d: "M0 0L10 0L10 10Z", fills: [{ type: "solid", color: "#ff0000", opacity: 1 }] },
        { d: "M20 20L30 20L30 30Z", fills: [{ type: "solid", color: "#ff0000", opacity: 1 }] },
      ]);
      expect(vectorNode?.shape?.vectorNetwork?.paths).toHaveLength(2);
      expect(vectorNode?.shape?.vectorNetwork?.paths[0]).toMatchObject({
        id: "segment_0",
        closed: true,
        fills: [{ type: "solid", color: "#ff0000", opacity: 1 }],
      });
      expect(vectorNode?.shape?.vectorNetwork?.paths[1]).toMatchObject({
        id: "segment_1",
        closed: true,
        fills: [{ type: "solid", color: "#ff0000", opacity: 1 }],
      });
    });

    it("preserves simple mask chains as editable nodes instead of raster fallback", () => {
      const maskRect = {
        id: "2:0",
        name: "Mask",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 120 },
        fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
        isMask: true,
        children: [],
      } as FigmaNode & { isMask: boolean };
      const contentRect: FigmaNode = {
        id: "3:0",
        name: "Content",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 20, y: 20, width: 160, height: 160 },
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
        children: [],
      };
      const frame: FigmaNode = {
        id: "1:0",
        name: "Masked Frame",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 300, height: 200 },
        children: [contentRect, maskRect],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const pageNode = doc.nodes["figma_page_1"];
      const importedMask = doc.nodes["figma_2_0"];
      const importedContent = doc.nodes["figma_3_0"];

      expect(pageNode?.children).toEqual(["figma_2_0", "figma_3_0"]);
      expect(importedMask?.isMask).toBe(true);
      expect(importedMask?.type).toBe("rect");
      expect(importedContent?.type).toBe("rect");
    });

    it("imports simple boolean operations as editable path nodes", () => {
      const booleanNode: FigmaNode = {
        id: "2:0",
        name: "Union",
        type: "BOOLEAN_OPERATION",
        booleanOperation: "UNION",
        absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 120 },
        fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 1, a: 1 } }],
        fillGeometry: [{ path: "M0 0L120 0L120 120Z" }],
        children: [
          {
            id: "3:0",
            name: "Operand A",
            type: "RECTANGLE",
            absoluteBoundingBox: { x: 0, y: 0, width: 80, height: 80 },
            children: [],
          },
          {
            id: "4:0",
            name: "Operand B",
            type: "ELLIPSE",
            absoluteBoundingBox: { x: 40, y: 40, width: 80, height: 80 },
            children: [],
          },
        ],
      };
      const frame: FigmaNode = {
        id: "1:0",
        name: "Frame",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 300, height: 200 },
        children: [booleanNode],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const importedBoolean = doc.nodes["figma_2_0"];

      expect(importedBoolean?.type).toBe("path");
      expect(importedBoolean?.shape?.pathData).toBe("M0 0L120 0L120 120Z");
      expect(importedBoolean?.shape?.booleanMeta?.op).toBe("union");
      expect(importedBoolean?.shape?.booleanMeta?.source).toBe("figma-import");
      expect(importedBoolean?.shape?.booleanMeta?.operands?.[0]).toMatchObject({
        sourceId: "3:0",
        name: "Operand A",
        type: "rect",
        pathData: "M 0 0 L 80 0 L 80 80 L 0 80 Z",
        frame: { x: 0, y: 0, w: 80, h: 80, rotation: 0 },
      });
      expect(importedBoolean?.shape?.booleanMeta?.operands?.[0]?.vectorNetwork?.paths).toHaveLength(1);
      expect(importedBoolean?.shape?.booleanMeta?.operands?.[1]).toMatchObject({
        sourceId: "4:0",
        name: "Operand B",
        type: "ellipse",
        frame: { x: 40, y: 40, w: 80, h: 80, rotation: 0 },
      });
      expect(importedBoolean?.shape?.booleanMeta?.operands?.[1]?.vectorNetwork?.paths).toHaveLength(1);
      expect(importedBoolean?.shape?.booleanMeta?.operands?.[1]?.pathData).toMatch(/^M 120 80 L /);
      expect(importedBoolean?.shape?.vectorNetwork).toBeDefined();
      expect(importedBoolean?.shape?.vectorNetwork?.vertices).toHaveLength(3);
      expect(importedBoolean?.shape?.vectorNetwork?.segments).toHaveLength(3);
      expect(importedBoolean?.shape?.vectorNetwork?.paths).toEqual([
        {
          id: "path_0",
          vertexIds: ["path_0_v0", "path_0_v1", "path_0_v2"],
          closed: true,
          fills: undefined,
        },
      ]);
      expect(doc.nodes["figma_3_0"]).toBeUndefined();
      expect(doc.nodes["figma_4_0"]).toBeUndefined();
    });

    it("imports stroke cap and join settings into node style", () => {
      const rect: FigmaNode = {
        id: "2:0",
        name: "Styled Stroke",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 10, y: 20, width: 100, height: 50 },
        strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
        strokeWeight: 3,
        strokeAlign: "CENTER",
        strokeCap: "ROUND",
        strokeJoin: "BEVEL",
        children: [],
      };
      const frame: FigmaNode = {
        id: "1:0",
        name: "Frame",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
        children: [rect],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const rectNode = doc.nodes["figma_2_0"];

      expect(rectNode?.style.strokeCap).toBe("round");
      expect(rectNode?.style.strokeJoin).toBe("bevel");
    });

    it("imports Figma export settings into NULL exportSettings", () => {
      const frame: FigmaNode = {
        id: "1:0",
        name: "Exportable",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 300, height: 120 },
        exportSettings: [
          { format: "PNG", constraint: { type: "SCALE", value: 2 } },
          { format: "SVG" },
          { format: "PDF", constraint: { type: "SCALE", value: 1 } },
        ],
        children: [],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const pageNode = doc.nodes["figma_page_1"];

      expect(pageNode?.exportSettings).toEqual([
        { format: "png", scale: 2 },
        { format: "svg", scale: 1 },
        { format: "pdf", scale: 1 },
      ]);
    });

    it("imports Figma layout grids into NULL layoutGrid items", () => {
      const frame: FigmaNode = {
        id: "1:0",
        name: "Grid Frame",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 900 },
        layoutGrids: [
          {
            pattern: "COLUMNS",
            visible: true,
            count: 12,
            sectionSize: 64,
            gutterSize: 20,
            offset: 24,
            color: { r: 0.31, g: 0.27, b: 0.9, a: 0.1 },
          },
          {
            pattern: "GRID",
            visible: true,
            sectionSize: 8,
            color: { r: 0.05, g: 0.65, b: 0.91, a: 0.08 },
          },
        ],
        children: [],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const pageNode = doc.nodes["figma_page_1"];

      expect(pageNode?.layoutGrid).toEqual([
        { type: "columns", count: 12, width: 64, gutter: 20, offset: 24, color: "rgba(79,69,230,0.1)", opacity: 0.1, alignment: "start" },
        { type: "grid", cellSize: 8, color: "rgba(13,166,232,0.08)", opacity: 0.08 },
      ]);
    });

    it("imports Figma grid layouts, child placement, and guide alignment metadata", () => {
      const child: FigmaNode = {
        id: "2:0",
        name: "Grid Item",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 32, y: 28, width: 120, height: 48 },
        gridColumnAnchorIndex: 2,
        gridRowAnchorIndex: 1,
        gridColumnSpan: 2,
        gridRowSpan: 1,
        gridChildHorizontalAlign: "CENTER",
        gridChildVerticalAlign: "MAX",
        children: [],
      };
      const frame: FigmaNode = {
        id: "1:0",
        name: "Grid Frame",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 640, height: 360 },
        layoutMode: "GRID",
        gridColumnCount: 3,
        gridRowCount: 2,
        gridColumnGap: 24,
        gridRowGap: 18,
        gridColumnsSizing: "120px 1fr 2fr",
        gridRowsSizing: "auto 80px",
        paddingTop: 12,
        paddingRight: 16,
        paddingBottom: 20,
        paddingLeft: 24,
        layoutGrids: [
          {
            pattern: "COLUMNS",
            visible: true,
            count: 3,
            gutterSize: 24,
            offset: 24,
            alignment: "STRETCH",
            color: { r: 0.31, g: 0.27, b: 0.9, a: 0.1 },
          },
          {
            pattern: "ROWS",
            visible: true,
            count: 4,
            sectionSize: 56,
            gutterSize: 16,
            offset: 20,
            alignment: "CENTER",
            color: { r: 0.13, g: 0.77, b: 0.37, a: 0.08 },
          },
        ],
        children: [child],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [frame],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const pageNode = doc.nodes["figma_page_1"];
      const childNode = doc.nodes["figma_2_0"];

      expect(pageNode?.layout).toEqual({
        mode: "grid",
        columns: 3,
        rows: 2,
        columnGap: 24,
        rowGap: 18,
        padding: { t: 12, r: 16, b: 20, l: 24 },
        columnsSizing: [
          { type: "fixed", value: 120 },
          { type: "flex", value: 1 },
          { type: "flex", value: 2 },
        ],
        rowsSizing: [
          { type: "hug" },
          { type: "fixed", value: 80 },
        ],
      });
      expect(pageNode?.layoutGrid).toEqual([
        { type: "columns", count: 3, width: undefined, gutter: 24, offset: 24, color: "rgba(79,69,230,0.1)", opacity: 0.1, alignment: "stretch" },
        { type: "rows", count: 4, height: 56, gutter: 16, offset: 20, color: "rgba(33,196,94,0.08)", opacity: 0.08, alignment: "center" },
      ]);
      expect(childNode?.gridChild).toEqual({
        row: 0,
        column: 1,
        rowSpan: 1,
        columnSpan: 2,
        horizontalAlign: "center",
        verticalAlign: "end",
      });
    });

    it("imports COMPONENT_SET children as component variants and resolves INSTANCE to the right variant", () => {
      const componentSet: FigmaNode = {
        id: "2:0",
        name: "Button",
        type: "COMPONENT_SET",
        absoluteBoundingBox: { x: 0, y: 0, width: 280, height: 120 },
        children: [
          {
            id: "2:1",
            name: "Primary",
            type: "COMPONENT",
            absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 44 },
            variantProperties: { State: "Primary", Size: "M" },
            children: [
              {
                id: "2:1:1",
                name: "Label",
                type: "TEXT",
                absoluteBoundingBox: { x: 16, y: 10, width: 48, height: 24 },
                characters: "Button",
                style: { fontSize: 16, fontWeight: 600 },
                children: [],
              },
            ],
          },
          {
            id: "2:2",
            name: "Secondary",
            type: "COMPONENT",
            absoluteBoundingBox: { x: 140, y: 0, width: 120, height: 44 },
            variantProperties: { State: "Secondary", Size: "M" },
            children: [
              {
                id: "2:2:1",
                name: "Label",
                type: "TEXT",
                absoluteBoundingBox: { x: 156, y: 10, width: 52, height: 24 },
                characters: "Ghost",
                style: { fontSize: 16, fontWeight: 600 },
                children: [],
              },
            ],
          },
        ],
      };
      const instance: FigmaNode = {
        id: "3:0",
        name: "Button Instance",
        type: "INSTANCE",
        componentId: "2:2",
        absoluteBoundingBox: { x: 400, y: 0, width: 120, height: 44 },
        children: [
          {
            id: "3:1",
            name: "Label",
            type: "TEXT",
            absoluteBoundingBox: { x: 416, y: 10, width: 52, height: 24 },
            characters: "Ghost",
            style: { fontSize: 16, fontWeight: 600 },
            children: [],
          },
        ],
      };
      const page: FigmaNode = {
        id: "1:0",
        name: "Components",
        type: "CANVAS",
        children: [componentSet, instance],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [page],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const componentNode = doc.nodes["figma_2_0"];
      const importedInstance = doc.nodes["figma_3_0"];

      expect(componentNode?.type).toBe("component");
      expect(doc.components["figma_2_0"]).toBe("figma_2_0");
      expect(componentNode?.children).toEqual(["figma_2_1", "figma_2_2"]);
      expect(componentNode?.variants).toEqual([
        { id: "figma_2_1__variant", name: "Size=M, State=Primary", rootId: "figma_2_1", props: { State: "Primary", Size: "M" } },
        { id: "figma_2_2__variant", name: "Size=M, State=Secondary", rootId: "figma_2_2", props: { State: "Secondary", Size: "M" } },
      ]);
      expect(doc.nodes["figma_2_1"]?.type).toBe("frame");
      expect(doc.nodes["figma_2_1"]?.parentId).toBe("figma_2_0");
      expect(doc.nodes["figma_2_1"]?.frame).toEqual({ x: 0, y: 0, w: 120, h: 44, rotation: 0 });
      expect(doc.nodes["figma_2_2"]?.frame).toEqual({ x: 140, y: 0, w: 120, h: 44, rotation: 0 });
      expect(importedInstance?.type).toBe("instance");
      expect(importedInstance?.componentId).toBe("2:2");
      expect(importedInstance?.instanceOf).toBe("figma_2_0");
      expect(importedInstance?.variantId).toBe("figma_2_2__variant");
      expect(importedInstance?.sourceId).toBe("figma_2_0");
      expect(doc.nodes["figma_3_1"]?.sourceId).toBe("figma_2_2_1");
    });

    it("imports standalone COMPONENT as a component root with a default variant", () => {
      const component: FigmaNode = {
        id: "4:0",
        name: "Badge",
        type: "COMPONENT",
        absoluteBoundingBox: { x: 80, y: 20, width: 140, height: 40 },
        componentPropertyDefinitions: {
          "Label#4:0": { type: "TEXT", defaultValue: "Badge" },
          "Show badge#4:1": { type: "BOOLEAN", defaultValue: true },
        },
        componentPropertyReferences: { visible: "Show badge#4:1" },
        children: [
          {
            id: "4:1",
            name: "Label",
            type: "TEXT",
            absoluteBoundingBox: { x: 96, y: 28, width: 52, height: 20 },
            characters: "Badge",
            style: { fontSize: 14, fontWeight: 600 },
            componentPropertyReferences: { characters: "Label#4:0" },
            children: [],
          },
        ],
      };
      const instance: FigmaNode = {
        id: "5:0",
        name: "Badge Instance",
        type: "INSTANCE",
        componentId: "4:0",
        componentProperties: {
          "Label#4:0": { type: "TEXT", value: "Badge XL" },
          "Show badge#4:1": { type: "BOOLEAN", value: false },
        },
        absoluteBoundingBox: { x: 260, y: 20, width: 140, height: 40 },
        children: [
          {
            id: "5:1",
            name: "Label",
            type: "TEXT",
            absoluteBoundingBox: { x: 276, y: 28, width: 52, height: 20 },
            characters: "Badge XL",
            style: { fontSize: 14, fontWeight: 600 },
            children: [],
          },
        ],
      };
      const page: FigmaNode = {
        id: "1:0",
        name: "Page 1",
        type: "CANVAS",
        children: [component, instance],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [page],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const componentNode = doc.nodes["figma_4_0"];
      const componentRoot = doc.nodes["figma_4_0__root"];
      const importedInstance = doc.nodes["figma_5_0"];

      expect(componentNode?.type).toBe("component");
      expect(componentNode?.children).toEqual(["figma_4_0__root"]);
      expect(componentNode?.variants).toEqual([{ id: "figma_4_0__variant", name: "Default", rootId: "figma_4_0__root" }]);
      expect(componentNode?.propertyDefinitions).toEqual({
        figma_4_0: { kind: "boolean", name: "Show badge" },
        figma_4_1: { kind: "text", name: "Label" },
      });
      expect(componentRoot?.type).toBe("frame");
      expect(componentRoot?.parentId).toBe("figma_4_0");
      expect(componentRoot?.frame).toEqual({ x: 0, y: 0, w: 140, h: 40, rotation: 0 });
      expect(importedInstance?.hidden).toBe(true);
      expect(importedInstance?.overrides?.hidden).toBe(true);
      expect(importedInstance?.instanceOf).toBe("figma_4_0");
      expect(importedInstance?.variantId).toBe("figma_4_0__variant");
      expect(importedInstance?.sourceId).toBe("figma_4_0");
      expect(doc.nodes["figma_5_1"]?.text?.value).toBe("Badge XL");
      expect(doc.nodes["figma_5_1"]?.overrides?.text?.value).toBe("Badge XL");
      expect(doc.nodes["figma_5_1"]?.sourceId).toBe("figma_4_1");
    });

    it("imports instance-swap component properties while preserving the property source node", () => {
      const iconA: FigmaNode = {
        id: "10:0",
        name: "Icon A",
        type: "COMPONENT",
        absoluteBoundingBox: { x: 0, y: 0, width: 24, height: 24 },
        children: [
          {
            id: "10:1",
            name: "Glyph",
            type: "TEXT",
            absoluteBoundingBox: { x: 4, y: 2, width: 16, height: 20 },
            characters: "A",
            style: { fontSize: 16, fontWeight: 700 },
            children: [],
          },
        ],
      };
      const iconB: FigmaNode = {
        id: "11:0",
        name: "Icon B",
        type: "COMPONENT",
        absoluteBoundingBox: { x: 40, y: 0, width: 24, height: 24 },
        children: [
          {
            id: "11:1",
            name: "Glyph",
            type: "TEXT",
            absoluteBoundingBox: { x: 44, y: 2, width: 16, height: 20 },
            characters: "B",
            style: { fontSize: 16, fontWeight: 700 },
            children: [],
          },
        ],
      };
      const button: FigmaNode = {
        id: "20:0",
        name: "Button",
        type: "COMPONENT",
        absoluteBoundingBox: { x: 0, y: 60, width: 160, height: 44 },
        componentPropertyDefinitions: {
          "Icon#20:1": { type: "INSTANCE_SWAP", defaultValue: "10:0" },
        },
        children: [
          {
            id: "20:1",
            name: "Icon Slot",
            type: "INSTANCE",
            componentId: "10:0",
            componentPropertyReferences: { mainComponent: "Icon#20:1" },
            absoluteBoundingBox: { x: 8, y: 70, width: 24, height: 24 },
            children: [
              {
                id: "20:1:1",
                name: "Glyph",
                type: "TEXT",
                absoluteBoundingBox: { x: 12, y: 72, width: 16, height: 20 },
                characters: "A",
                style: { fontSize: 16, fontWeight: 700 },
                children: [],
              },
            ],
          },
        ],
      };
      const buttonInstance: FigmaNode = {
        id: "30:0",
        name: "Button Instance",
        type: "INSTANCE",
        componentId: "20:0",
        componentProperties: {
          "Icon#20:1": { type: "INSTANCE_SWAP", value: "11:0" },
        },
        absoluteBoundingBox: { x: 220, y: 60, width: 160, height: 44 },
        children: [
          {
            id: "30:1",
            name: "Icon Slot",
            type: "INSTANCE",
            componentId: "11:0",
            absoluteBoundingBox: { x: 228, y: 70, width: 24, height: 24 },
            children: [
              {
                id: "30:1:1",
                name: "Glyph",
                type: "TEXT",
                absoluteBoundingBox: { x: 232, y: 72, width: 16, height: 20 },
                characters: "B",
                style: { fontSize: 16, fontWeight: 700 },
                children: [],
              },
            ],
          },
        ],
      };
      const page: FigmaNode = {
        id: "1:0",
        name: "Page 1",
        type: "CANVAS",
        children: [iconA, iconB, button, buttonInstance],
      };
      const docRoot: FigmaNode = {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [page],
      };

      const doc = figmaNodesToNullDoc("fileKey", docRoot);
      const propertyInstance = doc.nodes["figma_30_1"];

      expect(doc.nodes["figma_20_0"]?.propertyDefinitions).toEqual({
        figma_20_1: { kind: "instance", name: "Icon" },
      });
      expect(propertyInstance?.sourceId).toBe("figma_20_1");
      expect(propertyInstance?.instanceOf).toBe("figma_11_0");
      expect(propertyInstance?.variantId).toBe("figma_11_0__variant");
      expect(propertyInstance?.overrides?.instanceOf).toBe("figma_11_0");
      expect(propertyInstance?.overrides?.variantId).toBe("figma_11_0__variant");
      expect(doc.nodes["figma_30_1_1"]?.sourceId).toBe("figma_11_1");
      expect(doc.nodes["figma_30_1_1"]?.text?.value).toBe("B");
    });
  });
});
