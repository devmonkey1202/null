import type { Fill, Node } from "@/advanced/doc/scene";
import { buildEditableVectorPathModels } from "@/advanced/geom/vectorEditModel";
import { anchorsToPathData } from "@/advanced/geom/pathData";
import type { FigmaNode } from "./figma";

const SEMANTIC_VECTOR_CHILD_PREFIX = "__NULL_VECTOR_PATH__:";

export type SemanticVectorExportPath = {
  pathId: string;
  pathData: string;
  fills?: Fill[];
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

export function collectSemanticVectorExportPaths(node: Node): SemanticVectorExportPath[] {
  if (node.type !== "path" || node.shape?.booleanMeta?.op) return [];
  return buildEditableVectorPathModels(node.shape)
    .map((path) => ({
      pathId: path.pathId,
      pathData: anchorsToPathData(
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
      fills: cloneFills(path.fills),
    }))
    .filter((path) => Boolean(path.pathData.trim()));
}

export function shouldExportSemanticVectorWrapper(node: Node): boolean {
  return collectSemanticVectorExportPaths(node).length > 1;
}

export function buildSemanticVectorWrapperChildName(pathId: string): string {
  return `${SEMANTIC_VECTOR_CHILD_PREFIX}${pathId}`;
}

export function parseSemanticVectorWrapperChildName(name: string): string | undefined {
  if (!name.startsWith(SEMANTIC_VECTOR_CHILD_PREFIX)) return undefined;
  return name.slice(SEMANTIC_VECTOR_CHILD_PREFIX.length) || undefined;
}

export type SemanticVectorWrapperChild = {
  pathId: string;
  node: FigmaNode;
  geometryPath: string;
};

export function getSemanticVectorWrapperChildren(fNode: FigmaNode): SemanticVectorWrapperChild[] | undefined {
  if ((fNode.type !== "GROUP" && fNode.type !== "TRANSFORM_GROUP") || !fNode.children?.length) return undefined;
  const children = fNode.children
    .map((child) => {
      const pathId = parseSemanticVectorWrapperChildName(child.name);
      const geometryPath = child.fillGeometry?.find((segment) => Boolean(segment.path))?.path;
      if (!pathId || child.type !== "VECTOR" || child.children?.length || !geometryPath) return null;
      return {
        pathId,
        node: child,
        geometryPath,
      } satisfies SemanticVectorWrapperChild;
    })
    .filter((child): child is SemanticVectorWrapperChild => Boolean(child));
  if (!children.length || children.length !== fNode.children.length) return undefined;
  return children;
}
