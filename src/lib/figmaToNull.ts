/**
 * Figma 파일/노드 → NULL 문서 변환
 * FIGMA_IMPORT 로드맵 2, 3, 5, 6 통합
 */

import type { FigmaNode, FigmaPaint, FigmaRGBA, FigmaEffect, FigmaTypeStyle, FigmaGradientPaint, FigmaGradientStop } from "./figma";
import { rgbaToHex } from "./figma";
import type { NodeType, Fill, Stroke, Effect, NodeStyle, Frame, Node, Doc, SerializableDoc, TextStyle, LayoutMode, Constraints } from "@/advanced/doc/scene";
import { createNode, createDoc, serializeDoc as sceneSerializeDoc, DEFAULT_TEXT_STYLE } from "@/advanced/doc/scene";

const FIGMA_ID_PREFIX = "figma_";

function toNullId(figmaId: string): string {
  return `${FIGMA_ID_PREFIX}${figmaId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/** Figma 노드에 이미지 fill이 있는지 */
function hasImageFill(fNode: FigmaNode): boolean {
  return fNode.fills?.some((f: { type?: string }) => f.type === "IMAGE") ?? false;
}

/** 서브트리에 벡터/불리언/마스크가 있는지 재귀 확인 */
function hasComplexDescendant(fNode: FigmaNode): boolean {
  for (const ch of fNode.children ?? []) {
    const t = ch.type;
    if (t === "VECTOR" || t === "BOOLEAN_OPERATION") return true;
    if ((ch as FigmaNode & { isMask?: boolean }).isMask) return true;
    if (hasComplexDescendant(ch)) return true;
  }
  return false;
}

/** 비선형 그라데이션 fill이 있는지 */
function hasComplexGradient(fNode: FigmaNode): boolean {
  return fNode.fills?.some((f: { type?: string }) =>
    f.type === "GRADIENT_RADIAL" ||
    f.type === "GRADIENT_ANGULAR" ||
    f.type === "GRADIENT_DIAMOND"
  ) ?? false;
}

/** 이 노드를 Figma 서버에서 이미지로 렌더링해야 하는지 판별 */
function shouldRenderAsImage(fNode: FigmaNode): boolean {
  if (hasImageFill(fNode)) return true;
  const t = fNode.type;
  if (t === "VECTOR" || t === "BOOLEAN_OPERATION") return true;
  if ((fNode as FigmaNode & { isMask?: boolean }).isMask) return true;
  if (hasComplexGradient(fNode)) return true;
  if (fNode.children?.some((ch: FigmaNode & { isMask?: boolean }) => ch.isMask)) return true;
  if ((t === "INSTANCE" || t === "COMPONENT") && hasComplexDescendant(fNode)) return true;
  if (t === "GROUP" && hasComplexDescendant(fNode) && !fNode.children?.some(
    (ch) => ch.type === "FRAME" || ch.type === "TEXT" || ch.type === "RECTANGLE"
  )) return true;
  return false;
}

/** Figma node type → NULL NodeType (이미지 fill 있으면 image로) */
function mapNodeType(fNode: FigmaNode): NodeType {
  if (hasImageFill(fNode)) return "image";
  const type = fNode.type;
  switch (type) {
    case "FRAME":
    case "SECTION":
      return "frame";
    case "GROUP":
    case "BOOLEAN_OPERATION":
    case "TRANSFORM_GROUP":
      return "group";
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
      return "path";
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

function convertFills(paints: FigmaPaint[] | undefined): Fill[] {
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
      const stopArr = stops.map((s: FigmaGradientStop) => ({ offset: s.position, color: rgbaToHex(s.color) }));
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
  strokeAlign: FigmaNode["strokeAlign"]
): Stroke[] {
  if (!strokes || strokes.length === 0) return [];
  const weight = strokeWeight ?? 1;
  const align = strokeAlign === "OUTSIDE" ? "outside" : strokeAlign === "CENTER" ? "center" : "inside";
  return strokes
    .filter((s) => s.visible !== false)
    .map((s) => {
      if (s.type === "SOLID") {
        return { color: rgbaToHex(s.color), width: weight, align };
      }
      return { color: "#000000", width: weight, align };
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

function convertStyle(fNode: FigmaNode): Partial<NodeStyle> {
  const fills = convertFills(fNode.fills);
  const strokes = convertStrokes(fNode.strokes, fNode.strokeWeight, fNode.strokeAlign);
  const effects = convertEffects(fNode.effects);
  const opacity = fNode.opacity ?? 1;
  const blendMode = BLEND_MAP[fNode.blendMode ?? "NORMAL"] ?? "normal";

  const style: Partial<NodeStyle> = {
    fills,
    strokes,
    opacity,
    blendMode,
    effects,
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
  let align: "left" | "center" | "right" = "left";
  if (style.textAlignHorizontal === "CENTER") align = "center";
  if (style.textAlignHorizontal === "RIGHT") align = "right";

  let textCase: "none" | "upper" | "lower" | "capitalize" | undefined;
  if (style.textCase === "UPPER") textCase = "upper";
  else if (style.textCase === "LOWER") textCase = "lower";
  else if (style.textCase === "TITLE" || style.textCase === "SMALL_CAPS" || style.textCase === "SMALL_CAPS_FORCED") textCase = "capitalize";

  const figmaFont = style.fontFamily ?? style.fontPostScriptName;
  const fontFamily = figmaFont ? `${figmaFont}, ${FONT_FALLBACK_STACK}` : FONT_FALLBACK_STACK;

  return {
    fontFamily,
    fontSize: style.fontSize ?? 16,
    fontWeight: style.fontWeight ?? 500,
    lineHeight: style.lineHeightPx ? style.lineHeightPx / (style.fontSize || 16) : 1.4,
    letterSpacing: style.letterSpacing ?? 0,
    align,
    italic: style.italic,
    underline: style.textDecoration === "UNDERLINE",
    lineThrough: style.textDecoration === "STRIKETHROUGH",
    textCase,
  };
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

  return {
    mode: "auto",
    dir,
    gap,
    padding,
    align,
    wrap: fNode.layoutWrap === "WRAP",
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
function convertNode(fNode: FigmaNode, parentId: string | null, imageUrlMap?: Record<string, string>): Node {
  const id = toNullId(fNode.id);
  const type = mapNodeType(fNode);
  const node = createNode(type, {
    id,
    name: fNode.name || "레이어",
    parentId,
    children: [],
    frame: convertFrame(fNode.absoluteBoundingBox, fNode.rotation),
    style: convertStyle(fNode) as NodeStyle,
    constraints: convertConstraints(fNode.constraints),
    layout: convertLayout(fNode),
    locked: fNode.locked ?? false,
    hidden: fNode.visible === false,
    clipContent: fNode.clipsContent ?? false,
    overflowScrolling: convertOverflow(fNode.overflowDirection),
  });

  if (type === "text" && fNode.characters != null) {
    node.text = {
      value: fNode.characters,
      style: convertTextStyle(fNode.style),
      wrap: true,
      autoSize: false,
    };
  }

  if (type === "path" && fNode.fillGeometry?.[0]?.path) {
    node.shape = { pathData: fNode.fillGeometry[0].path };
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

  if (fNode.type === "INSTANCE" && fNode.componentId) {
    node.componentId = fNode.componentId;
    node.instanceOf = toNullId(fNode.componentId);
  }

  if (type === "image" && node.image) {
    node.image.src = imageUrlMap?.[fNode.id] ?? "";
    node.image.fit = "cover";
  }

  return node;
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
  for (const ch of fNode.children ?? []) {
    collectImageNodeIds(ch, out);
  }
}

/** 트리 순회하여 노드 맵과 루트 ID 목록 생성 */
function collectNodes(
  fNode: FigmaNode,
  parentId: string | null,
  nodes: Map<string, Node>,
  rootIds: string[],
  imageUrlMap?: Record<string, string>,
  parentBBox?: { x: number; y: number },
): void {
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
    rootIds.push(id);
    return;
  }

  const node = convertNode(fNode, parentId, imageUrlMap);
  if (parentBBox && fNode.absoluteBoundingBox) {
    node.frame = {
      ...node.frame,
      x: fNode.absoluteBoundingBox.x - parentBBox.x,
      y: fNode.absoluteBoundingBox.y - parentBBox.y,
    };
  }
  const id = node.id;
  nodes.set(id, node);

  const myBBox = fNode.absoluteBoundingBox ?? parentBBox;
  const children = fNode.children ?? [];
  if (children.length > 0) {
    const childIds: string[] = [];
    for (const ch of children) {
      if (ch.visible === false && (ch as FigmaNode & { exportSettings?: unknown }).exportSettings == null) continue;
      collectNodes(ch, id, nodes, childIds, imageUrlMap, myBBox);
    }
    node.children = childIds;
  }

  rootIds.push(id);
}

/** DOCUMENT 또는 CANVAS 무시하고 바로 자식들만 처리 */
function getTopLevelNodes(fNode: FigmaNode): FigmaNode[] {
  if (fNode.type === "DOCUMENT") return fNode.children ?? [];
  if (fNode.type === "CANVAS") return fNode.children ?? [];
  return [fNode];
}

/**
 * Figma 파일 → NULL 문서 변환
 * 1) getFile 또는 getFileNodes로 로드한 뒤 이 함수에 document 노드 전달
 */
export function figmaNodesToNullDoc(
  fileKey: string,
  figmaRoot: FigmaNode,
  options?: { fileName?: string; nodeId?: string; imageUrlMap?: Record<string, string> }
): SerializableDoc {
  const nodes = new Map<string, Node>();
  const rootIds: string[] = [];

  const topLevel = getTopLevelNodes(figmaRoot);
  const firstFrame = topLevel.find((n) => n.type === "FRAME" || n.type === "SECTION" || n.type === "GROUP");
  const rootNode = firstFrame ?? topLevel[0];

  if (!rootNode) {
    const emptyDoc = createEmptyNullDoc();
    return emptyDoc;
  }

  collectNodes(rootNode, null, nodes, rootIds, options?.imageUrlMap);
  const pageRootId = rootIds[0]!;

  const root = "root";
  const pageId = "figma_page_1";

  const rootGroup = createNode("group", {
    id: root,
    name: "루트",
    parentId: null,
    children: [pageId],
    frame: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
    style: { fills: [], strokes: [], opacity: 1, blendMode: "normal", effects: [] },
    layout: { mode: "fixed" },
    constraints: {},
    locked: true,
    hidden: true,
  });

  const pageNode = nodes.get(pageRootId);
  const allNodes: Record<string, Node> = { [root]: rootGroup };
  for (const [id, n] of nodes) {
    const node = { ...n };
    if (id === pageRootId) {
      node.id = pageId;
      node.parentId = root;
      node.name = options?.fileName ?? "Figma 임포트";
      allNodes[pageId] = node;
      continue;
    }
    if (node.parentId === pageRootId) node.parentId = pageId;
    allNodes[id] = node;
  }
  if (!allNodes[pageId] && pageNode) allNodes[pageId] = { ...pageNode, id: pageId, parentId: root, name: options?.fileName ?? "Figma 임포트" };

  const importedRoot = allNodes[pageId];
  const rootFrame = importedRoot?.frame ?? { x: 0, y: 0, w: 800, h: 600 };
  const viewPanX = rootFrame.x - 50;
  const viewPanY = rootFrame.y - 50;

  const doc: Doc = {
    schema: "null_advanced_v1",
    version: 1,
    root,
    pages: [{ id: pageId, name: options?.fileName ?? "Figma 임포트", rootId: pageId }],
    nodes: allNodes,
    selection: new Set(),
    view: { zoom: 1, panX: viewPanX, panY: viewPanY },
    styles: [],
    variables: [],
    variableModes: ["기본"],
    variableMode: "기본",
    components: {},
    prototype: { startPageId: pageId },
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
  const { getFile, getFileNodes, getImages } = await import("./figma");
  const { fileKey, accessToken, fileName } = params;
  const nodeId = params.nodeId?.replace(/-/g, ":") ?? undefined;

  let figmaRoot: FigmaNode;

  if (nodeId) {
    const res = await getFileNodes(fileKey, [nodeId], accessToken);
    const nodeEntry = res.nodes?.[nodeId];
    if (!nodeEntry?.document) throw new Error("Figma node not found");
    figmaRoot = nodeEntry.document;
  } else {
    const file = await getFile(fileKey, accessToken);
    figmaRoot = file.document as unknown as FigmaNode;
  }

  const imageNodeIds: string[] = [];
  const topLevel = getTopLevelNodes(figmaRoot);
  const firstFrame = topLevel.find((n) => n.type === "FRAME" || n.type === "SECTION" || n.type === "GROUP") ?? topLevel[0];
  if (firstFrame) collectImageNodeIds(firstFrame, imageNodeIds);

  let imageUrlMap: Record<string, string> = {};
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
      const parentIds = collectParentIdsForFailed(firstFrame, new Set(failed));
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
  });
}
