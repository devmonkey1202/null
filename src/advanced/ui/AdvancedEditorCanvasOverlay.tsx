"use client";

import React from "react";

import type { Doc, Node } from "../doc/scene";
import type { PathEditState } from "../geom/pathEditSession";
import type { DistanceGuideLine } from "./AdvancedEditor.drag";
import type { Rect } from "./AdvancedEditor.types";

type AuditIssueLike = {
  id: string;
  message: string;
  severity: "warn" | "error";
  frame: Rect;
};

type CollabCursorLike = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  selectionRect: Rect | null;
};

type CommentLike = {
  id: string;
  x: number;
  y: number;
  resolved: boolean;
  replies: Array<{ id: string }>;
};

type AdvancedEditorCanvasOverlayProps = {
  doc: Doc;
  marquee: Rect | null;
  selectedNode: Node | null;
  selectedAbs: Rect | null;
  parentAbs: Rect | null;
  resizingSelectionId: string | null;
  pathEditState: PathEditState | null;
  serializePathEditState: (state: PathEditState) => string;
  auditMode: boolean;
  auditIssues: AuditIssueLike[];
  collabEnabled: boolean;
  collabCursors: CollabCursorLike[];
  comments: CommentLike[];
  onSelectComment: (id: string) => void;
  layoutGridOverlay?: React.ReactNode;
  panelMode: "design" | "prototype" | "workflow" | "dev" | "export";
  devMeasure: boolean;
  devGuides: boolean;
  devSpecOverlay: boolean;
  devSpecLines: string[];
  computeDistanceGuideLines: (args: { moving: Rect; targetRects: Rect[]; parentRect: Rect | null }) => DistanceGuideLine[];
  formatMeasurementLabel: (value: number) => string;
  getAbsoluteFrame: (doc: Doc, nodeId: string) => Rect | null;
};

