# 에디터 Figma 롤백 부록 C-0061

주제:

- `A-1 Text Engine 5차 배치`
- rich text span 편집 UX
- text-on-path 시각 편집

수정 파일:

- `src/advanced/ui/textInspectorModel.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/text-inspector-model.test.ts`
- `docs/에디터_Figma_PhaseA_진행표.md`

검증 명령:

- `npx eslint src/advanced/ui/AdvancedEditorView.tsx src/advanced/ui/textInspectorModel.ts tests/text-inspector-model.test.ts --quiet`
- `npx vitest run tests/text-inspector-model.test.ts tests/rich-text-model.test.ts tests/text-layout.test.ts tests/figmaToNull.test.ts tests/nullToFigma.test.ts tests/runtime-renderer-fixtures.test.tsx`
- `npx next build`

수동 롤백 순서:

1. `textInspectorModel.ts`에서 `duplicateTextRange`, `buildWordTextRanges`, `buildParagraphTextRanges`, `getTextRangePreview`, `nudgeTextPathOffset`, `flipTextPathSide`를 제거한다.
2. `AdvancedEditorView.tsx`에서 rich range `Words`, `Paragraphs`, `Duplicate`, preview snippet UI를 제거한다.
3. `AdvancedEditorView.tsx`에서 text-on-path preview SVG, offset range slider, `-10/+10`, `Flip Side` 버튼을 제거한다.
4. `tests/text-inspector-model.test.ts`의 quick generation / duplicate / path control 테스트를 제거한다.
5. `에디터_Figma_PhaseA_진행표.md`에서 `A-1 Text Engine 5차 배치 완료`와 관련 체크 항목을 이전 상태로 되돌린다.

롤백 후 확인:

1. text inspector가 4차 배치 상태로 돌아왔는지 확인한다.
2. `tests/text-inspector-model.test.ts`와 텍스트 관련 회귀가 다시 통과하는지 확인한다.
3. `npx next build`가 다시 통과하는지 확인한다.
