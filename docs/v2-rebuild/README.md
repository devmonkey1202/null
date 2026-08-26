# NULL v2 Rebuild Handoff

작성일: 2026-05-21  
기준 베이스 브랜치: `main`  
기준 커밋: `6a7a35ff88932c69d563de4f3ffcc1c28c3fc8d1`

이 문서 묶음은 **NULL v2 재구축 착수 문서**입니다.

문서를 읽을 때 가장 먼저 구분해야 할 것은 아래 두 층입니다.

## 1. 최종 목표

NULL v2의 최종 목적은 장기적으로 아래까지 확장 가능한 구조를 갖는 것입니다.

- 앱 플랫폼 전체
- 서비스 빌더 전체
- 백엔드 도메인 전체
- 런타임/배포/AI 수정/서비스 연결까지 이어지는 문서 모델

즉, 최종적으로는 단순 디자인 툴이 아니라 **실행 가능한 문서 모델을 가진 제품 기반**을 목표로 합니다.

## 2. 현재 구현 1순위

하지만 **지금 당장 구현을 시작할 우선순위는 플랫폼 전체가 아니라 상용 수준 에디터 완성**입니다.

현재 Phase 1의 중심은 아래 네 가지입니다.

- Editor Kernel
- Editor UX
- Editor Performance
- Editor Quality Gate

Runtime / Service / AI는 이번 단계에서 **에디터 산출물이 이후 preview / publish / AI patch / service binding으로 확장될 수 있게 하는 최소 연결 계약**으로만 유지합니다.
AI는 이 단계부터 **외부 상용 API가 아니라 self-hosted inference 기반**으로 정의합니다.

## 3. 이번 문서 묶음의 목적

이 문서 묶음의 목적은 세 가지입니다.

1. v1의 실제 상태를 문서가 아니라 코드/실행 기준으로 고정
2. v2에서 무엇을 먼저 만들고 무엇을 나중으로 미룰지 구조적으로 정리
3. 다른 채팅/다른 개발 세션으로 넘어가도 즉시 착수 가능하게 만들기

## 4. 읽는 순서

현재 구현 우선순위 기준 읽기 순서는 아래와 같습니다.

1. [01-current-state-audit.md](./01-current-state-audit.md)
2. [10-v2-editor-spec.md](./10-v2-editor-spec.md)
3. [21-v2-rendering-text-vector-stack.md](./21-v2-rendering-text-vector-stack.md)
4. [20-v2-design-system-and-ux-spec.md](./20-v2-design-system-and-ux-spec.md)
5. [13-v2-performance-and-slo-spec.md](./13-v2-performance-and-slo-spec.md)
6. [15-v2-quality-gates-spec.md](./15-v2-quality-gates-spec.md)
7. [09-v2-contracts-and-interfaces.md](./09-v2-contracts-and-interfaces.md)
8. [03-v2-system-architecture.md](./03-v2-system-architecture.md)
9. [02-v2-product-definition.md](./02-v2-product-definition.md)
10. [07-v2-delivery-roadmap.md](./07-v2-delivery-roadmap.md)
11. [05-v2-ai-system.md](./05-v2-ai-system.md)
12. [12-v2-service-kernel-spec.md](./12-v2-service-kernel-spec.md)
13. [17-v2-websocket-event-catalog.md](./17-v2-websocket-event-catalog.md)
14. [18-v2-ai-patch-schema.md](./18-v2-ai-patch-schema.md)
15. [19-v2-rust-crate-api-map.md](./19-v2-rust-crate-api-map.md)
16. [22-v2-ops-topology-and-runbooks.md](./22-v2-ops-topology-and-runbooks.md)
17. [23-v2-cross-validation-report.md](./23-v2-cross-validation-report.md)
18. [24-v2-ai-serving-architecture.md](./24-v2-ai-serving-architecture.md)
19. [25-v2-ai-data-and-eval-spec.md](./25-v2-ai-data-and-eval-spec.md)
20. [26-v2-ai-model-lifecycle.md](./26-v2-ai-model-lifecycle.md)
21. [27-v2-ai-safety-and-approval-spec.md](./27-v2-ai-safety-and-approval-spec.md)
22. [08-next-chat-start-here.md](./08-next-chat-start-here.md)

## 5. 보조 / 확장 참조 문서

아래 문서들은 현재 에디터 완성의 직접 구현보다 한 단계 바깥에 있는 **확장 / 연결 / 운영 참조 문서**입니다.

