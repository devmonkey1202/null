# 19. v2 Rust Crate API Map

이 문서는 v2 Rust workspace의 crate 경계와 public API를 잠급니다.  
현재 phase의 중심은 **Editor Kernel**이며, runtime/service는 에디터 산출물 확장을 위한 보조 계층입니다.

## 1. workspace 원칙

- 각 crate는 단일 책임
- shell은 FFI crate만 본다
- kernel crate는 HTTP/DB를 모른다
- service crate는 DOM/React를 모른다
- runtime crate는 editor crate 내부 상태를 직접 보지 않는다

## 2. crate 계층

### shared core

- `core-id`
- `core-error`
- `core-json`
- `core-time`

### editor kernel

- `kernel-doc`
- `kernel-scene`
- `kernel-layout`
- `kernel-history`
- `kernel-text`
- `kernel-vector`
- `kernel-render`
- `kernel-sync`

### runtime kernel

- `kernel-runtime`
- `kernel-bindings`
- `kernel-actions`
- `kernel-conditions`

### service kernel

- `service-auth`
- `service-documents`
- `service-collab`
- `service-publish`
- `service-media`
- `service-ai`
- `service-control-plane`

### integration / ffi

- `ffi-wasm-editor`
- `ffi-wasm-runtime`
- `ffi-http`
- `ffi-events`

## 3. dependency 규칙

허용:

- `kernel-scene -> kernel-doc`
- `kernel-layout -> kernel-scene`
- `kernel-history -> kernel-doc`
- `kernel-runtime -> kernel-doc`
- `service-documents -> service-auth`
- `service-collab -> service-auth/service-documents`
- `service-publish -> service-documents`
- `ffi-wasm-editor -> kernel-*`
- `ffi-http -> service-*`

금지:

- `kernel-* -> service-*`
- `kernel-* -> ffi-*`
- `service-* -> ffi-*`
- `service-* -> React/Next concept`
- `kernel-runtime -> kernel-history` 직접 의존

## 4. crate별 public API

### `kernel-doc`

```rust
pub struct SceneDoc;
pub struct ScenePage;
pub struct SceneNode;

pub fn parse_scene_doc(raw: &str) -> Result<SceneDoc, KernelError>;
pub fn serialize_scene_doc(doc: &SceneDoc) -> Result<String, KernelError>;
pub fn validate_scene_doc(doc: &SceneDoc) -> Vec<ValidationIssue>;
pub fn upgrade_scene_doc(raw: &str, from: u32, to: u32) -> Result<SceneDoc, KernelError>;
```

### `kernel-scene`

```rust
pub struct SceneGraph;
pub struct SelectionSet;

pub fn build_scene_graph(doc: &SceneDoc) -> Result<SceneGraph, KernelError>;
pub fn select_nodes(graph: &SceneGraph, query: SelectionQuery) -> SelectionSet;
pub fn mutate_scene(graph: &SceneGraph, cmd: SceneCommand) -> Result<SceneDelta, KernelError>;
```

### `kernel-layout`

```rust
pub fn compute_layout(graph: &SceneGraph, viewport: Viewport) -> LayoutSnapshot;
pub fn compute_snap(graph: &SceneGraph, drag: DragInput) -> SnapPreview;
pub fn apply_transform(graph: &SceneGraph, transform: TransformCommand) -> Result<SceneDelta, KernelError>;
```

### `kernel-history`

```rust
pub struct HistoryStore;

pub fn begin_tx(store: &mut HistoryStore, label: &str);
pub fn push_delta(store: &mut HistoryStore, delta: SceneDelta);
pub fn undo(store: &mut HistoryStore) -> Option<SceneDelta>;
pub fn redo(store: &mut HistoryStore) -> Option<SceneDelta>;
```

### `kernel-text`

```rust
pub fn layout_text(input: TextLayoutInput) -> TextLayoutOutput;
pub fn hit_test_text(input: TextHitTestInput) -> TextHitResult;
pub fn edit_text(input: TextEditCommand) -> Result<TextEditDelta, KernelError>;
```

### `kernel-vector`

```rust
pub fn edit_path(input: PathEditCommand) -> Result<PathDelta, KernelError>;
pub fn boolean_op(lhs: VectorShape, rhs: VectorShape, op: BooleanOp) -> Result<VectorShape, KernelError>;
pub fn flatten_path(shape: &VectorShape, tolerance: f32) -> FlattenedPath;
```

### `kernel-render`

```rust
pub fn build_render_list(graph: &SceneGraph, viewport: Viewport) -> RenderList;
pub fn diff_render_lists(prev: &RenderList, next: &RenderList) -> RenderDiff;
```

### `kernel-sync`

```rust
pub fn apply_remote_ops(doc: &SceneDoc, ops: Vec<RemoteOp>) -> Result<SceneDoc, KernelError>;
pub fn build_presence_update(input: PresenceInput) -> PresenceEvent;
pub fn merge_text_ops(local: TextOps, remote: TextOps) -> MergeResult;
```

