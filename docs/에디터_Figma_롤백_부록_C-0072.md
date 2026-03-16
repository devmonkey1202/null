# 에디터 Figma 롤백 부록 C-0072
기준 날짜: `2026-03-14`

## 대상

이번 부록은 `Phase C / C-4 Type Gate` 1차 복구 작업을 되돌릴 때 쓴다.

## 포함 범위

- `next.config.ts`의 `ignoreBuildErrors` 제거
- `tsconfig.json`의 `e2e`, `tmp_*` 제외
- `scene.ts` 문서 모델 필드 보정
- editor / figma import-export / prototype interop 타입 정리
- 테스트 타입 보정과 `tests/test-globals.d.ts`
- `Phase C` 진행 문서 UTF-8 재작성

## 롤백 파일

- `next.config.ts`
- `tsconfig.json`
- `src/advanced/doc/scene.ts`
- `src/advanced/prototype/prototypeFlow.ts`
- `src/advanced/ui/AdvancedEditor.constants.ts`
- `src/advanced/ui/AdvancedEditor.types.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/advanced/ui/devHandoff.ts`
- `src/advanced/ui/exportPipeline.ts`
- `src/advanced/ui/tokenRoundtrip.ts`
- `src/lib/api-handler.ts`
- `src/lib/commerce.ts`
- `src/lib/connectors.ts`
- `src/lib/figmaToNull.ts`
- `src/lib/nullToFigma.ts`
- `src/lib/prototypeFigmaInterop.ts`
- `src/components/error-boundary.tsx`
- `src/app/api/ops/cache/purge/route.ts`
- `src/app/api/pages/[pageId]/deploy/route.ts`
- `src/app/api/pages/[pageId]/search/route.ts`
- `tests/test-globals.d.ts`
- `tests/commerce.test.ts`
- `tests/data-binding.test.ts`
- `tests/nullToFigma.test.ts`
- `tests/relations.test.ts`
- `tests/runtime-renderer.test.tsx`
- `tests/scene-clone.test.ts`
- `docs/에디터_Figma_PhaseC_진행표.md`
- `docs/에디터_Figma_PhaseC_구현_준비.md`

## 롤백 절차

1. `Phase C / C-4` 이후 추가 수정이 없는지 먼저 확인한다.
2. 위 파일만 기준으로 되돌린다.
3. 아래 검증을 다시 돌린다.

## 롤백 후 검증

- `npx eslint ... --quiet`
- `npx tsc --noEmit --pretty false`
- `npx next build`

## 메모

- 이 부록은 `Phase C` 전체 롤백이 아니라 `Type Gate 1차 복구` 범위만 다룬다.
