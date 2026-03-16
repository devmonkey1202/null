import type { Fill, NodeShape, VectorNetwork } from "../doc/scene";
import { anchorsToPathData, pathDataToAnchors } from "./pathData";
import { pathDataFromVectorPathId, vectorNetworkFromShape, withDerivedVectorNetwork } from "./vectorNetwork";

type Point = { x: number; y: number };

export type EditableVectorHandle = Point;

export type EditableVectorAnchor = {
  vertexId: string;
  x: number;
  y: number;
  isSmooth?: boolean;
  handleIn?: EditableVectorHandle;
  handleOut?: EditableVectorHandle;
};

export type EditableVectorEdge = {
  segmentId: string;
  fromVertexId: string;
  toVertexId: string;
  kind: "line" | "cubic";
};

export type EditableVectorPathModel = {
  pathId: string;
  closed: boolean;
  fills?: Fill[];
  anchors: EditableVectorAnchor[];
  edges: EditableVectorEdge[];
};

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

function buildEdgeId(pathId: string, index: number) {
  return `${pathId}_edge_${index}`;
}

function buildVertexId(pathId: string, index: number) {
  return `${pathId}_vertex_${index}`;
}

export function createEditableVectorPathModel(pathId: string, pathData: string, fills?: Fill[]): EditableVectorPathModel {
  const { anchors, closed } = pathDataToAnchors(pathData);
  return {
    pathId,
    closed,
    fills: cloneFills(fills),
    anchors: anchors.map((anchor, index) => ({
      vertexId: buildVertexId(pathId, index),
      x: anchor.x,
      y: anchor.y,
      isSmooth: anchor.isSmooth,
      handleIn:
        anchor.handle1X != null && anchor.handle1Y != null
          ? { x: anchor.handle1X, y: anchor.handle1Y }
          : undefined,
      handleOut:
        anchor.handle2X != null && anchor.handle2Y != null
          ? { x: anchor.handle2X, y: anchor.handle2Y }
          : undefined,
    })),
    edges: anchors
      .map((_, index) => {
        const nextIndex = index + 1;
        if (nextIndex < anchors.length) {
          return {
            segmentId: buildEdgeId(pathId, index),
            fromVertexId: buildVertexId(pathId, index),
            toVertexId: buildVertexId(pathId, nextIndex),
            kind: anchors[index]?.handle2X != null || anchors[nextIndex]?.handle1X != null ? "cubic" : "line",
          } satisfies EditableVectorEdge;
        }
        if (closed && anchors.length > 1) {
          return {
            segmentId: buildEdgeId(pathId, index),
            fromVertexId: buildVertexId(pathId, index),
            toVertexId: buildVertexId(pathId, 0),
            kind: anchors[index]?.handle2X != null || anchors[0]?.handle1X != null ? "cubic" : "line",
          } satisfies EditableVectorEdge;
        }
        return null;
      })
      .filter((edge): edge is EditableVectorEdge => Boolean(edge)),
  };
}

export function buildEditableVectorPathModels(shape: NodeShape | undefined): EditableVectorPathModel[] {
  const network = vectorNetworkFromShape(shape);
  if (!network?.paths.length) return [];
  return network.paths
    .map((path) => {
      const pathData = pathDataFromVectorPathId(network, path.id);
      if (!pathData) return null;
      const model = createEditableVectorPathModel(path.id, pathData, path.fills);
      const verticesById = new Map(network.vertices.map((vertex) => [vertex.id, vertex]));
      return {
        ...model,
        anchors: path.vertexIds.map((vertexId, index) => {
          const vertex = verticesById.get(vertexId);
          const anchor = model.anchors[index];
          if (!vertex || !anchor) return anchor;
          return {
            ...anchor,
            vertexId,
            x: vertex.x,
            y: vertex.y,
            isSmooth: vertex.isSmooth,
            handleIn:
              vertex.handleInX != null && vertex.handleInY != null
                ? { x: vertex.handleInX, y: vertex.handleInY }
                : undefined,
            handleOut:
              vertex.handleOutX != null && vertex.handleOutY != null
                ? { x: vertex.handleOutX, y: vertex.handleOutY }
                : undefined,
          };
        }),
        edges: path.vertexIds
          .map((vertexId, index) => {
            const nextIndex = index + 1;
            if (nextIndex >= path.vertexIds.length && !path.closed) return null;
            const toVertexId = path.vertexIds[nextIndex] ?? path.vertexIds[0];
            if (!toVertexId) return null;
            const segment = network.segments.find((candidate) => candidate.from === vertexId && candidate.to === toVertexId);
            return {
              segmentId: segment?.id ?? buildEdgeId(path.id, index),
              fromVertexId: vertexId,
              toVertexId,
              kind: model.edges[index]?.kind ?? "line",
            } satisfies EditableVectorEdge;
          })
          .filter((edge): edge is EditableVectorEdge => Boolean(edge)),
      };
    })
    .filter((model): model is EditableVectorPathModel => Boolean(model));
}

