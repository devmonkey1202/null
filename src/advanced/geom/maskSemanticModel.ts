import type { Doc } from "../doc/scene";

export type MaskSemanticEntry =
  | { kind: "node"; nodeId: string }
  | { kind: "mask-band"; maskId: string; targetIds: string[] };

export function buildMaskSemanticEntries(doc: Doc, childIds: string[]): MaskSemanticEntry[] {
  const entries: MaskSemanticEntry[] = [];
  let currentMaskId: string | null = null;
  let currentTargetIds: string[] = [];

  const flushCurrentMask = () => {
    if (!currentMaskId) return;
    if (currentTargetIds.length) {
      entries.push({
        kind: "mask-band",
        maskId: currentMaskId,
        targetIds: [...currentTargetIds],
      });
    } else {
      entries.push({
        kind: "node",
        nodeId: currentMaskId,
      });
    }
    currentMaskId = null;
    currentTargetIds = [];
  };

  childIds.forEach((childId) => {
    const child = doc.nodes[childId];
    if (child?.isMask) {
      flushCurrentMask();
      currentMaskId = childId;
      return;
    }
    if (currentMaskId) {
      currentTargetIds.push(childId);
      return;
    }
    entries.push({
      kind: "node",
      nodeId: childId,
    });
  });

  flushCurrentMask();
  return entries;
}
