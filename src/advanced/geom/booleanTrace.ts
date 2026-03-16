import type { BooleanOperandSnapshot, Fill, Frame, Node } from "../doc/scene";
import { ellipseToPath, pathDataToBounds, polygonToPathD, rectToPath, translatePathD } from "./pathData";
import { primaryPathDataFromShape, vectorNetworkFromPathData } from "./vectorNetwork";

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

function translateVectorNetwork(
  network: NonNullable<BooleanOperandSnapshot["vectorNetwork"]>,
  dx: number,
  dy: number,
): NonNullable<BooleanOperandSnapshot["vectorNetwork"]> {
  return {
    vertices: network.vertices.map((vertex) => ({
      ...vertex,
      x: vertex.x + dx,
      y: vertex.y + dy,
      handleInX: vertex.handleInX != null ? vertex.handleInX + dx : undefined,
      handleInY: vertex.handleInY != null ? vertex.handleInY + dy : undefined,
      handleOutX: vertex.handleOutX != null ? vertex.handleOutX + dx : undefined,
      handleOutY: vertex.handleOutY != null ? vertex.handleOutY + dy : undefined,
    })),
    segments: network.segments.map((segment) => ({ ...segment })),
    paths: network.paths.map((path) => ({
      ...path,
      vertexIds: [...path.vertexIds],
      fills: cloneFills(path.fills),
    })),
  };
}

function buildPathFromNode(node: Node, abs: Frame): string | null {
  switch (node.type) {
    case "rect":
      return rectToPath(abs);
    case "ellipse":
      return ellipseToPath(abs);
    case "polygon": {
      const sides = Math.max(3, Math.round(node.shape?.polygonSides ?? 6));
      const cx = abs.x + abs.w / 2;
      const cy = abs.y + abs.h / 2;
      const r = Math.max(0, Math.min(abs.w, abs.h) / 2);
      const ring = Array.from({ length: sides }).map((_, index) => {
        const angle = (Math.PI * 2 * index) / sides - Math.PI / 2;
        return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
      });
      return polygonToPathD(ring);
    }
    case "star": {
      const spikes = Math.max(3, Math.round(node.shape?.starPoints ?? 5));
      const innerRatio = Math.max(0.1, Math.min(0.9, node.shape?.starInnerRatio ?? 0.5));
      const cx = abs.x + abs.w / 2;
      const cy = abs.y + abs.h / 2;
      const outer = Math.max(0, Math.min(abs.w, abs.h) / 2);
      const inner = outer * innerRatio;
      const ring: number[][] = [];
      for (let index = 0; index < spikes * 2; index += 1) {
        const radius = index % 2 === 0 ? outer : inner;
        const angle = (Math.PI * index) / spikes - Math.PI / 2;
        ring.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
      }
      return polygonToPathD(ring);
    }
    case "line":
    case "arrow":
      return `M ${abs.x} ${abs.y} L ${abs.x + abs.w} ${abs.y + abs.h}`;
    case "path": {
      const base = primaryPathDataFromShape(node.shape);
      if (!base) return rectToPath(abs);
      return translatePathD(base, abs.x, abs.y);
    }
    default:
      return null;
  }
}

export function buildBooleanOperandSnapshotFromNode(
  node: Node,
  absoluteFrame: Frame,
  resultBounds: Pick<Frame, "x" | "y">,
): BooleanOperandSnapshot | undefined {
  const absolutePath = buildPathFromNode(node, absoluteFrame);
  if (!absolutePath) return undefined;
  const localPathData = translatePathD(absolutePath, -resultBounds.x, -resultBounds.y);
  const localBounds = pathDataToBounds(localPathData, 0);
  const localVectorNetwork =
    node.type === "path" && node.shape?.vectorNetwork
      ? translateVectorNetwork(
          node.shape.vectorNetwork,
          absoluteFrame.x - resultBounds.x,
          absoluteFrame.y - resultBounds.y,
        )
      : localPathData
        ? vectorNetworkFromPathData(localPathData, { pathId: node.id, fills: cloneFills(node.style.fills) })
        : undefined;
  return {
    sourceId: node.id,
    name: node.name,
    type: node.type,
    pathData: localPathData,
    frame: {
      x: localBounds.x,
      y: localBounds.y,
      w: localBounds.w,
      h: localBounds.h,
      rotation: 0,
    },
    fills: cloneFills(node.style.fills),
    vectorNetwork: localVectorNetwork,
  };
}
