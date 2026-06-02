import type { EditorBridge } from "@/v2/editor/contracts";
import { createNoopEditorBridge } from "@/v2/editor/bridge/noop-editor-bridge";
import { BrowserWasmEditorBridge } from "@/v2/editor/bridge/wasm-editor-bridge";
import { sampleSceneDoc } from "@/v2/editor/sample-doc";

export async function loadEditorBridge(): Promise<EditorBridge> {
  try {
    return await BrowserWasmEditorBridge.create();
  } catch (error) {
    console.warn("[v2-editor] failed to load wasm bridge, falling back to noop bridge", error);
    return createNoopEditorBridge(sampleSceneDoc);
  }
}
