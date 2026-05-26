# 03. v2 System Architecture

이 문서는 v2의 권장 기술 구조를 정의합니다.  
현재 우선순위는 **플랫폼 전체 완성**이 아니라 **Editor Kernel 완성**입니다.

## 1. 핵심 결론

가장 효율적인 조합은 다음입니다.

- 셸/UI: `React + Next.js`
- 에디터 코어: `Rust + WASM`
- 런타임 엔진: `Rust + WASM`
- 서비스 커널: `Rust`
- 저장소/큐: `Postgres + Redis + Object Storage`
- AI 계층: `서버 오케스트레이션 + 구조화된 IR 패치 시스템`

즉, **프론트 전체를 Rust로 가는 것이 아니라 Editor Kernel 중심으로 커널만 Rust로 뽑는 구조**입니다.

## 1-1. 현재 phase의 우선순위

1. Editor Kernel
2. Editor Shell / Inspector / Canvas UX
3. Text / Vector / Render stack
4. Collaboration document ops
5. Runtime / Service / AI 연결 계약

## 2. 계층 구조

### Layer 0. Storage / Infra

- Postgres
- Redis
- Object storage
- Log / metrics / tracing backend

### Layer 1. Editor Kernel

Rust/WASM. 책임:

- document model
- scene graph
- selection/hit testing
- layout/constraint
- snapping/alignment
- history/undo redo
- vector/text editing core
- collaboration document ops
- render command generation

### Layer 2. Shell / Product UI

Next/React. 책임:

- routes
- app shell
- inspector/sidebar/panels
- dashboard
- settings/admin
- AI chat surface

### Layer 3. Runtime Extension

Rust/WASM. 책임:

- page graph 해석
- component instance 계산
- state evaluation
- action graph 실행
- binding resolution
- editor 산출물을 preview/publish 가능한 구조로 전달

### Layer 4. Service Extension

Rust 서버. 책임:

- control plane API
- document persistence / publish snapshot
- auth/session
- collaboration / presence / comments
- media/file orchestration
- minimal runtime/service binding
- AI orchestration entrypoint

## 3. 왜 이런 분리가 필요한가

현재 v1의 문제는 다음이 한곳에 섞여 있다는 점입니다.

- 렌더링
- 편집 상태
- 도메인 상태
- UI 상태
- 실시간
- 서비스 액션

v2에서는 이걸 강제 분리해야 합니다.  
특히 현재 phase에서는 **Editor Kernel이 중심**이고, runtime/service/AI는 editor output을 확장 가능한 구조로 받는 보조 계층입니다.

분리 효과:

- 성능 병목 격리
- 회귀 범위 축소
- 테스트 가능성 증가
- AI 변경 단위 명확화
- 커널 재사용성 증가

## 4. 권장 저장소 구조

현재 레포를 그대로 유지하되, 새 구조를 병렬로 추가하는 방식을 권장합니다.

```text
docs/
  v2-rebuild/

rust/
  Cargo.toml
  crates/
    kernel-doc/
    kernel-scene/
    kernel-layout/
    kernel-history/
    kernel-text/
    kernel-vector/
    kernel-runtime/
    kernel-sync/
    kernel-render/
    service-auth/
    service-collab/
    service-media/
    service-publish/
    service-ai/
    ffi-wasm/
    ffi-http/

src/
  app/
    editor/
      advanced/          # v1 유지
      v2/                # v2 편집기
    v2/
      p/[pageId]/        # v2 퍼블릭 런타임
      dashboard/
      settings/
    api/
      v1/...             # 기존 유지
      v2/
        control/...
        app/...
        ai/...
  v2-shell/
    components/
    panels/
    stores/
    bridges/
  v2-bridge/
    wasm/
    runtime/
    editor/
  v2-sdk/
    plugins/
    actions/
```

## 5. 라우트 전략

v1을 깨지 않기 위해 v2는 별도 라우트로 시작합니다.

### 유지

- `/editor/advanced`
- `/p/[pageId]`
- 기존 `/api/*`

### 신설

- `/editor/v2`
- `/v2/p/[pageId]`
- `/api/v2/control/*`
- `/api/v2/app/*`
- `/api/v2/ai/*`

## 6. 문서 포맷 전략

