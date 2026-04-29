import type {
  Constraints,
  Doc,
  Effect,
  Fill,
  LayoutGridItem,
  Node,
  NodeStyle,
  Stroke,
  StyleToken,
  TextStyle,
  Variable,
} from "@/advanced/doc/scene";
import { pathDataToBounds, rectToPath, ellipseToPath, polygonToPathD, translatePathD } from "@/advanced/geom/pathData";
import { stringifyGridTrackSizing } from "@/advanced/layout/autoLayoutGrid";
import { resolveNodeTextStyle as resolveBoundNodeTextStyle, resolveNodeTextValue as resolveBoundNodeTextValue } from "@/advanced/geom/variableBindings";
import { pathDataFromVectorNetwork, primaryPathDataFromShape, segmentsFromVectorNetwork } from "@/advanced/geom/vectorNetwork";
import { buildFigmaFlowStartingPoints, buildFigmaNodePrototypeFields } from "./prototypeFigmaInterop";
import { buildSemanticVectorWrapperChildName, collectSemanticVectorExportPaths, shouldExportSemanticVectorWrapper } from "./vectorSemanticRoundtrip";
import { buildSharedPluginDataForNode } from "./figmaSharedMetadata";
import type {
  FigmaEffect,
  FigmaFileResponse,
  FigmaLayoutConstraint,
  FigmaLayoutGrid,
  FigmaLocalVariable,
  FigmaLocalVariableCollection,
  FigmaLocalVariablesResponse,
  FigmaNode,
  FigmaPaint,
  FigmaRGBA,
  FigmaStyleMeta,
  FigmaTypeStyle,
  FigmaVariableAlias,
  FigmaVariableValue,
} from "./figma";

type ExportContext = {
  doc: Doc;
  fileName: string;
  now: string;
  nodeIds: Map<string, string>;
  styleIds: Map<string, string>;
  variableIds: Map<string, string>;
  modeIds: Map<string, string>;
  componentIds: Map<string, string>;
  variantIds: Map<string, string>;
  componentPropertyNames: Map<string, Record<string, string>>;
  ownedVariantRoots: Set<string>;
};

export type NullToFigmaExportPayload = {
  file: FigmaFileResponse;
  localVariables: FigmaLocalVariablesResponse;
};

function sanitizeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function toFigmaNodeId(nodeId: string) {
  return `null_${sanitizeId(nodeId)}`;
}

function toFigmaStyleId(styleId: string) {
  return `S:null_${sanitizeId(styleId)}`;
}

function toFigmaVariableId(variableId: string) {
  return `VariableID:null_${sanitizeId(variableId)}`;
}

function toFigmaModeId(modeName: string) {
  return `mode_${sanitizeId(modeName || "default")}`;
}

function parseHexColor(color: string): { r: number; g: number; b: number; a: number } {
  const value = color.trim().replace(/^#/, "");
  if (value.length === 3) {
    const r = parseInt(value[0] + value[0], 16);
    const g = parseInt(value[1] + value[1], 16);
    const b = parseInt(value[2] + value[2], 16);
    return { r, g, b, a: 255 };
  }
  if (value.length === 4) {
    const r = parseInt(value[0] + value[0], 16);
    const g = parseInt(value[1] + value[1], 16);
    const b = parseInt(value[2] + value[2], 16);
    const a = parseInt(value[3] + value[3], 16);
    return { r, g, b, a };
  }
  if (value.length === 8) {
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
      a: parseInt(value.slice(6, 8), 16),
    };
  }
  return {
    r: parseInt(value.slice(0, 2) || "00", 16),
    g: parseInt(value.slice(2, 4) || "00", 16),
    b: parseInt(value.slice(4, 6) || "00", 16),
    a: 255,
  };
}

function hexToRgba(color: string, opacity = 1): FigmaRGBA {
  const parsed = parseHexColor(color);
  const alpha = Math.max(0, Math.min(1, (parsed.a / 255) * opacity));
  return {
    r: parsed.r / 255,
    g: parsed.g / 255,
    b: parsed.b / 255,
    a: alpha,
  };
}

function cloneFill(fill: Fill): Fill {
  if (fill.type === "linear" || fill.type === "radial") {
    return {
      ...fill,
      stops: fill.stops?.map((stop) => ({ ...stop })),
    };
  }
  return { ...fill };
}

function normalizeFillTokenValue(value: unknown): Fill[] | undefined {
  if (Array.isArray(value)) {
    return value.map((fill) => cloneFill(fill as Fill));
  }
  if (value && typeof value === "object" && "type" in (value as Record<string, unknown>)) {
    return [cloneFill(value as Fill)];
  }
  return undefined;
}

function normalizeStrokeTokenValue(value: unknown): Stroke[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((stroke) => ({ ...(stroke as Stroke), dash: (stroke as Stroke).dash ? [...((stroke as Stroke).dash as number[])] : undefined }));
}

function normalizeEffectTokenValue(value: unknown): Effect[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((effect) => ({ ...(effect as Effect) }));
}

function normalizeTextTokenValue(value: unknown): TextStyle | undefined {
  if (!value || typeof value !== "object") return undefined;
  return { ...(value as TextStyle) };
}

function getStyleToken(doc: Doc, styleId: string | undefined, type: StyleToken["type"]) {
  if (!styleId) return undefined;
  return doc.styles.find((style) => style.id === styleId && style.type === type);
}

function resolveNodeFills(node: Node, doc: Doc): Fill[] {
  const token = getStyleToken(doc, node.style.fillStyleId, "fill");
  return normalizeFillTokenValue(token?.value) ?? node.style.fills.map((fill) => cloneFill(fill));
}

function resolveNodeStrokes(node: Node, doc: Doc): Stroke[] {
  const token = getStyleToken(doc, node.style.strokeStyleId, "stroke");
  return normalizeStrokeTokenValue(token?.value) ?? node.style.strokes.map((stroke) => ({ ...stroke, dash: stroke.dash ? [...stroke.dash] : undefined }));
}

function resolveNodeEffects(node: Node, doc: Doc): Effect[] {
  const token = getStyleToken(doc, node.style.effectStyleId, "effect");
  return normalizeEffectTokenValue(token?.value) ?? node.style.effects.map((effect) => ({ ...effect }));
}

function resolveNodeTextStyle(node: Node, doc: Doc): TextStyle | undefined {
  if (!node.text) return undefined;
  const token = getStyleToken(doc, node.text.styleRef, "text");
  const tokenStyle = normalizeTextTokenValue(token?.value);
  const merged = tokenStyle ? { ...node.text.style, ...tokenStyle } : { ...node.text.style };
  return resolveBoundNodeTextStyle(doc, node.text, merged);
}

function buildLinearHandles(angle: number) {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.cos(radians) * 0.5;
  const dy = Math.sin(radians) * 0.5;
  return [
    { x: 0.5 - dx, y: 0.5 - dy },
    { x: 0.5 + dx, y: 0.5 + dy },
  ];
}

function buildRadialHandles(fill: Extract<Fill, { type: "radial" }>) {
  return [
    { x: fill.cx ?? 0.5, y: fill.cy ?? 0.5 },
    { x: (fill.cx ?? 0.5) + (fill.r ?? 0.5), y: fill.cy ?? 0.5 },
  ];
}

function buildPaintBoundVariables(alias: FigmaVariableAlias | undefined) {
  if (!alias) return undefined;
  return { color: alias };
}

function resolveFillStopAlias(ctx: ExportContext, variableId: string | undefined) {
  return resolveVariableAlias(ctx, variableId);
}

