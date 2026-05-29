"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createNoopEditorBridge } from "@/v2/editor/bridge/noop-editor-bridge";
import type {
  EditorRect,
  EditorSnapshot,
  RuntimeGraph,
  SceneNode,
  TransformHandle,
  ValidationReport,
  WasmBridgeInfo,
} from "@/v2/editor/contracts";
import { sampleSceneDoc } from "@/v2/editor/sample-doc";

const bridge = createNoopEditorBridge(sampleSceneDoc);
const CANVAS_PAGE_ID = sampleSceneDoc.pages[0]?.id ?? "page-home";

type DragMarquee = {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
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

export function V2EditorShell() {
  const [bridgeInfo, setBridgeInfo] = useState<WasmBridgeInfo | null>(null);
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [runtimeGraph, setRuntimeGraph] = useState<RuntimeGraph | null>(null);
  const [selectionBounds, setSelectionBounds] = useState<EditorRect | null>(null);
  const [transformHandles, setTransformHandles] = useState<TransformHandle[]>([]);
  const [dragMarquee, setDragMarquee] = useState<DragMarquee | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const syncBridgeState = useCallback(async () => {
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

  async function applyAndSync(commands: Parameters<typeof bridge.dispatch>[0]) {
    const result = await bridge.dispatch(commands);
    setSnapshot(result.snapshot);
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
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runDeleteSelection, runRedo, runUndo, snapshot?.selection.length]);

  function toCanvasPoint(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) {
      return null;
    }

    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  }

  function handleCanvasPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
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
    setDragMarquee(null);
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
            >
              {rootFrame ? (
                <div className="pointer-events-none absolute left-0 top-0 rounded-[28px] border border-dashed border-slate-200/80 p-5 text-xs uppercase tracking-[0.18em] text-slate-300">
                  {rootFrame.name}
                </div>
              ) : null}

              {canvasNodes.map((node) => {
                const selected = snapshot?.selection.includes(node.id) ?? false;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => void selectNode(node.id)}
                    style={{
                      left: node.frame.x,
                      top: node.frame.y,
                      width: node.frame.w,
                      height: node.frame.h,
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
                      <div className="mt-2 text-sm font-semibold text-slate-900">{node.name}</div>
                    </div>
                  </button>
                );
              })}

              {selectionBounds ? (
                <div
                  className="pointer-events-none absolute border border-[#2859ff] shadow-[0_0_0_1px_rgba(40,89,255,0.12)]"
                  style={{
                    left: selectionBounds.x,
                    top: selectionBounds.y,
                    width: selectionBounds.w,
                    height: selectionBounds.h,
                  }}
                />
              ) : null}

              {transformHandles.map((handle) => (
                <div
                  key={`${handle.kind}-${handle.x}-${handle.y}`}
                  className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#2859ff] bg-white ${
                    handle.kind === "rotate" ? "h-3.5 w-3.5" : "h-3 w-3"
                  }`}
                  style={{
                    left: handle.x,
                    top: handle.y,
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
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
