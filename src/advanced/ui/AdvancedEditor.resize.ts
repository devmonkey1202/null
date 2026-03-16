import type { Doc, Frame } from "../doc/scene";

type ResizeFinalizeDeps = {
  layoutDoc: (doc: Doc) => Doc;
  applyConstraintsOnResize: (doc: Doc, parentId: string, prevFrame: Frame, nextFrame: Frame) => Doc;
  refreshOverridesForSubtree: (doc: Doc, rootId: string) => void;
  cloneDoc: (doc: Doc) => Doc;
};

export function finalizeResizeDoc(params: {
  draft: Doc;
  nodeId: string;
  origin: Frame;
  deps: ResizeFinalizeDeps;
}) {
  const { draft, nodeId, origin, deps } = params;
  const node = draft.nodes[nodeId];
  if (!node || node.children.length === 0) {
    return { nextDoc: deps.cloneDoc(draft), strategy: "clone" as const };
  }

  if (node.layout?.mode === "auto") {
    const laidOut = deps.layoutDoc(draft);
    deps.refreshOverridesForSubtree(laidOut, nodeId);
    return { nextDoc: laidOut, strategy: "auto-layout" as const };
  }

  const constrained = deps.applyConstraintsOnResize(draft, nodeId, origin, node.frame);
  deps.refreshOverridesForSubtree(constrained, nodeId);
  return { nextDoc: constrained, strategy: "constraints" as const };
}
