# 에디터 Figma 롤백 부록 C-0060

주제:

- `A-1 Text Engine 4차 배치`
- paragraph spacing
- text-on-path preset editing
- representative text fixture parity

수정 파일:

- `src/advanced/doc/scene.ts`
- `src/lib/figma.ts`
- `src/lib/figmaToNull.ts`
- `src/lib/nullToFigma.ts`
- `src/advanced/geom/richTextModel.ts`
- `src/advanced/geom/textLayout.ts`
- `src/advanced/runtime/renderer.tsx`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/advanced/ui/textInspectorModel.ts`
- `tests/text-layout.test.ts`
- `tests/rich-text-model.test.ts`
- `tests/figmaToNull.test.ts`
- `tests/nullToFigma.test.ts`
- `tests/figma-fixtures.ts`
- `tests/runtime-renderer-fixtures.test.tsx`
- `tests/__snapshots__/runtime-renderer-fixtures.test.tsx.snap`
- `docs/에디터_Figma_PhaseA_진행표.md`

검증 명령:

- `npx eslint src/advanced/doc/scene.ts src/lib/figma.ts src/lib/figmaToNull.ts src/lib/nullToFigma.ts src/advanced/geom/richTextModel.ts src/advanced/geom/textLayout.ts src/advanced/runtime/renderer.tsx src/advanced/ui/AdvancedEditorView.tsx src/advanced/ui/textInspectorModel.ts tests/text-layout.test.ts tests/rich-text-model.test.ts tests/figmaToNull.test.ts tests/nullToFigma.test.ts tests/figma-fixtures.ts tests/runtime-renderer-fixtures.test.tsx --quiet`
- `npx vitest run tests/text-layout.test.ts tests/rich-text-model.test.ts tests/text-inspector-model.test.ts tests/figmaToNull.test.ts tests/nullToFigma.test.ts tests/runtime-renderer-fixtures.test.tsx -u`
- `npx next build`

수동 롤백 순서:

1. `scene.ts`에서 `TextStyle.paragraphSpacing`과 `DEFAULT_TEXT_STYLE.paragraphSpacing`을 제거한다.
2. `figma.ts`, `figmaToNull.ts`, `nullToFigma.ts`에서 `paragraphSpacing` import/export 경로를 제거한다.
3. `richTextModel.ts`의 `splitRichTextRunsByParagraph`를 제거한다.
4. `textLayout.ts`의 `getParagraphSpacing`, `getRenderedTextLines`와 paragraph spacing height 계산을 제거한다.
5. `renderer.tsx`, `AdvancedEditorView.tsx`에서 paragraph spacing 기반 paragraph 렌더 경로를 제거하고 기존 line-based 렌더로 되돌린다.
6. `AdvancedEditorView.tsx`에서 text-on-path preset 버튼과 paragraph spacing inspector 입력을 제거한다.
7. `tests/figma-fixtures.ts`의 `text-rich` fixture와 snapshot을 제거한다.
8. 관련 테스트 기대값을 이전 상태로 되돌린다.

롤백 후 확인:

1. `tests/text-layout.test.ts`, `tests/rich-text-model.test.ts`, `tests/figmaToNull.test.ts`, `tests/nullToFigma.test.ts`가 다시 통과하는지 확인한다.
2. `tests/runtime-renderer-fixtures.test.tsx` snapshot이 이전 상태와 맞는지 확인한다.
3. `npx next build`가 다시 통과하는지 확인한다.