function convertGradientStops(
  fill: Extract<Fill, { type: "linear" | "radial" }>,
  ctx: ExportContext,
  fallbackAlias?: FigmaVariableAlias,
) {
  if (fill.stops?.length) {
    return fill.stops.map((stop) => ({
      position: stop.offset,
      color: hexToRgba(stop.color, fill.opacity ?? 1),
      boundVariables: buildPaintBoundVariables(resolveFillStopAlias(ctx, stop.colorRef) ?? fallbackAlias),
    }));
  }
  return [
    { position: 0, color: hexToRgba(fill.from, fill.opacity ?? 1), boundVariables: buildPaintBoundVariables(fallbackAlias) },
    { position: 1, color: hexToRgba(fill.to, fill.opacity ?? 1), boundVariables: buildPaintBoundVariables(fallbackAlias) },
  ];
}

function convertFillToPaint(fill: Fill, ctx: ExportContext, colorAlias?: FigmaVariableAlias): FigmaPaint {
  if (fill.type === "solid") {
    return {
      type: "SOLID",
      color: hexToRgba(fill.color, fill.opacity ?? 1),
      opacity: fill.opacity ?? 1,
      boundVariables: buildPaintBoundVariables(colorAlias),
    };
  }

  if (fill.type === "linear") {
    const stops = convertGradientStops(fill, ctx, colorAlias);
    return {
      type: "GRADIENT_LINEAR",
      gradientHandlePositions: buildLinearHandles(fill.angle),
      gradientStops: stops,
      opacity: fill.opacity ?? 1,
      boundVariables: buildPaintBoundVariables(colorAlias),
    };
  }

  if (fill.type === "radial") {
    const stops = convertGradientStops(fill, ctx, colorAlias);
    return {
      type: "GRADIENT_RADIAL",
      gradientHandlePositions: buildRadialHandles(fill),
      gradientStops: stops,
      opacity: fill.opacity ?? 1,
      boundVariables: buildPaintBoundVariables(colorAlias),
    };
  }

  return {
    type: "IMAGE",
    imageRef: fill.src || "null_image",
    scaleMode: fill.fit === "contain" ? "FIT" : fill.fit === "fill" ? "STRETCH" : "FILL",
    boundVariables: buildPaintBoundVariables(colorAlias),
  };
}

function convertStrokeToPaint(stroke: Stroke, colorAlias?: FigmaVariableAlias): FigmaPaint {
  return {
    type: "SOLID",
    color: hexToRgba(stroke.color),
    boundVariables: buildPaintBoundVariables(colorAlias),
  };
}

function convertEffect(effect: Effect, ctx: ExportContext): FigmaEffect | null {
  if (effect.type === "shadow") {
    return {
      type: "DROP_SHADOW",
      color: hexToRgba(effect.color, effect.opacity ?? 1),
      offset: { x: effect.x, y: effect.y },
      radius: effect.blur,
      visible: true,
      boundVariables: {
        color: resolveVariableAlias(ctx, effect.colorRef),
        radius: resolveVariableAlias(ctx, effect.blurRef),
        offsetX: resolveVariableAlias(ctx, effect.xRef),
        offsetY: resolveVariableAlias(ctx, effect.yRef),
      },
    };
  }
  if (effect.type === "blur") {
    return {
      type: "LAYER_BLUR",
      radius: effect.blur,
      visible: true,
      boundVariables: {
        radius: resolveVariableAlias(ctx, effect.blurRef),
      },
    };
  }
  return null;
}

function exportTextCase(style: TextStyle) {
  if (style.textCase === "upper") return "UPPER";
  if (style.textCase === "lower") return "LOWER";
  if (style.textCase === "capitalize") return "TITLE";
  return "ORIGINAL";
}

function exportTextAlign(style: TextStyle) {
  if (style.align === "center") return "CENTER";
  if (style.align === "right") return "RIGHT";
  if (style.align === "justify") return "JUSTIFIED";
  return "LEFT";
}

function exportTextStyle(style: TextStyle, node: Node, textBindings?: FigmaTypeStyle["boundVariables"]): NonNullable<FigmaNode["style"]> {
  const fontFamily = style.fontFamily.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "") || style.fontFamily;
  const autoResize =
    node.text?.autoSize
      ? "WIDTH_AND_HEIGHT"
      : node.text?.wrap === false
        ? "TRUNCATE"
        : node.layoutSizing?.height === "hug"
          ? "HEIGHT"
          : "NONE";
  return {
    fontFamily,
    fontWeight: style.fontWeight,
    fontSize: style.fontSize,
    fontFeatureSettings: style.fontFeatureSettings,
    fontVariationSettings: style.fontVariationSettings,
    letterSpacing: style.letterSpacing,
    paragraphSpacing: style.paragraphSpacing,
    lineHeightPx: style.fontSize * style.lineHeight,
    lineHeightPercentFontSize: style.lineHeight * 100,
    lineHeightUnit: "FONT_SIZE_%",
    textAlignHorizontal: exportTextAlign(style),
    textCase: exportTextCase(style),
    textDecoration: style.underline ? "UNDERLINE" : style.lineThrough ? "STRIKETHROUGH" : "NONE",
    textAutoResize: autoResize,
    italic: style.italic,
    boundVariables: textBindings,
  };
}

function buildTextStyleOverride(style: TextStyle, node: Node, fill: string | undefined, bindings?: FigmaTypeStyle["boundVariables"]): FigmaTypeStyle {
  const exported = exportTextStyle(style, node, bindings);
  if (fill) {
    exported.fills = [{ type: "SOLID", color: hexToRgba(fill) }];
  }
  return exported;
}

function buildTextStyleOverrides(node: Node, doc: Doc, ctx: ExportContext): Pick<FigmaNode, "styleOverrideTable" | "characterStyleOverrides"> {
  const text = node.text;
  if (!text?.ranges?.length || !text.value.length) return {};
  const baseStyle = resolveNodeTextStyle(node, doc) ?? text.style;
  const charOverrides = Array.from({ length: text.value.length }, () => 0);
  const styleOverrideTable: Record<string, FigmaTypeStyle> = {};
  const indexByKey = new Map<string, number>();
  let nextIndex = 1;

  text.ranges.forEach((range) => {
    const start = Math.max(0, Math.min(text.value.length, Math.floor(range.start)));
    const end = Math.max(0, Math.min(text.value.length, Math.floor(range.end)));
    if (end <= start) return;
    const mergedStyle = { ...baseStyle, ...(range.style ?? {}) };
    const overrideBindings = buildTextStyleBoundVariables(
      {
        ...node,
        text: {
          ...text,
          style: mergedStyle,
          styleBindings: range.styleBindings ?? text.styleBindings,
        },
      },
      ctx,
    );
    const fill = range.fill ?? (range.fillRef ? undefined : undefined);
    const override = buildTextStyleOverride(
      mergedStyle,
      { ...node, text: { ...text, style: mergedStyle } },
      fill,
      overrideBindings,
    );
    if (range.fillRef) {
      override.fills = [
        {
          type: "SOLID",
          color: hexToRgba(range.fill ?? "#000000"),
          boundVariables: buildPaintBoundVariables(resolveVariableAlias(ctx, range.fillRef)),
        },
      ];
    }
    const key = JSON.stringify(override);
    let overrideIndex = indexByKey.get(key);
    if (!overrideIndex) {
      overrideIndex = nextIndex;
      nextIndex += 1;
      indexByKey.set(key, overrideIndex);
      styleOverrideTable[String(overrideIndex)] = override;
    }
    for (let index = start; index < end; index += 1) {
      charOverrides[index] = overrideIndex;
    }
  });

  return Object.keys(styleOverrideTable).length
    ? {
        styleOverrideTable,
        characterStyleOverrides: charOverrides,
      }
    : {};
}

