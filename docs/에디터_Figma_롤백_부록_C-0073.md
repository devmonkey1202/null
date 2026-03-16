# 에디터 Figma 롤백 부록 C-0073
기준 날짜: `2026-03-14`

## 대상

이번 부록은 `Phase C / C-1 Renderer / Scale Baseline` 배치를 되돌릴 때 쓴다.

## 포함 범위

- `sceneGraph` 도입
- `runtimeInteractions` 분리
- `RuntimeSvgStage`, `RuntimeCanvasPrototypeStage` 추가
- `RuntimeRenderer`의 render mode / fallback 규칙 연결
- `AdvancedEditorCanvasOverlay` 분리
- `5k renderer benchmark fixture` 추가
- `Phase C` 진행 문서 갱신

## 롤백 파일

- `src/advanced/geom/geom.ts`
- `src/advanced/runtime/renderer.tsx`
- `src/advanced/runtime/sceneGraph.ts`
- `src/advanced/runtime/runtimeInteractions.ts`
- `src/advanced/runtime/RuntimeSvgStage.tsx`
- `src/advanced/runtime/RuntimeCanvasPrototypeStage.tsx`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/advanced/ui/AdvancedEditorCanvasOverlay.tsx`
- `tests/runtime-scene-graph.test.ts`
- `tests/runtime-renderer-benchmark.test.tsx`
- `docs/에디터_Figma_PhaseC_진행표.md`
- `docs/에디터_Figma_PhaseC_구현_준비.md`

## 롤백 절차

1. `Phase C / C-1` 이후 추가 수정이 없는지 먼저 확인한다.
2. 위 파일만 기준선 이전 상태로 되돌린다.
3. 아래 검증을 다시 돌린다.

## 롤백 후 검증

- `npx eslint src/advanced/runtime/renderer.tsx src/advanced/ui/AdvancedEditorView.tsx --quiet`
- `npx tsc --noEmit --pretty false`
- `npx vitest run tests/runtime-renderer.test.tsx tests/runtime-renderer-fixtures.test.tsx tests/runtime-renderer-mask.test.tsx`
- `npx next build`

## 메모

- 이 부록은 `Phase C` 전체 롤백이 아니라 `C-1 Renderer / Scale Baseline` 범위만 다룬다.
