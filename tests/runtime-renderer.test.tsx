// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import RuntimeRenderer from "@/advanced/runtime/renderer";
import { createDoc, createNode, addNode } from "@/advanced/doc/scene";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
});