function exportLayoutMode(node: Node): Pick<
  FigmaNode,
  | "layoutMode"
  | "gridRowCount"
  | "gridColumnCount"
  | "gridRowGap"
  | "gridColumnGap"
  | "gridRowsSizing"
  | "gridColumnsSizing"
  | "primaryAxisAlignItems"
  | "counterAxisAlignItems"
  | "counterAxisAlignContent"
  | "paddingLeft"
  | "paddingRight"
  | "paddingTop"
  | "paddingBottom"
  | "itemSpacing"
  | "counterAxisSpacing"
  | "layoutWrap"
  | "strokesIncludedInLayout"
> {
  if (!node.layout) {
    return { layoutMode: "NONE" };
  }
  if (node.layout.mode === "grid") {
    return {
      layoutMode: "GRID",
      gridRowCount: Math.max(1, node.layout.rows),
      gridColumnCount: Math.max(1, node.layout.columns),
      gridRowGap: Math.max(0, node.layout.rowGap),
      gridColumnGap: Math.max(0, node.layout.columnGap),
      gridRowsSizing: stringifyGridTrackSizing(node.layout.rowsSizing, Math.max(1, node.layout.rows), { type: "hug" }),
      gridColumnsSizing: stringifyGridTrackSizing(node.layout.columnsSizing, Math.max(1, node.layout.columns), { type: "flex", value: 1 }),
      paddingLeft: node.layout.padding.l,
      paddingRight: node.layout.padding.r,
      paddingTop: node.layout.padding.t,
      paddingBottom: node.layout.padding.b,
    };
  }
  if (node.layout.mode !== "auto") {
    return { layoutMode: "NONE" };
  }

  const align =
    node.layout.align === "center"
      ? "CENTER"
      : node.layout.align === "end"
        ? "MAX"
        : node.layout.align === "stretch"
          ? "STRETCH"
          : node.layout.align === "baseline"
            ? "BASELINE"
            : "MIN";
  const justify =
    node.layout.justify === "center"
      ? "CENTER"
      : node.layout.justify === "end"
        ? "MAX"
        : node.layout.justify === "space-between"
          ? "SPACE_BETWEEN"
          : "MIN";

  return {
    layoutMode: node.layout.dir === "row" ? "HORIZONTAL" : "VERTICAL",
    primaryAxisAlignItems: justify,
    counterAxisAlignItems: align,
    counterAxisAlignContent: node.layout.wrapAlign === "space-between" ? "SPACE_BETWEEN" : "AUTO",
    paddingLeft: node.layout.padding.l,
    paddingRight: node.layout.padding.r,
    paddingTop: node.layout.padding.t,
    paddingBottom: node.layout.padding.b,
    itemSpacing: node.layout.gap,
    counterAxisSpacing: node.layout.wrapGap ?? node.layout.gap,
    layoutWrap: node.layout.wrap ? "WRAP" : "NO_WRAP",
    strokesIncludedInLayout: node.layout.includeStrokeInBounds ?? false,
  };
}

function hasAutoLayoutParent(doc: Doc, node: Node) {
  if (!node.parentId) return false;
  return doc.nodes[node.parentId]?.layout?.mode === "auto";
}

function exportLayoutSizing(node: Node, doc: Doc): Pick<
  FigmaNode,
  | "layoutSizingHorizontal"
  | "layoutSizingVertical"
  | "primaryAxisSizingMode"
  | "counterAxisSizingMode"
  | "layoutPositioning"
  | "layoutGrow"
  | "layoutAlign"
  | "minWidth"
  | "maxWidth"
  | "minHeight"
  | "maxHeight"
> {
  const absolutePositioning = node.layoutPositioning === "absolute";
  const widthMode = absolutePositioning && node.layoutSizing?.width === "fill"
    ? "fixed"
    : (node.layoutSizing?.width ?? "fixed");
  const heightMode = absolutePositioning && node.layoutSizing?.height === "fill"
    ? "fixed"
    : (node.layoutSizing?.height ?? "fixed");
  const width = widthMode === "fill" ? "FILL" : widthMode === "hug" ? "HUG" : "FIXED";
  const height = heightMode === "fill" ? "FILL" : heightMode === "hug" ? "HUG" : "FIXED";
  const isAutoRow = node.layout?.mode === "auto" && node.layout.dir === "row";
  const isAutoColumn = node.layout?.mode === "auto" && node.layout.dir === "column";
  const parentIsAutoLayout = hasAutoLayoutParent(doc, node);

  return {
    layoutSizingHorizontal: width,
    layoutSizingVertical: height,
    primaryAxisSizingMode: isAutoRow ? (width === "HUG" ? "AUTO" : "FIXED") : isAutoColumn ? (height === "HUG" ? "AUTO" : "FIXED") : "FIXED",
    counterAxisSizingMode: isAutoRow ? (height === "HUG" ? "AUTO" : "FIXED") : isAutoColumn ? (width === "HUG" ? "AUTO" : "FIXED") : "FIXED",
    layoutPositioning: parentIsAutoLayout ? (absolutePositioning ? "ABSOLUTE" : "AUTO") : undefined,
    layoutGrow: absolutePositioning ? 0 : (widthMode === "fill" || heightMode === "fill" ? 1 : 0),
    layoutAlign: absolutePositioning ? "INHERIT" : (widthMode === "fill" || heightMode === "fill" ? "STRETCH" : "INHERIT"),
    minWidth: node.layoutSizing?.minWidth,
    maxWidth: node.layoutSizing?.maxWidth,
    minHeight: node.layoutSizing?.minHeight,
    maxHeight: node.layoutSizing?.maxHeight,
  };
}

function exportConstraints(constraints: Constraints | undefined): FigmaLayoutConstraint | undefined {
  if (!constraints) return undefined;
  const horizontal =
    constraints.scaleX
      ? "SCALE"
      : constraints.hCenter
        ? "CENTER"
        : constraints.left && constraints.right
          ? "LEFT_RIGHT"
          : constraints.right
            ? "RIGHT"
            : "LEFT";
  const vertical =
    constraints.scaleY
      ? "SCALE"
      : constraints.vCenter
        ? "CENTER"
        : constraints.top && constraints.bottom
          ? "TOP_BOTTOM"
          : constraints.bottom
            ? "BOTTOM"
            : "TOP";
  return { horizontal, vertical };
}

function exportGridChild(node: Node, doc: Doc): Pick<
  FigmaNode,
  | "gridColumnAnchorIndex"
  | "gridRowAnchorIndex"
  | "gridColumnSpan"
  | "gridRowSpan"
  | "gridChildHorizontalAlign"
  | "gridChildVerticalAlign"
> {
  const parent = node.parentId ? doc.nodes[node.parentId] : null;
  if (parent?.layout?.mode !== "grid") return {};
  return {
    gridColumnAnchorIndex: (node.gridChild?.column ?? 0) + 1,
    gridRowAnchorIndex: (node.gridChild?.row ?? 0) + 1,
    gridColumnSpan: Math.max(1, node.gridChild?.columnSpan ?? 1),
    gridRowSpan: Math.max(1, node.gridChild?.rowSpan ?? 1),
    gridChildHorizontalAlign:
      node.gridChild?.horizontalAlign === "center"
        ? "CENTER"
        : node.gridChild?.horizontalAlign === "end"
          ? "MAX"
          : node.gridChild?.horizontalAlign === "start"
            ? "MIN"
            : "AUTO",
    gridChildVerticalAlign:
      node.gridChild?.verticalAlign === "center"
        ? "CENTER"
        : node.gridChild?.verticalAlign === "end"
          ? "MAX"
          : node.gridChild?.verticalAlign === "start"
            ? "MIN"
            : "AUTO",
  };
}

