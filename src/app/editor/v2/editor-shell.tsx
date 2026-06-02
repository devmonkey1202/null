"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EditorCommand,
  EditorBridge,
  EditorRect,
  EditorSnapshot,
  RuntimeGraph,
  SceneNode,
  TransformHandle,
  ValidationReport,
  WasmBridgeInfo,
} from "@/v2/editor/contracts";
import { loadEditorBridge } from "@/v2/editor/bridge/load-editor-bridge";
import { sampleSceneDoc } from "@/v2/editor/sample-doc";
const CANVAS_PAGE_ID = sampleSceneDoc.pages[0]?.id ?? "page-home";

type DragMarquee = {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
};

type DragPan = {
  originClientX: number;
  originClientY: number;
  startViewportX: number;
  startViewportY: number;
};

type DragMove = {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
};

type DragTransform = {
  handle: TransformHandle["kind"];
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  lockAspect: boolean;
};

type SnapGuide = {
  axis: "x" | "y";
  position: number;
  spanStart: number;
  spanEnd: number;
};

function flattenNodes(snapshot: EditorSnapshot | null) {
  return snapshot?.doc.pages.flatMap((page) => page.nodes) ?? [];
}

function selectedNode(nodes: SceneNode[], selection: string[]) {
  if (selection.length === 0) {
    return null;
  }

  return nodes.find((node) => node.id === selection[0]) ?? null;
}

function normalizeRect({ originX, originY, currentX, currentY }: DragMarquee): EditorRect {
  const x = Math.min(originX, currentX);
  const y = Math.min(originY, currentY);
  const w = Math.abs(currentX - originX);
  const h = Math.abs(currentY - originY);

  return { x, y, w, h, rotation: 0 };
}

function selectionSummary(selection: string[]) {
  if (selection.length === 0) {
    return "No selection";
  }

  if (selection.length === 1) {
    return "1 layer selected";
  }

  return `${selection.length} layers selected`;
}

function offsetRect(rect: EditorRect, deltaX: number, deltaY: number): EditorRect {
  return {
    ...rect,
    x: rect.x + deltaX,
    y: rect.y + deltaY,
  };
}

function resizePreviewBounds(
  bounds: EditorRect,
  handle: TransformHandle["kind"],
  deltaX: number,
  deltaY: number,
  lockAspect: boolean,
): EditorRect {
  const minSize = 1;
  let left = bounds.x;
  let top = bounds.y;
  let right = bounds.x + bounds.w;
  let bottom = bounds.y + bounds.h;

  switch (handle) {
    case "n":
      top += deltaY;
      break;
    case "ne":
      top += deltaY;
      right += deltaX;
      break;
    case "e":
      right += deltaX;
      break;
    case "se":
      right += deltaX;
      bottom += deltaY;
      break;
    case "s":
      bottom += deltaY;
      break;
    case "sw":
      left += deltaX;
      bottom += deltaY;
      break;
    case "w":
      left += deltaX;
      break;
    case "nw":
      left += deltaX;
      top += deltaY;
      break;
    case "rotate":
      break;
  }

  if (lockAspect) {
    const aspect = bounds.h !== 0 ? bounds.w / bounds.h : 1;
    const currentW = Math.max(right - left, minSize);
    const currentH = Math.max(bottom - top, minSize);

    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      const adjustedH = currentW / Math.max(aspect, 0.0001);
      if (handle === "nw" || handle === "ne") {
        top = bottom - adjustedH;
      } else if (handle === "sw" || handle === "se") {
        bottom = top + adjustedH;
      }
    } else {
      const adjustedW = currentH * aspect;
      if (handle === "nw" || handle === "sw") {
        left = right - adjustedW;
      } else if (handle === "ne" || handle === "se") {
        right = left + adjustedW;
      }
    }
  }

  if (right - left < minSize) {
    if (handle === "w" || handle === "nw" || handle === "sw") {
      left = right - minSize;
    } else {
      right = left + minSize;
    }
  }

  if (bottom - top < minSize) {
    if (handle === "n" || handle === "nw" || handle === "ne") {
      top = bottom - minSize;
    } else {
      bottom = top + minSize;
    }
  }

  return {
    ...bounds,
    x: left,
    y: top,
    w: Math.max(right - left, minSize),
    h: Math.max(bottom - top, minSize),
  };
}

