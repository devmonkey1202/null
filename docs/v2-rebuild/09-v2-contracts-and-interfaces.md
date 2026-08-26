# 09. v2 Contracts and Interfaces

이 문서는 v2 구현에서 가장 먼저 타입/스키마로 굳혀야 하는 계약을 정의합니다.  
현재 우선순위는 **에디터 완성**이며, runtime/service/AI는 그 산출물을 확장 가능한 구조로 넘기기 위한 보조 계약입니다.

## 1. 왜 계약 문서가 필요한가

v1의 큰 문제 중 하나는 다음입니다.

- UI 상태
- 런타임 상태
- 서비스 상태
- 문서 상태

이 네 개의 경계가 명확하지 않습니다.

v2는 시작부터 계약을 명시해야 합니다.

## 2. 최상위 계약 목록

가장 먼저 고정해야 할 계약은 아래 9개입니다.

1. `SceneDoc`
2. `EditorCommand`
3. `EditorSnapshot`
4. `ValidationReport`
5. `WASM Bridge`
6. `RuntimeGraph`
7. `ServiceBinding`
8. `AIContextBundle`
9. `AIPatch`

현재 phase 기준으로:

- **우선 계약**: `SceneDoc`, `EditorCommand`, `EditorSnapshot`, `ValidationReport`, `WASM Bridge`
- **보조 계약**: `RuntimeGraph`, `ServiceBinding`, `AIContextBundle`, `AIPatch`

## 3. SceneDoc

에디터와 런타임의 공통 기반 문서입니다.

```ts
type SceneDoc = {
  schemaVersion: 2;
  documentId: string;
  title: string;
  pages: ScenePage[];
  components: ComponentDefinition[];
  tokens: DesignTokenSet;
  variables: VariableSet[];
  appModel?: AppModelRef;
  meta: {
    createdAt: string;
    updatedAt: string;
    createdBy?: string;
    updatedBy?: string;
  };
};
```

### 요구사항

- deterministic serialization
- stable node ids
- explicit page tree
- component/instance 지원
- runtime graph와 연결 가능한 hook 제공

## 4. Scene Page / Node

```ts
type ScenePage = {
  id: string;
  name: string;
  rootId: string;
  routeKey?: string;
};

type SceneNode = {
  id: string;
  kind: "frame" | "text" | "shape" | "image" | "video" | "component" | "instance" | "slot";
  name: string;
  parentId: string | null;
  children?: string[];
  frame: {
    x: number;
    y: number;
    w: number;
    h: number;
    rotation: number;
  };
  layout?: LayoutSpec;
  style?: StyleSpec;
  text?: TextSpec;
  media?: MediaSpec;
  behavior?: BehaviorRef;
  bindings?: BindingRef[];
  visibility?: VisibilityRule;
};
```

### 4.1 Text offset and layout query contract

- `TextRange.start`, `TextRange.end`, caret offsets, hit-test offsets use UTF-16 code units.
- This matches browser `selectionStart` / `selectionEnd` and JavaScript `String.slice`.
- Grapheme boundaries are computed by the Rust text kernel. A caret must never be emitted inside a grapheme cluster.
- `query({ kind: "text_layout", nodeId })` returns `TextLayout` from the active editor kernel.
- `TextLayout` contains line, grapheme, caret, baseline, wrapping, width, height, and measurement-mode data.
- JS must not independently calculate authoritative text geometry while the Rust/WASM bridge is active.
- Preview and publish must consume the same future shaped-text output; the deterministic fallback is an implementation phase, not release parity.

## 5. Design Token 계약

```ts
type DesignTokenSet = {
  colors: Record<string, TokenValue>;
  typography: Record<string, TypographyToken>;
  spacing: Record<string, TokenValue>;
  radius: Record<string, TokenValue>;
  shadow: Record<string, ShadowToken>;
  motion: Record<string, MotionToken>;
};
```

## 6. Variable Graph 계약

```ts
type VariableSet = {
  id: string;
  name: string;
  scope: "document" | "page" | "component" | "app" | "session";
  modes?: string[];
  variables: VariableNode[];
};

type VariableNode = {
  id: string;
  key: string;
  type: "string" | "number" | "boolean" | "color" | "object" | "list";
  value?: unknown;
  formula?: string;
};
```

## 7. AppModel 계약

```ts
type AppModelRef = {
  appId: string;
  routeGraphId: string;
  stateGraphId: string;
  actionGraphId: string;
  permissionModelId?: string;
  realtimeModelId?: string;
};
```

이건 SceneDoc 바깥 모델을 연결하는 **최소 확장 참조점**입니다.

## 8. RuntimeGraph 계약

```ts
type RuntimeGraph = {
  routes: RouteNode[];
  states: StateNode[];
  actions: ActionNode[];
  permissions: PermissionRule[];
  realtime?: RealtimeModel;
  serviceBindings: ServiceBinding[];
};
```

### RouteNode

```ts
type RouteNode = {
  id: string;
  key: string;
  pageId: string;
  path: string;
  guards?: string[];
  loaders?: string[];
};
```

### StateNode

```ts
type StateNode = {
  id: string;
  key: string;
  scope: "local" | "page" | "app" | "session";
  type: "string" | "number" | "boolean" | "object" | "list";
  initial?: unknown;
  computed?: string;
};
```

### ActionNode

```ts
type ActionNode = {
  id: string;
  key: string;
  trigger: "click" | "submit" | "change" | "load" | "timer" | "custom";
  kind:
    | "navigate"
    | "set_state"
    | "call_service"
    | "open_modal"
    | "close_modal"
    | "emit_realtime";
  input?: Record<string, unknown>;
  condition?: string;
  successNext?: string[];
  failureNext?: string[];
};
```