function exportLayoutGrids(grids: LayoutGridItem[] | undefined): FigmaLayoutGrid[] | undefined {
  if (!grids?.length) return undefined;
  return grids.map((grid) => {
    if (grid.type === "columns") {
      return {
        pattern: "COLUMNS",
        count: grid.count,
        sectionSize: grid.width,
        gutterSize: grid.gutter,
        offset: grid.offset,
        alignment:
          grid.alignment === "center"
            ? "CENTER"
            : grid.alignment === "stretch"
              ? "STRETCH"
              : "MIN",
        visible: true,
        color: grid.color ? hexToRgba(grid.color, grid.opacity ?? 1) : undefined,
      };
    }
    if (grid.type === "rows") {
      return {
        pattern: "ROWS",
        count: grid.count,
        sectionSize: grid.height,
        gutterSize: grid.gutter,
        offset: grid.offset,
        alignment:
          grid.alignment === "center"
            ? "CENTER"
            : grid.alignment === "stretch"
              ? "STRETCH"
              : "MIN",
        visible: true,
        color: grid.color ? hexToRgba(grid.color, grid.opacity ?? 1) : undefined,
      };
    }
    return {
      pattern: "GRID",
      sectionSize: grid.cellSize,
      visible: true,
      color: grid.color ? hexToRgba(grid.color, grid.opacity ?? 1) : undefined,
    };
  });
}

function exportExportSettings(node: Node): NonNullable<FigmaNode["exportSettings"]> | undefined {
  if (!node.exportSettings?.length) return undefined;
  return node.exportSettings.map((setting) => ({
    format: setting.format.toUpperCase(),
    constraint: { type: "SCALE", value: setting.scale },
  }));
}

function exportOverflow(node: Node) {
  if (node.overflowScrolling === "vertical") return "VERTICAL_SCROLLING";
  if (node.overflowScrolling === "horizontal") return "HORIZONTAL_SCROLLING";
  if (node.overflowScrolling === "both") return "HORIZONTAL_AND_VERTICAL_SCROLLING";
  return "NONE";
}

function exportBlendMode(style: NodeStyle) {
  if (style.blendMode === "multiply") return "MULTIPLY";
  if (style.blendMode === "screen") return "SCREEN";
  if (style.blendMode === "overlay") return "OVERLAY";
  if (style.blendMode === "darken") return "DARKEN";
  if (style.blendMode === "lighten") return "LIGHTEN";
  if (style.blendMode === "color-burn") return "COLOR_BURN";
  if (style.blendMode === "color-dodge") return "COLOR_DODGE";
  if (style.blendMode === "hard-light") return "HARD_LIGHT";
  if (style.blendMode === "soft-light") return "SOFT_LIGHT";
  if (style.blendMode === "difference") return "DIFFERENCE";
  if (style.blendMode === "exclusion") return "EXCLUSION";
  if (style.blendMode === "hue") return "HUE";
  if (style.blendMode === "saturation") return "SATURATION";
  if (style.blendMode === "color") return "COLOR";
  if (style.blendMode === "luminosity") return "LUMINOSITY";
  return "NORMAL";
}

function exportStrokeAlign(stroke: Stroke | undefined) {
  if (stroke?.align === "outside") return "OUTSIDE";
  if (stroke?.align === "center") return "CENTER";
  return "INSIDE";
}

function exportStrokeCap(style: NodeStyle) {
  if (style.strokeCap === "round") return "ROUND";
  if (style.strokeCap === "square") return "SQUARE";
  return "NONE";
}

function exportStrokeJoin(style: NodeStyle) {
  if (style.strokeJoin === "round") return "ROUND";
  if (style.strokeJoin === "bevel") return "BEVEL";
  return "MITER";
}

function exportRadius(style: NodeStyle) {
  if (typeof style.radius === "number") {
    return { cornerRadius: style.radius };
  }
  if (style.radius && typeof style.radius === "object") {
    return {
      rectangleCornerRadii: [style.radius.tl, style.radius.tr, style.radius.br, style.radius.bl],
    };
  }
  return {};
}

function exportBooleanOperation(op: "union" | "subtract" | "intersect" | "exclude") {
  if (op === "subtract") return "SUBTRACT";
  if (op === "intersect") return "INTERSECT";
  if (op === "exclude") return "EXCLUDE";
  return "UNION";
}

function buildGeometryPaths(node: Node): string[] {
  if (node.shape?.segments?.length) {
    return node.shape.segments.map((segment) => segment.d).filter(Boolean);
  }
  const vectorSegments = segmentsFromVectorNetwork(node.shape?.vectorNetwork);
  if (vectorSegments?.length) {
    return vectorSegments.map((segment) => segment.d).filter(Boolean);
  }
  const primary = primaryPathDataFromShape(node.shape);
  return primary ? [primary] : [];
}

function buildDefaultPathForNode(node: Node): string | undefined {
  if (node.type === "rect") return rectToPath({ x: 0, y: 0, w: node.frame.w, h: node.frame.h });
  if (node.type === "ellipse") return ellipseToPath({ x: 0, y: 0, w: node.frame.w, h: node.frame.h });
  if (node.type === "polygon") {
    const sides = Math.max(3, Math.round(node.shape?.polygonSides ?? 6));
    const cx = node.frame.w / 2;
    const cy = node.frame.h / 2;
    const radius = Math.min(node.frame.w, node.frame.h) / 2;
    const ring = Array.from({ length: sides }).map((_, index) => {
      const angle = (Math.PI * 2 * index) / sides - Math.PI / 2;
      return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    });
    return polygonToPathD(ring);
  }
  if (node.type === "star") {
    const points = Math.max(3, Math.round(node.shape?.starPoints ?? 5));
    const innerRatio = Math.max(0.1, Math.min(0.9, node.shape?.starInnerRatio ?? 0.5));
    const cx = node.frame.w / 2;
    const cy = node.frame.h / 2;
    const outer = Math.min(node.frame.w, node.frame.h) / 2;
    const inner = outer * innerRatio;
    const ring: number[][] = [];
    for (let index = 0; index < points * 2; index += 1) {
      const radius = index % 2 === 0 ? outer : inner;
      const angle = (Math.PI * index) / points - Math.PI / 2;
      ring.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
    }
    return polygonToPathD(ring);
  }
  if (node.type === "line" || node.type === "arrow") {
    return `M 0 0 L ${node.frame.w} ${node.frame.h}`;
  }
  return undefined;
}

function buildFillGeometry(node: Node) {
  const paths = buildGeometryPaths(node);
  const source = paths.length
    ? paths
    : (() => {
        const fallback = buildDefaultPathForNode(node);
        return fallback ? [fallback] : [];
      })();
  return source.length ? source.map((path) => ({ path })) : undefined;
}

