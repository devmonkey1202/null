"use client";

import React, { useMemo, useRef } from "react";

import { minimapPointToCanvas, projectRectToMinimap, type MinimapModel } from "./canvasChrome";

type AdvancedEditorMinimapProps = {
  model: MinimapModel;
  onJumpTo: (point: { x: number; y: number }) => void;
  width?: number;
  height?: number;
};

export default function AdvancedEditorMinimap({
  model,
  onJumpTo,
  width = 220,
  height = 152,
}: AdvancedEditorMinimapProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  const projected = useMemo(() => {
    return {
      viewport: projectRectToMinimap(model.viewport, model.bounds, width, height),
      selection: model.selectionBounds ? projectRectToMinimap(model.selectionBounds, model.bounds, width, height) : null,
      nodes: model.nodes.map((item) => ({
        ...item,
        rect: projectRectToMinimap(item.rect, model.bounds, width, height),
      })),
    };
  }, [height, model, width]);

  function jumpFromPointer(clientX: number, clientY: number) {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const local = {
      x: Math.max(0, Math.min(width, clientX - rect.left)),
      y: Math.max(0, Math.min(height, clientY - rect.top)),
    };
    onJumpTo(minimapPointToCanvas(local, model.bounds, width, height));
  }

  return (
    <div className="absolute bottom-4 right-4 z-20 overflow-hidden rounded-xl border border-neutral-200 bg-white/95 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500">
        <span>Minimap</span>
        <span>{Math.round(model.bounds.w)} × {Math.round(model.bounds.h)}</span>
      </div>
      <div
        ref={surfaceRef}
        className="cursor-pointer bg-neutral-50"
        style={{ width, height }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          jumpFromPointer(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          jumpFromPointer(event.clientX, event.clientY);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="캔버스 미니맵">
          <rect x={0} y={0} width={width} height={height} fill="#F8FAFC" />
          {projected.nodes.map((item) => (
            <rect
              key={item.id}
              x={item.rect.x}
              y={item.rect.y}
              width={Math.max(1, item.rect.w)}
              height={Math.max(1, item.rect.h)}
              fill={item.selected ? "rgba(37,99,235,0.22)" : "rgba(148,163,184,0.25)"}
              stroke={item.selected ? "#2563EB" : "#94A3B8"}
              strokeWidth={item.selected ? 1.1 : 0.6}
              rx={1.5}
            />
          ))}
          {projected.selection ? (
            <rect
              x={projected.selection.x}
              y={projected.selection.y}
              width={Math.max(1, projected.selection.w)}
              height={Math.max(1, projected.selection.h)}
              fill="none"
              stroke="#F97316"
              strokeWidth={1.2}
              strokeDasharray="4 2"
              rx={2}
            />
          ) : null}
          <rect
            x={projected.viewport.x}
            y={projected.viewport.y}
            width={Math.max(2, projected.viewport.w)}
            height={Math.max(2, projected.viewport.h)}
            fill="rgba(14,165,233,0.12)"
            stroke="#0EA5E9"
            strokeWidth={1.4}
            rx={2}
          />
        </svg>
      </div>
    </div>
  );
}
