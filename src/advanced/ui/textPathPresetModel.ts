import type { TextPath } from "../doc/scene";

export type TextPathPresetKind = "arc" | "wave" | "line";

export type TextPathPreset = {
  kind: TextPathPresetKind;
  inset: number;
  baseline: number;
  curve: number;
};

export type TextPathHandleId = "inset" | "baseline" | "curve-up" | "curve-down";

export type TextPathHandle = {
  id: TextPathHandleId;
  x: number;
  y: number;
  label: string;
};

export const TEXT_PATH_VIEWBOX = {
  width: 220,
  height: 80,
} as const;

const MIN_INSET = 8;
const MAX_INSET = 72;
const MIN_BASELINE = 12;
const MAX_BASELINE = 68;
const MIN_CURVE = 0;
const MAX_CURVE = 36;

function round(value: number) {
  return Number(value.toFixed(2));
}

function fmt(value: number) {
  return String(round(value));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampTextPathInset(value: number) {
  return clamp(value, MIN_INSET, MAX_INSET);
}

export function clampTextPathBaseline(value: number) {
  return clamp(value, MIN_BASELINE, MAX_BASELINE);
}

export function clampTextPathCurve(value: number) {
  return clamp(value, MIN_CURVE, MAX_CURVE);
}

export function buildTextPathPresetPathData(preset: TextPathPreset) {
  const inset = clampTextPathInset(preset.inset);
  const baseline = clampTextPathBaseline(preset.baseline);
  const curve = clampTextPathCurve(preset.curve);
  const endX = TEXT_PATH_VIEWBOX.width - inset;
  const leftMid = inset + 32;
  const rightMid = endX - 32;

  if (preset.kind === "line") {
    return `M ${fmt(inset)} ${fmt(baseline)} L ${fmt(endX)} ${fmt(baseline)}`;
  }
  if (preset.kind === "arc") {
    return `M ${fmt(inset)} ${fmt(baseline)} C ${fmt(leftMid)} ${fmt(baseline - curve)} ${fmt(rightMid)} ${fmt(baseline - curve)} ${fmt(endX)} ${fmt(baseline)}`;
  }
  return `M ${fmt(inset)} ${fmt(baseline)} C ${fmt(leftMid)} ${fmt(baseline - curve)} ${fmt(leftMid)} ${fmt(baseline - curve)} 110 ${fmt(baseline)} S ${fmt(rightMid)} ${fmt(baseline + curve)} ${fmt(endX)} ${fmt(baseline)}`;
}

export function createTextPathPreset(kind: TextPathPresetKind, patch: Partial<TextPathPreset> = {}): TextPathPreset {
  return {
    kind,
    inset: clampTextPathInset(patch.inset ?? 12),
    baseline: clampTextPathBaseline(patch.baseline ?? 40),
    curve: clampTextPathCurve(patch.curve ?? (kind === "line" ? 0 : kind === "arc" ? 32 : 20)),
  };
}

function toTextPath(kind: TextPathPresetKind, preset: Partial<TextPathPreset>): TextPath {
  const normalized = createTextPathPreset(kind, preset);
  return {
    pathData: buildTextPathPresetPathData(normalized),
  };
}

export function createPresetTextPath(kind: TextPathPresetKind, patch: Partial<TextPathPreset> = {}): TextPath {
  return toTextPath(kind, patch);
}

export function parseTextPathPreset(pathData: string | undefined | null): TextPathPreset | null {
  const raw = pathData?.trim();
  if (!raw) return null;

  const number = "(-?\\d+(?:\\.\\d+)?)";
  const linePattern = new RegExp(`^M\\s+${number}\\s+${number}\\s+L\\s+${number}\\s+${number}$`);
  const arcPattern = new RegExp(`^M\\s+${number}\\s+${number}\\s+C\\s+${number}\\s+${number}\\s+${number}\\s+${number}\\s+${number}\\s+${number}$`);
  const wavePattern = new RegExp(`^M\\s+${number}\\s+${number}\\s+C\\s+${number}\\s+${number}\\s+${number}\\s+${number}\\s+110\\s+${number}\\s+S\\s+${number}\\s+${number}\\s+${number}\\s+${number}$`);

  let match = raw.match(linePattern);
  if (match) {
    const inset = Number(match[1]);
    const baseline = Number(match[2]);
    return createTextPathPreset("line", { inset, baseline, curve: 0 });
  }

  match = raw.match(arcPattern);
  if (match) {
    const inset = Number(match[1]);
    const baseline = Number(match[2]);
    const curve = baseline - Number(match[4]);
    return createTextPathPreset("arc", { inset, baseline, curve });
  }

  match = raw.match(wavePattern);
  if (match) {
    const inset = Number(match[1]);
    const baseline = Number(match[8]);
    const curve = baseline - Number(match[4]);
    return createTextPathPreset("wave", { inset, baseline, curve });
  }

  return null;
}

export function getTextPathPresetHandles(preset: TextPathPreset): TextPathHandle[] {
  const inset = clampTextPathInset(preset.inset);
  const baseline = clampTextPathBaseline(preset.baseline);
  const curve = clampTextPathCurve(preset.curve);
  const endX = TEXT_PATH_VIEWBOX.width - inset;
  const handles: TextPathHandle[] = [
    { id: "inset", x: inset, y: baseline, label: "Inset" },
    { id: "baseline", x: 110, y: baseline, label: "Baseline" },
  ];
  if (preset.kind === "arc") {
    handles.push({ id: "curve-up", x: 110, y: baseline - curve, label: "Curve" });
  } else if (preset.kind === "wave") {
    handles.push({ id: "curve-up", x: inset + 32, y: baseline - curve, label: "Crest" });
    handles.push({ id: "curve-down", x: endX - 32, y: baseline + curve, label: "Trough" });
  }
  return handles;
}

export function applyTextPathPresetHandle(
  preset: TextPathPreset,
  handleId: TextPathHandleId,
  point: { x: number; y: number },
) {
  const next: TextPathPreset = { ...preset };
  if (handleId === "inset") {
    next.inset = clampTextPathInset(point.x);
  } else if (handleId === "baseline") {
    next.baseline = clampTextPathBaseline(point.y);
  } else if (handleId === "curve-up") {
    next.curve = clampTextPathCurve(next.baseline - point.y);
  } else if (handleId === "curve-down") {
    next.curve = clampTextPathCurve(point.y - next.baseline);
  }
  return createTextPathPreset(next.kind, next);
}