function buildTransformHandles(bounds: EditorRect | null): TransformHandle[] {
  if (!bounds) {
    return [];
  }

  const left = bounds.x;
  const centerX = bounds.x + bounds.w / 2;
  const right = bounds.x + bounds.w;
  const top = bounds.y;
  const centerY = bounds.y + bounds.h / 2;
  const bottom = bounds.y + bounds.h;
  const rotateOffset = 28;

  return [
    { kind: "nw", x: left, y: top, cursor: "nwse-resize" },
    { kind: "n", x: centerX, y: top, cursor: "ns-resize" },
    { kind: "ne", x: right, y: top, cursor: "nesw-resize" },
    { kind: "e", x: right, y: centerY, cursor: "ew-resize" },
    { kind: "se", x: right, y: bottom, cursor: "nwse-resize" },
    { kind: "s", x: centerX, y: bottom, cursor: "ns-resize" },
    { kind: "sw", x: left, y: bottom, cursor: "nesw-resize" },
    { kind: "w", x: left, y: centerY, cursor: "ew-resize" },
    { kind: "rotate", x: centerX, y: top - rotateOffset, cursor: "grab" },
  ];
}

function angleDeltaFromBounds(
  bounds: EditorRect,
  originX: number,
  originY: number,
  currentX: number,
  currentY: number,
) {
  const centerX = bounds.x + bounds.w / 2;
  const centerY = bounds.y + bounds.h / 2;
  const originAngle = Math.atan2(originY - centerY, originX - centerX);
  const currentAngle = Math.atan2(currentY - centerY, currentX - centerX);
  return ((currentAngle - originAngle) * 180) / Math.PI;
}

function rectAnchors(rect: EditorRect) {
  return {
    left: rect.x,
    centerX: rect.x + rect.w / 2,
    right: rect.x + rect.w,
    top: rect.y,
    centerY: rect.y + rect.h / 2,
    bottom: rect.y + rect.h,
  };
}

function computeMoveSnap(
  selectionBounds: EditorRect | null,
  delta: { x: number; y: number } | null,
  targetRects: EditorRect[],
  threshold = 8,
) {
  if (!selectionBounds || !delta) {
    return {
      deltaX: delta?.x ?? 0,
      deltaY: delta?.y ?? 0,
      guides: [] as SnapGuide[],
    };
  }

  const movedBounds = offsetRect(selectionBounds, delta.x, delta.y);
  const moved = rectAnchors(movedBounds);

  let bestX: { adjust: number; position: number; spanStart: number; spanEnd: number } | null = null;
  let bestY: { adjust: number; position: number; spanStart: number; spanEnd: number } | null = null;

  for (const target of targetRects) {
    const anchors = rectAnchors(target);
    const xValues = [anchors.left, anchors.centerX, anchors.right];
    const yValues = [anchors.top, anchors.centerY, anchors.bottom];
    const movedXValues = [moved.left, moved.centerX, moved.right];
    const movedYValues = [moved.top, moved.centerY, moved.bottom];

    for (const currentX of movedXValues) {
      for (const targetX of xValues) {
        const adjust = targetX - currentX;
        if (Math.abs(adjust) <= threshold && (!bestX || Math.abs(adjust) < Math.abs(bestX.adjust))) {
          bestX = {
            adjust,
            position: targetX,
            spanStart: Math.min(moved.top, anchors.top),
            spanEnd: Math.max(moved.bottom, anchors.bottom),
          };
        }
      }
    }

    for (const currentY of movedYValues) {
      for (const targetY of yValues) {
        const adjust = targetY - currentY;
        if (Math.abs(adjust) <= threshold && (!bestY || Math.abs(adjust) < Math.abs(bestY.adjust))) {
          bestY = {
            adjust,
            position: targetY,
            spanStart: Math.min(moved.left, anchors.left),
            spanEnd: Math.max(moved.right, anchors.right),
          };
        }
      }
    }
  }

  const guides: SnapGuide[] = [];
  if (bestX) {
    guides.push({
      axis: "x",
      position: bestX.position,
      spanStart: bestX.spanStart,
      spanEnd: bestX.spanEnd,
    });
  }
  if (bestY) {
    guides.push({
      axis: "y",
      position: bestY.position,
      spanStart: bestY.spanStart,
      spanEnd: bestY.spanEnd,
    });
  }

  return {
    deltaX: delta.x + (bestX?.adjust ?? 0),
    deltaY: delta.y + (bestY?.adjust ?? 0),
    guides,
  };
}

