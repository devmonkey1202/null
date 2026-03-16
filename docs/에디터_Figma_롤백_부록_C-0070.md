# 에디터 Figma 롤백 부록 C-0070
기준 날짜: `2026-03-14`

## 범위

이번 배치에서 추가된 변경:

1. `B-3 Branch / Compare / Review`
2. `B-4 Plugin / Widget / Resource Hub` 1차
3. `Phase B` 진행 문서 UTF-8 재정리

## 롤백 대상 파일

### B-3

- `src/advanced/doc/scene.ts`
- `src/advanced/ui/branchReview.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/branch-review.test.ts`

### B-4

- `src/lib/plugin-store.ts`
- `src/lib/widget-store.ts`
- `src/app/api/plugins/store/route.ts`
- `src/app/api/widgets/store/route.ts`
- `src/advanced/ui/resourceHub.ts`
- `src/advanced/ui/widgetStore.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/store-resources.test.ts`

### 문서

- `docs/에디터_Figma_PhaseB_진행표.md`
- `docs/에디터_Figma_PhaseB_구현_준비.md`

## 롤백 절차

### B-3만 되돌리기

1. `src/advanced/ui/branchReview.ts`를 제거한다.
2. `src/advanced/doc/scene.ts`에서 `branches`, `branchReviews`, 관련 타입을 제거한다.
3. `src/advanced/ui/AdvancedEditorView.tsx`에서 branch compare/review UI, state, callback을 제거한다.
4. `tests/branch-review.test.ts`를 제거한다.

### B-4만 되돌리기

1. `src/lib/widget-store.ts`, `src/advanced/ui/resourceHub.ts`, `src/advanced/ui/widgetStore.ts`, `src/app/api/widgets/store/route.ts`를 제거한다.
2. `src/lib/plugin-store.ts`에서 search/detail metadata 확장을 제거한다.
3. `src/app/api/plugins/store/route.ts`를 단순 catalog 응답으로 되돌린다.
4. `src/advanced/ui/AdvancedEditorView.tsx`에서 plugin store / widget store / resource hub UI와 관련 state, effect, callback을 제거한다.
5. `tests/store-resources.test.ts`를 제거한다.

### 문서만 되돌리기

1. `docs/에디터_Figma_PhaseB_진행표.md`와 `docs/에디터_Figma_PhaseB_구현_준비.md`를 이전 버전으로 되돌린다.

## 롤백 후 확인

아래 검증이 모두 통과해야 한다.

```bash
npx eslint src/advanced/doc/scene.ts src/advanced/ui/AdvancedEditorView.tsx src/advanced/ui/branchReview.ts src/lib/plugin-store.ts src/lib/widget-store.ts src/advanced/ui/resourceHub.ts src/advanced/ui/widgetStore.ts tests/branch-review.test.ts tests/store-resources.test.ts --quiet
npx vitest run tests/branch-review.test.ts tests/store-resources.test.ts tests/design-library.test.ts tests/dev-handoff.test.ts
npx next build
```

주의:

- 현재 `next build`는 타입 검증을 건너뛴다.
- `Phase B` 문서 진행도는 이 부록 기준 변경을 반영한다.
