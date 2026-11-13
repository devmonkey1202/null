"use client";

import { useEffect, useRef, useState } from "react";

import type { RenderFrame } from "@/v2/editor/contracts";
import {
  WebGlRenderBackend,
  type WebGlRenderStatus,
} from "@/v2/editor/webgl-renderer";

type WebGlRenderSurfaceProps = {
  frame: RenderFrame | null;
  width: number;
  height: number;
  className?: string;
  onStatus?: (status: WebGlRenderStatus) => void;
};

const INITIAL_STATUS: WebGlRenderStatus = {
  backend: "unavailable",
  available: false,
  contextLost: false,
  revision: "",
  drawCalls: 0,
  instanceCount: 0,
  supportedCommandCount: 0,
  unsupportedCommandCount: 0,
  skippedCommandCount: 0,
  invalidPaintCount: 0,
  invalidGeometryCount: 0,
  meshVertexCount: 0,
  meshIndexCount: 0,
  triangleCount: 0,
  pixelWidth: 0,
  pixelHeight: 0,
  glError: 0,
};

export function WebGlRenderSurface({
  frame,
  width,
  height,
  className,
  onStatus,
}: WebGlRenderSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebGlRenderBackend | null>(null);
  const onStatusRef = useRef(onStatus);
  const [status, setStatus] = useState<WebGlRenderStatus>(INITIAL_STATUS);

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    let active = true;
    try {
      rendererRef.current = new WebGlRenderBackend(canvas, (nextStatus) => {
        if (active) {
          setStatus(nextStatus);
          onStatusRef.current?.(nextStatus);
        }
      });
    } catch (error) {
      const nextStatus: WebGlRenderStatus = {
        ...INITIAL_STATUS,
        error: error instanceof Error ? error.message : "WebGL2 initialization failed.",
      };
      queueMicrotask(() => {
        if (active) {
          setStatus(nextStatus);
          onStatusRef.current?.(nextStatus);
        }
      });
    }
    return () => {
      active = false;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !frame || width <= 0 || height <= 0) {
      return;
    }
    renderer.render({
      renderList: frame.list,
      cssWidth: width,
      cssHeight: height,
      pixelRatio: window.devicePixelRatio || 1,
    });
  }, [frame, height, width]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      data-testid="v2-webgl-render-surface"
      data-backend={status.backend}
      data-available={status.available ? "true" : "false"}
      data-context-lost={status.contextLost ? "true" : "false"}
      data-render-revision={status.revision}
      data-draw-call-count={status.drawCalls}
      data-instance-count={status.instanceCount}
      data-supported-command-count={status.supportedCommandCount}
      data-unsupported-command-count={status.unsupportedCommandCount}
      data-skipped-command-count={status.skippedCommandCount}
      data-invalid-paint-count={status.invalidPaintCount}
      data-invalid-geometry-count={status.invalidGeometryCount}
      data-mesh-vertex-count={status.meshVertexCount}
      data-mesh-index-count={status.meshIndexCount}
      data-triangle-count={status.triangleCount}
      data-gl-error={status.glError}
      data-pixel-width={status.pixelWidth}
      data-pixel-height={status.pixelHeight}
      data-error={status.error ?? ""}
    />
  );
}
