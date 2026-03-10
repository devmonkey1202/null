/**
 * Figma REST API v1 클라이언트 및 인증
 * GET /v1/files/:key, GET /v1/files/:key/nodes?ids=..., GET /v1/images/:key
 * 서버에서만 사용. 토큰은 클라이언트에 노출 금지.
 */

const FIGMA_API_BASE = "https://api.figma.com/v1";

export type FigmaRectangle = { x: number; y: number; width: number; height: number };

export type FigmaRGBA = { r: number; g: number; b: number; a: number };

export type FigmaSolidPaint = {
  type: "SOLID";
  color: FigmaRGBA;
  opacity?: number;
  visible?: boolean;
};

export type FigmaGradientStop = { position: number; color: FigmaRGBA };
export type FigmaVector = { x: number; y: number };

export type FigmaGradientPaint = {
  type: "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND";
  gradientHandlePositions: FigmaVector[];
  gradientStops: FigmaGradientStop[];
  opacity?: number;
  visible?: boolean;
};

export type FigmaImagePaint = {
  type: "IMAGE";
  imageRef: string;
  scaleMode?: "FILL" | "FIT" | "TILE" | "STRETCH";
  opacity?: number;
  visible?: boolean;
};

export type FigmaPaint = FigmaSolidPaint | FigmaGradientPaint | FigmaImagePaint;

export type FigmaLayoutConstraint = {
  vertical: "TOP" | "BOTTOM" | "CENTER" | "TOP_BOTTOM" | "SCALE";
  horizontal: "LEFT" | "RIGHT" | "CENTER" | "LEFT_RIGHT" | "SCALE";
};

export type FigmaTypeStyle = {
  fontFamily?: string;
  fontPostScriptName?: string | null;
  fontWeight?: number;
  fontSize?: number;
  letterSpacing?: number;
  lineHeightPx?: number;
  lineHeightPercent?: number;
  textAlignHorizontal?: "LEFT" | "RIGHT" | "CENTER" | "JUSTIFIED";
  textCase?: "ORIGINAL" | "UPPER" | "LOWER" | "TITLE" | "SMALL_CAPS" | "SMALL_CAPS_FORCED";
  textDecoration?: "NONE" | "STRIKETHROUGH" | "UNDERLINE";
  italic?: boolean;
  fills?: FigmaPaint[];
};

export type FigmaDropShadowEffect = {
  type: "DROP_SHADOW";
  color: FigmaRGBA;
  offset: FigmaVector;
  radius: number;
  spread?: number;
  visible: boolean;
};

export type FigmaInnerShadowEffect = {
  type?: "INNER_SHADOW";
  color: FigmaRGBA;
  offset: FigmaVector;
  radius: number;
  spread?: number;
  visible: boolean;
};

export type FigmaBlurEffect = {
  type: "LAYER_BLUR" | "BACKGROUND_BLUR";
  radius: number;
  visible: boolean;
};

export type FigmaEffect = FigmaDropShadowEffect | FigmaInnerShadowEffect | FigmaBlurEffect;

/** Figma API 노드: 공통 필드 + children 등 (타입은 문자열로) */
export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  locked?: boolean;
  rotation?: number;
  absoluteBoundingBox?: FigmaRectangle | null;
  children?: FigmaNode[];
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  strokeAlign?: "INSIDE" | "OUTSIDE" | "CENTER";
  strokeDashes?: number[];
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  opacity?: number;
  blendMode?: string;
  effects?: FigmaEffect[];
  constraints?: FigmaLayoutConstraint;
  clipsContent?: boolean;
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID";
  primaryAxisSizingMode?: "FIXED" | "AUTO";
  counterAxisSizingMode?: "FIXED" | "AUTO";
  primaryAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  counterAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "BASELINE" | "STRETCH";
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  layoutWrap?: "NO_WRAP" | "WRAP";
  overflowDirection?: "NONE" | "HORIZONTAL_SCROLLING" | "VERTICAL_SCROLLING" | "HORIZONTAL_AND_VERTICAL_SCROLLING";
  characters?: string;
  style?: FigmaTypeStyle;
  componentId?: string;
  exportSettings?: Array<{ format: string; constraint?: { type: string; value: number } }>;
  fillGeometry?: Array<{ path: string }>;
  strokeGeometry?: Array<{ path: string }>;
}

export type FigmaDocumentNode = { type: "DOCUMENT"; id: string; name: string; children: FigmaNode[] };

export type FigmaFileResponse = {
  name: string;
  lastModified: string;
  version: string;
  document: FigmaDocumentNode;
  components?: Record<string, unknown>;
  schemaVersion?: number;
};

export type FigmaFileNodesResponse = {
  name: string;
  lastModified: string;
  nodes: Record<string, { document: FigmaNode; components?: Record<string, unknown> }>;
};

export type FigmaImagesResponse = { err?: string; images?: Record<string, string> };

export class FigmaApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter?: number
  ) {
    super(message);
    this.name = "FigmaApiError";
  }
}

async function request<T>(
  path: string,
  accessToken: string,
  options?: { method?: string; body?: string; timeoutMs?: number }
): Promise<T> {
  const url = `${FIGMA_API_BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 60_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: options?.method ?? "GET",
      headers: {
        Accept: "application/json",
        "X-Figma-Token": accessToken,
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options?.body,
      signal: controller.signal,
    });
  } catch (e: unknown) {
    clearTimeout(timeout);
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new FigmaApiError("Figma API 요청 시간이 초과되었습니다 (60초). 특정 노드 ID를 지정해 보세요.", 408);
    }
    throw e;
  }
  clearTimeout(timeout);

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10);
    throw new FigmaApiError("Figma API rate limit exceeded", 429, retryAfter);
  }

  if (!res.ok) {
    const text = await res.text();
    let msg = `Figma API error ${res.status}`;
    try {
      const j = JSON.parse(text) as { err?: string; message?: string };
      msg = j.err ?? j.message ?? msg;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new FigmaApiError(msg, res.status);
  }

  return res.json() as Promise<T>;
}

/**
 * 파일 메타 + 문서 트리 (전체)
 */
export async function getFile(fileKey: string, accessToken: string): Promise<FigmaFileResponse> {
  return request<FigmaFileResponse>(`/files/${fileKey}`, accessToken);
}

/**
 * 특정 노드(및 하위)만 로드
 */
export async function getFileNodes(
  fileKey: string,
  nodeIds: string[],
  accessToken: string
): Promise<FigmaFileNodesResponse> {
  if (nodeIds.length === 0) throw new FigmaApiError("nodeIds required", 400);
  const ids = nodeIds.join(",");
  return request<FigmaFileNodesResponse>(`/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`, accessToken);
}

/**
 * 이미지 URL 맵 (node id -> url). format: PNG | JPG | SVG
 */
export async function getImages(
  fileKey: string,
  nodeIds: string[],
  accessToken: string,
  format: "png" | "jpg" | "svg" = "png",
  scale?: number
): Promise<FigmaImagesResponse> {
  if (nodeIds.length === 0) return { images: {} };
  const ids = nodeIds.join(",");
  let path = `/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}`;
  if (scale != null) path += `&scale=${scale}`;
  return request<FigmaImagesResponse>(path, accessToken);
}

export function rgbaToHex(rgba: FigmaRGBA): string {
  const r = Math.round((rgba.r ?? 0) * 255);
  const g = Math.round((rgba.g ?? 0) * 255);
  const b = Math.round((rgba.b ?? 0) * 255);
  const a = rgba.a ?? 1;
  if (a < 1) {
    return `rgba(${r},${g},${b},${a})`;
  }
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
