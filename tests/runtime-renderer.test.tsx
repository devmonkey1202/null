// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import RuntimeRenderer, { type NavigateEvent } from "@/advanced/runtime/renderer";
import { createDoc, createNode, addNode } from "@/advanced/doc/scene";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function ensurePointerEvent() {
  if ("PointerEvent" in window) return;
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;

    constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string } = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: PointerEventPolyfill,
  });
}

function createTextLabelNode(id: string, parentId: string, value: string) {
  return createNode("text", {
    id,
    parentId,
    frame: { x: 0, y: 0, w: 140, h: 24, rotation: 0 },
    text: {
      value,
      style: {
        fontFamily: "Inter, sans-serif",
        fontSize: 16,
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: 0,
        paragraphSpacing: 0,
        align: "left",
      },
    },
  });
}

function createInteractiveVariantDoc() {
  const doc = createDoc();
  const pageRootId = doc.pages[0]!.rootId;
  const component = createNode("component", {
    id: "component_button",
    name: "Button Component",
    parentId: doc.root,
    frame: { x: 0, y: 0, w: 160, h: 56, rotation: 0 },
  });
  const defaultRoot = createNode("frame", {
    id: "variant_default_root",
    name: "Default Root",
    parentId: component.id,
    frame: { x: 0, y: 0, w: 160, h: 56, rotation: 0 },
  });
  const hoverRoot = createNode("frame", {
    id: "variant_hover_root",
    name: "Hover Root",
    parentId: component.id,
    frame: { x: 0, y: 0, w: 160, h: 56, rotation: 0 },
  });
  const pressRoot = createNode("frame", {
    id: "variant_press_root",
    name: "Press Root",
    parentId: component.id,
    frame: { x: 0, y: 0, w: 160, h: 56, rotation: 0 },
  });
  const dragRoot = createNode("frame", {
    id: "variant_drag_root",
    name: "Drag Root",
    parentId: component.id,
    frame: { x: 0, y: 0, w: 160, h: 56, rotation: 0 },
  });
  const defaultText = createTextLabelNode("variant_default_text", defaultRoot.id, "Default state");
  const hoverText = createTextLabelNode("variant_hover_text", hoverRoot.id, "Hover state");
  const pressText = createTextLabelNode("variant_press_text", pressRoot.id, "Pressed state");
  const dragText = createTextLabelNode("variant_drag_text", dragRoot.id, "Dragging state");
  defaultRoot.children = [defaultText.id];
  hoverRoot.children = [hoverText.id];
  pressRoot.children = [pressText.id];
  dragRoot.children = [dragText.id];
  component.children = [defaultRoot.id];
  component.variants = [
    { id: "variant_default", name: "Default", rootId: defaultRoot.id, props: { State: "Default" } },
    { id: "variant_hover", name: "Hover", rootId: hoverRoot.id, props: { State: "Hover" } },
    { id: "variant_pressed", name: "Pressed", rootId: pressRoot.id, props: { State: "Pressed" } },
    { id: "variant_dragging", name: "Dragging", rootId: dragRoot.id, props: { State: "Dragging" } },
  ];
  addNode(doc, component, doc.root);
  addNode(doc, defaultRoot, component.id);
  addNode(doc, hoverRoot, component.id);
  addNode(doc, pressRoot, component.id);
  addNode(doc, dragRoot, component.id);
  addNode(doc, defaultText, defaultRoot.id);
  addNode(doc, hoverText, hoverRoot.id);
  addNode(doc, pressText, pressRoot.id);
  addNode(doc, dragText, dragRoot.id);

  const instance = createNode("instance", {
    id: "button_instance",
    name: "Interactive Button",
    parentId: pageRootId,
    frame: { x: 40, y: 40, w: 160, h: 56, rotation: 0 },
    instanceOf: component.id,
    variantId: "variant_default",
    prototype: {
      interactions: [
        { id: "hover_variant", trigger: "hover", action: { type: "setVariant", variantId: "variant_hover", targetNodeId: "button_instance" } },
        { id: "press_variant", trigger: "onPress", action: { type: "setVariant", variantId: "variant_pressed", targetNodeId: "button_instance" } },
        { id: "drag_variant", trigger: "onDragStart", action: { type: "setVariant", variantId: "variant_dragging", targetNodeId: "button_instance" } },
        { id: "drag_variant_reset", trigger: "onDragEnd", action: { type: "setVariant", variantId: "variant_default", targetNodeId: "button_instance" } },
      ],
    },
  });
  addNode(doc, instance, pageRootId);
  return {
    doc,
    instanceId: instance.id,
  };
}

