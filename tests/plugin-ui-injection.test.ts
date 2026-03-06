// @vitest-environment node
import { describe, it, expect } from "vitest";
import { registerRuntimePlugin, getCustomNodeRenderer } from "@/advanced/runtime/plugins";

describe("plugin UI injection", () => {
  it("registers a custom renderer and retrieves it", () => {
    const renderer = () => null;
    registerRuntimePlugin({
      widgetRenderers: {
        widget_node: renderer,
      },
    });

    const result = getCustomNodeRenderer("widget_node");
    expect(result).toBe(renderer);
  });
});
