import type { Constraints, LayoutPositioning } from "../doc/scene";

export type ConstraintAxis = "horizontal" | "vertical";
export type ConstraintAxisMode = "min" | "center" | "max" | "stretch" | "scale";
export type ConstraintEditingState = {
  editable: boolean;
  reason?: "auto-layout-parent" | "grid-parent";
};

export const HORIZONTAL_CONSTRAINT_OPTIONS: Array<{ mode: ConstraintAxisMode; label: string }> = [
  { mode: "min", label: "좌" },
  { mode: "center", label: "중앙" },
  { mode: "max", label: "우" },
  { mode: "stretch", label: "좌우" },
  { mode: "scale", label: "비율" },
];

export const VERTICAL_CONSTRAINT_OPTIONS: Array<{ mode: ConstraintAxisMode; label: string }> = [
  { mode: "min", label: "상" },
  { mode: "center", label: "중앙" },
  { mode: "max", label: "하" },
  { mode: "stretch", label: "상하" },
  { mode: "scale", label: "비율" },
];

export function buildConstraintPreset(
  horizontal: ConstraintAxisMode,
  vertical: ConstraintAxisMode,
): Constraints {
  const next: Constraints = {};

  if (horizontal === "min") next.left = true;
  else if (horizontal === "center") next.hCenter = true;
  else if (horizontal === "max") next.right = true;
  else if (horizontal === "stretch") {
    next.left = true;
    next.right = true;
  } else if (horizontal === "scale") {
    next.scaleX = true;
  }

  if (vertical === "min") next.top = true;
  else if (vertical === "center") next.vCenter = true;
  else if (vertical === "max") next.bottom = true;
  else if (vertical === "stretch") {
    next.top = true;
    next.bottom = true;
  } else if (vertical === "scale") {
    next.scaleY = true;
  }

  return next;
}

export function getConstraintEditingState(
  parentLayoutMode: "fixed" | "auto" | "grid" | undefined,
  layoutPositioning: LayoutPositioning | undefined = "auto",
): ConstraintEditingState {
  if (parentLayoutMode === "auto" && layoutPositioning !== "absolute") {
    return { editable: false, reason: "auto-layout-parent" };
  }
  if (parentLayoutMode === "grid") {
    return { editable: false, reason: "grid-parent" };
  }
  return { editable: true };
}

export function getConstraintAxisMode(
  constraints: Constraints | undefined,
  axis: ConstraintAxis,
): ConstraintAxisMode {
  if (axis === "horizontal") {
    if (constraints?.scaleX) return "scale";
    if (constraints?.left && constraints?.right) return "stretch";
    if (constraints?.hCenter) return "center";
    if (constraints?.right) return "max";
    return "min";
  }

  if (constraints?.scaleY) return "scale";
  if (constraints?.top && constraints?.bottom) return "stretch";
  if (constraints?.vCenter) return "center";
  if (constraints?.bottom) return "max";
  return "min";
}

export function describeConstraintPreset(constraints: Constraints | undefined): string {
  const horizontal = HORIZONTAL_CONSTRAINT_OPTIONS.find(
    (option) => option.mode === getConstraintAxisMode(constraints, "horizontal"),
  )?.label ?? "좌";
  const vertical = VERTICAL_CONSTRAINT_OPTIONS.find(
    (option) => option.mode === getConstraintAxisMode(constraints, "vertical"),
  )?.label ?? "상";
  return `${horizontal} / ${vertical}`;
}
