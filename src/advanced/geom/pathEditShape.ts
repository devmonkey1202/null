import type { Fill, Frame, NodeShape } from "../doc/scene";
import type { Rect } from "../ui/AdvancedEditor.types";
import { pathDataToBounds, translatePathD } from "./pathData";
import { applyEditableVectorPathModels, buildEditableVectorPathModels, createEditableVectorPathModel, replaceEditableVectorPathModelPath, vectorNetworkFromEditableVectorPathModels } from "./vectorEditModel";
import {
  pathDataFromVectorPathId,
  segmentsFromVectorNetwork,
  withDerivedVectorNetwork,
} from "./vectorNetwork";

export type EditablePathSource =
  | { kind: "pathData" }
  | { kind: "segment"; index: number }
  | { kind: "vectorPath"; pathId: string };

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

function sameEditablePathSource(left: EditablePathSource, right: EditablePathSource): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "segment" && right.kind === "segment") return left.index === right.index;
  if (left.kind === "vectorPath" && right.kind === "vectorPath") return left.pathId === right.pathId;
  return true;
}

function listAbsoluteShapePaths(
  shape: NodeShape | undefined,
  absoluteFrame: Pick<Frame, "x" | "y">,
): Array<{ source: EditablePathSource; d: string; fills?: Fill[] }> {
  const segments = shape?.segments ?? [];
  if (segments.length) {
    return segments
      .map((segment, index) => {
        const d = segment.d.trim();
        if (!d) return null;
        return {
          source: { kind: "segment", index } as EditablePathSource,
          d: translatePathD(d, absoluteFrame.x, absoluteFrame.y),
          fills: cloneFills(segment.fills),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }

  const pathData = shape?.pathData?.trim();
  if (pathData) {
    return [
      {
        source: { kind: "pathData" },
        d: translatePathD(pathData, absoluteFrame.x, absoluteFrame.y),
      },
    ];
  }

  if (shape?.vectorNetwork?.paths.length) {
    return shape.vectorNetwork.paths
      .map((path) => {
        const d = pathDataFromVectorPathId(shape.vectorNetwork, path.id);
        if (!d) return null;
        return {
          source: { kind: "vectorPath", pathId: path.id } as EditablePathSource,
          d: translatePathD(d, absoluteFrame.x, absoluteFrame.y),
          fills: cloneFills(path.fills),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }

  return [];
}

function getCombinedPathBounds(paths: string[]): { x: number; y: number; w: number; h: number } {
  if (!paths.length) return { x: 0, y: 0, w: 1, h: 1 };
  const bounds = paths.map((path) => pathDataToBounds(path, 0));
  const minX = Math.min(...bounds.map((bound) => bound.x));
  const minY = Math.min(...bounds.map((bound) => bound.y));
  const maxX = Math.max(...bounds.map((bound) => bound.x + bound.w));
  const maxY = Math.max(...bounds.map((bound) => bound.y + bound.h));
  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };
}

export function resolveEditablePathSource(shape: NodeShape | undefined): { pathData: string; source: EditablePathSource } | null {
  const segmentIndex = shape?.segments?.findIndex((segment) => segment.d.trim()) ?? -1;
  if (segmentIndex >= 0) {
    return {
      pathData: shape?.segments?.[segmentIndex]?.d.trim() ?? "",
      source: { kind: "segment", index: segmentIndex },
    };
  }

  const pathData = shape?.pathData?.trim();
  if (pathData) {
    return {
      pathData,
      source: { kind: "pathData" },
    };
  }

  if (shape?.vectorNetwork?.paths.length) {
    const firstPath = shape.vectorNetwork.paths[0]!;
    return {
      pathData: pathDataFromVectorPathId(shape.vectorNetwork, firstPath.id) ?? "",
      source: { kind: "vectorPath", pathId: firstPath.id },
    };
  }

  return null;
}

function pointToRectDistance(point: { x: number; y: number }, rect: Rect): number {
  const dx = point.x < rect.x ? rect.x - point.x : point.x > rect.x + rect.w ? point.x - (rect.x + rect.w) : 0;
  const dy = point.y < rect.y ? rect.y - point.y : point.y > rect.y + rect.h ? point.y - (rect.y + rect.h) : 0;
  return Math.hypot(dx, dy);
}

export function resolveEditablePathSourceAtPoint(
  shape: NodeShape | undefined,
  absoluteFrame: Pick<Rect, "x" | "y">,
  point: { x: number; y: number },
): { pathData: string; source: EditablePathSource } | null {
  const segments = shape?.segments ?? [];
  if (segments.length > 1) {
    const candidates = segments
      .map((segment, index) => {
        const d = segment.d.trim();
        if (!d) return null;
        const absolutePath = translatePathD(d, absoluteFrame.x, absoluteFrame.y);
        const bounds = pathDataToBounds(absolutePath, 8);
        return {
          index,
          d,
          distance: pointToRectDistance(point, bounds),
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((left, right) => left.distance - right.distance);
    if (candidates.length) {
      const winner = candidates[0]!;
      return {
        pathData: winner.d,
        source: { kind: "segment", index: winner.index },
      };
    }
  }

  if (shape?.vectorNetwork?.paths.length && !shape.segments?.length && !shape.pathData?.trim()) {
    const candidates = shape.vectorNetwork.paths
      .map((path) => {
        const d = pathDataFromVectorPathId(shape.vectorNetwork, path.id);
        if (!d) return null;
        const absolutePath = translatePathD(d, absoluteFrame.x, absoluteFrame.y);
        const bounds = pathDataToBounds(absolutePath, 8);
        return {
          pathId: path.id,
          d,
          distance: pointToRectDistance(point, bounds),
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((left, right) => left.distance - right.distance);
    if (candidates.length) {
      const winner = candidates[0]!;
      return {
        pathData: winner.d,
        source: { kind: "vectorPath", pathId: winner.pathId },
      };
    }
  }

  return resolveEditablePathSource(shape);
}

export function applyEditedPathToShape(
  shape: NodeShape | undefined,
  source: EditablePathSource,
  pathData: string,
): NodeShape {
  const nextShape: NodeShape = shape ? { ...shape } : {};
  if (source.kind === "segment") {
    const baseSegments = shape?.segments ?? [];
    const nextSegments = baseSegments.map((segment, index) => ({
      d: index === source.index ? pathData : segment.d,
      fills: cloneFills(segment.fills) ?? [],
    }));
    return withDerivedVectorNetwork({
      ...nextShape,
      pathData: nextSegments.length === 1 ? pathData : undefined,
      segments: nextSegments,
    });
  }

  if (source.kind === "vectorPath") {
    if (shape?.vectorNetwork?.paths.length) {
      const nextPaths = replaceEditableVectorPathModelPath(buildEditableVectorPathModels(shape), source.pathId, pathData);
      const rebuilt = applyEditableVectorPathModels(nextShape, nextPaths, { preferVectorOnly: true });
      if (rebuilt.vectorNetwork?.paths.length) {
        return rebuilt;
      }
    }

    const baseSegments = segmentsFromVectorNetwork(shape?.vectorNetwork);
    if (baseSegments?.length) {
      const nextSegments = baseSegments.map((segment, index) => ({
        d: shape?.vectorNetwork?.paths[index]?.id === source.pathId ? pathData : segment.d,
        fills: cloneFills(segment.fills) ?? [],
      }));
      return withDerivedVectorNetwork({
        ...nextShape,
        pathData: nextSegments.length === 1 ? nextSegments[0]?.d : undefined,
        segments: nextSegments,
      });
    }
  }

  return withDerivedVectorNetwork({
    ...nextShape,
    pathData,
  });
}

export function commitEditedPathShape(
  shape: NodeShape | undefined,
  absoluteFrame: Frame,
  source: EditablePathSource,
  absolutePathData: string,
): { shape: NodeShape; frame: Frame } {
  const absolutePaths = listAbsoluteShapePaths(shape, absoluteFrame);
  const replacedPaths =
    absolutePaths.length > 0
      ? absolutePaths.map((entry) => (sameEditablePathSource(entry.source, source) ? { ...entry, d: absolutePathData } : entry))
      : [{ source, d: absolutePathData }];
  const bounds = getCombinedPathBounds(replacedPaths.map((entry) => entry.d));
  const localPaths = replacedPaths.map((entry) => ({
    ...entry,
    d: translatePathD(entry.d, -bounds.x, -bounds.y),
  }));

  const allVectorPaths = localPaths.length > 0 && localPaths.every((entry) => entry.source.kind === "vectorPath");
  if (allVectorPaths) {
    const merged = vectorNetworkFromEditableVectorPathModels(
      localPaths.map((entry) => createEditableVectorPathModel(
        entry.source.kind === "vectorPath" ? entry.source.pathId : "path_0",
        entry.d,
        cloneFills(entry.fills),
      )),
    );
    if (merged) {
      return {
        shape: {
          ...(shape ? { ...shape } : {}),
          pathData: undefined,
          segments: undefined,
          vectorNetwork: merged,
        },
        frame: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, rotation: absoluteFrame.rotation },
      };
    }
  }

  if (localPaths.length > 1) {
    return {
      shape: withDerivedVectorNetwork({
        ...(shape ? { ...shape } : {}),
        pathData: undefined,
        segments: localPaths.map((entry) => ({ d: entry.d, fills: cloneFills(entry.fills) ?? [] })),
      }),
      frame: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, rotation: absoluteFrame.rotation },
    };
  }

  const single = localPaths[0];
  return {
    shape: applyEditedPathToShape(shape, source, single?.d ?? translatePathD(absolutePathData, -bounds.x, -bounds.y)),
    frame: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, rotation: absoluteFrame.rotation },
  };
}
