"use client";

import { useCallback, useMemo, useState } from "react";
import { computeVirtualRange } from "@/lib/virtualization";

type VirtualListProps<T> = {
  items: T[];
  itemHeight: number;
  height: number;
  overscan?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
};

export default function VirtualList<T>(props: VirtualListProps<T>) {
  const { items, itemHeight, height, overscan, renderItem } = props;
  const [scrollTop, setScrollTop] = useState(0);
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);
  const range = useMemo(
    () =>
      computeVirtualRange({
        itemCount: items.length,
        itemSize: itemHeight,
        viewportSize: height,
        scrollOffset: scrollTop,
        overscan,
      }),
    [items.length, itemHeight, height, overscan, scrollTop]
  );

  const visible = range.end >= range.start ? items.slice(range.start, range.end + 1) : [];
  const spacerStyle: React.CSSProperties = {
    height: range.offsetTop,
  };
  const bottomStyle: React.CSSProperties = {
    height: range.offsetBottom,
  };

  return (
    <div style={{ height, overflow: "auto" }} onScroll={handleScroll}>
      <div style={spacerStyle} />
      {visible.map((item, idx) => {
        const index = range.start + idx;
        return (
          <div key={index} style={{ height: itemHeight }}>
            {renderItem(item, index)}
          </div>
        );
      })}
      <div style={bottomStyle} />
    </div>
  );
}
