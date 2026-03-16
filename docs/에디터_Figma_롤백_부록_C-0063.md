# C-0063. Auto Layout / Constraints: Ignore Auto Layout

목적:

- auto-layout 부모 안에서 특정 자식을 흐름에서 제외하는 `Ignore Auto Layout`을 NULL 문서 모델과 엔진에 추가한다.
- Figma `layoutPositioning: "ABSOLUTE"`와 NULL `layoutPositioning: "absolute"`를 왕복 가능하게 만든다.
- absolute child는 auto-layout flow / hug 계산에서 제외하고, parent resize 시 constraints를 다시 사용할 수 있게 만든다.

수정 파일:

- `src/advanced/doc/scene.ts`
- `src/advanced/layout/engine.ts`
- `src/advanced/ui/constraintPresets.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/lib/figma.ts`
- `src/lib/figmaToNull.ts`
- `src/lib/nullToFigma.ts`
- `tests/layout.test.ts`
- `tests/constraint-presets.test.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`
- `tests/nullToFigma.test.ts`
- `tests/scene-clone.test.ts`
- `tests/doc-parity.ts`
- `docs/에디터_Figma_PhaseA_진행표.md`
- `docs/에디터_Figma_PhaseA_구현_준비.md`

검증:

- `npx eslint src/advanced/doc/scene.ts src/advanced/layout/engine.ts src/advanced/ui/constraintPresets.ts src/advanced/ui/AdvancedEditorView.tsx src/lib/figma.ts src/lib/figmaToNull.ts src/lib/nullToFigma.ts tests/layout.test.ts tests/constraint-presets.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/nullToFigma.test.ts tests/scene-clone.test.ts tests/doc-parity.ts --quiet`
- `npx vitest run tests/layout.test.ts tests/constraint-presets.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/nullToFigma.test.ts tests/scene-clone.test.ts`
- `npx next build`

수동 롤백 순서:

1. `scene.ts`에서 `layoutPositioning` 타입과 clone 경로를 제거한다.
2. `engine.ts`에서 absolute child 필터와 auto-layout 부모의 constraint 예외 처리를 제거한다.
3. `figma.ts`, `figmaToNull.ts`, `nullToFigma.ts`에서 `layoutPositioning` import/export 매핑을 제거한다.
4. `constraintPresets.ts`, `AdvancedEditorView.tsx`에서 Ignore Auto Layout 토글과 constraint 편집 예외를 제거한다.
5. 관련 테스트와 진행 문서 갱신을 되돌린다.

롤백 후 확인:

1. auto-layout children이 다시 모두 flow에 참여하는지 확인한다.
2. `tests/layout.test.ts`, `tests/figmaToNull.test.ts`, `tests/nullToFigma.test.ts`가 다시 통과하는지 확인한다.
3. `next build`가 다시 통과하는지 확인한다.
