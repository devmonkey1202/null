"use client";

import { useEffect, useMemo, useState } from "react";
import { createNoopEditorBridge } from "@/v2/editor/bridge/noop-editor-bridge";
import type {
  EditorSnapshot,
  RuntimeGraph,
  SceneNode,
  ValidationReport,
  WasmBridgeInfo,
} from "@/v2/editor/contracts";
import { sampleSceneDoc } from "@/v2/editor/sample-doc";

const bridge = createNoopEditorBridge(sampleSceneDoc);

function flattenNodes(snapshot: EditorSnapshot | null) {
  return snapshot?.doc.pages.flatMap((page) => page.nodes) ?? [];
}

function selectedNode(nodes: SceneNode[], selection: string[]) {
  if (selection.length === 0) {
    return null;
  }

  return nodes.find((node) => node.id === selection[0]) ?? null;
}

export function V2EditorShell() {
  const [bridgeInfo, setBridgeInfo] = useState<WasmBridgeInfo | null>(null);
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [runtimeGraph, setRuntimeGraph] = useState<RuntimeGraph | null>(null);

  useEffect(() => {
    async function load() {
      const [info, initialSnapshot, initialValidation, initialRuntime] = await Promise.all([
        bridge.info(),
        bridge.loadDocument(sampleSceneDoc),
        bridge.runValidation(),
        bridge.exportRuntimeGraph(),
      ]);

      setBridgeInfo(info);
      setSnapshot(initialSnapshot);
      setValidation(initialValidation);
      setRuntimeGraph(initialRuntime);
    }

    void load();
  }, []);

  const nodes = useMemo(() => flattenNodes(snapshot), [snapshot]);
  const activeNode = useMemo(
    () => selectedNode(nodes, snapshot?.selection ?? []),
    [nodes, snapshot?.selection],
  );

  async function selectNode(nodeId: string) {
    const result = await bridge.dispatch([{ kind: "select_nodes", nodeIds: [nodeId] }]);
    setSnapshot(result.snapshot);
    setValidation(result.validation);
  }

  async function rerunValidation() {
    setValidation(await bridge.runValidation());
    setRuntimeGraph(await bridge.exportRuntimeGraph());
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
            Editor-first scaffold. React/Next shell + v2 bridge boundary + sample SceneDoc.
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-[#edf1f7] p-8">
            <div className="relative mx-auto h-[960px] w-full max-w-[1280px] rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              {nodes
                .filter((node) => node.parentId !== null)
                .map((node) => {
                  const selected = snapshot?.selection.includes(node.id) ?? false;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => void selectNode(node.id)}
                      style={{
                        left: node.frame.x,
                        top: node.frame.y,
                        width: node.frame.w,
                        height: node.frame.h,
                      }}
                      className={`absolute rounded-2xl border text-left transition ${
                        node.kind === "text"
                          ? "bg-transparent"
                          : "bg-slate-50"
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

