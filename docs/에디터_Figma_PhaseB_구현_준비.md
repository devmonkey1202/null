# 에디터 Figma Phase B 구현 준비
기준 날짜: `2026-03-14`

## 상태

- Phase B 진행도: `24 / 24`
- 현재 상태:
  - `Phase A 완료`
  - `B-1 Library / Design System Distribution 완료`
  - `B-2 Dev Mode / Handoff 완료`
  - `B-3 Branch / Compare / Review 완료`
  - `B-4 Plugin / Widget / Resource Hub 완료`
- 목표:
  - `Dev Mode + Design System + Resource Hub`를 Figma 기준으로 실제 사용 가능한 수준까지 닫는다.
  - `Phase B 완료`는 Figma와 겹치는 비-인프라 editor 기능 잔여 범위를 `0`으로 만드는 상태를 뜻한다.

## 범위

이번 Phase B에서 반드시 끝내야 하는 것:

1. library publish / consume / update 실구현
2. Dev Mode를 inspect 보조가 아니라 handoff 계층으로 승격
3. branch / compare / review / merge 흐름 추가
4. plugin store를 community workflow 수준으로 고도화
5. widget store 추가
6. plugin + widget + library를 하나의 resource hub로 통합

이번 Phase B에서 하지 않는 것:

- renderer 전환
- CRDT multiplayer
- direct `.fig` 바이너리 호환 심화
- 대문서 성능 최적화
- 전체 타입 게이트 최종 복구

위 항목은 `Phase C` 범위다.

추가 규칙:

- `나중에 붙일 handoff`, `나중에 넣을 widget store`, `나중에 연결할 library update`를 허용하지 않는다.
- Figma와 겹치는 editor/product 기능인데 renderer, CRDT, direct `.fig`, type gate가 아니라면 모두 Phase B 안에서 닫는다.
- 구현 중 새로 발견된 잔여 기능이 있으면 `Phase B 미완료`로 유지한다.

## 우선 순서

1. `B-1 Library / Design System Distribution`
2. `B-2 Dev Mode / Handoff`
3. `B-3 Branch / Compare / Review`
4. `B-4 Plugin / Widget / Resource Hub`

## 실행 범위

### B-1. Library / Design System Distribution

- [x] library publish payload 정의
- [x] library consume / install 흐름
- [x] library update / dependency diff
- [x] component / variant / property sync
- [x] style / variable / mode sync
- [x] library usage tracking / update prompt

주요 파일:

- `src/advanced/doc/scene.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/advanced/ui/designLibrary.ts`
- `src/lib/figmaToNull.ts`
- `src/lib/nullToFigma.ts`

### B-2. Dev Mode / Handoff

- [x] compare changes 화면
- [x] code-linked handoff registry
- [x] component playground
- [x] ready-for-dev / annotation / measurement 보강
- [x] token / variant / property inspect 심화
- [x] codegen / export spec parity 검증

주요 파일:

- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/advanced/ui/devHandoff.ts`
- `src/advanced/ui/devCodegen.ts`
- `src/advanced/ui/exportPipeline.ts`
- `src/advanced/doc/scene.ts`
- `src/app/api/pages/[pageId]/versions/[versionId]/route.ts`

### B-3. Branch / Compare / Review

- [x] branch 문서 모델
- [x] branch diff / compare viewer
- [x] review 상태 / 승인 흐름
- [x] merge entrypoint
- [x] conflict detection / resolution
- [x] branch / review 헬퍼 테스트

주요 파일:

- `src/advanced/doc/scene.ts`
- `src/advanced/ui/branchReview.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/branch-review.test.ts`

### B-4. Plugin / Widget / Resource Hub

- [x] plugin catalog search / filter / detail
- [x] plugin approval / request / save flow
- [x] widget store listing / install / update
- [x] resource hub 통합 탐색
- [x] share URL / detail page / version flow
- [x] org policy / permission / audit wiring

주요 파일:

- `src/lib/plugin-store.ts`
- `src/lib/widget-store.ts`
- `src/lib/store-governance.ts`
- `src/app/api/plugins/store/route.ts`
- `src/app/api/widgets/store/route.ts`
- `src/app/api/app/[pageId]/store-governance/route.ts`
- `src/app/plugins/store/[storeId]/page.tsx`
- `src/app/widgets/store/[storeId]/page.tsx`
- `src/advanced/ui/resourceHub.ts`
- `src/advanced/ui/storeGovernanceModel.ts`
- `src/advanced/ui/widgetStore.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/store-resources.test.ts`
- `tests/store-governance-model.test.ts`

## 검증 규칙

- 정적 검증: `npx eslint <touched files> --quiet`
- 기능 검증: `npx vitest run <관련 테스트>`
- 빌드 검증: `npx next build`
- 문서 검증: 진행표와 롤백 부록 동시 갱신

## 완료 판정

아래를 모두 만족해야 `Phase B 완료`로 본다.

- library, Dev Mode, branch/review, resource hub가 전부 실제 UI와 데이터 흐름으로 닫힘
- plugin store와 widget store가 같은 resource 체계 안에서 동작함
- compare / handoff / publish / update 흐름이 fixture와 테스트로 재현 가능함
- `Phase B 완료 후에도 추가 구현이 필요한 Figma-overlapping 비-인프라 기능이 남아 있다`는 문장이 거짓이어야 함