export function V2EditorShell() {
  const [bridgeInfo, setBridgeInfo] = useState<WasmBridgeInfo | null>(null);
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [runtimeGraph, setRuntimeGraph] = useState<RuntimeGraph | null>(null);
  const [selectionBounds, setSelectionBounds] = useState<EditorRect | null>(null);
  const [transformHandles, setTransformHandles] = useState<TransformHandle[]>([]);
  const [dragMarquee, setDragMarquee] = useState<DragMarquee | null>(null);
  const [dragPan, setDragPan] = useState<DragPan | null>(null);
  const [dragMove, setDragMove] = useState<DragMove | null>(null);
  const [dragTransform, setDragTransform] = useState<DragTransform | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [draftViewport, setDraftViewport] = useState<EditorSnapshot["viewport"] | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<EditorBridge | null>(null);

  const syncBridgeState = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge) {
      return;
    }

    const [nextValidation, nextRuntime, nextSelectionBounds, nextTransformHandles] =
      await Promise.all([
        bridge.runValidation(),
        bridge.exportRuntimeGraph(),
        bridge.query({ kind: "selection_bounds" }) as Promise<EditorRect | null>,
        bridge.query({ kind: "transform_handles" }) as Promise<TransformHandle[]>,
      ]);

    setValidation(nextValidation);
    setRuntimeGraph(nextRuntime);
    setSelectionBounds(nextSelectionBounds);
    setTransformHandles(nextTransformHandles);
  }, []);

  useEffect(() => {
    async function load() {
      const bridge = await loadEditorBridge();
      bridgeRef.current = bridge;
      const [info, initialSnapshot] = await Promise.all([
        bridge.info(),
        bridge.loadDocument(sampleSceneDoc),
      ]);

      setBridgeInfo(info);
      setSnapshot(initialSnapshot);
      await syncBridgeState();
    }

    void load();
  }, [syncBridgeState]);

  const nodes = useMemo(() => flattenNodes(snapshot), [snapshot]);
  const activeNode = useMemo(
    () => selectedNode(nodes, snapshot?.selection ?? []),
    [nodes, snapshot?.selection],
  );
  const rootFrame = useMemo(
    () => nodes.find((node) => node.parentId === null) ?? null,
    [nodes],
  );
  const canvasNodes = useMemo(
    () => nodes.filter((node) => node.parentId !== null),
    [nodes],
  );
  const liveMarqueeRect = useMemo(
    () => (dragMarquee ? normalizeRect(dragMarquee) : null),
    [dragMarquee],
  );
  const viewViewport = draftViewport ?? snapshot?.viewport ?? { zoom: 1, x: 0, y: 0 };
  const dragMoveDelta = useMemo(
    () =>
      dragMove
        ? {
            x: dragMove.currentX - dragMove.originX,
            y: dragMove.currentY - dragMove.originY,
          }
        : null,
    [dragMove],
  );
  const moveSnapPreview = useMemo(() => {
    if (!dragMoveDelta || !selectionBounds) {
      return {
        deltaX: dragMoveDelta?.x ?? 0,
        deltaY: dragMoveDelta?.y ?? 0,
        guides: [] as SnapGuide[],
      };
    }

    const selectedIds = new Set(snapshot?.selection ?? []);
    const targetRects = [
      ...(rootFrame ? [rootFrame.frame] : []),
      ...canvasNodes
        .filter((node) => !selectedIds.has(node.id))
        .map((node) => node.frame),
    ];

    return computeMoveSnap(selectionBounds, dragMoveDelta, targetRects);
  }, [canvasNodes, dragMoveDelta, rootFrame, selectionBounds, snapshot?.selection]);
  const previewSelectionBounds = useMemo(() => {
    if (!selectionBounds) {
      return null;
    }

    if (dragMoveDelta) {
      return offsetRect(selectionBounds, moveSnapPreview.deltaX, moveSnapPreview.deltaY);
    }

    if (dragTransform) {
      if (dragTransform.handle === "rotate") {
        return selectionBounds;
      }

      return resizePreviewBounds(
        selectionBounds,
        dragTransform.handle,
        dragTransform.currentX - dragTransform.originX,
        dragTransform.currentY - dragTransform.originY,
        dragTransform.lockAspect,
      );
    }

    return selectionBounds;
  }, [dragMoveDelta, dragTransform, moveSnapPreview.deltaX, moveSnapPreview.deltaY, selectionBounds]);
  const previewTransformHandles = useMemo(
    () => (dragMove || dragTransform ? buildTransformHandles(previewSelectionBounds) : transformHandles),
    [dragMove, dragTransform, previewSelectionBounds, transformHandles],
  );

  async function applyAndSync(commands: EditorCommand[]) {
    const bridge = bridgeRef.current;
    if (!bridge) {
      return;
    }

    const result = await bridge.dispatch(commands);
    setSnapshot(result.snapshot);
    setDraftViewport(null);
    await syncBridgeState();
  }

  async function selectNode(nodeId: string) {
    await applyAndSync([{ kind: "select_nodes", nodeIds: [nodeId] }]);
  }

  async function rerunValidation() {
    await syncBridgeState();
  }

  const runDeleteSelection = useCallback(async () => {
    if (!snapshot?.selection.length) {
      return;
    }

    const commands = snapshot.selection.map((nodeId) => ({
      kind: "delete_node" as const,
      nodeId,
    }));

    await applyAndSync(commands);
  }, [snapshot?.selection, syncBridgeState]);

  const runUndo = useCallback(async () => {
    await applyAndSync([{ kind: "undo" }]);
  }, [syncBridgeState]);

  const runRedo = useCallback(async () => {
    await applyAndSync([{ kind: "redo" }]);
  }, [syncBridgeState]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const isMeta = event.metaKey || event.ctrlKey;

      if (event.key === "Delete" || event.key === "Backspace") {
        if (snapshot?.selection.length) {
          event.preventDefault();
          void runDeleteSelection();
        }
        return;
      }

      if (!isMeta) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        void runUndo();
        return;
      }

      if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        void runRedo();
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        setSpacePressed(true);
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") {
        setSpacePressed(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [runDeleteSelection, runRedo, runUndo, snapshot?.selection.length]);

  function toCanvasPoint(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) {
      return null;
    }

    const activeViewport = draftViewport ?? snapshot?.viewport ?? { zoom: 1, x: 0, y: 0 };

    return {
      x: (event.clientX - bounds.left - activeViewport.x) / activeViewport.zoom,
      y: (event.clientY - bounds.top - activeViewport.y) / activeViewport.zoom,
    };
  }

  async function handleNodePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    nodeId: string,
  ) {
    event.stopPropagation();

    if (event.button !== 0 || spacePressed) {
      return;
    }

    const point = toCanvasPoint(event as unknown as React.PointerEvent<HTMLDivElement>);
    if (!point) {
      return;
    }

    const alreadySelected = snapshot?.selection.includes(nodeId) ?? false;
    if (!alreadySelected) {
      await applyAndSync([{ kind: "select_nodes", nodeIds: [nodeId] }]);
    }

    setDragMove({
      originX: point.x,
      originY: point.y,
      currentX: point.x,
      currentY: point.y,
    });
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function handleTransformHandlePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    handle: TransformHandle,
  ) {
    event.stopPropagation();

    if (event.button !== 0 || !selectionBounds || spacePressed) {
      return;
    }

    const point = toCanvasPoint(event as unknown as React.PointerEvent<HTMLDivElement>);
    if (!point) {
      return;
    }

    setDragTransform({
      handle: handle.kind,
      originX: point.x,
      originY: point.y,
      currentX: point.x,
      currentY: point.y,
      lockAspect: event.shiftKey,
    });
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function handleCanvasPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) {
      return;
    }

    const activeViewport = draftViewport ?? snapshot?.viewport ?? { zoom: 1, x: 0, y: 0 };

    if (event.button === 1 || spacePressed) {
      setDragPan({
        originClientX: event.clientX,
        originClientY: event.clientY,
        startViewportX: activeViewport.x,
        startViewportY: activeViewport.y,
      });
      canvasRef.current?.setPointerCapture(event.pointerId);
      return;
    }

    const point = toCanvasPoint(event);
    if (!point) {
      return;
    }

    setDragMarquee({
      originX: point.x,
      originY: point.y,
      currentX: point.x,
      currentY: point.y,
      additive: event.shiftKey,
    });
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function handleCanvasPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (dragPan) {
      const nextViewport = {
        zoom: viewViewport.zoom,
        x: dragPan.startViewportX + (event.clientX - dragPan.originClientX),
        y: dragPan.startViewportY + (event.clientY - dragPan.originClientY),
      };
      setDraftViewport(nextViewport);
      return;
    }

    if (dragMove) {
      const point = toCanvasPoint(event);
      if (!point) {
        return;
      }

      setDragMove((current) =>
        current
          ? {
              ...current,
              currentX: point.x,
              currentY: point.y,
            }
          : current,
      );
      return;
    }

    if (dragTransform) {
      const point = toCanvasPoint(event);
      if (!point) {
        return;
      }

      setDragTransform((current) =>
        current
          ? {
              ...current,
              currentX: point.x,
              currentY: point.y,
            }
          : current,
      );
      return;
    }

    if (!dragMarquee) {
      return;
    }

    const point = toCanvasPoint(event);
    if (!point) {
      return;
    }

    setDragMarquee((current) =>
      current
        ? {
            ...current,
            currentX: point.x,
            currentY: point.y,
          }
        : current,
    );
  }

  async function commitViewport(viewport: EditorSnapshot["viewport"]) {
    await applyAndSync([{ kind: "set_viewport", viewport }]);
  }

  async function zoomCanvas(multiplier: number) {
    const current = draftViewport ?? snapshot?.viewport ?? { zoom: 1, x: 0, y: 0 };
    const nextZoom = Math.min(4, Math.max(0.2, Number((current.zoom * multiplier).toFixed(3))));
    await commitViewport({ ...current, zoom: nextZoom });
  }

  async function finishMarqueeSelection() {
    if (!dragMarquee) {
      return;
    }

    const rect = normalizeRect(dragMarquee);
    setDragMarquee(null);

    const isClick =
      rect.w < 4 &&
      rect.h < 4;

    if (isClick) {
      await applyAndSync([{ kind: "select_nodes", nodeIds: [] }]);
      return;
    }

    await applyAndSync([
      {
        kind: "select_in_rect",
        pageId: CANVAS_PAGE_ID,
        rect,
        mode: dragMarquee.additive ? "add" : "replace",
      },
    ]);
  }

  function handleCanvasPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragPan) {
      if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
        canvasRef.current.releasePointerCapture(event.pointerId);
      }

      const viewportToCommit = draftViewport ?? snapshot?.viewport ?? { zoom: 1, x: 0, y: 0 };
      setDragPan(null);
      void commitViewport(viewportToCommit);
      return;
    }

    if (dragMove) {
      if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
        canvasRef.current.releasePointerCapture(event.pointerId);
      }

      const deltaX = dragMove.currentX - dragMove.originX;
      const deltaY = dragMove.currentY - dragMove.originY;
      setDragMove(null);

      if (Math.abs(deltaX) >= 0.5 || Math.abs(deltaY) >= 0.5) {
        void applyAndSync([
          {
            kind: "move_selection",
            deltaX: moveSnapPreview.deltaX,
            deltaY: moveSnapPreview.deltaY,
          },
        ]);
      }
      return;
    }

    if (dragTransform) {
      if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
        canvasRef.current.releasePointerCapture(event.pointerId);
      }

      const currentDrag = dragTransform;
      setDragTransform(null);

      if (currentDrag.handle === "rotate") {
        if (!selectionBounds) {
          return;
        }

        const deltaDeg = angleDeltaFromBounds(
          selectionBounds,
          currentDrag.originX,
          currentDrag.originY,
          currentDrag.currentX,
          currentDrag.currentY,
        );

        if (Math.abs(deltaDeg) >= 0.5) {
          void applyAndSync([{ kind: "rotate_selection", deltaDeg }]);
        }
        return;
      }

      const deltaX = currentDrag.currentX - currentDrag.originX;
      const deltaY = currentDrag.currentY - currentDrag.originY;
      if (Math.abs(deltaX) >= 0.5 || Math.abs(deltaY) >= 0.5) {
        void applyAndSync([
          {
            kind: "resize_selection",
            handle: currentDrag.handle,
            deltaX,
            deltaY,
            lockAspect: currentDrag.lockAspect,
          },
        ]);
      }
      return;
    }

    if (!dragMarquee) {
      return;
    }

    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }

    void finishMarqueeSelection();
  }

  function handleCanvasPointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
    setDragPan(null);
    setDragMove(null);
    setDragTransform(null);
    setDragMarquee(null);
  }

  async function handleCanvasWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!(event.metaKey || event.ctrlKey)) {
      return;
    }

    event.preventDefault();
    const current = draftViewport ?? snapshot?.viewport ?? { zoom: 1, x: 0, y: 0 };
    const multiplier = event.deltaY < 0 ? 1.08 : 0.92;
    const nextZoom = Math.min(4, Math.max(0.2, Number((current.zoom * multiplier).toFixed(3))));
    await commitViewport({ ...current, zoom: nextZoom });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-slate-950 px-3 py-1 text-sm font-semibold text-white">
            NULL v2
          </div>
          <div>
            <div className="text-sm font-semibold">
              {snapshot?.doc.title ?? "Loading editor shell"}
            </div>
            <div className="text-xs text-slate-500">
              {bridgeInfo ? `${bridgeInfo.kernel} bridge` : "Booting bridge"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void zoomCanvas(0.9)}
            className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
          >
            -
          </button>
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
            {Math.round(viewViewport.zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => void zoomCanvas(1.1)}
            className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
          >
            +
          </button>
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
            schema v{bridgeInfo?.schemaVersion ?? 0}
          </span>
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
            version {snapshot?.version ?? 0}
          </span>
          <button
            type="button"
            onClick={rerunValidation}
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white"
          >
            Validate
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Layers
            </div>
          </div>
          <div className="space-y-1 p-3">
            {nodes.map((node) => {
              const selected = snapshot?.selection.includes(node.id) ?? false;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => void selectNode(node.id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                    selected
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-white"
                  }`}
                >
                  <span className="truncate text-sm font-medium">{node.name}</span>
                  <span className="ml-3 text-[11px] uppercase tracking-[0.14em] opacity-70">
                    {node.kind}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="flex min-h-0 flex-col">
          <div className="border-b border-slate-200 bg-[#f8fafc] px-5 py-3 text-sm text-slate-600">
            Editor-first shell. Selection, marquee, handles, history, and diagnostics are driven
            through the v2 bridge contract.
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-[#edf1f7] p-8">
            <div
              ref={canvasRef}
              className="relative mx-auto h-[960px] w-full max-w-[1280px] rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerCancel}
              onWheel={handleCanvasWheel}
            >
              <div
                className="absolute inset-0 origin-top-left"
                style={{
                  transform: `translate(${viewViewport.x}px, ${viewViewport.y}px) scale(${viewViewport.zoom})`,
                }}
              >
                {rootFrame ? (
                  <div className="pointer-events-none absolute left-0 top-0 rounded-[28px] border border-dashed border-slate-200/80 p-5 text-xs uppercase tracking-[0.18em] text-slate-300">
                    {rootFrame.name}
                  </div>
                ) : null}

                {canvasNodes.map((node) => {
                  const selected = snapshot?.selection.includes(node.id) ?? false;
                  const previewX = selected && dragMoveDelta ? node.frame.x + dragMoveDelta.x : node.frame.x;
                  const previewY = selected && dragMoveDelta ? node.frame.y + dragMoveDelta.y : node.frame.y;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onPointerDown={(event) => void handleNodePointerDown(event, node.id)}
                      onClick={() => void selectNode(node.id)}
                      style={{
                        left: previewX,
                        top: previewY,
                        width: node.frame.w,
                        height: node.frame.h,
                        transform: `rotate(${node.frame.rotation}deg)`,
                        transformOrigin: "center",
                      }}
                      className={`absolute rounded-2xl border text-left transition ${
                        node.kind === "text" ? "bg-transparent" : "bg-slate-50"
                      } ${
                        selected
                          ? "border-slate-950 ring-2 ring-slate-950/15"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                          {node.kind}
                        </div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">
                          {node.name}
                        </div>
                      </div>
                    </button>
                  );
                })}

                {previewSelectionBounds ? (
                  <div
                    className="pointer-events-none absolute border border-[#2859ff] shadow-[0_0_0_1px_rgba(40,89,255,0.12)]"
                    style={{
                      left: previewSelectionBounds.x,
                      top: previewSelectionBounds.y,
                      width: previewSelectionBounds.w,
                      height: previewSelectionBounds.h,
                    }}
                  />
                ) : null}

                {previewTransformHandles.map((handle) => (
                  <button
                    key={`${handle.kind}-${handle.x}-${handle.y}`}
                    type="button"
                    onPointerDown={(event) => handleTransformHandlePointerDown(event, handle)}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#2859ff] bg-white ${
                      handle.kind === "rotate" ? "h-3.5 w-3.5" : "h-3 w-3"
                    }`}
                    style={{
                      left: handle.x,
                      top: handle.y,
                      cursor: handle.cursor,
                    }}
                    title={handle.kind}
                  />
                ))}

                {liveMarqueeRect ? (
                  <div
                    className="pointer-events-none absolute border border-dashed border-[#2859ff] bg-[#2859ff]/10"
                    style={{
                      left: liveMarqueeRect.x,
                      top: liveMarqueeRect.y,
                      width: liveMarqueeRect.w,
                      height: liveMarqueeRect.h,
                    }}
                  />
                ) : null}

                {dragMove
                  ? moveSnapPreview.guides.map((guide) =>
                      guide.axis === "x" ? (
                        <div
                          key={`guide-x-${guide.position}-${guide.spanStart}-${guide.spanEnd}`}
                          className="pointer-events-none absolute w-px bg-[#2859ff]/80"
                          style={{
                            left: guide.position,
                            top: guide.spanStart,
                            height: Math.max(1, guide.spanEnd - guide.spanStart),
                          }}
                        />
                      ) : (
                        <div
                          key={`guide-y-${guide.position}-${guide.spanStart}-${guide.spanEnd}`}
                          className="pointer-events-none absolute h-px bg-[#2859ff]/80"
                          style={{
                            left: guide.spanStart,
                            top: guide.position,
                            width: Math.max(1, guide.spanEnd - guide.spanStart),
                          }}
                        />
                      ),
                    )
                  : null}
              </div>
              <div
                className={`pointer-events-none absolute bottom-4 left-4 rounded-full border px-3 py-1 text-xs font-medium ${
                  dragPan || spacePressed
                    ? "border-[#2859ff]/20 bg-[#2859ff]/10 text-[#2859ff]"
                    : "border-slate-200 bg-white/90 text-slate-500"
                }`}
              >
                {dragPan || spacePressed ? "Pan mode" : "Hold Space or use middle mouse to pan"}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[1.4fr_1fr] border-t border-slate-200 bg-white">
            <div className="border-r border-slate-200 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Diagnostics
              </div>
              <div className="mt-3 space-y-2">
                {validation?.issues.length ? (
                  validation.issues.map((issue) => (
                    <div
                      key={issue.id}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                    >
                      <div className="font-semibold">{issue.code}</div>
                      <div className="text-xs">{issue.message}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                    No validation issues in the scaffold document.
                  </div>
                )}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Runtime handoff
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  {runtimeGraph?.routes.length ?? 0} route
                  {(runtimeGraph?.routes.length ?? 0) === 1 ? "" : "s"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Minimal preview/publish contract only.
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  {selectionSummary(snapshot?.selection ?? [])}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Click to select, drag on canvas to marquee, Cmd/Ctrl+Z to undo, Delete to
                  remove.
                </div>
              </div>
            </div>
          </div>
        </main>

        <aside className="border-l border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Inspector
            </div>
          </div>
          <div className="space-y-5 p-4">
            <section>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Selection
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                {activeNode ? (
                  <>
                    <div className="text-sm font-semibold text-slate-900">{activeNode.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                      {activeNode.kind}
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-slate-400">X</dt>
                        <dd className="font-medium text-slate-900">{activeNode.frame.x}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Y</dt>
                        <dd className="font-medium text-slate-900">{activeNode.frame.y}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">W</dt>
                        <dd className="font-medium text-slate-900">{activeNode.frame.w}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">H</dt>
                        <dd className="font-medium text-slate-900">{activeNode.frame.h}</dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <div className="text-sm text-slate-500">Select a layer or canvas object.</div>
                )}
              </div>
            </section>

            <section>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Bridge state
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <div>mode: {bridgeInfo?.mode ?? "loading"}</div>
                <div className="mt-1">kernel: {bridgeInfo?.kernel ?? "loading"}</div>
                <div className="mt-1">
                  viewport: {Math.round(viewViewport.zoom * 100)}% / {Math.round(viewViewport.x)}/
                  {Math.round(viewViewport.y)}
                </div>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