export default function AdvancedEditorCanvasOverlay({
  doc,
  marquee,
  selectedNode,
  selectedAbs,
  parentAbs,
  resizingSelectionId,
  pathEditState,
  serializePathEditState,
  auditMode,
  auditIssues,
  collabEnabled,
  collabCursors,
  comments,
  onSelectComment,
  layoutGridOverlay,
  panelMode,
  devMeasure,
  devGuides,
  devSpecOverlay,
  devSpecLines,
  computeDistanceGuideLines,
  formatMeasurementLabel,
  getAbsoluteFrame,
}: AdvancedEditorCanvasOverlayProps) {
  return (
    <g data-layer="overlay" style={{ willChange: "transform" }}>
      {marquee ? (
        <rect
          x={marquee.x}
          y={marquee.y}
          width={marquee.w}
          height={marquee.h}
          fill="rgba(37,99,235,0.1)"
          stroke="#2563EB"
          strokeDasharray="4 2"
        />
      ) : null}

      {selectedNode && selectedAbs && resizingSelectionId === selectedNode.id ? (
        <g pointerEvents="none">
          <rect
            x={selectedAbs.x}
            y={selectedAbs.y - 20}
            width={Math.max(52, `${formatMeasurementLabel(selectedAbs.w)} x ${formatMeasurementLabel(selectedAbs.h)}`.length * 6.4)}
            height={16}
            rx={5}
            fill="white"
            stroke="#2563EB"
            strokeWidth={1}
          />
          <text x={selectedAbs.x + 6} y={selectedAbs.y - 8} fill="#2563EB" fontSize={10}>
            {formatMeasurementLabel(selectedAbs.w)} x {formatMeasurementLabel(selectedAbs.h)}
          </text>
        </g>
      ) : null}

      {pathEditState ? (
        <g pointerEvents="none">
          <path d={serializePathEditState(pathEditState)} fill="none" stroke="#2563EB" strokeWidth={2} />
          {pathEditState.anchors.map((anchor, index) => (
            <g key={index}>
              {pathEditState.selectedAnchorIndex === index ? (
                <circle cx={anchor.x} cy={anchor.y} r={10} fill="none" stroke="#F97316" strokeWidth={1.5} strokeDasharray="3 2" />
              ) : null}
              {anchor.handle1X != null && anchor.handle1Y != null ? (
                <>
                  <line x1={anchor.x} y1={anchor.y} x2={anchor.handle1X} y2={anchor.handle1Y} stroke="#94A3B8" strokeWidth={1} />
                  <circle cx={anchor.handle1X} cy={anchor.handle1Y} r={4} fill={pathEditState.selectedAnchorIndex === index ? "#F97316" : "#64748B"} />
                </>
              ) : null}
              {anchor.handle2X != null && anchor.handle2Y != null ? (
                <>
                  <line x1={anchor.x} y1={anchor.y} x2={anchor.handle2X} y2={anchor.handle2Y} stroke="#94A3B8" strokeWidth={1} />
                  <circle cx={anchor.handle2X} cy={anchor.handle2Y} r={4} fill={pathEditState.selectedAnchorIndex === index ? "#F97316" : "#64748B"} />
                </>
              ) : null}
              <circle
                cx={anchor.x}
                cy={anchor.y}
                r={index === 0 && pathEditState.anchors.length >= 2 && !pathEditState.closed ? 6 : 5}
                fill={pathEditState.selectedAnchorIndex === index ? "#F97316" : "#2563EB"}
                stroke="#fff"
                strokeWidth={1.5}
              />
            </g>
          ))}
        </g>
      ) : null}

      {auditMode && auditIssues.length ? (
        <g pointerEvents="none">
          {auditIssues.map((issue) => {
            const stroke = issue.severity === "error" ? "#DC2626" : "#F59E0B";
            const labelWidth = Math.max(60, issue.message.length * 6);
            return (
              <g key={`audit-${issue.id}`}>
                <rect x={issue.frame.x} y={issue.frame.y} width={issue.frame.w} height={issue.frame.h} fill="none" stroke={stroke} strokeWidth={1} strokeDasharray="4 2" />
                <rect x={issue.frame.x} y={issue.frame.y - 14} width={labelWidth} height={14} rx={4} fill={stroke} />
                <text x={issue.frame.x + 4} y={issue.frame.y - 4} fill="#fff" fontSize={10}>
                  {issue.message}
                </text>
              </g>
            );
          })}
        </g>
      ) : null}

      {collabEnabled && collabCursors.length ? (
        <g pointerEvents="none">
          {collabCursors.map((peer) => {
            const label = peer.name || "User";
            const labelWidth = Math.max(40, label.length * 6);
            return (
              <g key={`collab-${peer.id}`}>
                {peer.selectionRect ? (
                  <rect
                    x={peer.selectionRect.x}
                    y={peer.selectionRect.y}
                    width={peer.selectionRect.w}
                    height={peer.selectionRect.h}
                    fill="none"
                    stroke={peer.color}
                    strokeWidth={1}
                    strokeDasharray="4 2"
                  />
                ) : null}
                <circle cx={peer.x} cy={peer.y} r={4} fill={peer.color} />
                <rect x={peer.x + 6} y={peer.y - 16} width={labelWidth} height={14} rx={4} fill={peer.color} />
                <text x={peer.x + 10} y={peer.y - 6} fill="#fff" fontSize={10}>
                  {label}
                </text>
              </g>
            );
          })}
        </g>
      ) : null}

      {comments.length > 0
        ? comments.map((comment) => (
            <g
              key={comment.id}
              data-comment-pin
              style={{ cursor: "pointer" }}
              pointerEvents="all"
              onPointerDown={(event) => {
                event.stopPropagation();
                event.preventDefault();
                onSelectComment(comment.id);
              }}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                onSelectComment(comment.id);
              }}
            >
              <path
                d={`M ${comment.x} ${comment.y - 12} L ${comment.x - 6} ${comment.y + 4} L ${comment.x} ${comment.y} L ${comment.x + 6} ${comment.y + 4} Z`}
                fill={comment.resolved ? "#94A3B8" : "#2563EB"}
                stroke="#fff"
                strokeWidth={1.5}
              />
              {!comment.resolved && comment.replies.length > 0 ? <circle cx={comment.x + 8} cy={comment.y - 10} r={6} fill="#EF4444" stroke="#fff" strokeWidth={1} /> : null}
            </g>
          ))
        : null}

      {layoutGridOverlay}

      {panelMode === "dev" && devMeasure && selectedAbs && parentAbs
        ? (() => {
            const left = Math.round(selectedAbs.x - parentAbs.x);
            const right = Math.round(parentAbs.x + parentAbs.w - (selectedAbs.x + selectedAbs.w));
            const top = Math.round(selectedAbs.y - parentAbs.y);
            const bottom = Math.round(parentAbs.y + parentAbs.h - (selectedAbs.y + selectedAbs.h));
            const midX = selectedAbs.x + selectedAbs.w / 2;
            const midY = selectedAbs.y + selectedAbs.h / 2;
            const labelColor = "#F97316";
            return (
              <g pointerEvents="none">
                <line x1={parentAbs.x} y1={midY} x2={selectedAbs.x} y2={midY} stroke={labelColor} strokeWidth={1} />
                <line x1={selectedAbs.x + selectedAbs.w} y1={midY} x2={parentAbs.x + parentAbs.w} y2={midY} stroke={labelColor} strokeWidth={1} />
                <line x1={midX} y1={parentAbs.y} x2={midX} y2={selectedAbs.y} stroke={labelColor} strokeWidth={1} />
                <line x1={midX} y1={selectedAbs.y + selectedAbs.h} x2={midX} y2={parentAbs.y + parentAbs.h} stroke={labelColor} strokeWidth={1} />
                <text x={(parentAbs.x + selectedAbs.x) / 2} y={midY - 4} fill={labelColor} fontSize={10} textAnchor="middle">
                  {left}px
                </text>
                <text x={(selectedAbs.x + selectedAbs.w + parentAbs.x + parentAbs.w) / 2} y={midY - 4} fill={labelColor} fontSize={10} textAnchor="middle">
                  {right}px
                </text>
                <text x={midX + 4} y={(parentAbs.y + selectedAbs.y) / 2} fill={labelColor} fontSize={10}>
                  {top}px
                </text>
                <text x={midX + 4} y={(selectedAbs.y + selectedAbs.h + parentAbs.y + parentAbs.h) / 2} fill={labelColor} fontSize={10}>
                  {bottom}px
                </text>
                <text x={selectedAbs.x} y={selectedAbs.y - 6} fill={labelColor} fontSize={10}>
                  {Math.round(selectedAbs.w)}x{Math.round(selectedAbs.h)}
                </text>
              </g>
            );
          })()
        : null}

      {panelMode === "dev" && devGuides && selectedAbs && parentAbs && selectedNode
        ? (() => {
            const parent = selectedNode.parentId ? doc.nodes[selectedNode.parentId] : null;
            if (!parent) return null;
            const siblingRects = parent.children
              .filter((id) => id !== selectedNode.id)
              .map((id) => getAbsoluteFrame(doc, id))
              .filter((frame): frame is Rect => Boolean(frame));
            const midX = selectedAbs.x + selectedAbs.w / 2;
            const midY = selectedAbs.y + selectedAbs.h / 2;
            const labelColor = "#0EA5E9";
            const guides: React.ReactElement[] = [];
            computeDistanceGuideLines({ moving: selectedAbs, targetRects: siblingRects, parentRect: parentAbs }).forEach((distance, index) => {
              guides.push(
                <line
                  key={`distance-line-${distance.axis}-${distance.side}-${index}`}
                  x1={distance.x1}
                  y1={distance.y1}
                  x2={distance.x2}
                  y2={distance.y2}
                  stroke={labelColor}
                  strokeWidth={1}
                  strokeDasharray={distance.source === "parent" ? "4 4" : undefined}
                />,
              );
              guides.push(
                <text
                  key={`distance-text-${distance.axis}-${distance.side}-${index}`}
                  x={distance.labelX}
                  y={distance.labelY}
                  fill={labelColor}
                  fontSize={10}
                  textAnchor={distance.axis === "x" ? "middle" : "start"}
                >
                  {formatMeasurementLabel(distance.value)}px
                </text>,
              );
            });
            const parentCenterX = parentAbs.x + parentAbs.w / 2;
            const parentCenterY = parentAbs.y + parentAbs.h / 2;
            if (Math.abs(parentCenterX - midX) <= 1) {
              guides.push(<line key="center-x" x1={parentCenterX} y1={parentAbs.y} x2={parentCenterX} y2={parentAbs.y + parentAbs.h} stroke={labelColor} strokeDasharray="4 4" />);
            }
            if (Math.abs(parentCenterY - midY) <= 1) {
              guides.push(<line key="center-y" x1={parentAbs.x} y1={parentCenterY} x2={parentAbs.x + parentAbs.w} y2={parentCenterY} stroke={labelColor} strokeDasharray="4 4" />);
            }
            return <g pointerEvents="none">{guides}</g>;
          })()
        : null}

      {panelMode === "dev" && devSpecOverlay && selectedAbs && devSpecLines.length
        ? (() => {
            const lineHeight = 12;
            const padding = 6;
            const height = devSpecLines.length * lineHeight + padding * 2;
            const width = Math.max(...devSpecLines.map((line) => line.length), 12) * 6 + padding * 2;
            const x = selectedAbs.x;
            let y = selectedAbs.y - height - 8;
            const minY = parentAbs?.y ?? 0;
            if (y < minY) y = selectedAbs.y + selectedAbs.h + 8;
            return (
              <g pointerEvents="none">
                <rect x={x} y={y} width={width} height={height} fill="white" stroke="#F97316" strokeWidth={1} rx={6} />
                {devSpecLines.map((line, index) => (
                  <text key={line} x={x + padding} y={y + padding + lineHeight * (index + 1) - 2} fill="#F97316" fontSize={10}>
                    {line}
                  </text>
                ))}
              </g>
            );
          })()
        : null}
    </g>
  );
}
