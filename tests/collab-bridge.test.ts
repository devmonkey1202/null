import { describe, expect, it } from "vitest";

import { addNode, cloneDoc, createDoc, createNode } from "@/advanced/doc/scene";
import {
  applyEditorDocOperation,
  buildEditorDocOperation,
  getLatestEditorDocOperation,
  normalizeEditorDocOperation,
  rememberEditorDocOperation,
  shouldPreferLocalCollabState,
  wrapEditorDocOperation,
} from "@/lib/collab";

function buildRectDoc() {
  const doc = createDoc();
  const rootId = doc.pages[0].rootId;
  const rect = createNode("rect", {
    frame: { x: 12, y: 18, w: 120, h: 80, rotation: 0 },
    name: "Card",
  });
  addNode(doc, rect, rootId);
  return { doc, rectId: rect.id, rootId };
}

describe("collab operation bridge", () => {
  it("normalizes both wrapped and legacy payloads", () => {
    const { doc } = buildRectDoc();
    const op = buildEditorDocOperation({ doc, senderId: "peer-1", sessionId: "tab-1" });

    const wrapped = normalizeEditorDocOperation(wrapEditorDocOperation(op));
    const legacy = normalizeEditorDocOperation({
      ts: op.ts,
      opId: op.opId,
      senderId: op.senderId,
      sessionId: op.sessionId,
      content: op.content,
      deletedNodeIds: op.deletedNodeIds,
      deletedPageIds: op.deletedPageIds,
    });

    expect(wrapped?.opId).toBe(op.opId);
    expect(wrapped?.source).toBe("commit");
    expect(legacy?.opId).toBe(op.opId);
    expect(legacy?.source).toBe("legacy");
  });

  it("applies remote-wins merges by default", () => {
    const { doc, rectId, rootId } = buildRectDoc();
    const remote = cloneDoc(doc);
    remote.nodes[rectId] = {
      ...remote.nodes[rectId],
      frame: { ...remote.nodes[rectId].frame, x: 240 },
    };
    const remoteOnly = createNode("ellipse", {
      frame: { x: 300, y: 40, w: 64, h: 64, rotation: 0 },
      name: "Remote Only",
    });
    addNode(remote, remoteOnly, rootId);

    const result = applyEditorDocOperation(doc, buildEditorDocOperation({ doc: remote }));

    expect(result.doc.nodes[rectId]?.frame.x).toBe(240);
    expect(result.doc.nodes[remoteOnly.id]).toBeDefined();
    expect(result.conflict.strategy).toBe("remote-wins");
    expect(result.conflict.nodeConflicts).toContain(rectId);
    expect(result.conflict.rebroadcast).toBe(false);
  });

  it("keeps newer local state when preferLocal is set and still preserves remote additions", () => {
    const { doc, rectId, rootId } = buildRectDoc();
    const remote = cloneDoc(doc);
    remote.nodes[rectId] = {
      ...remote.nodes[rectId],
      frame: { ...remote.nodes[rectId].frame, x: 32 },
    };
    const remoteOnly = createNode("ellipse", {
      frame: { x: 420, y: 24, w: 48, h: 48, rotation: 0 },
      name: "New Remote",
    });
    addNode(remote, remoteOnly, rootId);

    doc.nodes[rectId] = {
      ...doc.nodes[rectId],
      frame: { ...doc.nodes[rectId].frame, x: 512 },
    };

    const result = applyEditorDocOperation(doc, buildEditorDocOperation({ doc: remote }), { preferLocal: true });

    expect(result.doc.nodes[rectId]?.frame.x).toBe(512);
    expect(result.doc.nodes[remoteOnly.id]).toBeDefined();
    expect(result.conflict.strategy).toBe("local-wins");
    expect(result.conflict.rebroadcast).toBe(true);
  });

  it("keeps operation history bounded and exposes the latest operation for recovery", () => {
    const { doc } = buildRectDoc();
    let history = [] as ReturnType<typeof rememberEditorDocOperation>;

    for (let index = 0; index < 80; index += 1) {
      history = rememberEditorDocOperation(
        history,
        buildEditorDocOperation({ doc, ts: index + 1, opId: `op-${index}` }),
        24,
      );
    }

    expect(history).toHaveLength(24);
    expect(history[0]?.opId).toBe("op-56");
    expect(getLatestEditorDocOperation(history)?.opId).toBe("op-79");
  });

  it("prefers recent local state only while the local op is still fresh", () => {
    expect(shouldPreferLocalCollabState({ ts: Date.now() }, { ts: Date.now() - 1000 }, 4000)).toBe(true);
    expect(shouldPreferLocalCollabState({ ts: Date.now() - 10_000 }, { ts: Date.now() - 1000 }, 4000)).toBe(false);
  });
});