function buildAbsoluteBoundingBox(absX: number, absY: number, width: number, height: number) {
  return {
    x: absX,
    y: absY,
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function resolveVariableAlias(ctx: ExportContext, variableId: string | undefined): FigmaVariableAlias | undefined {
  if (!variableId) return undefined;
  const id = ctx.variableIds.get(variableId);
  return id ? { type: "VARIABLE_ALIAS", id } : undefined;
}

function buildNodeStyleRefs(node: Node, ctx: ExportContext) {
  const refs: Record<string, string> = {};
  if (node.style.fillStyleId) {
    const id = ctx.styleIds.get(node.style.fillStyleId);
    if (id) refs.FILL = id;
  }
  if (node.style.strokeStyleId) {
    const id = ctx.styleIds.get(node.style.strokeStyleId);
    if (id) refs.STROKE = id;
  }
  if (node.style.effectStyleId) {
    const id = ctx.styleIds.get(node.style.effectStyleId);
    if (id) refs.EFFECT = id;
  }
  if (node.text?.styleRef) {
    const id = ctx.styleIds.get(node.text.styleRef);
    if (id) refs.TEXT = id;
  }
  return Object.keys(refs).length ? refs : undefined;
}

function buildBoundVariables(node: Node, ctx: ExportContext) {
  const fillAlias = resolveVariableAlias(ctx, node.style.fillRef);
  const strokeAlias = resolveVariableAlias(ctx, node.style.strokeRef);
  const charactersAlias = node.text?.valueRef ? resolveVariableAlias(ctx, node.text.valueRef) : undefined;
  if (!fillAlias && !strokeAlias && !charactersAlias) return undefined;
  return {
    fills: fillAlias ? [fillAlias] : undefined,
    strokes: strokeAlias ? [strokeAlias] : undefined,
    characters: charactersAlias,
  };
}

function buildTextStyleBoundVariables(node: Node, ctx: ExportContext): FigmaTypeStyle["boundVariables"] | undefined {
  const bindings = node.text?.styleBindings;
  if (!bindings) return undefined;
  const next: NonNullable<FigmaTypeStyle["boundVariables"]> = {};
  const keys = ["fontFamily", "fontWeight", "fontSize", "lineHeight", "letterSpacing", "paragraphSpacing"] as const;
  keys.forEach((key) => {
    const alias = resolveVariableAlias(ctx, bindings[key]);
    if (alias) next[key] = alias;
  });
  return Object.keys(next).length ? next : undefined;
}

function buildPropertyNameMap(componentNode: Node): Record<string, string> {
  const out: Record<string, string> = {};
  const definitions = componentNode.propertyDefinitions ?? {};
  Object.entries(definitions).forEach(([sourceId, definition]) => {
    out[sourceId] = `${definition.name}#${sourceId}`;
  });
  return out;
}

function buildComponentPropertyDefinitions(componentNode: Node, ctx: ExportContext) {
  const nameMap = ctx.componentPropertyNames.get(componentNode.id) ?? {};
  const definitions = componentNode.propertyDefinitions ?? {};
  const defs = Object.entries(definitions).reduce<Record<string, { type: string; defaultValue?: string | boolean | number }>>((acc, [sourceId, definition]) => {
    const propertyName = nameMap[sourceId];
    if (!propertyName) return acc;
    acc[propertyName] = {
      type: definition.kind === "text" ? "TEXT" : definition.kind === "boolean" ? "BOOLEAN" : "INSTANCE_SWAP",
    };
    return acc;
  }, {});
  return Object.keys(defs).length ? defs : undefined;
}

function buildComponentPropertyReferences(
  componentNode: Node | undefined,
  currentNode: Node,
  ctx: ExportContext,
  options?: { currentIsExportRoot?: boolean },
) {
  if (!componentNode?.propertyDefinitions) return undefined;
  const nameMap = ctx.componentPropertyNames.get(componentNode.id) ?? {};
  const refs: Record<string, string> = {};
  const sourceKeys = new Set<string>();
  if (currentNode.sourceId) sourceKeys.add(currentNode.sourceId);
  sourceKeys.add(currentNode.id);
  if (options?.currentIsExportRoot) {
    sourceKeys.add(componentNode.id);
  }

  sourceKeys.forEach((sourceKey) => {
    const definition = componentNode.propertyDefinitions?.[sourceKey];
    const propertyName = nameMap[sourceKey];
    if (!definition || !propertyName) return;
    if (definition.kind === "text") refs.characters = propertyName;
    if (definition.kind === "boolean") refs.visible = propertyName;
    if (definition.kind === "instance") refs.mainComponent = propertyName;
  });

  return Object.keys(refs).length ? refs : undefined;
}

function collectSubtreeNodes(doc: Doc, rootId: string, out: Node[] = []): Node[] {
  const node = doc.nodes[rootId];
  if (!node) return out;
  out.push(node);
  node.children.forEach((childId) => collectSubtreeNodes(doc, childId, out));
  return out;
}

function resolveComponentVariantRoot(doc: Doc, componentNode: Node, variantId?: string) {
  if (componentNode.variants?.length) {
    const variant = variantId
      ? componentNode.variants.find((item) => item.id === variantId) ?? componentNode.variants[0]
      : componentNode.variants[0];
    return variant ? doc.nodes[variant.rootId] ?? null : null;
  }
  if (componentNode.children[0]) return doc.nodes[componentNode.children[0]] ?? null;
  return componentNode;
}

function resolveExportedComponentReference(ctx: ExportContext, componentNode: Node, variantId?: string) {
  if (componentNode.variants?.length) {
    const chosen = variantId
      ? componentNode.variants.find((variant) => variant.id === variantId) ?? componentNode.variants[0]
      : componentNode.variants[0];
    if (chosen) {
      return ctx.variantIds.get(chosen.id) ?? ctx.componentIds.get(componentNode.id);
    }
  }
  return ctx.componentIds.get(componentNode.id);
}

function deriveInstancePropertyValue(
  instanceNode: Node,
  componentNode: Node,
  sourceId: string,
  kind: "text" | "boolean" | "instance",
  ctx: ExportContext,
) {
  const instanceSubtree = instanceNode.children.length ? collectSubtreeNodes(ctx.doc, instanceNode.id) : [];
  const sourceSubtreeRoot = resolveComponentVariantRoot(ctx.doc, componentNode, instanceNode.variantId);
  const sourceSubtree = sourceSubtreeRoot ? collectSubtreeNodes(ctx.doc, sourceSubtreeRoot.id) : [];
  const instanceTarget =
    instanceSubtree.find((node) => node.sourceId === sourceId || node.id === sourceId) ??
    null;
  const sourceTarget =
    sourceSubtree.find((node) => node.sourceId === sourceId || node.id === sourceId) ??
    ctx.doc.nodes[sourceId] ??
    null;

  if (kind === "text") {
    if (instanceTarget?.text?.value != null) return instanceTarget.text.value;
    if (instanceNode.overrides?.text?.value != null) return instanceNode.overrides.text.value;
    return sourceTarget?.text?.value;
  }

  if (kind === "boolean") {
    if (instanceTarget) return !instanceTarget.hidden;
    if (typeof instanceNode.overrides?.hidden === "boolean") return !instanceNode.overrides.hidden;
    return sourceTarget ? !Boolean(sourceTarget.hidden) : true;
  }

  const targetInstance = instanceTarget?.type === "instance" ? instanceTarget : null;
  const overrideInstanceOf = instanceNode.overrides?.instanceOf;
  const nextComponentId = targetInstance?.instanceOf ?? overrideInstanceOf ?? (sourceTarget?.type === "instance" ? sourceTarget.instanceOf : undefined);
  const nextVariantId =
    targetInstance?.variantId ??
    instanceNode.overrides?.variantId ??
    (sourceTarget?.type === "instance" ? sourceTarget.variantId : undefined);
  if (!nextComponentId) return undefined;
  const nextComponent = ctx.doc.nodes[nextComponentId];
  if (!nextComponent || nextComponent.type !== "component") return undefined;
  return resolveExportedComponentReference(ctx, nextComponent, nextVariantId);
}

function resolveExportedPageStartNodeId(ctx: ExportContext, pageId: string | undefined): string | undefined {
  if (!pageId) return undefined;
  const page = ctx.doc.pages.find((candidate) => candidate.id === pageId);
  if (!page) return undefined;
  const pageRoot = ctx.doc.nodes[page.rootId];
  const startChildId = pageRoot?.children.find((childId) => !ctx.ownedVariantRoots.has(childId));
  if (!startChildId) return undefined;
  return ctx.nodeIds.get(startChildId) ?? toFigmaNodeId(startChildId);
}

function resolveExportedPageName(ctx: ExportContext, pageId: string | undefined): string | undefined {
  if (!pageId) return undefined;
  return ctx.doc.pages.find((candidate) => candidate.id === pageId)?.name;
}

function buildInstanceComponentProperties(instanceNode: Node, componentNode: Node, ctx: ExportContext) {
  const nameMap = ctx.componentPropertyNames.get(componentNode.id) ?? {};
  const definitions = componentNode.propertyDefinitions ?? {};
  const entries = Object.entries(definitions).flatMap(([sourceId, definition]) => {
    const propertyName = nameMap[sourceId];
    if (!propertyName) return [];
    const value = deriveInstancePropertyValue(instanceNode, componentNode, sourceId, definition.kind, ctx);
    if (value == null) return [];
    return [[propertyName, { type: definition.kind === "text" ? "TEXT" : definition.kind === "boolean" ? "BOOLEAN" : "INSTANCE_SWAP", value }] as const];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function buildBaseNode(
  node: Node,
  ctx: ExportContext,
  absX: number,
  absY: number,
  options?: {
    figmaType?: string;
    componentOwner?: Node;
    currentIsExportRoot?: boolean;
  },
): FigmaNode {
  const fills = resolveNodeFills(node, ctx.doc);
  const strokes = resolveNodeStrokes(node, ctx.doc);
  const effects = resolveNodeEffects(node, ctx.doc);
  const fillAlias = resolveVariableAlias(ctx, node.style.fillRef);
  const strokeAlias = resolveVariableAlias(ctx, node.style.strokeRef);
  const figmaType = options?.figmaType ?? (() => {
    if (node.type === "frame") return "FRAME";
    if (node.type === "section") return "SECTION";
    if (node.type === "group") return "GROUP";
    if (node.type === "rect") return "RECTANGLE";
    if (node.type === "ellipse") return "ELLIPSE";
    if (node.type === "line" || node.type === "arrow") return "LINE";
    if (node.type === "polygon") return "REGULAR_POLYGON";
    if (node.type === "star") return "STAR";
    if (node.type === "path") return "VECTOR";
    if (node.type === "text") return "TEXT";
    if (node.type === "component") return "COMPONENT";
    if (node.type === "instance") return "INSTANCE";
    if (node.type === "slice") return "SLICE";
    if (node.type === "image") return "RECTANGLE";
    return "GROUP";
  })();
  const strokeWeight = strokes[0]?.width ?? (node.type === "line" || node.type === "arrow" ? 1 : undefined);
  const figmaNode: FigmaNode = {
    id: ctx.nodeIds.get(node.id) ?? toFigmaNodeId(node.id),
    name: node.name,
    type: figmaType,
    visible: node.hidden === true ? false : true,
    locked: node.locked ?? false,
    isMask: node.isMask ?? false,
    rotation: node.frame.rotation,
    absoluteBoundingBox: buildAbsoluteBoundingBox(absX, absY, node.frame.w, node.frame.h),
    fills:
      node.type === "image" && node.image
        ? [{ type: "IMAGE", imageRef: node.image.src || "null_image", scaleMode: node.image.fit === "contain" ? "FIT" : node.image.fit === "fill" ? "STRETCH" : "FILL" }]
        : fills.map((fill, index) => convertFillToPaint(fill, ctx, index === 0 ? fillAlias : undefined)),
    strokes: strokes.map((stroke, index) => convertStrokeToPaint(stroke, index === 0 ? strokeAlias : undefined)),
    strokeWeight,
    strokeAlign: exportStrokeAlign(strokes[0]),
    strokeDashes: strokes[0]?.dash ? [...strokes[0].dash] : undefined,
    strokeCap: exportStrokeCap(node.style),
    strokeJoin: exportStrokeJoin(node.style),
    opacity: node.style.opacity,
    blendMode: exportBlendMode(node.style),
    effects: effects.map((effect) => convertEffect(effect, ctx)).filter((effect): effect is FigmaEffect => Boolean(effect)),
    constraints: exportConstraints(node.constraints),
    layoutGrids: exportLayoutGrids(node.layoutGrid),
    clipsContent: node.clipContent ?? false,
    styles: buildNodeStyleRefs(node, ctx),
    boundVariables: buildBoundVariables(node, ctx),
    exportSettings: exportExportSettings(node),
    overflowDirection: exportOverflow(node),
    componentPropertyReferences: buildComponentPropertyReferences(options?.componentOwner, node, ctx, {
      currentIsExportRoot: options?.currentIsExportRoot,
    }),
    ...buildFigmaNodePrototypeFields(node, {
      resolvePageStartNodeId: (pageId) => resolveExportedPageStartNodeId(ctx, pageId),
      resolvePageName: (pageId) => resolveExportedPageName(ctx, pageId),
      resolveNodeFigmaId: (nodeId) => (nodeId ? ctx.nodeIds.get(nodeId) ?? toFigmaNodeId(nodeId) : undefined),
      resolveVariantFigmaId: (variantId) => (variantId ? ctx.variantIds.get(variantId) : undefined),
    }),
    ...exportGridChild(node, ctx.doc),
    ...exportLayoutMode(node),
    ...exportLayoutSizing(node, ctx.doc),
    ...exportRadius(node.style),
  };

  if (node.type === "polygon") {
    (figmaNode as FigmaNode & { pointCount?: number }).pointCount = Math.max(3, Math.round(node.shape?.polygonSides ?? 6));
  }
  if (node.type === "star") {
    (figmaNode as FigmaNode & { pointCount?: number }).pointCount = Math.max(3, Math.round(node.shape?.starPoints ?? 5));
  }
  if (node.type === "text" && node.text) {
    figmaNode.characters = resolveBoundNodeTextValue(ctx.doc, node.text);
    figmaNode.style = exportTextStyle(
      resolveNodeTextStyle(node, ctx.doc) ?? node.text.style,
      node,
      buildTextStyleBoundVariables(node, ctx),
    );
    Object.assign(figmaNode, buildTextStyleOverrides(node, ctx.doc, ctx));
  }
  if (node.type === "path" || node.type === "polygon" || node.type === "star" || node.type === "line" || node.type === "arrow") {
    figmaNode.fillGeometry = buildFillGeometry(node);
    figmaNode.strokeGeometry = figmaNode.fillGeometry;
  }

  figmaNode.sharedPluginData = buildSharedPluginDataForNode(node, figmaNode.sharedPluginData);

  return figmaNode;
}

type BooleanOperand = NonNullable<NonNullable<NonNullable<Node["shape"]>["booleanMeta"]>["operands"]>[number];

function exportOperandNode(
  operand: BooleanOperand,
  ctx: ExportContext,
  baseAbsX: number,
  baseAbsY: number,
  index: number,
): FigmaNode {
  const pathData = operand.pathData ?? pathDataFromVectorNetwork(operand.vectorNetwork);
  const operandBounds = operand.frame ?? (pathData ? pathDataToBounds(pathData) : { x: 0, y: 0, w: 100, h: 100 });
  const absX = baseAbsX + operandBounds.x;
  const absY = baseAbsY + operandBounds.y;
  const fills = operand.fills?.map((fill) => cloneFill(fill)) ?? [];
  const nodeType =
    operand.type === "rect"
      ? "RECTANGLE"
      : operand.type === "ellipse"
        ? "ELLIPSE"
        : operand.type === "polygon"
          ? "REGULAR_POLYGON"
          : operand.type === "star"
            ? "STAR"
            : operand.type === "line" || operand.type === "arrow"
              ? "LINE"
              : "VECTOR";
  const node: FigmaNode = {
    id: `${toFigmaNodeId(operand.sourceId ?? `operand_${index}`)}__operand`,
    name: operand.name ?? `Operand ${index + 1}`,
    type: nodeType,
    absoluteBoundingBox: buildAbsoluteBoundingBox(absX, absY, operandBounds.w, operandBounds.h),
    fills: fills.map((fill: Fill) => convertFillToPaint(fill, ctx)),
    children: [],
  };

  if (pathData) {
    node.fillGeometry = [{ path: pathData }];
    node.strokeGeometry = node.fillGeometry;
  }

  return node;
}

function exportComponentVariantNode(componentNode: Node, variant: NonNullable<Node["variants"]>[number], ctx: ExportContext, absX: number, absY: number) {
  const variantRoot = ctx.doc.nodes[variant.rootId];
  if (!variantRoot) {
    return buildBaseNode(componentNode, ctx, absX, absY, {
      figmaType: "COMPONENT",
      componentOwner: componentNode,
      currentIsExportRoot: true,
    });
  }
  const variantNode = buildBaseNode(variantRoot, ctx, absX + variantRoot.frame.x, absY + variantRoot.frame.y, {
    figmaType: "COMPONENT",
    componentOwner: componentNode,
    currentIsExportRoot: true,
  });
  variantNode.id = ctx.variantIds.get(variant.id) ?? `${toFigmaNodeId(variant.rootId)}__variant`;
  variantNode.name = variant.name || variantRoot.name;
  variantNode.variantProperties = variant.props ? { ...variant.props } : undefined;
  const children = variantRoot.children.map((childId) =>
    exportNodeTree(childId, ctx, absX + variantRoot.frame.x, absY + variantRoot.frame.y, {
      componentOwner: componentNode,
    }),
  );
  if (children.length) {
    variantNode.children = children;
  }
  return variantNode;
}

function exportComponentNode(componentNode: Node, ctx: ExportContext, absX: number, absY: number): FigmaNode {
  const componentDefinitions = buildComponentPropertyDefinitions(componentNode, ctx);

  if (componentNode.variants?.length && componentNode.variants.length > 1) {
    const setNode = buildBaseNode(componentNode, ctx, absX, absY, {
      figmaType: "COMPONENT_SET",
      componentOwner: componentNode,
      currentIsExportRoot: true,
    });
    setNode.id = ctx.componentIds.get(componentNode.id) ?? toFigmaNodeId(componentNode.id);
    setNode.componentPropertyDefinitions = componentDefinitions;
    setNode.children = componentNode.variants.map((variant) => exportComponentVariantNode(componentNode, variant, ctx, absX, absY));
    return setNode;
  }

  const sourceRoot = resolveComponentVariantRoot(ctx.doc, componentNode);
  const figmaNode = buildBaseNode(sourceRoot ?? componentNode, ctx, absX, absY, {
    figmaType: "COMPONENT",
    componentOwner: componentNode,
    currentIsExportRoot: true,
  });
  figmaNode.id = ctx.componentIds.get(componentNode.id) ?? toFigmaNodeId(componentNode.id);
  figmaNode.name = componentNode.name;
  figmaNode.componentPropertyDefinitions = componentDefinitions;
  const sourceChildren = sourceRoot && sourceRoot.id !== componentNode.id ? sourceRoot.children : componentNode.children;
  const childBaseX = sourceRoot && sourceRoot.id !== componentNode.id ? absX + sourceRoot.frame.x : absX;
  const childBaseY = sourceRoot && sourceRoot.id !== componentNode.id ? absY + sourceRoot.frame.y : absY;
  const children = sourceChildren.map((childId) => exportNodeTree(childId, ctx, childBaseX, childBaseY, {
    componentOwner: componentNode,
  }));
  if (children.length) {
    figmaNode.children = children;
  }
  return figmaNode;
}

function exportInstanceNode(node: Node, ctx: ExportContext, absX: number, absY: number): FigmaNode {
  const figmaNode = buildBaseNode(node, ctx, absX, absY, { figmaType: "INSTANCE" });
  const sourceComponent = node.instanceOf ? ctx.doc.nodes[node.instanceOf] : null;
  if (sourceComponent && sourceComponent.type === "component") {
    figmaNode.componentId = resolveExportedComponentReference(ctx, sourceComponent, node.variantId);
    const componentProperties = buildInstanceComponentProperties(node, sourceComponent, ctx);
    if (componentProperties) {
      figmaNode.componentProperties = componentProperties;
    }
  }

  const sourceRoot =
    sourceComponent && sourceComponent.type === "component"
      ? resolveComponentVariantRoot(ctx.doc, sourceComponent, node.variantId)
      : null;
  const childIds = node.children.length ? node.children : sourceRoot?.children ?? [];
  const baseX = node.children.length ? absX : absX - (sourceRoot?.frame.x ?? 0);
  const baseY = node.children.length ? absY : absY - (sourceRoot?.frame.y ?? 0);
  const children = childIds.map((childId) => exportNodeTree(childId, ctx, baseX, baseY));
  if (children.length) {
    figmaNode.children = children;
  }
  return figmaNode;
}

function exportSemanticVectorWrapperNode(
  node: Node,
  ctx: ExportContext,
  absX: number,
  absY: number,
  options?: {
    componentOwner?: Node;
    currentIsExportRoot?: boolean;
  },
): FigmaNode {
  const wrapperNode = buildBaseNode(node, ctx, absX, absY, {
    ...options,
    figmaType: "GROUP",
  });
  const fillAlias = resolveVariableAlias(ctx, node.style.fillRef);
  const strokeAlias = resolveVariableAlias(ctx, node.style.strokeRef);
  const strokes = resolveNodeStrokes(node, ctx.doc);
  const fallbackFills = resolveNodeFills(node, ctx.doc);
  const semanticPaths = collectSemanticVectorExportPaths(node);

  wrapperNode.children = semanticPaths.map((path, index) => {
    const bounds = pathDataToBounds(path.pathData);
    const localPath = translatePathD(path.pathData, -bounds.x, -bounds.y);
    const fills = (path.fills?.length ? path.fills : fallbackFills).map((fill, fillIndex) =>
      convertFillToPaint(fill, ctx, fillIndex === 0 ? fillAlias : undefined),
    );
    return {
      id: `${wrapperNode.id}__vector_${index}`,
      name: buildSemanticVectorWrapperChildName(path.pathId),
      type: "VECTOR",
      visible: node.hidden === true ? false : true,
      locked: node.locked ?? false,
      absoluteBoundingBox: buildAbsoluteBoundingBox(absX + bounds.x, absY + bounds.y, bounds.w, bounds.h),
      fills,
      strokes: strokes.map((stroke, strokeIndex) => convertStrokeToPaint(stroke, strokeIndex === 0 ? strokeAlias : undefined)),
      strokeWeight: strokes[0]?.width,
      strokeAlign: exportStrokeAlign(strokes[0]),
      strokeDashes: strokes[0]?.dash ? [...strokes[0].dash] : undefined,
      strokeCap: exportStrokeCap(node.style),
      strokeJoin: exportStrokeJoin(node.style),
      fillGeometry: [{ path: localPath }],
      strokeGeometry: [{ path: localPath }],
      children: [],
    } satisfies FigmaNode;
  });

  return wrapperNode;
}

function exportNodeTree(
  nodeId: string,
  ctx: ExportContext,
  parentAbsX: number,
  parentAbsY: number,
  options?: {
    componentOwner?: Node;
    currentIsExportRoot?: boolean;
  },
): FigmaNode {
  const node = ctx.doc.nodes[nodeId];
  const absX = parentAbsX + node.frame.x;
  const absY = parentAbsY + node.frame.y;

  if (node.type === "component") {
    return exportComponentNode(node, ctx, absX, absY);
  }

  if (node.type === "instance") {
    return exportInstanceNode(node, ctx, absX, absY);
  }

  if (shouldExportSemanticVectorWrapper(node)) {
    return exportSemanticVectorWrapperNode(node, ctx, absX, absY, options);
  }

  if (node.type === "path" && node.shape?.booleanMeta?.op && node.shape.booleanMeta.operands?.length) {
    const booleanNode = buildBaseNode(node, ctx, absX, absY, options);
    booleanNode.type = "BOOLEAN_OPERATION";
    booleanNode.booleanOperation = exportBooleanOperation(node.shape.booleanMeta.op);
    booleanNode.fillGeometry = buildFillGeometry(node);
    booleanNode.strokeGeometry = booleanNode.fillGeometry;
    booleanNode.children = node.shape.booleanMeta.operands.map((operand, index) => exportOperandNode(operand, ctx, absX, absY, index));
    return booleanNode;
  }

  const figmaNode = buildBaseNode(node, ctx, absX, absY, options);
  const children = node.children.map((childId) => exportNodeTree(childId, ctx, absX, absY, {
    componentOwner: options?.componentOwner,
  }));
  if (children.length) {
    figmaNode.children = children;
  }
  return figmaNode;
}

function buildVariableCollections(doc: Doc, ctx: ExportContext): Record<string, FigmaLocalVariableCollection> {
  const modeNames = doc.variableModes?.length ? doc.variableModes : [doc.variableMode ?? "Default"];
  const collectionId = "VariableCollectionId:null_doc";
  return {
    [collectionId]: {
      id: collectionId,
      name: "NULL Variables",
      defaultModeId: ctx.modeIds.get(doc.variableMode ?? modeNames[0] ?? "Default"),
      modes: modeNames.map((modeName) => ({
        modeId: ctx.modeIds.get(modeName) ?? toFigmaModeId(modeName),
        name: modeName,
      })),
      variableIds: doc.variables.map((variable) => ctx.variableIds.get(variable.id) ?? toFigmaVariableId(variable.id)),
      remote: false,
      hiddenFromPublishing: false,
    },
  };
}

function exportVariableValue(variable: Variable, modeName: string, ctx: ExportContext): FigmaVariableValue | undefined {
  const aliasId = variable.modeAliases?.[modeName] ?? variable.aliasOf;
  if (aliasId) {
    const alias = resolveVariableAlias(ctx, aliasId);
    if (alias) return alias;
  }
  const raw = variable.modes?.[modeName] ?? variable.value;
  if (variable.type === "color") {
    if (typeof raw !== "string") return undefined;
    return hexToRgba(raw);
  }
  if (variable.type === "number" && typeof raw === "number") return raw;
  if (variable.type === "string" && typeof raw === "string") return raw;
  if (variable.type === "boolean" && typeof raw === "boolean") return raw;
  return undefined;
}

function buildVariables(doc: Doc, ctx: ExportContext): Record<string, FigmaLocalVariable> {
  const modeNames = doc.variableModes?.length ? doc.variableModes : [doc.variableMode ?? "Default"];
  const collectionId = "VariableCollectionId:null_doc";
  return Object.fromEntries(
    doc.variables.map((variable) => {
      const valuesByMode = Object.fromEntries(
        modeNames.flatMap((modeName) => {
          const exported = exportVariableValue(variable, modeName, ctx);
          if (exported == null) return [];
          return [[ctx.modeIds.get(modeName) ?? toFigmaModeId(modeName), exported] as const];
        }),
      );
      const figmaId = ctx.variableIds.get(variable.id) ?? toFigmaVariableId(variable.id);
      return [
        figmaId,
        {
          id: figmaId,
          name: variable.name,
          variableCollectionId: collectionId,
          resolvedType:
            variable.type === "color"
              ? "COLOR"
              : variable.type === "number"
                ? "FLOAT"
                : variable.type === "string"
                  ? "STRING"
                  : "BOOLEAN",
          valuesByMode,
          remote: false,
          hiddenFromPublishing: false,
        } satisfies FigmaLocalVariable,
      ];
    }),
  );
}

function exportStyleMeta(token: StyleToken): FigmaStyleMeta {
  return {
    name: token.name,
    style_type: token.type === "text" ? "TEXT" : token.type === "effect" ? "EFFECT" : "FILL",
  };
}

function buildExportContext(doc: Doc, fileName?: string): ExportContext {
  const modeNames = doc.variableModes?.length ? doc.variableModes : [doc.variableMode ?? "Default"];
  const ownedVariantRoots = collectOwnedVariantRootIds(doc);
  const ctx: ExportContext = {
    doc,
    fileName: fileName?.trim() || doc.pages[0]?.name || "NULL Export",
    now: new Date().toISOString(),
    nodeIds: new Map(),
    styleIds: new Map(),
    variableIds: new Map(),
    modeIds: new Map(),
    componentIds: new Map(),
    variantIds: new Map(),
    componentPropertyNames: new Map(),
    ownedVariantRoots,
  };

  Object.keys(doc.nodes).forEach((nodeId) => {
    ctx.nodeIds.set(nodeId, toFigmaNodeId(nodeId));
  });
  doc.styles.forEach((style) => {
    ctx.styleIds.set(style.id, toFigmaStyleId(style.id));
  });
  doc.variables.forEach((variable) => {
    ctx.variableIds.set(variable.id, toFigmaVariableId(variable.id));
  });
  modeNames.forEach((modeName) => {
    ctx.modeIds.set(modeName, toFigmaModeId(modeName));
  });
  (Object.values(doc.nodes) as Node[])
    .filter((node) => node.type === "component")
    .forEach((componentNode) => {
      ctx.componentIds.set(componentNode.id, toFigmaNodeId(componentNode.id));
      ctx.componentPropertyNames.set(componentNode.id, buildPropertyNameMap(componentNode));
      componentNode.variants?.forEach((variant) => {
        ctx.variantIds.set(variant.id, `${toFigmaNodeId(variant.rootId)}__variant`);
      });
    });

  return ctx;
}

function collectOwnedVariantRootIds(doc: Doc) {
  const owned = new Set<string>();
  (Object.values(doc.nodes) as Node[])
    .filter((node) => node.type === "component")
    .forEach((componentNode) => {
      if (componentNode.variants && componentNode.variants.length > 1) {
        componentNode.variants.forEach((variant) => {
          if (variant.rootId !== componentNode.id) {
            owned.add(variant.rootId);
          }
        });
      }
    });
  return owned;
}

export function nullDocToFigmaPayload(doc: Doc, options?: { fileName?: string }): NullToFigmaExportPayload {
  const ctx = buildExportContext(doc, options?.fileName);
  const canvases = doc.pages.map((page) => {
    const pageRoot = doc.nodes[page.rootId];
    const pageOriginX = pageRoot?.frame.x ?? 0;
    const pageOriginY = pageRoot?.frame.y ?? 0;
    const children = (pageRoot?.children ?? [])
      .filter((childId) => !ctx.ownedVariantRoots.has(childId))
      .map((childId) => exportNodeTree(childId, ctx, pageOriginX, pageOriginY));
    const canvas: FigmaNode = {
      id: `canvas_${sanitizeId(page.id)}`,
      name: page.name,
      type: "CANVAS",
      children,
      ...buildFigmaFlowStartingPoints({
        pageId: page.id,
        pageName: page.name,
        prototypeStartPageId: doc.prototype?.startPageId,
        resolvePageStartNodeId: (pageId) => resolveExportedPageStartNodeId(ctx, pageId),
      }),
    };
    return canvas;
  });

  const file: FigmaFileResponse = {
    name: ctx.fileName,
    lastModified: ctx.now,
    version: "null-export-v1",
    schemaVersion: 1,
    document: {
      id: "0:0",
      name: ctx.fileName,
      type: "DOCUMENT",
      children: canvases,
    },
    styles: Object.fromEntries(doc.styles.map((style) => [ctx.styleIds.get(style.id) ?? toFigmaStyleId(style.id), exportStyleMeta(style)])),
    components: Object.fromEntries(
      (Object.values(doc.nodes) as Node[])
        .filter((node) => node.type === "component")
        .map((node) => [ctx.componentIds.get(node.id) ?? toFigmaNodeId(node.id), { name: node.name }]),
    ),
  };

  const localVariables: FigmaLocalVariablesResponse = {
    meta: {
      variableCollections: buildVariableCollections(doc, ctx),
      variables: buildVariables(doc, ctx),
    },
  };

  return { file, localVariables };
}

export function nullDocToFigmaFile(doc: Doc, options?: { fileName?: string }) {
  return nullDocToFigmaPayload(doc, options).file;
}
