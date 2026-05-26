# 07. v2 Delivery Roadmap

이 문서는 v2를 **에디터 완성 중심**으로 개발하는 순서를 정의합니다.

## 1. 전제

- v1 운영은 계속 유지
- v2는 병행 개발
- 목표는 상용 수준 에디터 완성
- React/Next 셸 유지, Rust/WASM Editor Kernel 재구축
- Runtime / Service / AI는 에디터 산출물 확장을 위한 연결 계층으로 유지
- 운영 서비스에 영향 주는 중간 배포 금지
- GitHub 업데이트는 별도 작업 브랜치 기준

## 2. Phase 0 - Architecture Lock

기간 목표: 1~2주

산출물:

- v2 아키텍처 확정
- SceneDoc / EditorCommand / EditorSnapshot / ValidationReport / WASM Bridge 계약 확정
- Editor Kernel 우선순위 확정
- route/flag 결정

Acceptance Gate:

- 이 문서 묶음 수준의 설계가 내부 합의됨

## 3. Phase 1 - Shell and Workspace

기간 목표: 1~2주

작업:

- `/editor/v2` 셸 생성
- feature flags
- rust workspace 생성
- wasm bridge skeleton
- service extension skeleton

Acceptance Gate:

- 빈 에디터 셸과 빈 kernel bridge가 병행 구동

## 4. Phase 2 - Document / Scene Foundation

기간 목표: 3~6주

작업:

- document model
- scene graph
- node ids / serialization
- validation baseline
- snapshot model

Acceptance Gate:

- 문서 로드/저장/검증이 결정론적으로 동작

## 5. Phase 3 - Selection / Transform / History

기간 목표: 4~8주

작업:

- selection
- hit testing
- move/resize/rotate
- snapping
- history
- command batching

Acceptance Gate:

- 선택/변형/undo/redo가 안정적으로 동작

## 6. Phase 4 - Layout / Components / Tokens

기간 목표: 4~8주

작업:

- frame layout
- auto layout
- constraints
- component / instance / override
- token / variable basics

Acceptance Gate:

- 컴포넌트/인스턴스/토큰/변수가 실제 문서 편집에 사용 가능

## 7. Phase 5 - Text / Vector / Render

기간 목표: 4~10주

작업:

- text layout
- caret/selection
- vector path editing
- boolean ops gate
- render command generation
- large document render path

Acceptance Gate:

- text/vector/edit/render parity와 성능 기준 충족

## 8. Phase 6 - Builder UX Quality Pass

기간 목표: 3~6주

작업:

- canvas UX cleanup
- inspector usability
- dark/light correctness
- keyboard/mouse polish
- onboarding/modal interference 제거
- accessibility pass

Acceptance Gate:

- 핵심 편집 흐름에서 툴 자체가 방해되지 않음

## 9. Phase 7 - Collaboration Document Ops

기간 목표: 3~8주

작업:

- presence
- document ops sync
- conflict handling strategy 구현
- comment/review/version hooks

Acceptance Gate:

- 2인 협업에서 문서 파손 없이 편집 가능

## 10. Phase 8 - AI Patch Integration

기간 목표: 3~6주

작업:

- context assembler
- IR patch generator
- patch preview
- selection modify
- layout/style polish
- debug assist

Acceptance Gate:

- selection-aware edit
- page completion
- patch preview / rollback / validation 동작

## 11. Phase 9 - Runtime / Service Minimum Extension

기간 목표: 2~5주

작업:

- minimal RuntimeGraph
- minimal ServiceBinding
- preview/publish parity
- document publish snapshot
- collaboration/publish/auth 최소 연결

Acceptance Gate:

- 에디터 산출물이 preview/publish로 일관되게 이어짐

## 12. Phase 10 - Import / Compatibility

기간 목표: 2~5주

작업:

- v1 -> v2 importer
- parity checks
- migration notes

Acceptance Gate:

- 대표 v1 문서를 v2에서 읽고 비교 검증 가능

## 13. Phase 11 - Internal QA / Staging Validation

기간 목표: 2~6주

작업:

- internal dogfooding
- staging validation
- AI guided repair
- observability tuning

Acceptance Gate:

- internal QA green
- staging validation green
- block bug 밀도 감소

## 14. Phase 12 - Acceptance Gate and Default Switch

기간 목표: 1~3주

작업:

- editor acceptance gate 최종 통과
- v1 fallback 유지 확인
- v2 기본 전환 준비

Acceptance Gate:

- 신규 기본 에디터를 v2로 전환해도 운영 리스크 허용 범위 내

## 15. 병렬 트랙

### Track A. Kernel

- Rust/WASM editor kernel

### Track B. Shell/UX

- React shell
- panels
- inspector
- diagnostics

### Track C. AI

- orchestration
- IR patch generation
- validation

### Track D. Collaboration / Preview

- document ops
- preview/publish parity

### Track E. QA

- property tests
- e2e
- visual regression
- perf traces

### Track F. Release Safety

- feature flags
- route isolation
- branch isolation
- no-production-deploy policy

## 16. 필수 품질 게이트

각 phase 종료 조건은 “기능 구현”이 아니라 아래를 포함해야 합니다.

- benchmark
- regression suite
- observability
- rollback plan
- internal QA result

## 17. 절대 건너뛰면 안 되는 것

- Editor Kernel 분리
- 명시적 SceneDoc
- command -> kernel -> snapshot delta
- text/vector/render parity
- inspector/canvas 입력 안정성
- AI patch preview
- collaboration consistency

## 18. 현실적인 리스크

- 범위 폭주
- v1 호환 집착
- Rust/WASM bridge 복잡도
- text/vector 품질 마감 비용
- collaboration 충돌 처리 비용
- 실수로 `main` 푸시 후 자동 배포

대응:

- 작업 브랜치 고정
- acceptance gate 중심 진행
- 배포 전용 체크리스트
- 기본 브랜치 보호 정책

## 19. 최종 로드맵 한 줄

> v2는 우선 상용 수준 에디터를 완성하고, 그 산출물이 이후 runtime / publish / AI / service 연결로 확장될 수 있게 만드는 프로젝트다.