- [04-v2-identity-and-data-model.md](./04-v2-identity-and-data-model.md)
- [06-v2-migration-rollout.md](./06-v2-migration-rollout.md)
- [11-v2-runtime-spec.md](./11-v2-runtime-spec.md)
- [12-v2-service-kernel-spec.md](./12-v2-service-kernel-spec.md)
- [14-v2-plugin-widget-sdk-spec.md](./14-v2-plugin-widget-sdk-spec.md)
- [16-v2-prisma-ddl-draft.md](./16-v2-prisma-ddl-draft.md)
- [17-v2-websocket-event-catalog.md](./17-v2-websocket-event-catalog.md)
- [18-v2-ai-patch-schema.md](./18-v2-ai-patch-schema.md)
- [19-v2-rust-crate-api-map.md](./19-v2-rust-crate-api-map.md)
- [22-v2-ops-topology-and-runbooks.md](./22-v2-ops-topology-and-runbooks.md)
- [24-v2-ai-serving-architecture.md](./24-v2-ai-serving-architecture.md)
- [25-v2-ai-data-and-eval-spec.md](./25-v2-ai-data-and-eval-spec.md)
- [26-v2-ai-model-lifecycle.md](./26-v2-ai-model-lifecycle.md)
- [27-v2-ai-safety-and-approval-spec.md](./27-v2-ai-safety-and-approval-spec.md)

이 문서들은 삭제 대상이 아닙니다.  
다만 **현재 구현 깊이의 중심은 에디터**이고, 이 문서들은 그 에디터 결과물이 확장 가능한 구조를 갖기 위한 보조 계층입니다.

## 6. v2의 현재 결론

- v1 보수만으로는 목표 품질에 도달하기 어렵습니다.
- v2는 `React/Next shell + Rust/WASM Editor Kernel + 최소 Runtime/Service/AI 연결 계약` 구조로 다시 세웁니다.
- AI는 외부 상용 inference API가 아니라 `self-hosted inference + structured IR patch` 구조로 설계합니다.
- 장기적으로는 앱 플랫폼 전체로 확장될 수 있어야 하지만, 현재 구현은 **Editor-first, not Editor-only** 원칙으로 갑니다.

## 7. 운영 보호 원칙

- 기존 v1 경로 유지
- 기존 기본 에디터/기본 퍼블릭 경로 유지
- 기존 서비스에 영향 주는 변경 금지
- 불필요한 Vercel 배포 금지
- GitHub 업데이트는 `main`이 아니라 별도 작업 브랜치에서 진행

권장 작업 브랜치:

- `v2-rebuild`

현재 레포는 Vercel 프로젝트와 연결돼 있으므로 `main` 직접 푸시는 자동 배포로 이어질 수 있습니다.

## 8. 현재 워킹트리 메모

현재 로컬 워킹트리에는 v1 관련 조사/완화 작업 흔적이 남아 있습니다.

- 수정됨: `src/advanced/runtime/player.tsx`
- 수정됨: `src/components/work-view.tsx`
- 미추적: `.logs/`
- 미추적: `artifacts/`

이 변경은 v2 문서 작업과 별개입니다.  
정리/보존 여부를 분리해서 다뤄야 합니다.

## 9. 현재 구현 상태

현재 `v2-rebuild`에는 다음 기반 코드가 구현돼 있습니다.

- React/Next v2 editor shell과 독립 `/editor/v2` 경로
- Rust workspace와 실제 browser WASM bridge
- SceneDoc load/query/validation 및 command 기반 변경
- selection, hit test, move, rotate, resize, align, distribute, snapping, guide, ruler, history
- auto layout, group, component/instance, rich-text range 기초
- Unicode grapheme/line-break/caret geometry를 계산하는 `kernel-text` Phase 1
- Playwright 기반 실제 Rust/WASM 편집 흐름 검증

아직 상용 수준 완료로 간주할 수 없는 핵심 범위:

- 실제 폰트 파일 registry와 `rustybuzz` shaping
- glyph raster/atlas와 GPU render list 기반 캔버스
- 완성형 vector boolean/tessellation
- editor collaboration document ops
- 대규모 문서 benchmark와 memory profiling
- autosave/version persistence, staging validation, acceptance gate

따라서 현재 상태는 **실제 v2 구현 진행 중**이며 **제품 완성이나 교체 준비 완료 상태는 아닙니다.**

## 10. 한 줄 요약

> NULL v2의 최종 목적은 더 넓은 앱 플랫폼으로 확장 가능한 구조를 갖는 것이지만,  
> 현재 구현의 1순위는 상용 수준 에디터 완성이다.

## 11. `main` Reflect Conditions

`v2-rebuild`의 변경을 `main`에 반영하는 조건은 아래를 모두 만족해야 합니다.

1. Editor Kernel 핵심 축이 내부 QA 기준으로 녹색일 것
   - selection / move / rotate / resize
   - snapping / guides / rulers
   - text editing
   - vector path editing
   - component / instance 기본 흐름
2. `cargo test`, `build:v2:editor-wasm`, `verify:types`가 안정적으로 통과할 것
3. v2 editor shell이 기본 작업 흐름에서 noop fallback 없이도 사용 가능한 수준일 것
4. editor 성능 기준과 quality gate가 staging에서 확인될 것
5. v1 경로와 충돌하지 않는 전환 계획이 준비될 것
6. Vercel production 자동 배포 조건을 통제할 것

그 전까지는:
- GitHub 최신 작업은 `v2-rebuild` 브랜치에서 계속 누적
- `main`은 의도적으로 최신화하지 않음
- GitHub 메인 화면이 오래돼 보이는 것은 정상