export function replaceEditableVectorPathModelPath(
  paths: EditableVectorPathModel[],
  pathId: string,
  pathData: string,
): EditableVectorPathModel[] {
  return paths.map((path) => {
    if (path.pathId !== pathId) return path;
    return createEditableVectorPathModel(pathId, pathData, path.fills);
  });
}

export function vectorNetworkFromEditableVectorPathModels(paths: EditableVectorPathModel[]): VectorNetwork | undefined {
  if (!paths.length) return undefined;
  return {
    vertices: paths.flatMap((path) =>
      path.anchors.map((anchor) => ({
        id: anchor.vertexId,
        x: anchor.x,
        y: anchor.y,
        handleInX: anchor.handleIn?.x,
        handleInY: anchor.handleIn?.y,
        handleOutX: anchor.handleOut?.x,
        handleOutY: anchor.handleOut?.y,
        isSmooth: anchor.isSmooth,
      })),
    ),
    segments: paths.flatMap((path) =>
      path.edges.map((edge) => ({
        id: edge.segmentId,
        from: edge.fromVertexId,
        to: edge.toVertexId,
      })),
    ),
    paths: paths.map((path) => ({
      id: path.pathId,
      vertexIds: path.anchors.map((anchor) => anchor.vertexId),
      closed: path.closed,
      fills: cloneFills(path.fills),
    })),
  };
}

export function applyEditableVectorPathModels(
  shape: NodeShape | undefined,
  paths: EditableVectorPathModel[],
  options?: { preferVectorOnly?: boolean },
): NodeShape {
  const nextShape: NodeShape = shape ? { ...shape } : {};
  const network = vectorNetworkFromEditableVectorPathModels(paths);
  if (!network) return nextShape;
  if (options?.preferVectorOnly) {
    return {
      ...nextShape,
      pathData: undefined,
      segments: undefined,
      vectorNetwork: network,
    };
  }
  const firstPath = paths[0];
  return withDerivedVectorNetwork({
    ...nextShape,
    pathData: paths.length === 1 && firstPath ? anchorsToPathData(
      firstPath.anchors.map((anchor) => ({
        x: anchor.x,
        y: anchor.y,
        handle1X: anchor.handleIn?.x,
        handle1Y: anchor.handleIn?.y,
        handle2X: anchor.handleOut?.x,
        handle2Y: anchor.handleOut?.y,
        isSmooth: anchor.isSmooth,
      })),
      firstPath.closed,
    ) : undefined,
    segments: paths.length > 1
      ? paths.map((path) => ({
          d: anchorsToPathData(
            path.anchors.map((anchor) => ({
              x: anchor.x,
              y: anchor.y,
              handle1X: anchor.handleIn?.x,
              handle1Y: anchor.handleIn?.y,
              handle2X: anchor.handleOut?.x,
              handle2Y: anchor.handleOut?.y,
              isSmooth: anchor.isSmooth,
            })),
            path.closed,
          ),
          fills: cloneFills(path.fills) ?? [],
        }))
      : undefined,
    vectorNetwork: network,
  });
}
