import { normalizeTextInput } from "./textLayout";

export function getTextPathId(nodeId: string, prefix: string) {
  return `${prefix}-${nodeId}`;
}

export function normalizeTextPathText(text: string) {
  return normalizeTextInput(text).replace(/\s+/g, " ").trim();
}

export function clampTextPathStartOffsetValue(offset: number | undefined) {
  const value = Number.isFinite(offset) ? Number(offset) : 0;
  return Math.max(0, Math.min(100, value));
}

export function normalizeTextPathStartOffset(offset: number | undefined) {
  return `${clampTextPathStartOffsetValue(offset)}%`;
}