function VariantRuntimeHarness({ doc }: { doc: ReturnType<typeof createDoc> }) {
  const [instanceVariantOverrides, setInstanceVariantOverrides] = useState<Record<string, string>>({});
  const handleNavigate = useCallback((event: NavigateEvent) => {
    if (event.action.type !== "setVariant") return;
    const targetId = event.action.targetNodeId ?? event.nodeId;
    if (!targetId) return;
    setInstanceVariantOverrides((prev) => ({ ...prev, [targetId]: (event.action as Extract<NavigateEvent["action"], { type: "setVariant" }>).variantId }));
  }, []);

  return (
    <>
      <RuntimeRenderer
        doc={doc}
        interactive
        onNavigate={handleNavigate}
        instanceVariantOverrides={instanceVariantOverrides}
      />
      <div data-testid="variant-state">{instanceVariantOverrides.button_instance ?? "variant_default"}</div>
    </>
  );
}

describe("runtime renderer accessibility + media", () => {
  it("triggers click interaction with keyboard", async () => {
    const doc = createDoc();
    const rootId = doc.pages[0].rootId;
    const rect = createNode("rect", { frame: { x: 0, y: 0, w: 100, h: 60, rotation: 0 } });
    rect.prototype = {
      interactions: [
        { id: "interaction_click", trigger: "click", action: { type: "navigate", targetPageId: rootId } },
      ],
    };
    addNode(doc, rect, rootId);

    const onNavigate = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RuntimeRenderer
          doc={doc}
          interactive
          onNavigate={onNavigate}
        />,
      );
    });

    const node = container.querySelector(`[data-node-id="${rect.id}"]`) as SVGGElement | null;
    expect(node).toBeTruthy();
    await act(async () => {
      node?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onNavigate).toHaveBeenCalled();
  });

  it("renders video nodes with controls", async () => {
    const doc = createDoc();
    const rootId = doc.pages[0].rootId;
    const video = createNode("video", {
      frame: { x: 0, y: 0, w: 160, h: 90, rotation: 0 },
      video: {
        src: "https://example.com/sample.mp4",
        fit: "cover",
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        controls: true,
        autoplay: true,
        muted: true,
      },
    });
    addNode(doc, video, rootId);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RuntimeRenderer doc={doc} />);
    });

    const videoEl = container.querySelector("video") as HTMLVideoElement | null;
    expect(videoEl).toBeTruthy();
    expect(videoEl?.autoplay).toBe(true);
    expect(videoEl?.muted).toBe(true);
    expect(videoEl?.hasAttribute("controls")).toBe(true);
  });

  it("composites noise effects with source graphics instead of replacing them", async () => {
    const doc = createDoc();
    const rootId = doc.pages[0].rootId;
    const rect = createNode("rect", {
      id: "noise_rect",
      frame: { x: 0, y: 0, w: 120, h: 80, rotation: 0 },
    });
    rect.style.effects = [{ type: "noise", amount: 0.5 }];
    addNode(doc, rect, rootId);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RuntimeRenderer doc={doc} />);
    });

    const filter = container.querySelector(`filter#rt-effect-${rect.id}`) as SVGFilterElement | null;
    expect(filter).toBeTruthy();
    expect(filter?.querySelector("feTurbulence")).toBeTruthy();
    expect(filter?.querySelector('feBlend[mode="soft-light"]')).toBeTruthy();
  });

  it("fires hover and delayed whileHover with proper cancellation", async () => {
    vi.useFakeTimers();
    try {
      const doc = createDoc();
      const rootId = doc.pages[0].rootId;
      const rect = createNode("rect", {
        id: "hover_rect",
        frame: { x: 0, y: 0, w: 100, h: 60, rotation: 0 },
        prototype: {
          interactions: [
            { id: "hover_now", trigger: "hover", action: { type: "url", url: "https://example.com/hover" } },
            { id: "hover_delay", trigger: "whileHover", hoverDelayMs: 150, action: { type: "url", url: "https://example.com/while-hover" } },
          ],
        },
      });
      addNode(doc, rect, rootId);

      const onNavigate = vi.fn();
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(<RuntimeRenderer doc={doc} interactive onNavigate={onNavigate} />);
      });

      const node = container.querySelector(`[data-node-id="${rect.id}"]`) as SVGGElement | null;
      expect(node).toBeTruthy();

      await act(async () => {
        node?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      });
      expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ trigger: "hover" }));

      await act(async () => {
        vi.advanceTimersByTime(149);
      });
      expect(onNavigate).not.toHaveBeenCalledWith(expect.objectContaining({ trigger: "whileHover" }));

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ trigger: "whileHover" }));

      onNavigate.mockClear();
      await act(async () => {
        node?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        node?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
        vi.advanceTimersByTime(300);
      });
      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ trigger: "hover" }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("fires onPress immediately and drag triggers only after movement threshold", async () => {
    ensurePointerEvent();
    const originalSetPointerCapture = (SVGGElement.prototype as unknown as { setPointerCapture?: unknown }).setPointerCapture;
    const originalReleasePointerCapture = (SVGGElement.prototype as unknown as { releasePointerCapture?: unknown }).releasePointerCapture;
    Object.defineProperty(SVGGElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
    Object.defineProperty(SVGGElement.prototype, "releasePointerCapture", { configurable: true, value: vi.fn() });

    try {
      const doc = createDoc();
      const rootId = doc.pages[0].rootId;
      const rect = createNode("rect", {
        id: "drag_rect",
        frame: { x: 0, y: 0, w: 120, h: 60, rotation: 0 },
        prototype: {
          interactions: [
            { id: "press_now", trigger: "onPress", action: { type: "url", url: "https://example.com/press" } },
            { id: "drag_start", trigger: "onDragStart", action: { type: "url", url: "https://example.com/drag-start" } },
            { id: "drag_end", trigger: "onDragEnd", action: { type: "url", url: "https://example.com/drag-end" } },
          ],
        },
      });
      addNode(doc, rect, rootId);

      const onNavigate = vi.fn();
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(<RuntimeRenderer doc={doc} interactive onNavigate={onNavigate} />);
      });

      const node = container.querySelector(`[data-node-id="${rect.id}"]`) as SVGGElement | null;
      expect(node).toBeTruthy();

      await act(async () => {
        node?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
      expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ trigger: "onPress" }));

      onNavigate.mockClear();
      await act(async () => {
        node?.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }));
        node?.dispatchEvent(new window.PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 3, clientY: 4 }));
      });
      expect(onNavigate).not.toHaveBeenCalledWith(expect.objectContaining({ trigger: "onDragStart" }));

      await act(async () => {
        node?.dispatchEvent(new window.PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 12, clientY: 0 }));
      });
      expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ trigger: "onDragStart" }));

      await act(async () => {
        node?.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: 12, clientY: 0 }));
      });
      expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ trigger: "onDragEnd" }));
    } finally {
      if (originalSetPointerCapture === undefined) {
        delete (SVGGElement.prototype as unknown as { setPointerCapture?: unknown }).setPointerCapture;
      } else {
        Object.defineProperty(SVGGElement.prototype, "setPointerCapture", { configurable: true, value: originalSetPointerCapture });
      }
      if (originalReleasePointerCapture === undefined) {
        delete (SVGGElement.prototype as unknown as { releasePointerCapture?: unknown }).releasePointerCapture;
      } else {
        Object.defineProperty(SVGGElement.prototype, "releasePointerCapture", { configurable: true, value: originalReleasePointerCapture });
      }
    }
  });

  it("applies interactive component variant changes for hover, press, and drag lifecycles", async () => {
    ensurePointerEvent();
    const originalSetPointerCapture = (SVGGElement.prototype as unknown as { setPointerCapture?: unknown }).setPointerCapture;
    const originalReleasePointerCapture = (SVGGElement.prototype as unknown as { releasePointerCapture?: unknown }).releasePointerCapture;
    Object.defineProperty(SVGGElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
    Object.defineProperty(SVGGElement.prototype, "releasePointerCapture", { configurable: true, value: vi.fn() });

    try {
      const { doc, instanceId } = createInteractiveVariantDoc();
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(<VariantRuntimeHarness doc={doc} />);
      });

      const instanceNode = container.querySelector(`[data-node-id="${instanceId}"]`) as SVGGElement | null;
      expect(instanceNode).toBeTruthy();
      expect(container.querySelector('[data-testid="variant-state"]')?.textContent).toBe("variant_default");

      await act(async () => {
        instanceNode?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      });
      expect(container.querySelector('[data-testid="variant-state"]')?.textContent).toBe("variant_hover");

      await act(async () => {
        instanceNode?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
      expect(container.querySelector('[data-testid="variant-state"]')?.textContent).toBe("variant_pressed");

      await act(async () => {
        instanceNode?.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, pointerId: 4, clientX: 0, clientY: 0 }));
        instanceNode?.dispatchEvent(new window.PointerEvent("pointermove", { bubbles: true, pointerId: 4, clientX: 10, clientY: 0 }));
      });
      expect(container.querySelector('[data-testid="variant-state"]')?.textContent).toBe("variant_dragging");

      await act(async () => {
        instanceNode?.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true, pointerId: 4, clientX: 10, clientY: 0 }));
      });
      expect(container.querySelector('[data-testid="variant-state"]')?.textContent).toBe("variant_default");
    } finally {
      if (originalSetPointerCapture === undefined) {
        delete (SVGGElement.prototype as unknown as { setPointerCapture?: unknown }).setPointerCapture;
      } else {
        Object.defineProperty(SVGGElement.prototype, "setPointerCapture", { configurable: true, value: originalSetPointerCapture });
      }
      if (originalReleasePointerCapture === undefined) {
        delete (SVGGElement.prototype as unknown as { releasePointerCapture?: unknown }).releasePointerCapture;
      } else {
        Object.defineProperty(SVGGElement.prototype, "releasePointerCapture", { configurable: true, value: originalReleasePointerCapture });
      }
    }
  });
});
