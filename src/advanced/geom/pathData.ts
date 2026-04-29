/**
 * 펜 도구용 앵커·베지어 표현 ↔ SVG path `d` 변환.
 * Cubic Bézier 기준. Figma 스타일 직선(L)/곡선(C)/닫힘(Z) 지원.
 */

export type PathAnchor = {
  x: number;
  y: number;
  /** 이 앵커로 들어오는 핸들 (이전 세그먼트 쪽) */
  handle1X?: number;
  handle1Y?: number;
  /** 이 앵커에서 나가는 핸들 (다음 세그먼트 쪽) */
  handle2X?: number;
  handle2Y?: number;
  /** true면 양쪽 핸들이 한 선상(스무스). Alt로 한쪽만 끊을 수 있음 */
  isSmooth?: boolean;
};

function inferSmoothAnchor(anchor: PathAnchor): PathAnchor {
  if (anchor.isSmooth != null) return anchor;
  if (
    anchor.handle1X == null ||
    anchor.handle1Y == null ||
    anchor.handle2X == null ||
    anchor.handle2Y == null
  ) {
    return anchor;
  }
  const v1x = anchor.handle1X - anchor.x;
  const v1y = anchor.handle1Y - anchor.y;
  const v2x = anchor.handle2X - anchor.x;
  const v2y = anchor.handle2Y - anchor.y;
  const len1 = Math.hypot(v1x, v1y);
  const len2 = Math.hypot(v2x, v2y);
  if (len1 < 1e-6 || len2 < 1e-6) return anchor;
  const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
  const cross = Math.abs(v1x * v2y - v1y * v2x) / (len1 * len2);
  if (dot <= -0.98 && cross <= 0.2) {
    return { ...anchor, isSmooth: true };
  }
  return anchor;
}

const SNAP_45 = Math.PI / 4;

/** 각도를 45° 단위로 스냅 (Shift 스냅용) */
export function snapAngle45(angle: number): number {
  const step = SNAP_45;
  const n = Math.round(angle / step);
  return n * step;
}

/** (dx, dy) 방향을 45° 스냅한 단위 벡터 */
export function snapDirection45(dx: number, dy: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, y: 0 };
  const angle = Math.atan2(dy, dx);
  const snapped = snapAngle45(angle);
  return { x: Math.cos(snapped), y: Math.sin(snapped) };
}

/**
 * 앵커 배열 + 닫힘 여부 → SVG path `d` 문자열.
 * M 시작, L 직선, C 3차 베지어, Z 닫기.
 */
export function anchorsToPathData(anchors: PathAnchor[], closed: boolean): string {
  if (anchors.length === 0) return "";
  if (anchors.length === 1) {
    const a = anchors[0];
    return `M ${a.x} ${a.y}`;
  }

  const parts: string[] = [];
  const first = anchors[0];
  parts.push(`M ${first.x} ${first.y}`);

  for (let i = 1; i < anchors.length; i++) {
    const prev = anchors[i - 1];
    const curr = anchors[i];
    const hasOut = prev.handle2X != null && prev.handle2Y != null;
    const hasIn = curr.handle1X != null && curr.handle1Y != null;
    if (hasOut && hasIn) {
      parts.push(
        `C ${prev.handle2X} ${prev.handle2Y} ${curr.handle1X} ${curr.handle1Y} ${curr.x} ${curr.y}`
      );
    } else {
      parts.push(`L ${curr.x} ${curr.y}`);
    }
  }

  if (closed) {
    const last = anchors[anchors.length - 1];
    const hasOut = last.handle2X != null && last.handle2Y != null;
    const hasIn = first.handle1X != null && first.handle1Y != null;
    if (hasOut && hasIn) {
      parts.push(
        `C ${last.handle2X} ${last.handle2Y} ${first.handle1X} ${first.handle1Y} ${first.x} ${first.y}`
      );
    } else {
      parts.push(`L ${first.x} ${first.y}`);
    }
    parts.push("Z");
  }

  return parts.join(" ");
}

/**
 * SVG path `d` 파싱 → 앵커 배열 + 닫힘 여부.
 * M, L, C, Z만 지원. H, V, Q, S 등은 L/C로 근사하지 않고 무시(빈 반환 가능).
 */
