export function roundRotationDegrees(value: number, step = 0.1) {
  if (!Number.isFinite(value)) return 0;
  const decimals = `${step}`.includes(".") ? `${step}`.split(".")[1]?.length ?? 0 : 0;
  const rounded = Number((Math.round(value / step) * step).toFixed(decimals));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeRotationDegrees(value: number, step = 0.1) {
  if (!Number.isFinite(value)) return 0;
  let normalized = value % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  return roundRotationDegrees(normalized, step);
}

export function formatRotationDegrees(value: number, precision = 1) {
  if (!Number.isFinite(value)) return "0";
  const normalized = normalizeRotationDegrees(value, 1 / Math.pow(10, precision));
  const fixed = normalized.toFixed(precision);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function parseRotationInput(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return normalizeRotationDegrees(parsed);
}
