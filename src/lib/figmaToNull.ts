/**
 * Figma 파일/노드 → NULL 문서 변환
 * FIGMA_IMPORT 로드맵 2, 3, 5, 6 통합
 */

import type {
  FigmaNode,
  FigmaPaint,
  FigmaEffect,
  FigmaTypeStyle,
  FigmaGradientPaint,
  FigmaGradientStop,
  FigmaStyleMeta,
  FigmaLocalVariableCollection,
  FigmaLocalVariable,
  FigmaVariableAlias,
  FigmaRGBA,
} from "./figma";
import { rgbaToHex } from "./figma";
import { applySharedNodeMetadata } from "./figmaSharedMetadata";
import {
  canImportGeometryAsPath,
  getGeometrySegments,
  getImportFidelityDecision,
  hasComplexGradient,
  hasImageFill,
} from "./figmaImportFidelity";
import type {
  NodeType,
  Fill,
  Stroke,
  Effect,
  NodeStyle,
  Frame,
  Node,
  Doc,
  SerializableDoc,
  TextStyle,
  TextRange,
  LayoutMode,
  Constraints,
  LayoutSizingAxis,
  LayoutGridItem,
  BooleanMeta,
  BooleanOperandSnapshot,
  StyleToken,
  Variable,
  VariableType,
  TextStyleVariableBindings,
} from "@/advanced/doc/scene";
import { createNode, createDoc, serializeDoc as sceneSerializeDoc, DEFAULT_TEXT_STYLE } from "@/advanced/doc/scene";
import { parseGridTrackSizingInput } from "@/advanced/layout/autoLayoutGrid";
import { ellipseToPath, polygonToPathD, rectToPath, translatePathD } from "@/advanced/geom/pathData";
import { importFigmaNodePrototype, resolveImportedStartPageId } from "./prototypeFigmaInterop";
import { createEditableVectorPathModel, vectorNetworkFromEditableVectorPathModels } from "@/advanced/geom/vectorEditModel";
import { vectorNetworkFromPathData, withDerivedVectorNetwork } from "@/advanced/geom/vectorNetwork";
import { getSemanticVectorWrapperChildren } from "./vectorSemanticRoundtrip";

const FIGMA_ID_PREFIX = "figma_";

