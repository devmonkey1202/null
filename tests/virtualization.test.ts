import { describe, it, expect } from "vitest";
import { computeVirtualRange } from "@/lib/virtualization";

describe("computeVirtualRange", () => {
  it("returns empty range when itemCount is zero", () => {
    const range = computeVirtualRange({ itemCount: 0, itemSize: 40, viewportSize: 400, scrollOffset: 0 });
    expect(range.start).toBe(0);
    expect(range.end).toBe(-1);
  });

  it("computes visible range with overscan", () => {
    const range = computeVirtualRange({ itemCount: 100, itemSize: 20, viewportSize: 100, scrollOffset: 0, overscan: 2 });
    expect(range.start).toBe(0);
    expect(range.end).toBe(6);
    expect(range.offsetTop).toBe(0);
  });

  it("computes range at scroll offset", () => {
    const range = computeVirtualRange({ itemCount: 100, itemSize: 10, viewportSize: 50, scrollOffset: 120, overscan: 1 });
    expect(range.start).toBe(11);
    expect(range.end).toBe(17);
    expect(range.offsetTop).toBe(110);
    expect(range.offsetBottom).toBe((100 - 18) * 10);
  });
});