## 9. ServiceBinding 계약

현재 phase에서 서비스 연결은 **에디터 산출물을 실행 가능한 구조로 넘기기 위한 최소 계약**이어야 합니다.

```ts
type ServiceBinding = {
  id: string;
  key: string;
  kind:
    | "auth"
    | "storage"
    | "publish"
    | "collaboration"
    | "realtime"
    | "ai";
  target: string;
  config: Record<string, unknown>;
};
```

예:

- `kind: "auth", target: "platform_auth.default"`
- `kind: "publish", target: "publish.snapshot.default"`
- `kind: "collaboration", target: "collab.document.default"`

## 10. Permission 계약

```ts
type PermissionRule = {
  id: string;
  subject: "role" | "user" | "group";
  subjectKey: string;
  resource: string;
  effect: "allow" | "deny";
  actions: string[];
  condition?: string;
};
```

예:

- route access
- selection-based action permission
- publish permission
- comment create/resolve

## 11. RealtimeModel 계약

```ts
type RealtimeModel = {
  channels: RealtimeChannel[];
  events: RealtimeEventDef[];
  presence?: PresenceModel;
};

type RealtimeChannel = {
  id: string;
  key: string;
  scope: "document" | "page" | "custom";
  retention: "ephemeral" | "persisted";
};
```

## 12. EditorCommand 계약

Shell이 WASM 커널에 보내는 명령은 명시적이어야 합니다.

```ts
type EditorCommand =
  | { kind: "create_node"; payload: CreateNodeInput }
  | { kind: "update_node"; payload: UpdateNodeInput }
  | { kind: "delete_node"; payload: { nodeId: string } }
  | { kind: "move_node"; payload: MoveNodeInput }
  | { kind: "set_token"; payload: SetTokenInput }
  | { kind: "set_variable"; payload: SetVariableInput }
  | { kind: "apply_patch"; payload: ScenePatch }
  | { kind: "undo" }
  | { kind: "redo" };
```

중요:

- React state로 직접 문서를 변형하지 않음
- command -> kernel -> snapshot 구조 유지

## 13. EditorSnapshot 계약

```ts
type EditorSnapshot = {
  version: number;
  doc: SceneDoc;
  selection: string[];
  inspector: InspectorSnapshot;
  diagnostics: ValidationReport[];
};
```

## 14. AIContextBundle 계약

AI에 보내는 문맥은 항상 구조화돼야 합니다.

```ts
type AIContextBundle = {
  intent: string;
  mode: "generate" | "continue" | "modify" | "debug" | "polish";
  selection?: SelectionBundle;
  scene?: SceneDoc;
  runtime?: RuntimeGraph;
  permissions?: PermissionRule[];
  diagnostics?: ValidationReport[];
  userConstraints?: Record<string, unknown>;
};
```

## 15. AIPatch 계약

AI는 코드가 아니라 patch를 반환해야 합니다.

```ts
type AIPatch = {
  patchId: string;
  intent: string;
  mode: "generate" | "continue" | "modify" | "debug" | "polish";
  summary: string;
  risk: "low" | "medium" | "high";
  scope: PatchScope;
  sceneOps: ScenePatchOp[];
  runtimeOps: RuntimePatchOp[];
  serviceOps: ServicePatchOp[];
  notes?: string[];
  testOps: TestPatchOp[];
  requiresApproval: boolean;
};
```

주의:

- `AIPatch`의 **canonical source**는 [18-v2-ai-patch-schema.md](./18-v2-ai-patch-schema.md)입니다.
- 이 문서는 최상위 계약만 유지합니다.

## 16. ValidationReport 계약

```ts
type ValidationReport = {
  id: string;
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  target?: {
    kind: "node" | "route" | "action" | "state" | "collection";
    id: string;
  };
  fixHint?: string;
};
```

## 17. WASM Bridge 계약

JS와 Rust/WASM 사이 계약은 최대한 얇게 유지합니다.

권장 API:

- `loadDocument(serializedDoc) -> snapshot`
- `dispatch(command) -> snapshotDelta`
- `query(selector) -> result`
- `exportRuntimeGraph() -> graph`
- `runValidation() -> report[]`

반대로 금지:

- JS가 internal node map 직접 수정
- 임의 전역 상태 접근
- DOM에 종속된 kernel API

## 18. Runtime / Service 연결 API 초안

### Control Plane

- `POST /api/v2/control/projects`
- `GET /api/v2/control/projects/:id`
- `POST /api/v2/control/projects/:id/deploy`
- `POST /api/v2/control/documents/:documentId/publish`
- `POST /api/v2/control/documents/:documentId/restore`

### Editor Collaboration

- `WS /api/v2/control/realtime/ws`
- `POST /api/v2/control/documents/:documentId/comments`
- `POST /api/v2/control/documents/:documentId/review/resolve`

### AI

- `POST /api/v2/ai/plan`
- `POST /api/v2/ai/patch`
- `POST /api/v2/ai/validate`
- `POST /api/v2/ai/debug`

## 19. 테스트 계약

모든 patch는 아래를 만족해야 합니다.

- schema valid
- no broken binding
- no missing route target
- no missing permission ref
- no unresolved token/variable
- optional visual diff pass

## 20. 시작 시점에 꼭 고정할 것

초기 개발 전에 반드시 합의해야 하는 것:

1. SceneDoc schema
2. RuntimeGraph schema
3. editor auth separation rules
4. AI patch envelope
5. WASM bridge API

이 다섯 개가 흔들리면 v2 전체가 다시 흔들립니다.