v2는 문서 포맷도 분리해야 합니다.

권장:

- v1 문서: 기존 포맷 유지
- v2 문서: 새 `schemaVersion`

예:

```json
{
  "schemaVersion": 2,
  "documentId": "doc_x",
  "pages": [],
  "components": [],
  "tokens": {},
  "variables": {},
  "appModel": {},
  "runtimeModel": {}
}
```

이유:

- v1 특수처리와 결별
- importer를 명시적으로 만들 수 있음
- AI가 구조화된 포맷을 다루기 쉬움

## 7. Editor Kernel 구성

권장 crate 분리:

- `kernel-doc`: 직렬화/역직렬화, schema, ids
- `kernel-scene`: scene graph, node tree, instances
- `kernel-layout`: constraint, auto layout, snapping
- `kernel-history`: command log, undo/redo
- `kernel-text`: text runs, selection model, shaping integration
- `kernel-vector`: path, boolean, geometry
- `kernel-sync`: CRDT/OT layer
- `kernel-render`: render command builder

이걸 WASM으로 노출하고 React 셸은 호출만 합니다.

## 8. Runtime Extension 구성

권장 모듈:

- `route_graph`
- `state_graph`
- `binding_resolver`
- `action_executor`
- `condition_evaluator`
- `component_renderer`
- `service_binding_resolver`
- `realtime_adapter`

중요:

런타임은 더 이상 페이지 이름/텍스트 이름을 보고 문맥을 추론하면 안 됩니다.  
모든 것은 명시적 IR을 따라야 합니다.

## 9. Service Extension 구성

현재 phase 권장 모듈:

- `auth`
- `control_plane`
- `publish`
- `collaboration`
- `realtime_presence`
- `media`
- `audit`
- `ai_orchestrator`

### 초기 구현 원칙

- Postgres를 source of truth로 사용
- Redis는 presence, fanout, queue, cache에 사용
- 문서/댓글/presence/preview snapshot은 데이터 모델로 명시
- long-lived collaboration connection은 Rust 서비스에서 처리

## 10. 배포 구조

현재 v1은 Vercel 중심입니다.  
v2 에디터는 다음 구조를 기본으로 둡니다.

### 권장

- Next 셸: Vercel 또는 container
- Rust service kernel: container/VM 기반
- Realtime: Rust service 내부에서 WebSocket

### 이유

- 협업/문서 presence는 장기 연결이 필요
- Rust 서비스는 서버리스보다 지속 프로세스가 유리
- AI 오케스트레이션과 worker도 분리 가능

## 11. 통신 방식

### Shell <-> Service Kernel

- HTTP/JSON
- 선택적으로 gRPC 내부 사용 가능

### Shell <-> WASM Kernels

- typed command interface
- batch diff apply

### Realtime

- WebSocket 기본
- 필요한 경우 SSE 보조

### AI

- editor selection/context -> AI service
- AI service -> IR patch 반환
- shell이 preview/approve/apply

## 12. 테스트 구조

v2는 테스트를 아래로 분리합니다.

### Rust unit/property tests

- geometry
- text layout
- state graph
- realtime conflict cases

### Contract tests

- shell <-> wasm
- shell <-> service
- ai patch schema

### Integration tests

- document create/open/save
- edit page
- publish snapshot
- preview parity
- collaboration presence
- comment/review
- ai patch apply

### Visual regression

- editor snapshots
- runtime snapshots
- token/theme variants

## 13. v2가 반드시 피해야 할 것

- giant React file 재등장
- 패턴 이름 기반 런타임 특수처리
- 데모 앱과 에디터 기능 혼합
- shell state와 kernel state 혼합
- AI가 HTML을 통째로 찍어내는 방식
- 프로덕션에서 필수 secret 누락 시점이 늦은 구조

## 14. 최종 구조 요약

```text
React/Next Shell
  -> Rust/WASM Editor Kernel
  -> Rust/WASM Runtime Extension
  -> Rust Service Extension
  -> Postgres / Redis / Object Storage
  -> AI Orchestrator over IR
```

이 구조가 v2의 기준점입니다.  
핵심은 **Editor Kernel을 1순위로 완성하고**, runtime/service/AI는 그 산출물을 확장하는 연결 구조로 유지하는 것입니다.
