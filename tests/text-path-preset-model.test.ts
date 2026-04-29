import { describe, expect, it } from "vitest";

import {
  applyTextPathPresetHandle,
  buildTextPathPresetPathData,
  createTextPathPreset,
  getTextPathPresetHandles,
  parseTextPathPreset,
} from "../src/advanced/ui/textPathPresetModel";

describe("textPathPresetModel", () => {
  it("builds and parses preset path data", () => {
    const arc = createTextPathPreset("arc", { inset: 16, baseline: 42, curve: 24 });
    const pathData = buildTextPathPresetPathData(arc);
    expect(parseTextPathPreset(pathData)).toEqual(arc);
  });

  it("builds wave handles and updates amplitude from drag points", () => {
    const wave = createTextPathPreset("wave", { inset: 12, baseline: 40, curve: 18 });
    const handles = getTextPathPresetHandles(wave);
    expect(handles.map((handle) => handle.id)).toEqual(["inset", "baseline", "curve-up", "curve-down"]);

    const updated = applyTextPathPresetHandle(wave, "curve-up", { x: 44, y: 10 });
    expect(updated.curve).toBe(30);
  });

  it("updates inset and baseline from handle drags", () => {
    const line = createTextPathPreset("line", { inset: 12, baseline: 40, curve: 0 });
    const movedInset = applyTextPathPresetHandle(line, "inset", { x: 32, y: 40 });
    expect(movedInset.inset).toBe(32);

    const movedBaseline = applyTextPathPresetHandle(line, "baseline", { x: 110, y: 58 });
    expect(movedBaseline.baseline).toBe(58);
  });
});
