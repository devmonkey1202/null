/* tslint:disable */
/* eslint-disable */

export class WasmEditorBridgeHandle {
    free(): void;
    [Symbol.dispose](): void;
    dispatch_editor_commands(commands_json: string): string;
    export_document(): string;
    hit_test(page_id: string, x: number, y: number, mode: string): string;
    load_document(serialized_doc: string): string;
    move_snap(delta_x: number, delta_y: number, threshold?: number | null): string;
    constructor();
    query_node(node_id: string): string;
    resize_snap(handle: string, delta_x: number, delta_y: number, lock_aspect: boolean, threshold?: number | null): string;
    run_validation(): string;
    selection_bounds(): string;
    text_layout(node_id: string): string;
    transform_handles(): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmeditorbridgehandle_free: (a: number, b: number) => void;
    readonly wasmeditorbridgehandle_new: () => number;
    readonly wasmeditorbridgehandle_load_document: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmeditorbridgehandle_dispatch_editor_commands: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmeditorbridgehandle_query_node: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmeditorbridgehandle_hit_test: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly wasmeditorbridgehandle_selection_bounds: (a: number) => [number, number, number, number];
    readonly wasmeditorbridgehandle_transform_handles: (a: number) => [number, number, number, number];
    readonly wasmeditorbridgehandle_text_layout: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmeditorbridgehandle_move_snap: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly wasmeditorbridgehandle_resize_snap: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly wasmeditorbridgehandle_run_validation: (a: number) => [number, number, number, number];
    readonly wasmeditorbridgehandle_export_document: (a: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
