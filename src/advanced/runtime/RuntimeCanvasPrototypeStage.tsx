"use client";

import React, { useEffect, useMemo, useRef } from "react";

import { buildCanvasPrototypeSnapshot, type RuntimeSceneGraph } from "./sceneGraph";

type RuntimeCanvasPrototypeStageProps = {
  scene: RuntimeSceneGraph;
};

type SnapshotEntry = ReturnType<typeof buildCanvasPrototypeSnapshot>[number];

function resolveFill(entry: SnapshotEntry) {
  const fill = entry.fill;
  if (!fill) return "#E5E7EB";
  if (fill.type === "solid") return fill.color;
  if (fill.type === "image") return "#D1D5DB";
  return fill.from;
}

function resolveStroke(entry: SnapshotEntry) {
  return entry.stroke?.color ?? "#9CA3AF";
}

function drawRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius = 0) {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  ctx.beginPath();
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function drawSnapshotEntry(ctx: CanvasRenderingContext2D, entry: SnapshotEntry) {
  const { x, y, w, h } = entry.frame;
  const fill = resolveFill(entry);
  const stroke = resolveStroke(entry);

  ctx.save();
  ctx.globalAlpha = entry.opacity;
  if (entry.rotation) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((entry.rotation * Math.PI) / 180);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }

  switch (entry.type) {
    case "ellipse": {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, Math.max(0, w / 2), Math.max(0, h / 2), 0, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = entry.stroke?.width ?? 1;
      ctx.stroke();
      break;
    }
    case "line":
    case "arrow": {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(1, entry.stroke?.width ?? 1);
      ctx.stroke();
      break;
    }
    case "text": {
      ctx.fillStyle = fill === "transparent" ? "#111111" : fill;
      ctx.font = "12px sans-serif";
      ctx.textBaseline = "top";
      const text = entry.text.trim() || "Text";
      ctx.fillText(text.slice(0, 48), x, y, Math.max(0, w));
      break;
    }
    default: {
      drawRectPath(ctx, x, y, w, h, 4);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(1, entry.stroke?.width ?? 1);
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

export default function RuntimeCanvasPrototypeStage({ scene }: RuntimeCanvasPrototypeStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshot = useMemo(() => buildCanvasPrototypeSnapshot(scene), [scene]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ratio = typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1;
    const width = Math.max(1, Math.ceil(scene.svgWidth));
    const height = Math.max(1, Math.ceil(scene.svgHeight));
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);

    snapshot.forEach((entry) => {
      drawSnapshotEntry(ctx, entry);
    });
  }, [scene.svgHeight, scene.svgWidth, snapshot]);

  return (
    <svg
      width={scene.svgWidth}
      height={scene.svgHeight}
      viewBox={scene.viewBox}
      preserveAspectRatio="xMinYMin meet"
      style={{ display: "block" }}
      data-renderer-mode="canvas-prototype"
    >
      <foreignObject x={0} y={0} width={scene.svgWidth} height={scene.svgHeight}>
        <div
          {...({ xmlns: "http://www.w3.org/1999/xhtml" } as React.HTMLAttributes<HTMLDivElement>)}
          style={{ width: scene.svgWidth, height: scene.svgHeight }}
        >
          <canvas
            ref={canvasRef}
            width={Math.max(1, Math.ceil(scene.svgWidth))}
            height={Math.max(1, Math.ceil(scene.svgHeight))}
            style={{ display: "block", width: scene.svgWidth, height: scene.svgHeight }}
            data-renderer-mode="canvas-prototype"
          />
        </div>
      </foreignObject>
    </svg>
  );
}
