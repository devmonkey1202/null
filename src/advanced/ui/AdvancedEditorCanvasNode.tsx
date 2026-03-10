"use client";

import React from "react";
import type { Doc, Node } from "../doc/scene";
import { WidgetSandbox } from "../runtime/widget-sandbox";
import type { BridgeActionHandler } from "../runtime/widget-bridge";

type CanvasNodeProps = {
  id: string;
  doc: Doc;
  node: Node;
  displayX: number;
  displayY: number;
  isSelected: boolean;
  useLod: boolean;
  outlineMode: boolean;
  effectId: string | undefined;
  blendMode: React.CSSProperties["mixBlendMode"];
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  renderNode: (doc: Doc, node: Node, options: { outline: boolean; filterId: string | undefined }) => React.ReactNode;
  onBridgeAction?: BridgeActionHandler;
};

function CanvasNodeView({
  id,
  doc,
  node,
  displayX,
  displayY,
  isSelected,
  useLod,
  outlineMode,
  effectId,
  blendMode,
  onContextMenu,
  onDoubleClick,
  renderNode,
  onBridgeAction,
}: CanvasNodeProps) {
  const cx = node.frame.w / 2;
  const cy = node.frame.h / 2;
  return (
    <g
      data-nodeid={id}
      transform={`translate(${displayX} ${displayY}) rotate(${node.frame.rotation} ${cx} ${cy})`}
      onContextMenu={(e) => onContextMenu(e, id)}
      onDoubleClick={onDoubleClick}
      opacity={node.style.opacity}
      style={blendMode ? { mixBlendMode: blendMode } : undefined}
    >
      {useLod ? (
        <rect x={0} y={0} width={node.frame.w} height={node.frame.h} fill="#f3f4f6" stroke="#d1d5db" strokeWidth={1} />
      ) : (
        renderNode(doc, node, { outline: outlineMode, filterId: effectId })
      )}
      {node.widget ? (
        <foreignObject x={0} y={0} width={node.frame.w} height={node.frame.h}>
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "stretch", justifyContent: "stretch" }}>
            <WidgetSandbox widget={node.widget} width={node.frame.w} height={node.frame.h} interactive={false} onBridgeAction={onBridgeAction} />
          </div>
        </foreignObject>
      ) : null}
      {isSelected ? (
        <rect x={0} y={0} width={node.frame.w} height={node.frame.h} fill="none" stroke="#2563EB" strokeWidth={1} />
      ) : null}
      {isSelected
        ? (["nw", "ne", "sw", "se"] as const).map((handle) => {
            const size = 8;
            const hx = handle.includes("w") ? 0 : node.frame.w;
            const hy = handle.includes("n") ? 0 : node.frame.h;
            return (
              <rect
                key={`${id}-${handle}`}
                data-nodeid={id}
                data-handle={handle}
                x={hx - size / 2}
                y={hy - size / 2}
                width={size}
                height={size}
                fill="#2563EB"
              />
            );
          })
        : null}
    </g>
  );
}

export const CanvasNode = React.memo(
  CanvasNodeView,
  (prev, next) =>
    prev.id === next.id &&
    prev.displayX === next.displayX &&
    prev.displayY === next.displayY &&
    prev.node.frame.w === next.node.frame.w &&
    prev.node.frame.h === next.node.frame.h &&
    prev.node.frame.rotation === next.node.frame.rotation &&
    prev.isSelected === next.isSelected &&
    prev.useLod === next.useLod &&
    prev.node.style.opacity === next.node.style.opacity &&
    prev.node.widget === next.node.widget,
);

export type { CanvasNodeProps };
