# C-0064. Auto Layout / Constraints: Grid Flow + Layout Guide Priority

변경 목적:

- `grid flow`를 NULL 레이아웃 엔진에 실제로 연결한다.
- `layout guide + constraints`를 stretch guide 우선 규칙으로 해석한다.
- Figma `GRID` import / export / roundtrip을 추가한다.
- editor inspector에서 grid layout / grid child / guide alignment를 직접 편집할 수 있게 한다.

수정 파일:

- `src/advanced/doc/scene.ts`
- `src/advanced/layout/autoLayoutGrid.ts`
- `src/advanced/layout/constraintGuideResolution.ts`
- `src/advanced/layout/engine.ts`
- `src/advanced/ui/layoutInspectorModel.ts`
- `src/advanced/ui/constraintPresets.ts`
- `src/advanced/ui/AdvancedEditor.constants.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/lib/figma.ts`
- `src/lib/figmaToNull.ts`
- `src/lib/nullToFigma.ts`
- `tests/constraint-presets.test.ts`
- `tests/layout.test.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`
- `tests/nullToFigma.test.ts`
- `tests/scene-clone.test.ts`
- `tests/doc-parity.ts`
- `tests/figma-roundtrip.test.ts`
- `docs/에디터_Figma_PhaseA_진행표.md`
- `docs/에디터_Figma_PhaseA_구현_준비.md`

검증 방법:

- `npx eslint src/advanced/ui/AdvancedEditorView.tsx src/advanced/ui/constraintPresets.ts src/advanced/layout/autoLayoutGrid.ts src/advanced/layout/constraintGuideResolution.ts src/advanced/layout/engine.ts src/lib/figmaToNull.ts src/lib/nullToFigma.ts tests/constraint-presets.test.ts tests/layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/nullToFigma.test.ts tests/scene-clone.test.ts tests/doc-parity.ts tests/figma-roundtrip.test.ts --quiet`
- `npx vitest run tests/constraint-presets.test.ts tests/layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/nullToFigma.test.ts tests/scene-clone.test.ts tests/doc-parity.test.ts tests/figma-roundtrip.test.ts`
- `npx vitest run tests/runtime-renderer-fixtures.test.tsx`
- `npx next build`

수동 롤백 절차:

1. `src/advanced/layout/autoLayoutGrid.ts`와 `src/advanced/layout/constraintGuideResolution.ts`를 제거한다.
2. `src/advanced/layout/engine.ts`에서 `applyGridLayout(...)`와 `resolveGuideAwareConstraints(...)` 호출을 제거하고 이전 auto-layout / constraints 경로만 남긴다.
3. `src/lib/figma.ts`, `src/lib/figmaToNull.ts`, `src/lib/nullToFigma.ts`에서 grid 관련 Figma 필드와 변환 로직을 제거한다.
4. `src/advanced/ui/AdvancedEditorView.tsx`에서 grid mode selector, grid layout inspector, grid child inspector, grid parent warning, guide alignment editor를 제거한다.
5. `src/advanced/doc/scene.ts`에서 `gridChild`, grid layout track clone 보강을 되돌린다.
6. 관련 테스트와 진행 문서에서 이번 배치 항목을 제거한다.

롤백 후 확인:

1. `tests/layout.test.ts`에서 grid / guide 관련 테스트를 제외한 기존 회귀가 다시 통과하는지 확인한다.
2. `tests/figmaToNull.test.ts`, `tests/nullToFigma.test.ts`, `tests/figmaFileToNull.test.ts`, `tests/figma-roundtrip.test.ts`의 grid 관련 테스트를 제거한 상태에서 나머지가 통과하는지 확인한다.
3. `next build`가 다시 통과하는지 확인한다.
