import type { Fill, NodeShape, PathSegment, VectorNetwork, VectorNetworkPath } from "../doc/scene";
import { pathDataToAnchors, type PathAnchor } from "./pathData";

function cloneFills(fills: Fill[] | undefined): Fill[] | undefined {
  return fills ? fills.map((fill) => ({ ...fill })) : undefined;
}

function buildVectorPath(
  anchors: PathAnchor[],
  closed: boolean,
  pathId: string,
  fills?: Fill[],
): VectorNetwork | undefined {
  if (!anchors.length) return undefined;

  const vertices = anchors.map((anchor, index) => ({
    id: `${pathId}_v${index}`,
    x: anchor.x,
    y: anchor.y,
    handleInX: anchor.handle1X,
    handleInY: anchor.handle1Y,
    handleOutX: anchor.handle2X,
    handleOutY: anchor.handle2Y,
    isSmooth: anchor.isSmooth,
  }));

  const segments = anchors
    .map((_, index) => {
      const nextIndex = index + 1;
      if (nextIndex < anchors.length) {
        return {
          id: `${pathId}_s${index}`,
          from: `${pathId}_v${index}`,
          to: `${pathId}_v${nextIndex}`,
        };
      }
      if (closed && anchors.length > 1) {
        return {
          id: `${pathId}_s${index}`,
          from: `${pathId}_v${index}`,
          to: `${pathId}_v0`,
        };
      }
      return null;
    })
    .filter((segment): segment is NonNullable<typeof segment> => Boolean(segment));

  return {
    vertices,
    segments,
    paths: [
      {
        id: pathId,
        vertexIds: vertices.map((vertex) => vertex.id),
        closed,
        fills: cloneFills(fills),
      },
    ],
  };
}

export function mergeVectorNetworks(networks: VectorNetwork[]): VectorNetwork | undefined {
  if (!networks.length) return undefined;
  return {
    vertices: networks.flatMap((network) => network.vertices),
    segments: networks.flatMap((network) => network.segments),
    paths: networks.flatMap((network) => network.paths),
  };
}

function pathDataFromVectorPath(network: VectorNetwork, path: VectorNetworkPath): string | undefined {
  const verticesById = new Map(network.vertices.map((vertex) => [vertex.id, vertex]));
  const parts: string[] = [];
  const ordered = path.vertexIds.map((vertexId) => verticesById.get(vertexId)).filter(Boolean);
  if (!ordered.length) return undefined;

  const first = ordered[0]!;
  parts.push(`M ${first.x} ${first.y}`);

  for (let index = 1; index < ordered.length; index += 1) {
    const prev = ordered[index - 1]!;
    const current = ordered[index]!;
    const hasCurve =
      prev.handleOutX != null &&
      prev.handleOutY != null &&
      current.handleInX != null &&
      current.handleInY != null;
    if (hasCurve) {
      parts.push(
        `C ${prev.handleOutX} ${prev.handleOutY} ${current.handleInX} ${current.handleInY} ${current.x} ${current.y}`,
      );
    } else {
      parts.push(`L ${current.x} ${current.y}`);
    }
  }

  if (path.closed && ordered.length > 1) {
    const last = ordered[ordered.length - 1]!;
    const hasClosingCurve =
      last.handleOutX != null &&
      last.handleOutY != null &&
      first.handleInX != null &&
      first.handleInY != null;
    if (hasClosingCurve) {
      parts.push(`C ${last.handleOutX} ${last.handleOutY} ${first.handleInX} ${first.handleInY} ${first.x} ${first.y}`);
    } else {
      parts.push(`L ${first.x} ${first.y}`);
    }
    parts.push("Z");
  }

  const pathData = parts.join(" ").trim();
  return pathData || undefined;
}

export function pathDataFromVectorNetwork(network: VectorNetwork | undefined): string | undefined {
  if (!network?.paths.length || !network.vertices.length) return undefined;
  return network.paths
    .map((path) => pathDataFromVectorPath(network, path))
    .filter((path): path is string => Boolean(path))
    .join(" ")
    .trim() || undefined;
}

export function pathDataFromVectorPathId(network: VectorNetwork | undefined, pathId: string): string | undefined {
  if (!network?.paths.length || !network.vertices.length) return undefined;
  const path = network.paths.find((candidate) => candidate.id === pathId);
  if (!path) return undefined;
  return pathDataFromVectorPath(network, path);
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

export function segmentsFromVectorNetwork(network: VectorNetwork | undefined): PathSegment[] | undefined {
  if (!network?.paths.length) return undefined;
  const segments = network.paths
    .map((path) => {
      const d = pathDataFromVectorPath(network, path);
      if (!d) return null;
      return {
        d,
        fills: path.fills?.map((fill) => cloneFill(fill)) ?? [],
      };
    })
    .filter((segment): segment is PathSegment => Boolean(segment));
  return segments.length ? segments : undefined;
}

export function primaryPathDataFromShape(shape: NodeShape | undefined): string | undefined {
  const pathData = shape?.pathData?.trim();
  if (pathData) return pathData;

  const segmentPath = shape?.segments?.find((segment) => segment.d.trim())?.d.trim();
  if (segmentPath) return segmentPath;

  return pathDataFromVectorNetwork(shape?.vectorNetwork);
}

export function vectorNetworkFromPathData(
  pathData: string,
  options?: { pathId?: string; fills?: Fill[] },
): VectorNetwork | undefined {
  const { anchors, closed } = pathDataToAnchors(pathData);
  return buildVectorPath(anchors, closed, options?.pathId ?? "path_0", options?.fills);
}

export function vectorNetworkFromShape(shape: NodeShape | undefined): VectorNetwork | undefined {
  if (!shape) return undefined;
  if (shape.vectorNetwork?.paths.length) return shape.vectorNetwork;
  if (shape.segments?.length) {
    const networks = shape.segments
      .map((segment, index) => vectorNetworkFromPathData(segment.d, { pathId: `segment_${index}`, fills: segment.fills }))
      .filter((network): network is VectorNetwork => Boolean(network));
    return mergeVectorNetworks(networks);
  }

  if (shape.pathData?.trim()) {
    return vectorNetworkFromPathData(shape.pathData, { pathId: "path_0" });
  }

  return undefined;
}

export function withDerivedVectorNetwork(shape: NodeShape): NodeShape {
  return {
    ...shape,
    vectorNetwork: vectorNetworkFromShape(shape),
  };
}
