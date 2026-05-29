# 08. Next Chat Start Here

이 문서는 다음 채팅/다음 세션에서 바로 이어받기 위한 착수 지침입니다.

## 1. 현재 상태 요약

- 기준 베이스 브랜치: `main`
- 기준 커밋: `6a7a35ff88932c69d563de4f3ffcc1c28c3fc8d1`
- v1은 유지
- v2는 이미 코드 스캐폴드와 기초 커널 구현이 시작됨
- 이 폴더 문서가 계속 기준이지만, 코드 상태와 함께 읽어야 함

## 2. 워킹트리 주의사항

현재 로컬에는 v1 조사 흔적이 남아 있습니다.

- 수정됨: `src/advanced/runtime/player.tsx`
- 수정됨: `src/components/work-view.tsx`
- 미추적: `.logs/`
- 미추적: `artifacts/`

다음 세션에서 해야 할 첫 판단:

1. 이 변경을 v1 유지용으로 커밋할지
2. stash/별도 브랜치로 격리할지
3. v2 작업과 분리할지

## 2-1. 브랜치/배포 원칙

다음 원칙은 고정입니다.

- `main` 직접 작업 금지
- `v2-rebuild` 같은 별도 작업 브랜치 사용
- 완성 전까지 Vercel production 배포 금지
- GitHub에는 작업 브랜치로 계속 푸시

이유:

- 현재 레포는 Vercel 프로젝트와 연결되어 있어 `main` 반영이 자동 배포를 유발할 수 있음
- 기존 서비스 보호가 우선
- 위의 `기준 베이스 브랜치`는 참조 기준일 뿐, 실제 작업 브랜치가 아님

## 3. 즉시 읽을 파일

반드시 아래 순서로 읽습니다.

1. `docs/v2-rebuild/01-current-state-audit.md`
2. `docs/v2-rebuild/10-v2-editor-spec.md`
3. `docs/v2-rebuild/21-v2-rendering-text-vector-stack.md`
4. `docs/v2-rebuild/20-v2-design-system-and-ux-spec.md`
5. `docs/v2-rebuild/13-v2-performance-and-slo-spec.md`
6. `docs/v2-rebuild/15-v2-quality-gates-spec.md`
7. `docs/v2-rebuild/09-v2-contracts-and-interfaces.md`
8. `docs/v2-rebuild/03-v2-system-architecture.md`
9. `docs/v2-rebuild/02-v2-product-definition.md`
10. `docs/v2-rebuild/05-v2-ai-system.md`
11. `docs/v2-rebuild/12-v2-service-kernel-spec.md`
12. `docs/v2-rebuild/17-v2-websocket-event-catalog.md`
13. `docs/v2-rebuild/18-v2-ai-patch-schema.md`
14. `docs/v2-rebuild/19-v2-rust-crate-api-map.md`
15. `docs/v2-rebuild/22-v2-ops-topology-and-runbooks.md`
16. `docs/v2-rebuild/23-v2-cross-validation-report.md`

## 4. 다음 세션에서 가장 먼저 할 일

### Task 1

작업 브랜치 확인 및 **현재 v2 코드 상태 점검**

최소:

- `v2-rebuild` 브랜치 확인/생성
- `src/app/editor/v2`
- `src/app/v2/p/[pageId]`
- `src/app/api/v2/control`
- `src/app/api/v2/ai`
- `rust/`
- `src/v2/editor/contracts.ts`
- `src/v2/editor/bridge/noop-editor-bridge.ts`

### Task 2

Rust workspace 및 커널 진행 상태 확인

최소 crate:

- `kernel-doc`
- `kernel-scene`
- `kernel-layout`
- `kernel-history`
- `kernel-text`
- `kernel-vector`
- `kernel-render`
- `kernel-runtime`
- `service-auth`
- `service-documents`
- `service-collab`
- `service-publish`
- `service-media`
- `service-ai`
- `ffi-wasm-editor`

### Task 3

noop bridge -> 실제 WASM bridge 연결 착수

정해야 할 것:

- load / dispatch / query 경계
- selection / viewport / transform 동기화
- editor shell 상태와 kernel 상태 분리

### Task 4

AI self-hosted 문서와 코드 경계 확인

정해야 할 것:

- `05`, `18`, `24`, `25`, `26`, `27` 문서 기준 확인
- `AIPatch` provenance 필드 고정
- self-hosted inference 전제 유지

### Task 5

다음 커널 우선순위 진행

- SceneDoc
- EditorCommand
- EditorSnapshot
- ValidationReport
- WASM Bridge
- rotate
- snapping / guide
- layout / constraints
- 실제 WASM adapter

## 5. 절대 바로 하지 말아야 할 것

- v1 giant file를 계속 덧대기
- v1 runtime에 더 많은 특수처리 추가
- AI를 HTML 생성기로 먼저 붙이기
- 범용 앱 플랫폼 전체부터 먼저 완성하려고 달려들기
- `main`으로 바로 푸시하기
- Vercel production을 중간 검증용으로 쓰기

## 6. v2 초기 구현 우선순위

가장 합리적인 순서:

1. 실제 WASM bridge 연결
2. rotate / snapping / layout
3. text/vector/render skeleton
4. minimal collaboration/publish service boundary
5. self-hosted AI patch execution boundary

## 7. 개발 체크리스트

### 환경

- 로컬 Docker 상태 확인
- Postgres/Redis 재기동 가능 여부 확인
- production env secrets 재정비 필요 여부 확인

### 품질

- 모든 새 구조에 테스트 자리 먼저 만들기
- v2용 visual regression 계획 같이 만들기
- metrics/logging hook 자리 먼저 확보하기

## 8. 다음 채팅에서 바로 시작할 수 있는 요청 예시

아래 중 하나로 시작하면 됩니다.

### 예시 A

“v2 editor shell을 실제 wasm bridge에 붙여”

### 예시 B

“rotate와 snapping 커널부터 이어서 구현해”

### 예시 C

“self-hosted AI 문서 기준으로 AI gateway 스캐폴드 만들어”

### 예시 D

“AIPatch provenance와 eval 로그 구조를 코드 타입으로 고정해”

### 예시 E

“text/vector stack 선택 기준과 skeleton crate를 더 구체화해”

## 9. 현재 빌드 관련 메모

- `verify:prisma` 통과
- `verify:types` 통과
- `verify:unit` 통과
- `build`는 현재 production secret 상태 때문에 실제로 실패했음
- 직접 확인된 실패 원인: `IP_HASH_SALT` 미설정

즉, 다음 세션에서 v2 착수 전에 기존 build 상태를 다시 해석해야 합니다.

## 10. 최종 한 줄

다음 세션은 “앱 플랫폼 전체”가 아니라,  
이 문서 묶음을 기준으로 **상용 수준 에디터 재구축**부터 바로 착수하면 됩니다.