### `kernel-runtime`

```rust
pub struct RuntimeSnapshot;

pub fn load_runtime(graph: RuntimeGraph, services: RuntimeServices) -> Result<RuntimeSnapshot, RuntimeError>;
pub fn dispatch_action(rt: &mut RuntimeSnapshot, action_key: &str, input: serde_json::Value) -> Result<RuntimeResult, RuntimeError>;
pub fn evaluate_bindings(rt: &RuntimeSnapshot, selectors: Vec<BindingSelector>) -> Vec<BindingValue>;
```

## 5. service crate public API

### `service-auth`

```rust
pub trait PlatformAuthService {
    fn login(&self, input: PlatformLoginInput) -> Result<PlatformSession, ServiceError>;
    fn logout(&self, session_id: &str) -> Result<(), ServiceError>;
}
```

### `service-documents`

```rust
pub trait DocumentService {
    fn load_document(&self, req: LoadDocumentRequest) -> Result<DocumentView, ServiceError>;
    fn save_document(&self, req: SaveDocumentRequest) -> Result<DocumentVersionView, ServiceError>;
    fn restore_document(&self, req: RestoreDocumentRequest) -> Result<DocumentView, ServiceError>;
}
```

### `service-collab`

```rust
pub trait CollaborationService {
    fn authorize_subscription(&self, req: SubscribeRequest) -> Result<SubscriptionGrant, ServiceError>;
    fn publish_doc_event(&self, evt: EventEnvelope) -> Result<(), ServiceError>;
    fn replay(&self, req: ReplayRequest) -> Result<Vec<EventEnvelope>, ServiceError>;
}
```

### `service-publish`

```rust
pub trait PublishService {
    fn create_snapshot(&self, req: CreatePublishSnapshotRequest) -> Result<PublishSnapshotView, ServiceError>;
    fn load_snapshot(&self, req: LoadPublishSnapshotRequest) -> Result<PublishSnapshotView, ServiceError>;
}
```

### `service-ai`

```rust
pub trait AiPatchService {
    fn plan(&self, ctx: AiContextBundle) -> Result<AiPlan, ServiceError>;
    fn generate_patch(&self, ctx: AiContextBundle) -> Result<AiPatch, ServiceError>;
    fn validate_patch(&self, patch: AiPatch, ctx: AiValidationContext) -> Result<AiValidationResult, ServiceError>;
}
```

## 6. FFI crate API

### `ffi-wasm-editor`

```rust
#[wasm_bindgen]
pub fn load_document(serialized_doc: String) -> Result<JsValue, JsValue>;

#[wasm_bindgen]
pub fn dispatch_editor_command(cmd_json: String) -> Result<JsValue, JsValue>;

#[wasm_bindgen]
pub fn query_editor(selector_json: String) -> Result<JsValue, JsValue>;

#[wasm_bindgen]
pub fn validate_document() -> Result<JsValue, JsValue>;
```

### `ffi-wasm-runtime`

```rust
#[wasm_bindgen]
pub fn load_runtime_graph(graph_json: String) -> Result<(), JsValue>;

#[wasm_bindgen]
pub fn dispatch_runtime_action(action_json: String) -> Result<JsValue, JsValue>;
```

### `ffi-http`

책임:

- request parsing
- auth extraction
- JSON serialization
- error mapping

## 7. 타입 공유 전략

권장:

- `core-error`
- `core-id`
- `contracts-scene`
- `contracts-runtime`
- `contracts-service`
- `contracts-ai`

하나의 거대한 `common` crate는 피합니다.

## 8. forbidden API patterns

- raw DB client를 public API로 노출
- shell이 scene graph internals에 직접 접근
- service layer가 wasm-specific type 반환
- kernel API가 DOM selector/HTMLElement 입력 수용
- runtime가 page name string heuristic 의존

## 9. 구현 순서

### 1차

- `core-error`
- `kernel-doc`
- `kernel-scene`
- `kernel-layout`
- `kernel-history`
- `ffi-wasm-editor`

### 2차

- `service-auth`
- `service-documents`
- `service-collab`
- `service-publish`

### 3차

- `kernel-runtime`
- `ffi-wasm-runtime`
- `service-media`
- `ffi-http`

### 4차

- `service-ai`
- `kernel-sync`
- `kernel-text`
- `kernel-vector`
- `kernel-render`

## 10. 테스트 책임 분배

- `kernel-*`: unit / property / benchmark
- `service-*`: contract / integration / failure mode
- `ffi-*`: boundary tests
- workspace top-level: smoke / flow / perf

## 11. 최종 결론

v2 Rust workspace는 **crate 경계, export 표면, dependency 규칙이 잠긴 상태**로 출발해야 합니다.