function toNullId(figmaId: string): string {
  return `${FIGMA_ID_PREFIX}${figmaId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

type FigmaComponentImportRef = {
  componentNodeId: string;
  contentRootId: string;
  variantId: string;
  variantName: string;
  variantProps?: Record<string, string>;
  sourceNodeId: string;
};

type FigmaImportContext = {
  componentRefs: Map<string, FigmaComponentImportRef>;
  instancePropertyValues: Map<string, NonNullable<FigmaNode["componentProperties"]>>;
  styleTokens: Map<string, StyleToken>;
  styleMeta?: Record<string, FigmaStyleMeta>;
  variables: Variable[];
  variableModes: string[];
  defaultVariableMode?: string;
  variableIdsByFigmaId: Map<string, string>;
  importedNodeIdsByFigmaId: Map<string, string>;
};

function createEmptyImportContext(): FigmaImportContext {
  return {
    componentRefs: new Map(),
    instancePropertyValues: new Map(),
    styleTokens: new Map(),
    variables: [],
    variableModes: [],
    variableIdsByFigmaId: new Map(),
    importedNodeIdsByFigmaId: new Map(),
  };
}

function toImportedStyleTokenId(kind: StyleToken["type"], figmaStyleId: string) {
  return `figma_style_${kind}_${figmaStyleId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function toImportedVariableId(figmaVariableId: string) {
  return `figma_var_${figmaVariableId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function cloneStyleTokenValue(kind: StyleToken["type"], value: unknown) {
  if (kind === "fill" && Array.isArray(value)) {
    return value.map((fill) => cloneFill(fill as Fill));
  }
  if (kind === "stroke" && Array.isArray(value)) {
    return value.map((stroke) => ({ ...(stroke as Stroke), dash: (stroke as Stroke).dash ? [...((stroke as Stroke).dash as number[])] : undefined }));
  }
  if (kind === "effect" && Array.isArray(value)) {
    return value.map((effect) => ({ ...(effect as Effect) }));
  }
  if (kind === "text" && value && typeof value === "object") {
    return { ...(value as TextStyle) };
  }
  return value;
}

function registerImportedStyleToken(
  context: FigmaImportContext | undefined,
  kind: StyleToken["type"],
  figmaStyleId: string | undefined,
  value: unknown,
) {
  if (!context || !figmaStyleId) return undefined;
  const tokenId = toImportedStyleTokenId(kind, figmaStyleId);
  if (!context.styleTokens.has(tokenId)) {
    const meta = context.styleMeta?.[figmaStyleId];
    context.styleTokens.set(tokenId, {
      id: tokenId,
      name: meta?.name?.trim() || `${kind}:${figmaStyleId}`,
      type: kind,
      value: cloneStyleTokenValue(kind, value),
    });
  }
  return tokenId;
}

function readFigmaStyleRef(fNode: FigmaNode, keys: string[]) {
  const styleMap = fNode.styles;
  if (!styleMap) return undefined;
  for (const key of keys) {
    const value = styleMap[key];
    if (value) return value;
  }
  return undefined;
}

function isFigmaVariableAlias(value: unknown): value is FigmaVariableAlias {
  return Boolean(
    value &&
      typeof value === "object" &&
      "type" in (value as Record<string, unknown>) &&
      "id" in (value as Record<string, unknown>) &&
      (value as { type?: string }).type === "VARIABLE_ALIAS" &&
      typeof (value as { id?: unknown }).id === "string",
  );
}

function mapImportedVariableType(resolvedType: string | undefined): VariableType | null {
  const normalized = resolvedType?.toUpperCase();
  if (normalized === "COLOR") return "color";
  if (normalized === "FLOAT") return "number";
  if (normalized === "STRING") return "string";
  if (normalized === "BOOLEAN") return "boolean";
  return null;
}

function normalizeVariableModeName(name: string | undefined) {
  return name?.trim() || "기본";
}

function resolveCollectionModeName(collection: FigmaLocalVariableCollection | undefined, modeId: string | undefined) {
  if (!modeId) return "기본";
  const mode = collection?.modes?.find((item) => item.modeId === modeId);
  return normalizeVariableModeName(mode?.name ?? modeId);
}

function findCollectionModeIdByName(collection: FigmaLocalVariableCollection | undefined, modeName: string | undefined) {
  if (!modeName) return undefined;
  return collection?.modes?.find((item) => normalizeVariableModeName(item.name) === modeName)?.modeId;
}

function readVariableRawValue(
  variable: FigmaLocalVariable,
  modeId: string | undefined,
  collections?: Record<string, FigmaLocalVariableCollection>,
) {
  const values = variable.valuesByMode ?? {};
  if (modeId && modeId in values) return values[modeId];
  const collection = collections?.[variable.variableCollectionId];
  if (collection?.defaultModeId && collection.defaultModeId in values) return values[collection.defaultModeId];
  const firstModeId = Object.keys(values)[0];
  return firstModeId ? values[firstModeId] : undefined;
}

function convertImportedVariablePrimitive(type: VariableType, raw: unknown): string | number | boolean | undefined {
  if (type === "color") {
    if (typeof raw === "string") return raw;
    if (raw && typeof raw === "object" && "r" in (raw as FigmaRGBA)) {
      return rgbaToHex(raw as FigmaRGBA);
    }
    return undefined;
  }
  if (type === "number") {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    return undefined;
  }
  if (type === "string") {
    if (typeof raw === "string") return raw;
    return undefined;
  }
  if (type === "boolean") {
    if (typeof raw === "boolean") return raw;
    return undefined;
  }
  return undefined;
}

function resolveImportedVariableValue(
  variable: FigmaLocalVariable,
  type: VariableType,
  modeId: string | undefined,
  collections: Record<string, FigmaLocalVariableCollection> | undefined,
  variables: Record<string, FigmaLocalVariable> | undefined,
  stack: Set<string>,
): string | number | boolean | undefined {
  const raw = readVariableRawValue(variable, modeId, collections);
  if (raw === undefined) return undefined;
  if (isFigmaVariableAlias(raw)) {
    if (stack.has(raw.id)) return undefined;
    const target = variables?.[raw.id];
    if (!target) return undefined;
    const targetType = mapImportedVariableType(target.resolvedType) ?? type;
    const sourceCollection = collections?.[variable.variableCollectionId];
    const sourceModeName = resolveCollectionModeName(sourceCollection, modeId);
    const targetCollection = collections?.[target.variableCollectionId];
    const targetModeId =
      findCollectionModeIdByName(targetCollection, sourceModeName) ??
      targetCollection?.defaultModeId ??
      Object.keys(target.valuesByMode ?? {})[0];
    const nextStack = new Set(stack);
    nextStack.add(raw.id);
    return resolveImportedVariableValue(target, targetType, targetModeId, collections, variables, nextStack);
  }
  return convertImportedVariablePrimitive(type, raw);
}

function importVariablesIntoContext(
  context: FigmaImportContext,
  collections?: Record<string, FigmaLocalVariableCollection>,
  variables?: Record<string, FigmaLocalVariable>,
) {
  if (!variables || Object.keys(variables).length === 0) return;

  Object.keys(variables).forEach((figmaId) => {
    context.variableIdsByFigmaId.set(figmaId, toImportedVariableId(figmaId));
  });

  const modeNames: string[] = [];
  const seenModes = new Set<string>();
  const pushModeName = (name: string | undefined) => {
    const normalized = normalizeVariableModeName(name);
    if (seenModes.has(normalized)) return;
    seenModes.add(normalized);
    modeNames.push(normalized);
  };

  for (const collection of Object.values(collections ?? {})) {
    for (const mode of collection.modes ?? []) {
      pushModeName(mode.name);
    }
  }

  const imported: Variable[] = [];
  for (const figmaVariable of Object.values(variables)) {
    const type = mapImportedVariableType(figmaVariable.resolvedType);
    if (!type) continue;
    const collection = collections?.[figmaVariable.variableCollectionId];
    const modeEntries =
      collection?.modes?.length
        ? collection.modes
        : Object.keys(figmaVariable.valuesByMode ?? {}).map((modeId) => ({ modeId, name: modeId }));
    const modeValues: Record<string, string | number | boolean> = {};
    for (const mode of modeEntries) {
      const modeName = normalizeVariableModeName(mode.name);
      pushModeName(modeName);
      const resolved = resolveImportedVariableValue(
        figmaVariable,
        type,
        mode.modeId,
        collections,
        variables,
        new Set([figmaVariable.id]),
      );
      if (resolved !== undefined) {
        modeValues[modeName] = resolved;
      }
    }

    const defaultModeName = resolveCollectionModeName(collection, collection?.defaultModeId ?? modeEntries[0]?.modeId);
    const fallbackValue =
      modeValues[defaultModeName] ??
      Object.values(modeValues)[0] ??
      resolveImportedVariableValue(
        figmaVariable,
        type,
        collection?.defaultModeId ?? modeEntries[0]?.modeId,
        collections,
        variables,
        new Set([figmaVariable.id]),
      );
    if (fallbackValue === undefined) continue;

    const variableId = context.variableIdsByFigmaId.get(figmaVariable.id) ?? toImportedVariableId(figmaVariable.id);
    context.variableIdsByFigmaId.set(figmaVariable.id, variableId);
    const modeAliases = Object.fromEntries(
      modeEntries.flatMap((mode) => {
        const raw = readVariableRawValue(figmaVariable, mode.modeId, collections);
        if (!isFigmaVariableAlias(raw)) return [];
        const targetId = context.variableIdsByFigmaId.get(raw.id);
        if (!targetId) return [];
        return [[normalizeVariableModeName(mode.name), targetId] as const];
      }),
    );
    const defaultRaw = readVariableRawValue(figmaVariable, collection?.defaultModeId ?? modeEntries[0]?.modeId, collections);
    imported.push({
      id: variableId,
      name: figmaVariable.name?.trim() || variableId,
      type,
      value: fallbackValue,
      modes: Object.keys(modeValues).length ? modeValues : undefined,
      aliasOf: isFigmaVariableAlias(defaultRaw) ? context.variableIdsByFigmaId.get(defaultRaw.id) : undefined,
      modeAliases: Object.keys(modeAliases).length ? modeAliases : undefined,
    });
  }

  if (!imported.length) return;
  context.variables = imported;
  context.variableModes = modeNames.length ? modeNames : ["기본"];
  const defaultCollection = Object.values(collections ?? {})[0];
  context.defaultVariableMode =
    resolveCollectionModeName(defaultCollection, defaultCollection?.defaultModeId) ?? context.variableModes[0];
}

function resolveImportedVariableRef(
  alias: FigmaVariableAlias | null | undefined,
  context?: FigmaImportContext,
  type?: VariableType,
) {
  if (!alias || !isFigmaVariableAlias(alias) || !context?.variables.length) return undefined;
  const variableId = context.variableIdsByFigmaId.get(alias.id);
  if (!variableId) return undefined;
  if (!type) return variableId;
  const variable = context.variables.find((item) => item.id === variableId && item.type === type);
  return variable ? variable.id : undefined;
}

function resolveImportedFillVariableRef(fNode: FigmaNode, context?: FigmaImportContext) {
  if (!context?.variables.length) return undefined;
  const candidates: Array<FigmaVariableAlias | null | undefined> = [];
  for (const fill of fNode.fills ?? []) {
    candidates.push(fill.boundVariables?.color);
  }
  for (const candidate of fNode.boundVariables?.fills ?? []) {
    candidates.push(candidate);
  }
  for (const candidate of candidates) {
    const variableId = resolveImportedVariableRef(candidate, context, "color");
    if (variableId) return variableId;
  }
  return undefined;
}

function resolveImportedStrokeVariableRef(fNode: FigmaNode, context?: FigmaImportContext) {
  if (!context?.variables.length) return undefined;
  const candidates: Array<FigmaVariableAlias | null | undefined> = [];
  for (const stroke of fNode.strokes ?? []) {
    candidates.push(stroke.boundVariables?.color);
  }
  for (const candidate of fNode.boundVariables?.strokes ?? []) {
    candidates.push(candidate);
  }
  for (const candidate of candidates) {
    const variableId = resolveImportedVariableRef(candidate, context, "color");
    if (variableId) return variableId;
  }
  return undefined;
}

function toImportedVariantId(figmaId: string): string {
  return `${toNullId(figmaId)}__variant`;
}

function toImportedComponentRootId(figmaId: string): string {
  return `${toNullId(figmaId)}__root`;
}

function buildVariantName(fNode: FigmaNode, fallbackIndex: number): string {
  const entries = Object.entries(fNode.variantProperties ?? {}).filter((entry) => entry[0] && entry[1]);
  if (entries.length > 0) {
    return entries
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => `${key}=${value}`)
      .join(", ");
  }
  return fNode.name || `Variant ${fallbackIndex + 1}`;
}

function walkFigmaTree(
  node: FigmaNode,
  visit: (current: FigmaNode, parent: FigmaNode | null) => void,
  parent: FigmaNode | null = null,
): void {
  visit(node, parent);
  for (const child of node.children ?? []) {
    walkFigmaTree(child, visit, node);
  }
}

function buildImportContext(
  figmaRoot: FigmaNode,
  styleMeta?: Record<string, FigmaStyleMeta>,
  variableCollections?: Record<string, FigmaLocalVariableCollection>,
  figmaVariables?: Record<string, FigmaLocalVariable>,
): FigmaImportContext {
  const context: FigmaImportContext = {
    ...createEmptyImportContext(),
    styleMeta,
  };

  importVariablesIntoContext(context, variableCollections, figmaVariables);

  walkFigmaTree(figmaRoot, (node, parent) => {
    if (node.type === "COMPONENT_SET") {
      const componentNodeId = toNullId(node.id);
      const variants = (node.children ?? []).filter((child) => child.type === "COMPONENT");
      variants.forEach((child, index) => {
        context.componentRefs.set(child.id, {
          componentNodeId,
          contentRootId: toNullId(child.id),
          variantId: toImportedVariantId(child.id),
          variantName: buildVariantName(child, index),
          variantProps: child.variantProperties ? { ...child.variantProperties } : undefined,
          sourceNodeId: child.id,
        });
      });
      return;
    }

    if (node.type === "COMPONENT" && parent?.type !== "COMPONENT_SET") {
      context.componentRefs.set(node.id, {
        componentNodeId: toNullId(node.id),
        contentRootId: toImportedComponentRootId(node.id),
        variantId: toImportedVariantId(node.id),
        variantName: "Default",
        variantProps: undefined,
        sourceNodeId: node.id,
      });
    }

    if (node.type === "INSTANCE" && node.componentProperties && Object.keys(node.componentProperties).length > 0) {
      context.instancePropertyValues.set(toNullId(node.id), { ...node.componentProperties });
    }
  });

  return context;
}

function normalizeComponentPropertyName(propertyName: string): string {
  return propertyName.split("#")[0]?.trim() || propertyName;
}

function mapImportedComponentPropertyKind(
  nodeProperty: string,
  definitionType?: string,
): "text" | "boolean" | "instance" | null {
  if (definitionType === "TEXT" || nodeProperty === "characters") return "text";
  if (definitionType === "BOOLEAN" || nodeProperty === "visible") return "boolean";
  if (definitionType === "INSTANCE_SWAP" || nodeProperty === "mainComponent") return "instance";
  return null;
}

/** Figma 노드에 이미지 fill이 있는지 */
/** 서브트리에 현재 import로 보존하지 못하는 노드가 있는지 재귀 확인 */
/** 비선형 그라데이션 fill이 있는지 */

/** 이 노드를 Figma 서버에서 이미지로 렌더링해야 하는지 판별 */
function shouldRenderAsImage(fNode: FigmaNode): boolean {
  return getImportFidelityDecision(fNode).renderAsImage;
}

/** Figma node type → NULL NodeType (이미지 fill 있으면 image로) */
function mapNodeType(fNode: FigmaNode): NodeType {
  if (hasImageFill(fNode)) return "image";
  const type = fNode.type;
  switch (type) {
    case "FRAME":
      return "frame";
    case "SECTION":
      return "section";
    case "GROUP":
    case "TRANSFORM_GROUP":
      return "group";
    case "BOOLEAN_OPERATION":
      return canImportGeometryAsPath(fNode) ? "path" : "group";
    case "RECTANGLE":
      return "rect";
    case "ELLIPSE":
      return "ellipse";
    case "LINE":
      return "line";
    case "REGULAR_POLYGON":
      return "polygon";
    case "STAR":
      return "star";
    case "VECTOR":
      return canImportGeometryAsPath(fNode) ? "path" : "group";
    case "TEXT":
      return "text";
    case "COMPONENT":
      return "component";
    case "INSTANCE":
      return "instance";
    case "SLICE":
      return "slice";
    default:
      return "group";
  }
}

function convertFrame(bbox: FigmaNode["absoluteBoundingBox"], rotation?: number): Frame {
  if (!bbox) return { x: 0, y: 0, w: 100, h: 100, rotation: 0 };
  return {
    x: bbox.x,
    y: bbox.y,
    w: Math.max(1, bbox.width),
    h: Math.max(1, bbox.height),
    rotation: rotation ?? 0,
  };
}

function convertFills(paints: FigmaPaint[] | undefined, context?: FigmaImportContext): Fill[] {
  if (!paints || paints.length === 0) return [{ type: "solid", color: "#EDEDED" }];
  const out: Fill[] = [];
  for (const p of paints) {
    if (p.visible === false) continue;
    if ((p as { type?: string }).type === "IMAGE") continue;
    const opacity = p.opacity ?? 1;
    if (p.type === "SOLID") {
      out.push({ type: "solid", color: rgbaToHex(p.color), opacity });
    } else if (p.type?.startsWith("GRADIENT_")) {
      const grad = p as FigmaGradientPaint;
      const stops: FigmaGradientStop[] = grad.gradientStops ?? [];
      const from = grad.gradientHandlePositions?.[0];
      const to = grad.gradientHandlePositions?.[1];
      if (!from || !to) continue;
      const angle = Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI);
      const stopArr = stops.map((s: FigmaGradientStop) => ({
        offset: s.position,
        color: rgbaToHex(s.color),
        colorRef: resolveImportedVariableRef(s.boundVariables?.color, context, "color"),
      }));
      out.push({
        type: "linear",
        from: stops[0] ? rgbaToHex(stops[0].color) : "#000000",
        to: stops[stops.length - 1] ? rgbaToHex(stops[stops.length - 1].color) : "#ffffff",
        angle,
        opacity,
        stops: stopArr.length > 0 ? stopArr : undefined,
      });
    }
  }
  return out.length ? out : [{ type: "solid", color: "#EDEDED" }];
}

function convertStrokes(
  strokes: FigmaPaint[] | undefined,
  strokeWeight: number | undefined,
  strokeAlign: FigmaNode["strokeAlign"],
  strokeDashes?: number[],
): Stroke[] {
  if (!strokes || strokes.length === 0) return [];
  const weight = strokeWeight ?? 1;
  const align = strokeAlign === "OUTSIDE" ? "outside" : strokeAlign === "CENTER" ? "center" : "inside";
  return strokes
    .filter((s) => s.visible !== false)
    .map((s) => {
      if (s.type === "SOLID") {
        return { color: rgbaToHex(s.color), width: weight, align, dash: strokeDashes ? [...strokeDashes] : undefined };
      }
      return { color: "#000000", width: weight, align, dash: strokeDashes ? [...strokeDashes] : undefined };
    });
}

function convertEffects(effects: FigmaEffect[] | undefined): Effect[] {
  if (!effects || effects.length === 0) return [];
  const out: Effect[] = [];
  for (const e of effects) {
    if ("visible" in e && e.visible === false) continue;
    if (e.type === "DROP_SHADOW") {
      const offset = "offset" in e ? e.offset : undefined;
      out.push({
        type: "shadow",
        x: offset?.x ?? 0,
        y: offset?.y ?? 0,
        blur: e.radius ?? 0,
        color: rgbaToHex(e.color),
        opacity: 1,
      });
    } else if (e.type === "INNER_SHADOW" || (e as FigmaEffect & { type?: string }).type === "INNER_SHADOW") {
      const offset = "offset" in e ? e.offset : undefined;
      const color = "color" in e ? rgbaToHex(e.color) : "#000000";
      out.push({
        type: "shadow",
        x: offset?.x ?? 0,
        y: offset?.y ?? 0,
        blur: e.radius ?? 0,
        color,
        opacity: 1,
      });
    } else if (e.type === "LAYER_BLUR" || e.type === "BACKGROUND_BLUR") {
      out.push({ type: "blur", blur: e.radius ?? 0 });
    }
  }
  return out;
}

const BLEND_MAP: Record<string, "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten"> = {
  NORMAL: "normal",
  MULTIPLY: "multiply",
  SCREEN: "screen",
  OVERLAY: "overlay",
  DARKEN: "darken",
  LIGHTEN: "lighten",
};

function convertStrokeCap(cap: string | undefined): NodeStyle["strokeCap"] {
  if (cap === "ROUND") return "round";
  if (cap === "SQUARE") return "square";
  return "butt";
}

function convertStrokeJoin(join: string | undefined): NodeStyle["strokeJoin"] {
  if (join === "ROUND") return "round";
  if (join === "BEVEL") return "bevel";
  return "miter";
}

function convertExportSettings(
  exportSettings: FigmaNode["exportSettings"],
): Node["exportSettings"] | undefined {
  if (!exportSettings?.length) return undefined;
  const mapped = exportSettings
    .map((setting) => {
      const format = setting.format?.toLowerCase();
      if (format !== "png" && format !== "svg" && format !== "pdf") return null;
      const scale =
        setting.constraint?.type === "SCALE" && Number.isFinite(setting.constraint.value)
          ? setting.constraint.value
          : 1;
      return {
        format,
        scale,
      };
    })
    .filter((setting): setting is { format: "png" | "svg" | "pdf"; scale: number } => Boolean(setting));

  return mapped.length ? mapped : undefined;
}

function convertStyle(fNode: FigmaNode, context?: FigmaImportContext): Partial<NodeStyle> {
  const fills = convertFills(fNode.fills, context);
  const strokes = convertStrokes(fNode.strokes, fNode.strokeWeight, fNode.strokeAlign, fNode.strokeDashes);
  const effects = convertEffects(fNode.effects);
  const opacity = fNode.opacity ?? 1;
  const blendMode = BLEND_MAP[fNode.blendMode ?? "NORMAL"] ?? "normal";

  const style: Partial<NodeStyle> = {
    fills,
    strokes,
    opacity,
    blendMode,
    effects,
    strokeCap: convertStrokeCap(fNode.strokeCap),
    strokeJoin: convertStrokeJoin(fNode.strokeJoin),
  };

  if (fNode.cornerRadius != null) {
    style.radius = fNode.cornerRadius;
  }
  if (fNode.rectangleCornerRadii && fNode.rectangleCornerRadii.length >= 4) {
    style.radius = {
      tl: fNode.rectangleCornerRadii[0] ?? 0,
      tr: fNode.rectangleCornerRadii[1] ?? 0,
      br: fNode.rectangleCornerRadii[2] ?? 0,
      bl: fNode.rectangleCornerRadii[3] ?? 0,
    };
  }

  return style;
}

/** Figma 폰트 미지원 시 사용할 폴백 폰트 스택 (문서화: docs/FIGMA_IMPORT.md) */
const FONT_FALLBACK_STACK = DEFAULT_TEXT_STYLE.fontFamily;

function convertTextStyle(style: FigmaTypeStyle | undefined): TextStyle {
  if (!style) return { ...DEFAULT_TEXT_STYLE };
  let align: "left" | "center" | "right" | "justify" = "left";
  if (style.textAlignHorizontal === "CENTER") align = "center";
  if (style.textAlignHorizontal === "RIGHT") align = "right";
  if (style.textAlignHorizontal === "JUSTIFIED") align = "justify";

  let textCase: "none" | "upper" | "lower" | "capitalize" | undefined;
  if (style.textCase === "UPPER") textCase = "upper";
  else if (style.textCase === "LOWER") textCase = "lower";
  else if (style.textCase === "TITLE" || style.textCase === "SMALL_CAPS" || style.textCase === "SMALL_CAPS_FORCED") textCase = "capitalize";

  const figmaFont = style.fontFamily ?? style.fontPostScriptName;
  const fontFamily = figmaFont ? `${figmaFont}, ${FONT_FALLBACK_STACK}` : FONT_FALLBACK_STACK;
  const fontSize = style.fontSize ?? 16;
  const lineHeight = style.lineHeightPx
    ? style.lineHeightPx / fontSize
    : style.lineHeightPercentFontSize
      ? style.lineHeightPercentFontSize / 100
      : style.lineHeightPercent
        ? style.lineHeightPercent / 100
        : 1.4;

  return {
    fontFamily,
    fontSize,
    fontWeight: style.fontWeight ?? 500,
    lineHeight,
    letterSpacing: style.letterSpacing ?? 0,
    paragraphSpacing: style.paragraphSpacing ?? 0,
    align,
    italic: style.italic,
    underline: style.textDecoration === "UNDERLINE",
    lineThrough: style.textDecoration === "STRIKETHROUGH",
    textCase,
    fontFeatureSettings: style.fontFeatureSettings?.trim() || undefined,
    fontVariationSettings: style.fontVariationSettings?.trim() || undefined,
  };
}

function convertTextStyleBindings(style: FigmaTypeStyle | undefined, context?: FigmaImportContext): TextStyleVariableBindings | undefined {
  const bindings = style?.boundVariables;
  if (!bindings) return undefined;
  const next: TextStyleVariableBindings = {};
  const keys = ["fontFamily", "fontWeight", "fontSize", "lineHeight", "letterSpacing", "paragraphSpacing"] as const;
  keys.forEach((key) => {
    const variableId = resolveImportedVariableRef(bindings[key], context);
    if (variableId) next[key] = variableId;
  });
  return Object.keys(next).length ? next : undefined;
}

function convertTextBoxBehavior(style: FigmaTypeStyle | undefined): { wrap: boolean; autoSize: boolean } {
  const mode = style?.textAutoResize ?? "NONE";
  if (mode === "WIDTH_AND_HEIGHT") {
    return { wrap: false, autoSize: true };
  }
  if (mode === "TRUNCATE") {
    return { wrap: false, autoSize: false };
  }
  return { wrap: true, autoSize: false };
}

function extractSolidTextFillHex(paints: FigmaPaint[] | undefined) {
  const solid = paints?.find((paint) => paint.type === "SOLID");
  return solid ? rgbaToHex(solid.color) : undefined;
}

function diffTextStyle(base: TextStyle, next: TextStyle): Partial<TextStyle> | undefined {
  const patch: Partial<TextStyle> = {};
  (Object.keys(next) as Array<keyof TextStyle>).forEach((key) => {
    const value = next[key];
    if (value !== undefined && value !== base[key]) patch[key] = value as never;
  });
  return Object.keys(patch).length ? patch : undefined;
}

function convertTextRanges(fNode: FigmaNode, baseStyle: TextStyle, context?: FigmaImportContext): TextRange[] | undefined {
  const overrides = fNode.characterStyleOverrides;
  const table = fNode.styleOverrideTable;
  const value = fNode.characters ?? "";
  if (!overrides?.length || !table || !value.length) return undefined;
  const limit = Math.min(value.length, overrides.length);
  const ranges: TextRange[] = [];
  let start = 0;
  let current = overrides[0] ?? 0;
  const commit = (end: number, overrideIndex: number) => {
    if (overrideIndex <= 0 || end <= start) return;
    const overrideStyle = table[String(overrideIndex)];
    if (!overrideStyle) return;
    const mergedStyle = convertTextStyle({
      ...(fNode.style ?? {}),
      ...overrideStyle,
      fills: overrideStyle.fills ?? fNode.style?.fills,
    });
    const style = diffTextStyle(baseStyle, mergedStyle);
    const fill = extractSolidTextFillHex(overrideStyle.fills);
    const fillRef = resolveImportedVariableRef(
      overrideStyle.fills?.find((paint) => paint.type === "SOLID")?.boundVariables?.color,
      context,
      "color",
    );
    const styleBindings = convertTextStyleBindings(overrideStyle, context);
    if (!style && !fill && !fillRef && !styleBindings) return;
    ranges.push({ start, end, style, fill, fillRef, styleBindings });
  };

  for (let index = 1; index <= limit; index += 1) {
    const next = index < limit ? overrides[index] ?? 0 : -1;
    if (next === current) continue;
    commit(index, current);
    start = index;
    current = next;
  }

  return ranges.length ? ranges : undefined;
}

function convertConstraints(c: FigmaNode["constraints"]): Constraints {
  if (!c) return {};
  const h = c.horizontal;
  const v = c.vertical;
  return {
    left: h === "LEFT" || h === "LEFT_RIGHT",
    right: h === "RIGHT" || h === "LEFT_RIGHT",
    top: v === "TOP" || v === "TOP_BOTTOM",
    bottom: v === "BOTTOM" || v === "TOP_BOTTOM",
    hCenter: h === "CENTER",
    vCenter: v === "CENTER",
    scaleX: h === "SCALE",
    scaleY: v === "SCALE",
  };
}

function convertLayout(fNode: FigmaNode): LayoutMode | undefined {
  if (fNode.layoutMode === "NONE" || !fNode.layoutMode) return undefined;
  if (fNode.layoutMode === "GRID") {
    return {
      mode: "grid",
      columns: Math.max(1, fNode.gridColumnCount ?? 1),
      rows: Math.max(1, fNode.gridRowCount ?? 1),
      columnGap: Math.max(0, fNode.gridColumnGap ?? 0),
      rowGap: Math.max(0, fNode.gridRowGap ?? 0),
      padding: {
        t: fNode.paddingTop ?? 0,
        r: fNode.paddingRight ?? 0,
        b: fNode.paddingBottom ?? 0,
        l: fNode.paddingLeft ?? 0,
      },
      columnsSizing: parseGridTrackSizingInput(fNode.gridColumnsSizing, Math.max(1, fNode.gridColumnCount ?? 1), { type: "flex", value: 1 }),
      rowsSizing: parseGridTrackSizingInput(fNode.gridRowsSizing, Math.max(1, fNode.gridRowCount ?? 1), { type: "hug" }),
    };
  }
  const dir = fNode.layoutMode === "HORIZONTAL" ? "row" : "column";
  const gap = fNode.itemSpacing ?? 0;
  const padding = {
    t: fNode.paddingTop ?? 0,
    r: fNode.paddingRight ?? 0,
    b: fNode.paddingBottom ?? 0,
    l: fNode.paddingLeft ?? 0,
  };
  let align: "start" | "center" | "end" | "stretch" | "baseline" = "start";
  const counter = fNode.counterAxisAlignItems;
  if (counter === "CENTER") align = "center";
  else if (counter === "MAX") align = "end";
  else if (counter === "STRETCH") align = "stretch";
  else if (counter === "BASELINE") align = "baseline";
  let justify: "start" | "center" | "end" | "space-between" = "start";
  if (fNode.primaryAxisAlignItems === "CENTER") justify = "center";
  else if (fNode.primaryAxisAlignItems === "MAX") justify = "end";
  else if (fNode.primaryAxisAlignItems === "SPACE_BETWEEN") justify = "space-between";
  let wrapAlign: "start" | "center" | "end" | "space-between" = "start";
  if (fNode.counterAxisAlignContent === "SPACE_BETWEEN") wrapAlign = "space-between";

  return {
    mode: "auto",
    dir,
    gap,
    gapMode: justify === "space-between" ? "space-between" : "fixed",
    justify,
    padding,
    align,
    wrap: fNode.layoutWrap === "WRAP",
    wrapGap: fNode.counterAxisSpacing ?? gap,
    wrapAlign,
    includeStrokeInBounds: Boolean(fNode.strokesIncludedInLayout),
  };
}

function mapFigmaLayoutSizing(
  value: FigmaNode["layoutSizingHorizontal"] | FigmaNode["layoutSizingVertical"] | undefined,
): LayoutSizingAxis["width"] | undefined {
  if (value === "HUG") return "hug";
  if (value === "FILL") return "fill";
  if (value === "FIXED") return "fixed";
  return undefined;
}

function convertGridChild(fNode: FigmaNode, parentFNode?: FigmaNode | null) {
  if (parentFNode?.layoutMode !== "GRID") return undefined;
  const horizontalAlign =
    fNode.gridChildHorizontalAlign === "CENTER"
      ? "center"
      : fNode.gridChildHorizontalAlign === "MAX"
        ? "end"
        : fNode.gridChildHorizontalAlign === "MIN"
          ? "start"
          : "auto";
  const verticalAlign =
    fNode.gridChildVerticalAlign === "CENTER"
      ? "center"
      : fNode.gridChildVerticalAlign === "MAX"
        ? "end"
        : fNode.gridChildVerticalAlign === "MIN"
          ? "start"
          : "auto";
  return {
    row: Math.max(0, (fNode.gridRowAnchorIndex ?? 1) - 1),
    column: Math.max(0, (fNode.gridColumnAnchorIndex ?? 1) - 1),
    rowSpan: Math.max(1, fNode.gridRowSpan ?? 1),
    columnSpan: Math.max(1, fNode.gridColumnSpan ?? 1),
    horizontalAlign,
    verticalAlign,
  } as const;
}

function convertLayoutPositioning(
  fNode: FigmaNode,
  parentFNode?: FigmaNode | null,
): "auto" | "absolute" | undefined {
  if (!parentFNode?.layoutMode || parentFNode.layoutMode === "NONE" || parentFNode.layoutMode === "GRID") {
    return undefined;
  }
  if (fNode.layoutPositioning === "ABSOLUTE") return "absolute";
  if (fNode.layoutPositioning === "AUTO") return "auto";
  return undefined;
}

function convertLayoutSizing(fNode: FigmaNode, parentFNode?: FigmaNode | null): LayoutSizingAxis | undefined {
  const layoutPositioning = convertLayoutPositioning(fNode, parentFNode);
  const isAbsoluteInAutoLayout = layoutPositioning === "absolute";
  const sizingWidth = mapFigmaLayoutSizing(fNode.layoutSizingHorizontal);
  const sizingHeight = mapFigmaLayoutSizing(fNode.layoutSizingVertical);
  const textAutoResize = fNode.type === "TEXT" ? fNode.style?.textAutoResize : undefined;
  const inferredTextWidth = textAutoResize === "WIDTH_AND_HEIGHT" ? "hug" : undefined;
  const inferredTextHeight = textAutoResize === "WIDTH_AND_HEIGHT" || textAutoResize === "HEIGHT" ? "hug" : undefined;
  const resolvedWidth = sizingWidth ?? inferredTextWidth;
  const resolvedHeight = sizingHeight ?? inferredTextHeight;
  const minWidth = Number.isFinite(fNode.minWidth ?? undefined) ? Number(fNode.minWidth) : undefined;
  const minHeight = Number.isFinite(fNode.minHeight ?? undefined) ? Number(fNode.minHeight) : undefined;
  const maxWidth = Number.isFinite(fNode.maxWidth ?? undefined) ? Number(fNode.maxWidth) : undefined;
  const maxHeight = Number.isFinite(fNode.maxHeight ?? undefined) ? Number(fNode.maxHeight) : undefined;

  if (resolvedWidth || resolvedHeight) {
    return {
      width: isAbsoluteInAutoLayout && resolvedWidth === "fill" ? "fixed" : (resolvedWidth ?? "fixed"),
      height: isAbsoluteInAutoLayout && resolvedHeight === "fill" ? "fixed" : (resolvedHeight ?? "fixed"),
      minWidth,
      minHeight,
      maxWidth,
      maxHeight,
      };
  }

  if (isAbsoluteInAutoLayout) {
    return {
      width: "fixed",
      height: "fixed",
      minWidth,
      minHeight,
      maxWidth,
      maxHeight,
    };
  }

  if (
    parentFNode?.layoutMode &&
    parentFNode.layoutMode !== "NONE" &&
    parentFNode.layoutMode !== "GRID" &&
    !isAbsoluteInAutoLayout &&
    (fNode.layoutGrow === 1 || fNode.layoutAlign === "STRETCH" || minWidth != null || minHeight != null || maxWidth != null || maxHeight != null)
  ) {
    const parentIsRow = parentFNode.layoutMode === "HORIZONTAL";
    return {
      width: parentIsRow
        ? fNode.layoutGrow === 1 ? "fill" : "fixed"
        : fNode.layoutAlign === "STRETCH" ? "fill" : "fixed",
      height: parentIsRow
        ? fNode.layoutAlign === "STRETCH" ? "fill" : "fixed"
        : fNode.layoutGrow === 1 ? "fill" : "fixed",
      minWidth,
      minHeight,
      maxWidth,
      maxHeight,
    };
  }

  if (!fNode.layoutMode || fNode.layoutMode === "NONE") {
    if (minWidth != null || minHeight != null || maxWidth != null || maxHeight != null) {
      return {
        width: fNode.layoutGrow === 1 ? "fill" : "fixed",
        height: fNode.layoutAlign === "STRETCH" ? "fill" : "fixed",
        minWidth,
        minHeight,
        maxWidth,
        maxHeight,
      };
    }
    return undefined;
  }
  if (fNode.layoutMode === "GRID") {
    return { width: "fixed", height: "fixed", minWidth, minHeight, maxWidth, maxHeight };
  }

  if (fNode.layoutMode === "HORIZONTAL") {
    return {
      width: fNode.primaryAxisSizingMode === "AUTO" ? "hug" : "fixed",
      height: fNode.counterAxisSizingMode === "AUTO" ? "hug" : "fixed",
      minWidth,
      minHeight,
      maxWidth,
      maxHeight,
    };
  }

  return {
    width: fNode.counterAxisSizingMode === "AUTO" ? "hug" : "fixed",
    height: fNode.primaryAxisSizingMode === "AUTO" ? "hug" : "fixed",
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
  };
}

function convertLayoutGrids(layoutGrids: FigmaNode["layoutGrids"]): LayoutGridItem[] | undefined {
  if (!layoutGrids?.length) return undefined;
  const items: LayoutGridItem[] = layoutGrids
    .filter((grid) => grid.visible !== false)
    .map((grid): LayoutGridItem => {
      const color = grid.color ? rgbaToHex(grid.color) : undefined;
      const opacity = grid.color?.a;
      if (grid.pattern === "COLUMNS") {
        return {
          type: "columns" as const,
          count: Math.max(1, Math.round(grid.count ?? 1)),
          width: grid.sectionSize,
          gutter: grid.gutterSize,
          offset: grid.offset,
          color,
          opacity,
          alignment: (grid.alignment === "CENTER"
            ? "center"
            : grid.alignment === "STRETCH"
              ? "stretch"
              : "start") as "start" | "center" | "stretch",
        };
      }
      if (grid.pattern === "ROWS") {
        return {
          type: "rows" as const,
          count: Math.max(1, Math.round(grid.count ?? 1)),
          height: grid.sectionSize,
          gutter: grid.gutterSize,
          offset: grid.offset,
          color,
          opacity,
          alignment: (grid.alignment === "CENTER"
            ? "center"
            : grid.alignment === "STRETCH"
              ? "stretch"
              : "start") as "start" | "center" | "stretch",
        };
      }
      return {
        type: "grid" as const,
        cellSize: Math.max(1, grid.sectionSize ?? 8),
        color,
        opacity,
      };
    });

  return items.length ? items : undefined;
}

function convertBooleanOperation(operation: FigmaNode["booleanOperation"]): BooleanMeta["op"] | undefined {
  if (operation === "UNION") return "union";
  if (operation === "SUBTRACT") return "subtract";
  if (operation === "INTERSECT") return "intersect";
  if (operation === "EXCLUDE") return "exclude";
  return undefined;
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

function cloneFills(fills: Fill[] | undefined): Fill[] | undefined {
  return fills?.map((fill) => cloneFill(fill));
}

function buildPolygonPath(frame: Frame, sides: number): string {
  const safeSides = Math.max(3, Math.round(sides || 6));
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  const r = Math.max(0, Math.min(frame.w, frame.h) / 2);
  const ring = Array.from({ length: safeSides }).map((_, index) => {
    const angle = (Math.PI * 2 * index) / safeSides - Math.PI / 2;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });
  return polygonToPathD(ring);
}

function buildStarPath(frame: Frame, points: number, innerRatio = 0.5): string {
  const safePoints = Math.max(3, Math.round(points || 5));
  const safeRatio = Math.max(0.1, Math.min(0.9, innerRatio));
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  const outer = Math.max(0, Math.min(frame.w, frame.h) / 2);
  const inner = outer * safeRatio;
  const ring: number[][] = [];
  for (let index = 0; index < safePoints * 2; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI * index) / safePoints - Math.PI / 2;
    ring.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return polygonToPathD(ring);
}

function buildBooleanOperandPath(fNode: FigmaNode, resultFrame: Frame): string | undefined {
  const abs = fNode.absoluteBoundingBox;
  if (!abs) return undefined;
  const frame = convertFrame(abs, fNode.rotation);
  const relativeFrame: Frame = {
    ...frame,
    x: frame.x - resultFrame.x,
    y: frame.y - resultFrame.y,
  };
  const type = mapNodeType(fNode);
  if (type === "path") {
    const geometry = getGeometrySegments(fNode).filter((segment) => Boolean(segment.path));
    if (!geometry.length) return undefined;
    return geometry.map((segment) => translatePathD(segment.path, relativeFrame.x, relativeFrame.y)).join(" ");
  }
  if (type === "rect") return rectToPath(relativeFrame);
  if (type === "ellipse") return ellipseToPath(relativeFrame);
  if (type === "polygon") {
    const sides = (fNode as FigmaNode & { pointCount?: number }).pointCount ?? 6;
    return buildPolygonPath(relativeFrame, sides);
  }
  if (type === "star") {
    const points = (fNode as FigmaNode & { pointCount?: number }).pointCount ?? 5;
    return buildStarPath(relativeFrame, points);
  }
  if (type === "line" || type === "arrow") {
    return `M ${relativeFrame.x} ${relativeFrame.y} L ${relativeFrame.x + relativeFrame.w} ${relativeFrame.y + relativeFrame.h}`;
  }
  return undefined;
}

function buildBooleanOperandSnapshot(fNode: FigmaNode, resultFrame: Frame): BooleanOperandSnapshot {
  const abs = fNode.absoluteBoundingBox;
  const pathData = buildBooleanOperandPath(fNode, resultFrame);
  const fills = fNode.fills?.length ? cloneFills(convertFills(fNode.fills)) : undefined;
  const frame = abs
    ? {
        ...convertFrame(abs, fNode.rotation),
        x: abs.x - resultFrame.x,
        y: abs.y - resultFrame.y,
      }
    : undefined;
  return {
    sourceId: fNode.id,
    name: fNode.name || undefined,
    type: mapNodeType(fNode),
    pathData,
    frame,
    fills,
    vectorNetwork: pathData
      ? vectorNetworkFromPathData(pathData, {
          pathId: toNullId(fNode.id),
          fills,
        })
      : undefined,
  };
}

function buildBooleanMeta(fNode: FigmaNode): BooleanMeta | undefined {
  if (fNode.type !== "BOOLEAN_OPERATION") return undefined;
  const op = convertBooleanOperation(fNode.booleanOperation);
  if (!op) return undefined;
  const resultFrame = convertFrame(fNode.absoluteBoundingBox, fNode.rotation);
  const operands = (fNode.children ?? []).map((child) => buildBooleanOperandSnapshot(child, resultFrame));
  return {
    op,
    source: "figma-import",
    operands: operands.length ? operands : undefined,
  };
}

function convertOverflow(overflowDirection: FigmaNode["overflowDirection"]): "none" | "vertical" | "horizontal" | "both" | undefined {
  if (!overflowDirection || overflowDirection === "NONE") return undefined;
  if (overflowDirection === "VERTICAL_SCROLLING") return "vertical";
  if (overflowDirection === "HORIZONTAL_SCROLLING") return "horizontal";
  if (overflowDirection === "HORIZONTAL_AND_VERTICAL_SCROLLING") return "both";
  return undefined;
}

/** 단일 Figma 노드 → NULL Node (자식은 재귀에서 채움) */
function convertNode(
  fNode: FigmaNode,
  parentId: string | null,
  imageUrlMap?: Record<string, string>,
  context?: FigmaImportContext,
  options?: { id?: string; typeOverride?: NodeType; omitComponentRef?: boolean },
  parentFNode?: FigmaNode | null,
): Node {
  const id = options?.id ?? toNullId(fNode.id);
  const type = options?.typeOverride ?? mapNodeType(fNode);
  const node = createNode(type, {
    id,
    name: fNode.name || "레이어",
    parentId,
    children: [],
    frame: convertFrame(fNode.absoluteBoundingBox, fNode.rotation),
    style: convertStyle(fNode, context) as NodeStyle,
    constraints: convertConstraints(fNode.constraints),
    layout: convertLayout(fNode),
    layoutSizing: convertLayoutSizing(fNode, parentFNode),
    layoutPositioning: convertLayoutPositioning(fNode, parentFNode),
    gridChild: convertGridChild(fNode, parentFNode),
    layoutGrid: convertLayoutGrids(fNode.layoutGrids),
    locked: fNode.locked ?? false,
    hidden: fNode.visible === false,
    clipContent: fNode.clipsContent ?? false,
    overflowScrolling: convertOverflow(fNode.overflowDirection),
    isMask: fNode.isMask ?? false,
  });

  if (type === "component") {
    node.componentId = id;
  }

  if (type === "text" && fNode.characters != null) {
    const textBehavior = convertTextBoxBehavior(fNode.style);
    const textStyle = convertTextStyle(fNode.style);
    node.text = {
      value: fNode.characters,
      style: textStyle,
      wrap: textBehavior.wrap,
      autoSize: textBehavior.autoSize,
      ranges: convertTextRanges(fNode, textStyle, context),
      valueRef: resolveImportedVariableRef(fNode.boundVariables?.characters, context),
      styleBindings: convertTextStyleBindings(fNode.style, context),
    };
  }

  const fillStyleRef = readFigmaStyleRef(fNode, ["FILL", "fill"]);
  const strokeStyleRef = readFigmaStyleRef(fNode, ["STROKE", "stroke"]);
  const effectStyleRef = readFigmaStyleRef(fNode, ["EFFECT", "effect"]);
  const textStyleRef = readFigmaStyleRef(fNode, ["TEXT", "text"]);
  if (fillStyleRef) {
    node.style.fillStyleId = registerImportedStyleToken(context, "fill", fillStyleRef, node.style.fills) ?? node.style.fillStyleId;
  }
  if (strokeStyleRef) {
    node.style.strokeStyleId = registerImportedStyleToken(context, "stroke", strokeStyleRef, node.style.strokes) ?? node.style.strokeStyleId;
  }
  if (effectStyleRef) {
    node.style.effectStyleId = registerImportedStyleToken(context, "effect", effectStyleRef, node.style.effects) ?? node.style.effectStyleId;
  }
  if (type === "text" && node.text && textStyleRef) {
    node.text.styleRef = registerImportedStyleToken(context, "text", textStyleRef, node.text.style) ?? node.text.styleRef;
  }
  const fillVariableRef = resolveImportedFillVariableRef(fNode, context);
  if (fillVariableRef) {
    node.style.fillRef = fillVariableRef;
  }
  const strokeVariableRef = resolveImportedStrokeVariableRef(fNode, context);
  if (strokeVariableRef) {
    node.style.strokeRef = strokeVariableRef;
  }

  const vectorGeometry = getGeometrySegments(fNode);
  if (type === "path" && vectorGeometry[0]?.path) {
    const fills = convertFills(fNode.fills, context);
    const booleanMeta = buildBooleanMeta(fNode);
    if (vectorGeometry.length > 1) {
      node.shape = withDerivedVectorNetwork({
        segments: vectorGeometry
          .filter((segment) => Boolean(segment.path))
          .map((segment) => ({ d: segment.path, fills: fills.map((fill) => ({ ...fill })) })),
        booleanMeta,
      });
    } else {
      node.shape = withDerivedVectorNetwork({ pathData: vectorGeometry[0].path, booleanMeta });
    }
  }

  if (type === "ellipse" && (fNode as FigmaNode & { arcData?: { startingAngle: number; endingAngle: number; innerRadius: number } }).arcData) {
    const arc = (fNode as FigmaNode & { arcData: { innerRadius: number } }).arcData;
    if (arc?.innerRadius > 0) {
      node.shape = { pathData: undefined };
    }
  }

  if (fNode.type === "REGULAR_POLYGON" && (fNode as FigmaNode & { pointCount?: number }).pointCount) {
    const n = (fNode as FigmaNode & { pointCount: number }).pointCount;
    node.shape = { polygonSides: n };
  }

  if (fNode.type === "STAR" && (fNode as FigmaNode & { pointCount?: number }).pointCount) {
    const n = (fNode as FigmaNode & { pointCount: number }).pointCount;
    node.shape = { starPoints: n ?? 5, starInnerRatio: 0.5 };
  }

  if (fNode.type === "INSTANCE" && fNode.componentId && !options?.omitComponentRef) {
    const componentRef = context?.componentRefs.get(fNode.componentId);
    node.componentId = fNode.componentId;
    node.instanceOf = componentRef?.componentNodeId ?? toNullId(fNode.componentId);
    node.variantId = componentRef?.variantId;
  }

  const exportSettings = convertExportSettings(fNode.exportSettings);
  if (exportSettings) {
    node.exportSettings = exportSettings;
  }

  if (type === "image" && node.image) {
    node.image.src = imageUrlMap?.[fNode.id] ?? "";
    node.image.fit = "cover";
  }

  return applySharedNodeMetadata(node, fNode);
}

function applyRelativeFrame(node: Node, fNode: FigmaNode, parentBBox?: { x: number; y: number }) {
  if (!parentBBox || !fNode.absoluteBoundingBox) return;
  node.frame = {
    ...node.frame,
    x: fNode.absoluteBoundingBox.x - parentBBox.x,
    y: fNode.absoluteBoundingBox.y - parentBBox.y,
  };
}

function collectComponentContentRoot(
  fNode: FigmaNode,
  parentId: string,
  rootId: string,
  nodes: Map<string, Node>,
  rootIds: string[],
  imageUrlMap: Record<string, string> | undefined,
  context: FigmaImportContext,
  parentBBox?: { x: number; y: number },
  parentFNode?: FigmaNode | null,
): void {
  const renderedUrl = imageUrlMap?.[fNode.id];
  if (renderedUrl && !fNode.children?.length && (hasImageFill(fNode) || hasComplexGradient(fNode))) {
    const node = createNode("image", {
      id: rootId,
      name: fNode.name || "이미지",
      parentId,
      children: [],
      frame: convertFrame(fNode.absoluteBoundingBox, fNode.rotation),
      constraints: convertConstraints(fNode.constraints),
      locked: fNode.locked ?? false,
      hidden: fNode.visible === false,
    });
    applyRelativeFrame(node, fNode, parentBBox);
    node.image = { src: renderedUrl, fit: "fill" };
    nodes.set(rootId, node);
    context.importedNodeIdsByFigmaId.set(fNode.id, rootId);
    rootIds.push(rootId);
    return;
  }

  const node = convertNode(fNode, parentId, imageUrlMap, context, {
    id: rootId,
    typeOverride: "frame",
    omitComponentRef: true,
  }, parentFNode);
  applyRelativeFrame(node, fNode, parentBBox);
  nodes.set(rootId, node);
  context.importedNodeIdsByFigmaId.set(fNode.id, rootId);

  const myBBox = fNode.absoluteBoundingBox ?? parentBBox;
  const children = shouldTraverseChildren(fNode, node.type) ? filterImportChildren(fNode.children ?? []) : [];
  if (children.length > 0) {
    const childIds: string[] = [];
    for (const child of children) {
      collectNodes(child, rootId, nodes, childIds, imageUrlMap, myBBox, context, fNode);
    }
    node.children = childIds;
  }

  rootIds.push(rootId);
}

function collectImportedComponentNode(
  fNode: FigmaNode,
  parentId: string | null,
  nodes: Map<string, Node>,
  rootIds: string[],
  imageUrlMap: Record<string, string> | undefined,
  parentBBox: { x: number; y: number } | undefined,
  context: FigmaImportContext,
  parentFNode?: FigmaNode | null,
): void {
  const ref = context.componentRefs.get(fNode.id) ?? {
    componentNodeId: toNullId(fNode.id),
    contentRootId: toImportedComponentRootId(fNode.id),
    variantId: toImportedVariantId(fNode.id),
    variantName: "Default",
    sourceNodeId: fNode.id,
  };
  const componentNode = convertNode(fNode, parentId, imageUrlMap, context, {
    id: ref.componentNodeId,
    typeOverride: "component",
  }, parentFNode);
  applyRelativeFrame(componentNode, fNode, parentBBox);
  nodes.set(componentNode.id, componentNode);
  context.importedNodeIdsByFigmaId.set(fNode.id, componentNode.id);

  const myBBox = fNode.absoluteBoundingBox ?? parentBBox;
  const childRootIds: string[] = [];

  if (fNode.type === "COMPONENT_SET") {
    const variantChildren = filterImportChildren((fNode.children ?? []).filter((child) => child.type === "COMPONENT"));
    const variants = variantChildren.map((child, index) => {
      const childRef = context.componentRefs.get(child.id) ?? {
        componentNodeId: componentNode.id,
        contentRootId: toNullId(child.id),
        variantId: toImportedVariantId(child.id),
        variantName: buildVariantName(child, index),
        variantProps: child.variantProperties ? { ...child.variantProperties } : undefined,
        sourceNodeId: child.id,
      };
      collectComponentContentRoot(child, componentNode.id, childRef.contentRootId, nodes, childRootIds, imageUrlMap, context, myBBox, fNode);
      return {
        id: childRef.variantId,
        name: childRef.variantName,
        rootId: childRef.contentRootId,
        props: childRef.variantProps ? { ...childRef.variantProps } : undefined,
      };
    });
    componentNode.children = childRootIds;
    componentNode.variants = variants.length ? variants : undefined;
  } else {
    collectComponentContentRoot(fNode, componentNode.id, ref.contentRootId, nodes, childRootIds, imageUrlMap, context, myBBox, parentFNode);
    componentNode.children = childRootIds;
    componentNode.variants = childRootIds[0]
      ? [{ id: ref.variantId, name: ref.variantName, rootId: childRootIds[0] }]
      : undefined;
  }

  applyImportedComponentPropertyDefinitions(componentNode, fNode);

  rootIds.push(componentNode.id);
}

function applyImportedComponentPropertyDefinitions(
  componentNode: Node,
  fNode: FigmaNode,
): void {
  const definitionMap = fNode.componentPropertyDefinitions ?? {};
  const propertyDefinitions: NonNullable<Node["propertyDefinitions"]> = {};

  walkFigmaTree(fNode, (current, parent) => {
    const refs = Object.entries(current.componentPropertyReferences ?? {});
    if (!refs.length) return;

    refs.forEach(([nodeProperty, propertyName]) => {
      const definition = definitionMap[propertyName];
      const kind = mapImportedComponentPropertyKind(nodeProperty, definition?.type);
      if (!kind) return;

      const sourceId =
        current.id === fNode.id || parent?.type === "COMPONENT_SET"
          ? componentNode.id
          : toNullId(current.id);
      if (propertyDefinitions[sourceId]) return;

      propertyDefinitions[sourceId] = {
        kind,
        name: normalizeComponentPropertyName(propertyName),
      };
    });
  });

  componentNode.propertyDefinitions = Object.keys(propertyDefinitions).length ? propertyDefinitions : undefined;
}

/** 렌더링 실패한 노드의 부모 ID 수집 (부모를 통째로 렌더링하기 위해) */
function collectParentIdsForFailed(fNode: FigmaNode, failedIds: Set<string>): string[] {
  const parentIds: string[] = [];
  function walk(node: FigmaNode) {
    const hasFailedChild = node.children?.some((ch) => failedIds.has(ch.id)) ?? false;
    if (hasFailedChild) {
      parentIds.push(node.id);
      return;
    }
    for (const ch of node.children ?? []) {
      walk(ch);
    }
  }
  walk(fNode);
  return parentIds;
}

/** 트리에서 이미지 렌더링이 필요한 노드 ID 수집 */
function collectImageNodeIds(fNode: FigmaNode, out: string[]): void {
  if (shouldRenderAsImage(fNode)) {
    out.push(fNode.id);
    return;
  }
  if (!shouldTraverseChildren(fNode, mapNodeType(fNode))) return;
  for (const ch of fNode.children ?? []) {
    collectImageNodeIds(ch, out);
  }
}

function orderChildrenForImport(children: FigmaNode[]): FigmaNode[] {
  const maskChildren = children.filter((child) => child.isMask);
  if (maskChildren.length !== 1) return children;
  const maskChild = maskChildren[0]!;
  return [maskChild, ...children.filter((child) => child !== maskChild)];
}

function filterImportChildren(children: FigmaNode[]): FigmaNode[] {
  return orderChildrenForImport(children).filter(
    (child) => !(child.visible === false && (child as FigmaNode & { exportSettings?: unknown }).exportSettings == null),
  );
}

function shouldTraverseChildren(fNode: FigmaNode, nodeType: NodeType): boolean {
  if (nodeType === "path" && fNode.type === "BOOLEAN_OPERATION") return false;
  return true;
}

/** 트리 순회하여 노드 맵과 루트 ID 목록 생성 */
function collectNodes(
  fNode: FigmaNode,
  parentId: string | null,
  nodes: Map<string, Node>,
  rootIds: string[],
  imageUrlMap?: Record<string, string>,
  parentBBox?: { x: number; y: number },
  context: FigmaImportContext = createEmptyImportContext(),
  parentFNode?: FigmaNode | null,
): void {
  if (fNode.type === "COMPONENT_SET" || (fNode.type === "COMPONENT" && context.componentRefs.has(fNode.id))) {
    collectImportedComponentNode(fNode, parentId, nodes, rootIds, imageUrlMap, parentBBox, context, parentFNode);
    return;
  }

  const semanticVectorChildren = getSemanticVectorWrapperChildren(fNode);
  if (semanticVectorChildren?.length) {
    const node = convertNode(fNode, parentId, imageUrlMap, context, { typeOverride: "path" }, parentFNode);
    applyRelativeFrame(node, fNode, parentBBox);
    const parentAbsX = fNode.absoluteBoundingBox?.x ?? 0;
    const parentAbsY = fNode.absoluteBoundingBox?.y ?? 0;
    const pathEntries = semanticVectorChildren.map(({ pathId, node: child, geometryPath }) => {
      const childAbsX = child.absoluteBoundingBox?.x ?? parentAbsX;
      const childAbsY = child.absoluteBoundingBox?.y ?? parentAbsY;
      return {
        pathId,
        pathData: translatePathD(geometryPath, childAbsX - parentAbsX, childAbsY - parentAbsY),
        fills: convertFills(child.fills, context),
      };
    });
    const pathModels = pathEntries.map((entry) => createEditableVectorPathModel(entry.pathId, entry.pathData, entry.fills));
    const primaryFills = pathEntries[0]?.fills;
    if (primaryFills?.length) {
      node.style.fills = cloneFills(primaryFills) ?? node.style.fills;
      node.style.fillRef = resolveImportedFillVariableRef(semanticVectorChildren[0]?.node, context) ?? node.style.fillRef;
    }
    node.shape = {
      pathData: undefined,
      segments: pathEntries.map((entry) => ({
        d: entry.pathData,
        fills: cloneFills(entry.fills) ?? [],
      })),
      vectorNetwork: vectorNetworkFromEditableVectorPathModels(pathModels),
    };
    const id = node.id;
    nodes.set(id, node);
    context.importedNodeIdsByFigmaId.set(fNode.id, id);
    rootIds.push(id);
    return;
  }

  const renderedUrl = imageUrlMap?.[fNode.id];
  if (renderedUrl) {
    const id = toNullId(fNode.id);
    const bbox = fNode.absoluteBoundingBox;
    const frame = convertFrame(bbox, fNode.rotation);
    if (parentBBox && bbox) {
      frame.x = bbox.x - parentBBox.x;
      frame.y = bbox.y - parentBBox.y;
    }
    const node = createNode("image", {
      id,
      name: fNode.name || "이미지",
      parentId,
      children: [],
      frame,
      constraints: convertConstraints(fNode.constraints),
      locked: fNode.locked ?? false,
      hidden: fNode.visible === false,
    });
    node.image = { src: renderedUrl, fit: "fill" };
    nodes.set(id, node);
    context.importedNodeIdsByFigmaId.set(fNode.id, id);
    rootIds.push(id);
    return;
  }

  const node = convertNode(fNode, parentId, imageUrlMap, context, undefined, parentFNode);
  applyRelativeFrame(node, fNode, parentBBox);
  const id = node.id;
  nodes.set(id, node);
  context.importedNodeIdsByFigmaId.set(fNode.id, id);

  const myBBox = fNode.absoluteBoundingBox ?? parentBBox;
  const children = shouldTraverseChildren(fNode, node.type) ? filterImportChildren(fNode.children ?? []) : [];
  if (children.length > 0) {
    const childIds: string[] = [];
    for (const ch of children) {
      collectNodes(ch, id, nodes, childIds, imageUrlMap, myBBox, context, fNode);
    }
    node.children = childIds;
  }

  rootIds.push(id);
}

type ImportPageSource =
  | { kind: "canvas"; node: FigmaNode; name: string }
  | { kind: "node"; node: FigmaNode; name: string };

function getImportPageSources(figmaRoot: FigmaNode, fileName?: string): ImportPageSource[] {
  if (figmaRoot.type === "DOCUMENT") {
    const children = figmaRoot.children ?? [];
    const canvases = children.filter((child) => child.type === "CANVAS");
    if (canvases.length > 0) {
      return canvases.map((canvas, index) => ({
        kind: "canvas",
        node: canvas,
        name: canvas.name || `페이지 ${index + 1}`,
      }));
    }
    return children.map((child, index) => ({
      kind: "node",
      node: child,
      name: children.length === 1 ? (fileName ?? child.name ?? "Figma 임포트") : (child.name || `페이지 ${index + 1}`),
    }));
  }

  if (figmaRoot.type === "CANVAS") {
    return [{ kind: "canvas", node: figmaRoot, name: fileName ?? figmaRoot.name ?? "Figma 임포트" }];
  }

  return [{ kind: "node", node: figmaRoot, name: fileName ?? figmaRoot.name ?? "Figma 임포트" }];
}

function computeBoundsFromNodes(nodes: FigmaNode[]): Frame {
  const boxes = nodes
    .map((node) => node.absoluteBoundingBox)
    .filter((bbox): bbox is NonNullable<FigmaNode["absoluteBoundingBox"]> => Boolean(bbox));
  if (boxes.length === 0) return { x: 0, y: 0, w: 1200, h: 800, rotation: 0 };

  const left = Math.min(...boxes.map((bbox) => bbox.x));
  const top = Math.min(...boxes.map((bbox) => bbox.y));
  const right = Math.max(...boxes.map((bbox) => bbox.x + bbox.width));
  const bottom = Math.max(...boxes.map((bbox) => bbox.y + bbox.height));
  return {
    x: left,
    y: top,
    w: Math.max(1, right - left),
    h: Math.max(1, bottom - top),
    rotation: 0,
  };
}

function scoreSourceMatch(instanceNode: Node, sourceNode: Node): number {
  let score = 0;
  if (instanceNode.type === sourceNode.type) score += 4;
  if (instanceNode.name && sourceNode.name && instanceNode.name === sourceNode.name) score += 2;
  if (instanceNode.children.length === sourceNode.children.length) score += 1;
  return score;
}

function pairInstanceChildrenToSource(
  allNodes: Record<string, Node>,
  instanceChildIds: string[],
  sourceChildIds: string[],
): Array<[string, string]> {
  const remaining = [...sourceChildIds];
  const pairs: Array<[string, string]> = [];

  for (const instanceChildId of instanceChildIds) {
    const instanceChild = allNodes[instanceChildId];
    if (!instanceChild || remaining.length === 0) continue;

    let bestIndex = 0;
    let bestScore = -1;
    remaining.forEach((sourceChildId, index) => {
      const sourceChild = allNodes[sourceChildId];
      if (!sourceChild) return;
      const score = scoreSourceMatch(instanceChild, sourceChild);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    const [matched] = remaining.splice(bestIndex, 1);
    if (matched) {
      pairs.push([instanceChildId, matched]);
    }
  }

  return pairs;
}

function collectImportedSubtreeNodes(
  allNodes: Record<string, Node>,
  rootId: string,
  out: Node[] = [],
): Node[] {
  const node = allNodes[rootId];
  if (!node) return out;
  out.push(node);
  node.children.forEach((childId) => collectImportedSubtreeNodes(allNodes, childId, out));
  return out;
}

function getImportedVariantRoot(
  allNodes: Record<string, Node>,
  instanceNode: Node,
): Node | null {
  if (!instanceNode.instanceOf) return null;
  const componentNode = allNodes[instanceNode.instanceOf];
  if (!componentNode || componentNode.type !== "component") return null;
  const variantId = instanceNode.variantId ?? componentNode.variants?.[0]?.id;
  const variantRootId =
    componentNode.variants?.find((variant) => variant.id === variantId)?.rootId ??
    componentNode.children[0];
  return variantRootId ? allNodes[variantRootId] ?? null : null;
}

function relinkImportedInstanceDescendants(
  allNodes: Record<string, Node>,
  instanceNodeId: string,
): void {
  const instanceNode = allNodes[instanceNodeId];
  if (!instanceNode || instanceNode.type !== "instance") return;
  const variantRoot = getImportedVariantRoot(allNodes, instanceNode);
  if (!variantRoot) return;

  const childPairs = pairInstanceChildrenToSource(allNodes, instanceNode.children, variantRoot.children);
  childPairs.forEach(([instanceChildId, sourceChildId]) => {
    linkImportedSourceSubtree(allNodes, instanceChildId, sourceChildId);
  });
}

function mergeImportedOverride(node: Node, patch: Partial<NonNullable<Node["overrides"]>>) {
  node.overrides = {
    ...(node.overrides ?? {}),
    ...patch,
  };
}

function applyImportedInstanceComponentProperties(
  allNodes: Record<string, Node>,
  context: FigmaImportContext,
): void {
  context.instancePropertyValues.forEach((componentProperties, instanceNodeId) => {
    const instanceNode = allNodes[instanceNodeId];
    if (!instanceNode || instanceNode.type !== "instance" || !instanceNode.instanceOf) return;
    const componentNode = allNodes[instanceNode.instanceOf];
    if (!componentNode || componentNode.type !== "component" || !componentNode.propertyDefinitions) return;

    const subtreeNodes = collectImportedSubtreeNodes(allNodes, instanceNode.id);
    const nodeBySourceId = new Map<string, Node>();
    subtreeNodes.forEach((node) => {
      if (node.sourceId && !nodeBySourceId.has(node.sourceId)) {
        nodeBySourceId.set(node.sourceId, node);
      }
    });

    Object.entries(componentProperties).forEach(([propertyName, propertyValue]) => {
      const normalizedName = normalizeComponentPropertyName(propertyName);
      const matchedDefs = Object.entries(componentNode.propertyDefinitions ?? {}).filter(([, definition]) =>
        definition.name === normalizedName,
      );

      matchedDefs.forEach(([sourceId, definition]) => {
        const targetNode = nodeBySourceId.get(sourceId);
        if (!targetNode) return;

        if (definition.kind === "text" && targetNode.type === "text" && propertyValue.value != null) {
          const nextText = {
            ...(targetNode.text ?? { value: "", style: { ...DEFAULT_TEXT_STYLE }, wrap: true, autoSize: false }),
            value: String(propertyValue.value),
          };
          targetNode.text = nextText;
          mergeImportedOverride(targetNode, { text: { ...nextText, style: { ...nextText.style } } });
          return;
        }

        if (definition.kind === "boolean") {
          targetNode.hidden = !Boolean(propertyValue.value);
          mergeImportedOverride(targetNode, { hidden: targetNode.hidden });
          return;
        }

        if (definition.kind === "instance" && targetNode.type === "instance" && typeof propertyValue.value === "string") {
          const componentRef = context.componentRefs.get(propertyValue.value);
          if (!componentRef) return;
          targetNode.instanceOf = componentRef.componentNodeId;
          targetNode.variantId = componentRef.variantId;
          mergeImportedOverride(targetNode, {
            instanceOf: targetNode.instanceOf,
            variantId: targetNode.variantId,
          });
          relinkImportedInstanceDescendants(allNodes, targetNode.id);
        }
      });
    });
  });
}

function linkImportedSourceSubtree(
  allNodes: Record<string, Node>,
  instanceNodeId: string,
  sourceNodeId: string,
): void {
  const instanceNode = allNodes[instanceNodeId];
  const sourceNode = allNodes[sourceNodeId];
  if (!instanceNode || !sourceNode) return;

  instanceNode.sourceId = sourceNodeId;
  const childPairs = pairInstanceChildrenToSource(allNodes, instanceNode.children, sourceNode.children);
  childPairs.forEach(([instanceChildId, sourceChildId]) => {
    linkImportedSourceSubtree(allNodes, instanceChildId, sourceChildId);
  });
}

function linkImportedInstanceSources(allNodes: Record<string, Node>): void {
  Object.values(allNodes).forEach((node) => {
    if (node.type !== "instance" || !node.instanceOf) return;
    const componentNode = allNodes[node.instanceOf];
    if (!componentNode || componentNode.type !== "component") return;

    if (!node.sourceId) {
      node.sourceId = componentNode.id;
    }
    const variantId = node.variantId ?? componentNode.variants?.[0]?.id;
    const variantRootId = componentNode.variants?.find((variant) => variant.id === variantId)?.rootId;
    const variantRoot = variantRootId ? allNodes[variantRootId] : null;
    if (!variantRoot) return;

    const childPairs = pairInstanceChildrenToSource(allNodes, node.children, variantRoot.children);
    childPairs.forEach(([instanceChildId, sourceChildId]) => {
      linkImportedSourceSubtree(allNodes, instanceChildId, sourceChildId);
    });
  });
}

function buildImportedPageIdByNodeId(allNodes: Record<string, Node>, pages: Array<{ id: string; rootId: string }>) {
  const pageIdByNodeId = new Map<string, string>();

  const visit = (pageId: string, nodeId: string) => {
    if (pageIdByNodeId.has(nodeId)) return;
    pageIdByNodeId.set(nodeId, pageId);
    const node = allNodes[nodeId];
    node?.children.forEach((childId) => visit(pageId, childId));
  };

  pages.forEach((page) => visit(page.id, page.rootId));
  return pageIdByNodeId;
}

function applyImportedNodePrototypeData(
  figmaRoot: FigmaNode,
  allNodes: Record<string, Node>,
  pages: Array<{ id: string; rootId: string }>,
  context: FigmaImportContext,
): void {
  const pageIdByNodeId = buildImportedPageIdByNodeId(allNodes, pages);
  const pageByName = new Map(pages.map((page) => [allNodes[page.rootId]?.name ?? page.id, page.id]));

  walkFigmaTree(figmaRoot, (fNode) => {
    const importedNodeId = context.importedNodeIdsByFigmaId.get(fNode.id);
    if (!importedNodeId) return;
    const importedNode = allNodes[importedNodeId];
    if (!importedNode) return;
    const interactions = importFigmaNodePrototype(fNode, importedNodeId, {
      resolvePageIdFromDestination: (figmaNodeId) => {
        if (!figmaNodeId) return undefined;
        const importedId = context.importedNodeIdsByFigmaId.get(figmaNodeId) ?? toNullId(figmaNodeId);
        return pageIdByNodeId.get(importedId);
      },
      resolvePageIdByName: (pageName) => (pageName ? pageByName.get(pageName) : undefined),
      resolveNodeIdFromFigma: (figmaNodeId) => {
        if (!figmaNodeId) return undefined;
        return context.importedNodeIdsByFigmaId.get(figmaNodeId) ?? toNullId(figmaNodeId);
      },
    });
    if (interactions?.length) {
      importedNode.prototype = { interactions };
    }
  });
}

function buildCanvasPage(params: {
  pageId: string;
  pageName: string;
  canvas: FigmaNode;
  imageUrlMap?: Record<string, string>;
  context: FigmaImportContext;
}) {
  const { pageId, pageName, canvas, imageUrlMap, context } = params;
  const pageNodes = new Map<string, Node>();
  const children = filterImportChildren(canvas.children ?? []);
  const frame = computeBoundsFromNodes(children);
  const childRootIds: string[] = [];

  children.forEach((child) => {
    collectNodes(child, pageId, pageNodes, childRootIds, imageUrlMap, { x: frame.x, y: frame.y }, context);
  });

  const pageNode = createNode("frame", {
    id: pageId,
    name: pageName,
    parentId: "root",
    children: childRootIds,
    frame,
  });
  pageNodes.set(pageId, pageNode);

  return {
    page: { id: pageId, name: pageName, rootId: pageId },
    nodes: Object.fromEntries(pageNodes),
    frame,
  };
}

function buildNodePage(params: {
  pageId: string;
  pageName: string;
  source: FigmaNode;
  imageUrlMap?: Record<string, string>;
  context: FigmaImportContext;
}) {
  const { pageId, pageName, source, imageUrlMap, context } = params;
  const pageNodes = new Map<string, Node>();
  const rootIds: string[] = [];
  collectNodes(source, null, pageNodes, rootIds, imageUrlMap, undefined, context);
  const sourceRootId = rootIds[0];
  if (!sourceRootId) {
    const frame = { x: 0, y: 0, w: 1200, h: 800, rotation: 0 };
    const pageNode = createNode("frame", {
      id: pageId,
      name: pageName,
      parentId: "root",
      frame,
    });
    return {
      page: { id: pageId, name: pageName, rootId: pageId },
      nodes: { [pageId]: pageNode },
      frame,
    };
  }

  const sourceRoot = pageNodes.get(sourceRootId);
  const allNodes: Record<string, Node> = {};
  for (const [id, node] of pageNodes) {
    if (id === sourceRootId) continue;
    allNodes[id] = {
      ...node,
      parentId: node.parentId === sourceRootId ? pageId : node.parentId,
    };
  }

  const pageNode = sourceRoot
    ? {
        ...sourceRoot,
        id: pageId,
        parentId: "root",
        name: pageName,
      }
    : createNode("frame", {
        id: pageId,
        name: pageName,
        parentId: "root",
      });
  allNodes[pageId] = pageNode;

  return {
    page: { id: pageId, name: pageName, rootId: pageId },
    nodes: allNodes,
    frame: pageNode.frame,
  };
}

/**
 * Figma 파일 → NULL 문서 변환
 * 1) getFile 또는 getFileNodes로 로드한 뒤 이 함수에 document 노드 전달
 */
export type FigmaImportDocOptions = {
  fileName?: string;
  nodeId?: string;
  imageUrlMap?: Record<string, string>;
  figmaStyles?: Record<string, FigmaStyleMeta>;
  figmaVariableCollections?: Record<string, FigmaLocalVariableCollection>;
  figmaVariables?: Record<string, FigmaLocalVariable>;
};

export function figmaNodesToNullDoc(
  fileKey: string,
  figmaRoot: FigmaNode,
  options?: FigmaImportDocOptions
): SerializableDoc {
  const context = buildImportContext(
    figmaRoot,
    options?.figmaStyles,
    options?.figmaVariableCollections,
    options?.figmaVariables,
  );
  const pageSources = getImportPageSources(figmaRoot, options?.fileName);
  if (pageSources.length === 0) {
    const emptyDoc = createEmptyNullDoc();
    return emptyDoc;
  }

  const root = "root";
  const rootGroup = createNode("group", {
    id: root,
    name: "루트",
    parentId: null,
    children: [],
    frame: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
    style: { fills: [], strokes: [], opacity: 1, blendMode: "normal", effects: [] },
    layout: { mode: "fixed" },
    constraints: {},
    locked: true,
    hidden: true,
  });

  const allNodes: Record<string, Node> = { [root]: rootGroup };
  const pages = pageSources.map((source, index) => {
    const pageId = `figma_page_${index + 1}`;
    const built =
      source.kind === "canvas"
        ? buildCanvasPage({
            pageId,
            pageName: source.name,
            canvas: source.node,
            imageUrlMap: options?.imageUrlMap,
            context,
          })
        : buildNodePage({
            pageId,
            pageName: source.name,
            source: source.node,
            imageUrlMap: options?.imageUrlMap,
            context,
          });
    Object.assign(allNodes, built.nodes);
    rootGroup.children.push(pageId);
    return built;
  });

  const importedRoot = allNodes[pages[0]!.page.rootId];
  const rootFrame = importedRoot?.frame ?? { x: 0, y: 0, w: 800, h: 600 };
  const viewPanX = rootFrame.x - 50;
  const viewPanY = rootFrame.y - 50;

  linkImportedInstanceSources(allNodes);
  applyImportedInstanceComponentProperties(allNodes, context);
  applyImportedNodePrototypeData(figmaRoot, allNodes, pages.map((page) => page.page), context);
  const importedStartPageId = resolveImportedStartPageId({
    pageSources,
    importedPageIds: pages.map((page) => page.page.id),
  });

  const doc: Doc = {
    schema: "null_advanced_v1",
    version: 1,
    root,
    pages: pages.map((page) => page.page),
    nodes: allNodes,
    selection: new Set(),
    view: { zoom: 1, panX: viewPanX, panY: viewPanY },
    styles: Array.from(context.styleTokens.values()),
    variables: context.variables,
    variableModes: context.variableModes.length ? context.variableModes : ["기본"],
    variableMode: context.defaultVariableMode ?? context.variableModes[0] ?? "기본",
    components: Object.fromEntries(
      Object.values(allNodes)
        .filter((node) => node.type === "component")
        .map((node) => [node.id, node.id]),
    ),
    prototype: { startPageId: importedStartPageId ?? pages[0]!.page.id },
  };

  return sceneSerializeDoc(doc);
}

function createEmptyNullDoc(): SerializableDoc {
  return sceneSerializeDoc(createDoc());
}

export type FigmaImportParams = {
  fileKey: string;
  accessToken: string;
  nodeId?: string;
  fileName?: string;
};

/**
 * Figma API 호출 후 NULL 문서 반환
 * 서버(API 라우트)에서만 사용. accessToken은 환경변수 또는 요청 body.
 */
export async function figmaFileToNullDoc(params: FigmaImportParams): Promise<SerializableDoc> {
  const { getFile, getFileNodes, getImages, getLocalVariables } = await import("./figma");
  const { fileKey, accessToken, fileName } = params;
  const nodeId = params.nodeId?.replace(/-/g, ":") ?? undefined;
  const localVariablesPromise = getLocalVariables(fileKey, accessToken).catch(() => null);

  let figmaRoot: FigmaNode;
  let figmaStyles: Record<string, FigmaStyleMeta> | undefined;

  if (nodeId) {
    const res = await getFileNodes(fileKey, [nodeId], accessToken);
    const nodeEntry = res.nodes?.[nodeId];
    if (!nodeEntry?.document) throw new Error("Figma node not found");
    figmaRoot = nodeEntry.document;
  } else {
    const file = await getFile(fileKey, accessToken);
    figmaRoot = file.document as unknown as FigmaNode;
    figmaStyles = file.styles;
  }

  const localVariables = await localVariablesPromise;
  const figmaVariableCollections = localVariables?.meta?.variableCollections;
  const figmaVariables = localVariables?.meta?.variables;

  const imageNodeIds: string[] = [];
  const pageSources = getImportPageSources(figmaRoot, fileName);
  pageSources.forEach((source) => collectImageNodeIds(source.node, imageNodeIds));

  const imageUrlMap: Record<string, string> = {};
  if (imageNodeIds.length > 0) {
    const BATCH = 100;
    for (let i = 0; i < imageNodeIds.length; i += BATCH) {
      const batch = imageNodeIds.slice(i, i + BATCH);
      try {
        const imgRes = await getImages(fileKey, batch, accessToken, "png", 2);
        if (imgRes.images) {
          for (const [k, v] of Object.entries(imgRes.images)) {
            if (v) imageUrlMap[k] = v;
          }
        }
      } catch {
        // 배치 실패 시 다음 배치로 진행
      }
    }

    const failed = imageNodeIds.filter((id) => !imageUrlMap[id]);
    if (failed.length > 0) {
      const parentIds = Array.from(
        new Set(pageSources.flatMap((source) => collectParentIdsForFailed(source.node, new Set(failed)))),
      );
      if (parentIds.length > 0) {
        for (let i = 0; i < parentIds.length; i += BATCH) {
          const batch = parentIds.slice(i, i + BATCH);
          try {
            const imgRes = await getImages(fileKey, batch, accessToken, "png", 2);
            if (imgRes.images) {
              for (const [k, v] of Object.entries(imgRes.images)) {
                if (v) imageUrlMap[k] = v;
              }
            }
          } catch { /* skip */ }
        }
      }
    }
  }

  return figmaNodesToNullDoc(fileKey, figmaRoot, {
    fileName: fileName ?? undefined,
    nodeId,
    imageUrlMap: Object.keys(imageUrlMap).length > 0 ? imageUrlMap : undefined,
    figmaStyles,
    figmaVariableCollections,
    figmaVariables,
  });
}
