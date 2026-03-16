import { describe, expect, it } from "vitest";

import {
  buildConstraintPreset,
  describeConstraintPreset,
  getConstraintAxisMode,
  getConstraintEditingState,
} from "../src/advanced/ui/constraintPresets";

describe("constraint presets", () => {
  it("builds consistent presets from horizontal and vertical modes", () => {
    expect(buildConstraintPreset("stretch", "scale")).toEqual({
      left: true,
      right: true,
      scaleY: true,
    });
    expect(buildConstraintPreset("center", "max")).toEqual({
      hCenter: true,
      bottom: true,
    });
  });

  it("derives the active axis mode from constraint flags", () => {
    expect(getConstraintAxisMode({ left: true, right: true }, "horizontal")).toBe("stretch");
    expect(getConstraintAxisMode({ scaleX: true }, "horizontal")).toBe("scale");
    expect(getConstraintAxisMode({ vCenter: true }, "vertical")).toBe("center");
    expect(getConstraintAxisMode(undefined, "vertical")).toBe("min");
  });

  it("formats a readable constraint preset label", () => {
    expect(describeConstraintPreset({ left: true, bottom: true })).toContain("/");
    expect(describeConstraintPreset({ scaleX: true, top: true, bottom: true })).toContain("/");
  });

  it("disables constraint editing for auto-layout and grid children when required", () => {
    expect(getConstraintEditingState("auto")).toEqual({
      editable: false,
      reason: "auto-layout-parent",
    });
    expect(getConstraintEditingState("auto", "absolute")).toEqual({
      editable: true,
    });
    expect(getConstraintEditingState("grid")).toEqual({
      editable: false,
      reason: "grid-parent",
    });
    expect(getConstraintEditingState("fixed")).toEqual({
      editable: true,
    });
  });
});
