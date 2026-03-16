import type { FigmaNode } from "./figma";

export type FigmaImportFallbackReason =
  | "image-fill"
  | "complex-gradient"
  | "mask-chain"
  | "complex-descendant"
  | "unsupported-geometry"
  | "editable-path"
  | "editable-mask";

export type FigmaImportFidelityDecision = {
  renderAsImage: boolean;
  editablePath: boolean;
  editableMask: boolean;
  reasons: FigmaImportFallbackReason[];
};

export function hasImageFill(fNode: FigmaNode): boolean {
  return fNode.fills?.some((f: { type?: string }) => f.type === "IMAGE") ?? false;
}

export function hasComplexGradient(fNode: FigmaNode): boolean {
  return (
    fNode.fills?.some(
      (f: { type?: string }) =>
        f.type === "GRADIENT_RADIAL" ||
        f.type === "GRADIENT_ANGULAR" ||
        f.type === "GRADIENT_DIAMOND",
    ) ?? false
  );
}

export function getGeometrySegments(fNode: FigmaNode) {
  return [...(fNode.fillGeometry ?? []), ...(fNode.strokeGeometry ?? [])].filter((segment) => Boolean(segment.path));
}

export function canImportGeometryAsPath(fNode: FigmaNode): boolean {
  if (fNode.type !== "VECTOR" && fNode.type !== "BOOLEAN_OPERATION") return false;
  if (fNode.isMask) return false;
  if (hasImageFill(fNode) || hasComplexGradient(fNode)) return false;
  return getGeometrySegments(fNode).length > 0;
}

export function canImportMaskAsShape(fNode: FigmaNode): boolean {
  if (!fNode.isMask) return false;
  if (fNode.children?.length) return false;
  if (hasImageFill(fNode) || hasComplexGradient(fNode)) return false;
  if (fNode.type === "VECTOR" || fNode.type === "BOOLEAN_OPERATION") return canImportGeometryAsPath(fNode);
  return (
    fNode.type === "RECTANGLE" ||
    fNode.type === "ELLIPSE" ||
    fNode.type === "FRAME" ||
    fNode.type === "SECTION" ||
    fNode.type === "REGULAR_POLYGON" ||
    fNode.type === "STAR"
  );
}

export function hasSimpleMaskChildren(fNode: FigmaNode): boolean {
  const maskChildren = (fNode.children ?? []).filter((child) => child.isMask);
  return maskChildren.length > 0 && maskChildren.every((child) => canImportMaskAsShape(child));
}

export function hasComplexDescendant(fNode: FigmaNode): boolean {
  for (const child of fNode.children ?? []) {
    const type = child.type;
    if ((type === "VECTOR" || type === "BOOLEAN_OPERATION") && !canImportGeometryAsPath(child)) return true;
    if (child.isMask && !canImportMaskAsShape(child)) return true;
    if ((child.children?.some((nested) => nested.isMask) ?? false) && !hasSimpleMaskChildren(child)) return true;
    if (hasComplexDescendant(child)) return true;
  }
  return false;
}

export function getImportFidelityDecision(fNode: FigmaNode): FigmaImportFidelityDecision {
  const reasons: FigmaImportFallbackReason[] = [];
  const editablePath = canImportGeometryAsPath(fNode);
  const editableMask = canImportMaskAsShape(fNode);
  if (editablePath) reasons.push("editable-path");
  if (editableMask) reasons.push("editable-mask");
  if (hasImageFill(fNode)) reasons.push("image-fill");
  if (hasComplexGradient(fNode)) reasons.push("complex-gradient");
  if ((fNode.children?.some((child) => child.isMask) ?? false) && !hasSimpleMaskChildren(fNode)) reasons.push("mask-chain");
  if (fNode.type === "GROUP" && hasComplexDescendant(fNode) && !fNode.children?.some((child) => child.type === "FRAME" || child.type === "TEXT" || child.type === "RECTANGLE")) {
    reasons.push("complex-descendant");
  }
  if ((fNode.type === "VECTOR" || fNode.type === "BOOLEAN_OPERATION") && !editablePath) {
    reasons.push("unsupported-geometry");
  }
  return {
    renderAsImage: reasons.some((reason) =>
      reason === "image-fill" ||
      reason === "complex-gradient" ||
      reason === "mask-chain" ||
      reason === "complex-descendant" ||
      reason === "unsupported-geometry",
    ),
    editablePath,
    editableMask,
    reasons,
  };
}
