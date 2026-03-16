# C-0069. Phase B batch 1: library distribution + dev handoff

변경 목적:

- `B-1 Library / Design System Distribution`의 실제 publish / consume / update / usage 흐름을 에디터에 연결한다.
- `B-2 Dev Mode / Handoff`의 compare changes, code-linked handoff, component playground, ready-for-dev 흐름을 실제 패널과 데이터 모델에 연결한다.
- Phase B 진행표를 현재 구현 상태와 동일하게 맞춘다.

수정 파일:

- `src/advanced/doc/scene.ts`
- `src/advanced/ui/designLibrary.ts`
- `src/advanced/ui/devHandoff.ts`
- `src/advanced/ui/devCodegen.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/app/api/pages/[pageId]/versions/[versionId]/route.ts`
- `tests/design-library.test.ts`
- `tests/dev-codegen.test.ts`
- `tests/dev-handoff.test.ts`
- `docs/에디터_Figma_PhaseB_구현_준비.md`
- `docs/에디터_Figma_PhaseB_진행표.md`

검증 방법:

- `npx eslint src/advanced/doc/scene.ts src/advanced/ui/designLibrary.ts src/advanced/ui/devHandoff.ts src/advanced/ui/devCodegen.ts src/advanced/ui/AdvancedEditorView.tsx src/app/api/pages/[pageId]/versions/[versionId]/route.ts tests/design-library.test.ts tests/dev-codegen.test.ts tests/dev-handoff.test.ts --quiet`
- `npx vitest run tests/design-library.test.ts tests/dev-codegen.test.ts tests/dev-handoff.test.ts`
- `npx vitest run tests/scene-clone.test.ts tests/token-roundtrip.test.ts tests/design-library.test.ts tests/dev-codegen.test.ts tests/dev-handoff.test.ts`
- `npx next build`

수동 롤백 순서:

1. `src/advanced/ui/designLibrary.ts`를 제거하고 `src/advanced/ui/AdvancedEditorView.tsx`에서 library publish / consume / update UI와 관련 import, state, callback을 제거한다.
2. `src/advanced/ui/devHandoff.ts`를 제거하고 `src/advanced/ui/AdvancedEditorView.tsx`에서 ready-for-dev, annotation, code-linked handoff, compare changes, component playground UI와 callback을 제거한다.
3. `src/advanced/doc/scene.ts`에서 `Node.dev`, `NodeOverrides.dev`, `DevAnnotation`, `DevCodeLink`, `NodeDevHandoff` 관련 타입과 clone 경로를 제거한다.
4. `src/advanced/ui/devCodegen.ts`에서 `handoff` payload와 comment 출력 경로를 제거한다.
5. `src/app/api/pages/[pageId]/versions/[versionId]/route.ts`에서 `include=content` 지원을 제거한다.
6. `tests/dev-handoff.test.ts`를 제거하고, 필요하면 `tests/dev-codegen.test.ts`의 handoff comment 기대값을 이전 상태로 되돌린다.
7. `docs/에디터_Figma_PhaseB_구현_준비.md`, `docs/에디터_Figma_PhaseB_진행표.md`의 체크 상태를 되돌린다.

롤백 후 확인:

1. `npx vitest run tests/design-library.test.ts tests/dev-codegen.test.ts tests/scene-clone.test.ts tests/token-roundtrip.test.ts`
2. `npx next build`
3. Dev 패널에서 library publish / consume / update, ready-for-dev, compare changes, component playground 카드가 제거되었는지 확인한다.
