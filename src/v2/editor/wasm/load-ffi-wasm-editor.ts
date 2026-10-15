// This wrapper exists because wasm-bindgen generates the JS and .d.ts files
// into pkg/ at build time, while TypeScript resolves them inconsistently when
// importing the generated module directly from application code.
// @ts-ignore generated at build time by wasm-bindgen
import init, { WasmEditorBridgeHandle } from "./pkg/ffi_wasm_editor.js";

export { WasmEditorBridgeHandle };
export default init;