export function pathDataToAnchors(d: string): { anchors: PathAnchor[]; closed: boolean } {
  const anchors: PathAnchor[] = [];
  const trimmed = (d || "").trim();
  if (!trimmed) return { anchors: [], closed: false };

  const tokens = trimmed.replace(/([MLCZ])/gi, " $1 ").split(/\s+/).filter(Boolean);
  let i = 0;
  let closed = false;

  const readNum = (): number | null => {
    const t = tokens[i++];
    if (t == null) return null;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
  };

  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (!cmd) break;
    const c = cmd.toUpperCase();

    if (c === "M") {
      const x = readNum();
      const y = readNum();
      if (x == null || y == null) break;
      anchors.push({ x, y });
      continue;
    }

    if (c === "L") {
      const x = readNum();
      const y = readNum();
      if (x == null || y == null) break;
      anchors.push({ x, y });
      continue;
    }

    if (c === "C") {
      const x1 = readNum();
      const y1 = readNum();
      const x2 = readNum();
      const y2 = readNum();
      const x = readNum();
      const y = readNum();
      if (x1 == null || y1 == null || x2 == null || y2 == null || x == null || y == null) break;
      if (anchors.length > 0) {
        const prev = anchors[anchors.length - 1];
        prev.handle2X = x1;
        prev.handle2Y = y1;
      }
      anchors.push({ x, y, handle1X: x2, handle1Y: y2 });
      continue;
    }

    if (c === "Z") {
      closed = true;
      break;
    }
  }

  if (closed && anchors.length > 1) {
    const first = anchors[0];
    const last = anchors[anchors.length - 1];
    if (first && last && first.x === last.x && first.y === last.y) {
      anchors.pop();
    }
  }

  for (let anchorIndex = 0; anchorIndex < anchors.length; anchorIndex += 1) {
    anchors[anchorIndex] = inferSmoothAnchor(anchors[anchorIndex]!);
  }

  return { anchors, closed };
}

/**
 * path 노드의 frame(바운딩 박스)을 pathData 기준으로 계산.
 * d 파싱해서 모든 좌표의 min/max + 패딩.
 */
export function pathDataToBounds(d: string, padding = 0): { x: number; y: number; w: number; h: number } {
  const { anchors } = pathDataToAnchors(d);
  const points: Array<{ x: number; y: number }> = [];
  anchors.forEach((a) => {
    points.push({ x: a.x, y: a.y });
    if (a.handle1X != null && a.handle1Y != null) points.push({ x: a.handle1X, y: a.handle1Y });
    if (a.handle2X != null && a.handle2Y != null) points.push({ x: a.handle2X, y: a.handle2Y });
  });
  if (points.length === 0) return { x: 0, y: 0, w: 100, h: 100 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    x: minX - padding,
    y: minY - padding,
    w: Math.max(1, maxX - minX + 2 * padding),
    h: Math.max(1, maxY - minY + 2 * padding),
  };
}

/** rect 노드용: frame → SVG path d (회전 무시) */
export function rectToPath(frame: { x: number; y: number; w: number; h: number }): string {
  const { x, y, w, h } = frame;
  return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
}

/** ellipse 노드용: frame(바운딩박스) → SVG path d (원에 가까운 다각형, 회전 무시) */
export function ellipseToPath(frame: { x: number; y: number; w: number; h: number }, segments = 24): string {
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  const rx = frame.w / 2;
  const ry = frame.h / 2;
  const points: string[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * 2 * Math.PI;
    points.push(`${cx + rx * Math.cos(t)} ${cy + ry * Math.sin(t)}`);
  }
  return `M ${points[0]} L ${points.slice(1).join(" L ")} Z`;
}

/** 닫힌 path d → 단일 폴리곤(외곽만) [[x,y], ...]. martinez 등 Boolean 연산용 */
export function pathDataToPolygon(d: string): number[][] | null {
  const { anchors, closed } = pathDataToAnchors(d);
  if (anchors.length < 3) return null;
  const ring = anchors.map((a) => [a.x, a.y] as [number, number]);
  if (!closed) ring.push([anchors[0].x, anchors[0].y]);
  return ring;
}

/** 단일 폴리곤 [[x,y], ...] → SVG path d */
export function polygonToPathD(ring: number[][]): string {
  if (ring.length < 2) return "";
  const first = `${ring[0][0]} ${ring[0][1]}`;
  const rest = ring.slice(1).map((p) => `L ${p[0]} ${p[1]}`).join(" ");
  return `M ${first} ${rest} Z`;
}

/** path d 내 모든 좌표에 (dx, dy) 더함. 노드 로컬 ↔ 절대 변환용 */
export function translatePathD(d: string, dx: number, dy: number): string {
  const { anchors } = pathDataToAnchors(d);
  const translated: PathAnchor[] = anchors.map((a) => ({
    ...a,
    x: a.x + dx,
    y: a.y + dy,
    handle1X: a.handle1X != null ? a.handle1X + dx : undefined,
    handle1Y: a.handle1Y != null ? a.handle1Y + dy : undefined,
    handle2X: a.handle2X != null ? a.handle2X + dx : undefined,
    handle2Y: a.handle2Y != null ? a.handle2Y + dy : undefined,
  }));
  const closed = d.trim().endsWith("Z") || d.trim().toUpperCase().endsWith("Z");
  return anchorsToPathData(translated, closed);
}
