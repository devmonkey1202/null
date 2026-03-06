export type VirtualRange = {
  start: number;
  end: number;
  total: number;
  offsetTop: number;
  offsetBottom: number;
};

export type VirtualRangeOptions = {
  itemCount: number;
  itemSize: number;
  viewportSize: number;
  scrollOffset: number;
  overscan?: number;
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function computeVirtualRange(options: VirtualRangeOptions): VirtualRange {
  const count = Math.max(0, Math.floor(options.itemCount));
  const size = Math.max(1, Math.floor(options.itemSize));
  const viewport = Math.max(0, Math.floor(options.viewportSize));
  const scroll = Math.max(0, Math.floor(options.scrollOffset));
  const overscan = Math.max(0, Math.floor(options.overscan ?? 2));

  if (count === 0 || viewport === 0) {
    return { start: 0, end: -1, total: count, offsetTop: 0, offsetBottom: 0 };
  }

  const visibleStart = Math.floor(scroll / size);
  const visibleCount = Math.ceil(viewport / size);
  const start = clamp(visibleStart - overscan, 0, Math.max(0, count - 1));
  const end = clamp(visibleStart + visibleCount + overscan - 1, 0, Math.max(0, count - 1));
  const offsetTop = start * size;
  const offsetBottom = Math.max(0, (count - end - 1) * size);
  return { start, end, total: count, offsetTop, offsetBottom };
}
