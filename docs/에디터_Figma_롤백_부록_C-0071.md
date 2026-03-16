# 에디터 Figma 롤백 부록 C-0071
기준 날짜: `2026-03-14`

## 범위

이번 배치에서 추가된 변경:

1. plugin approval / request / save flow
2. widget store / plugin store share URL / detail page / version flow
3. org scope policy / permission / audit wiring
4. `Phase B` 완료 문서 반영

## 롤백 대상 파일

- `src/advanced/ui/storeGovernanceModel.ts`
- `src/lib/store-governance.ts`
- `src/app/api/app/[pageId]/store-governance/route.ts`
- `src/app/plugins/store/[storeId]/page.tsx`
- `src/app/widgets/store/[storeId]/page.tsx`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/store-governance-model.test.ts`
- `docs/에디터_Figma_PhaseB_진행표.md`
- `docs/에디터_Figma_PhaseB_구현_준비.md`

## 롤백 절차

1. `src/advanced/ui/storeGovernanceModel.ts`, `src/lib/store-governance.ts`, `src/app/api/app/[pageId]/store-governance/route.ts`를 제거한다.
2. `src/app/plugins/store/[storeId]/page.tsx`, `src/app/widgets/store/[storeId]/page.tsx`를 제거한다.
3. `src/advanced/ui/AdvancedEditorView.tsx`에서 store governance state, fetch effect, approval/save/policy/audit UI를 제거한다.
4. `tests/store-governance-model.test.ts`를 제거한다.
5. `docs/에디터_Figma_PhaseB_진행표.md`, `docs/에디터_Figma_PhaseB_구현_준비.md`를 직전 상태로 되돌린다.

## 롤백 후 확인

```bash
npx eslint src/advanced/ui/storeGovernanceModel.ts src/lib/store-governance.ts src/app/api/app/[pageId]/store-governance/route.ts src/app/plugins/store/[storeId]/page.tsx src/app/widgets/store/[storeId]/page.tsx src/advanced/ui/AdvancedEditorView.tsx tests/store-governance-model.test.ts --quiet
npx vitest run tests/store-governance-model.test.ts tests/store-resources.test.ts tests/branch-review.test.ts
npx next build
```

주의:

- 현재 `next build`는 타입 검증을 건너뛴다.
- 이번 배치로 `Phase B` 문서 진행도는 `24 / 24`가 된다.
