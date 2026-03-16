import { describe, expect, it, vi } from "vitest";

import { finalizeResizeDoc } from "@/advanced/ui/AdvancedEditor.resize";

describe("editor resize finalize", () => {
  it("uses clone fallback for nodes without children", () => {
    const draft = {
      nodes: {
        a: {
          id: "a",
          children: [],
          frame: { x: 0, y: 0, w: 100, h: 100, rotation: 0 },
        },
      },
    } as any;

    const cloneDoc = vi.fn((doc) => ({ ...doc, cloned: true }));
    const layoutDoc = vi.fn();
    const applyConstraintsOnResize = vi.fn();
    const refreshOverridesForSubtree = vi.fn();

    const result = finalizeResizeDoc({
      draft,
      nodeId: "a",
      origin: { x: 0, y: 0, w: 80, h: 80, rotation: 0 },
      deps: {
        layoutDoc,
        applyConstraintsOnResize,
        refreshOverridesForSubtree,
        cloneDoc,
      },
    });

    expect(result.strategy).toBe("clone");
    expect(cloneDoc).toHaveBeenCalledWith(draft);
    expect(layoutDoc).not.toHaveBeenCalled();
    expect(applyConstraintsOnResize).not.toHaveBeenCalled();
    expect(refreshOverridesForSubtree).not.toHaveBeenCalled();
    expect(result.nextDoc).toEqual({ ...draft, cloned: true });
  });

  it("uses auto-layout path for resized auto-layout containers", () => {
    const draft = {
      nodes: {
        a: {
          id: "a",
          children: ["b"],
          layout: { mode: "auto" },
          frame: { x: 10, y: 20, w: 120, h: 60, rotation: 0 },
        },
      },
    } as any;

    const laidOut = { ...draft, laidOut: true };
    const cloneDoc = vi.fn();
    const layoutDoc = vi.fn(() => laidOut);
    const applyConstraintsOnResize = vi.fn();
    const refreshOverridesForSubtree = vi.fn();

    const result = finalizeResizeDoc({
      draft,
      nodeId: "a",
      origin: { x: 10, y: 20, w: 100, h: 50, rotation: 0 },
      deps: {
        layoutDoc,
        applyConstraintsOnResize,
        refreshOverridesForSubtree,
        cloneDoc,
      },
    });

    expect(result.strategy).toBe("auto-layout");
    expect(layoutDoc).toHaveBeenCalledWith(draft);
    expect(refreshOverridesForSubtree).toHaveBeenCalledWith(laidOut, "a");
    expect(applyConstraintsOnResize).not.toHaveBeenCalled();
    expect(cloneDoc).not.toHaveBeenCalled();
    expect(result.nextDoc).toBe(laidOut);
  });

  it("uses constraints path for regular containers", () => {
    const draft = {
      nodes: {
        a: {
          id: "a",
          children: ["b"],
          layout: { mode: "fixed" },
          frame: { x: 15, y: 25, w: 140, h: 70, rotation: 0 },
        },
      },
    } as any;

    const constrained = { ...draft, constrained: true };
    const cloneDoc = vi.fn();
    const layoutDoc = vi.fn();
    const applyConstraintsOnResize = vi.fn(() => constrained);
    const refreshOverridesForSubtree = vi.fn();

    const result = finalizeResizeDoc({
      draft,
      nodeId: "a",
      origin: { x: 15, y: 25, w: 110, h: 55, rotation: 0 },
      deps: {
        layoutDoc,
        applyConstraintsOnResize,
        refreshOverridesForSubtree,
        cloneDoc,
      },
    });

    expect(result.strategy).toBe("constraints");
    expect(applyConstraintsOnResize).toHaveBeenCalledWith(
      draft,
      "a",
      { x: 15, y: 25, w: 110, h: 55, rotation: 0 },
      { x: 15, y: 25, w: 140, h: 70, rotation: 0 },
    );
    expect(refreshOverridesForSubtree).toHaveBeenCalledWith(constrained, "a");
    expect(layoutDoc).not.toHaveBeenCalled();
    expect(cloneDoc).not.toHaveBeenCalled();
    expect(result.nextDoc).toBe(constrained);
  });
});
