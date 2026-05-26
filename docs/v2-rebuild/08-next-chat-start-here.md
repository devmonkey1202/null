# 08. Next Chat Start Here

이 문서는 다음 채팅/다음 세션에서 바로 이어받기 위한 착수 지침입니다.

## 1. 현재 상태 요약

- 기준 베이스 브랜치: `main`
- 기준 커밋: `6a7a35ff88932c69d563de4f3ffcc1c28c3fc8d1`
- v1은 유지
- v2는 아직 코드로 시작하지 않음
- 이 폴더 문서가 v2 설계 기준

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

작업 브랜치 확인 및 **에디터 우선** v2 폴더 스캐폴드 생성

최소:

- `v2-rebuild` 브랜치 확인/생성
- `src/app/editor/v2`
- `src/app/v2/p/[pageId]`
- `src/app/api/v2/control`
- `src/app/api/v2/ai`
- `rust/`

### Task 2

Rust workspace 생성

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

v2 문서 포맷 초안 작성

정해야 할 것:

- `schemaVersion`
- page/frame/text/component 구조
- tokens
- variables
- app model hooks

### Task 4

에디터 서비스 경계 초안 코드화

정해야 할 것:

- platform user/session
- document persistence boundary
- collaboration session boundary
- publish snapshot boundary

### Task 5

초기 구현 전에 아래 5개 계약을 코드 타입으로 먼저 잠그기

- SceneDoc
- EditorCommand
- EditorSnapshot
- ValidationReport
- WASM Bridge

## 5. 절대 바로 하지 말아야 할 것

- v1 giant file를 계속 덧대기
- v1 runtime에 더 많은 특수처리 추가
- AI를 HTML 생성기로 먼저 붙이기
- 범용 앱 플랫폼 전체부터 먼저 완성하려고 달려들기
- `main`으로 바로 푸시하기
- Vercel production을 중간 검증용으로 쓰기

## 6. v2 초기 구현 우선순위

가장 합리적인 순서:

1. 문서 포맷
2. editor kernel skeleton
3. text/vector/render skeleton
4. minimal collaboration/publish service boundary
5. AI patch format

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

“`docs/v2-rebuild` 기준으로 v2 폴더 스캐폴드부터 만들어”

### 예시 B

“v2 문서 포맷 JSON schema 초안부터 작성해”

### 예시 C

“Rust workspace와 wasm bridge 기본 골격 만들어”

### 예시 D

“계정 분리 모델을 Prisma 초안으로 정리해”

### 예시 E

“AI가 다룰 IR 타입부터 TypeScript와 Rust 양쪽에서 맞춰”

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
