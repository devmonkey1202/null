import { GRID } from "./AdvancedEditor.constants";

export function makeRuntimeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;
}

export function snap(value: number, enabled: boolean, grid = GRID) {
  if (!enabled) return value;
  const step = Math.max(1, grid);
  return Math.round(value / step) * step;
}

/** Integer rounding to avoid 0.5px during move/resize (N1 pixel snap). */
export function snapToPixel(value: number): number {
  return Math.round(value);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getRulerStep(zoom: number) {
  const targetPx = 80;
  const raw = targetPx / Math.max(zoom, 0.05);
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const candidates = [1, 2, 5, 10].map((n) => n * magnitude);
  return candidates.find((value) => value >= raw) ?? candidates[candidates.length - 1];
}
