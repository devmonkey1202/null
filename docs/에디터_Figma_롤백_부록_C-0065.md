# C-0065. Vector / Boolean / Mask: semantic roundtrip + multi-mask render

변경 목적:

- multi-path vector를 `NULL -> Figma -> NULL` 왕복 후에도 하나의 editable path node로 유지한다.
- single-first-mask 가정 대신 ordered mask bands를 렌더러에서 직접 해석한다.
- multiple simple mask bands를 image fallback 없이 editable 경로로 유지한다.

수정 파일:

- `src/lib/vectorSemanticRoundtrip.ts`
- `src/advanced/geom/maskSemanticModel.ts`
- `src/lib/nullToFigma.ts`
- `src/lib/figmaToNull.ts`
- `src/lib/figmaImportFidelity.ts`
- `src/advanced/runtime/renderer.tsx`
- `tests/nullToFigma.test.ts`
- `tests/mask-semantic-model.test.ts`
- `tests/runtime-renderer-mask.test.tsx`
- `tests/figma-import-fidelity.test.ts`
- `docs/에디터_Figma_PhaseA_진행표.md`
- `docs/에디터_Figma_PhaseA_구현_준비.md`

검증 방법:

- `npx eslint src/lib/vectorSemanticRoundtrip.ts src/advanced/geom/maskSemanticModel.ts src/lib/nullToFigma.ts src/lib/figmaToNull.ts src/lib/figmaImportFidelity.ts src/advanced/runtime/renderer.tsx tests/nullToFigma.test.ts tests/mask-semantic-model.test.ts tests/runtime-renderer-mask.test.tsx tests/figma-import-fidelity.test.ts --quiet`
- `npx vitest run tests/nullToFigma.test.ts tests/figma-import-fidelity.test.ts tests/mask-semantic-model.test.ts tests/runtime-renderer-mask.test.tsx tests/layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/scene-clone.test.ts tests/doc-parity.test.ts tests/figma-roundtrip.test.ts`
- `npx vitest run tests/runtime-renderer-fixtures.test.tsx`
- `npx next build`

수동 롤백 순서:

1. `src/lib/vectorSemanticRoundtrip.ts`와 `src/advanced/geom/maskSemanticModel.ts`를 제거한다.
2. `src/lib/nullToFigma.ts`에서 semantic vector wrapper export 경로를 제거하고 기존 `path -> VECTOR` 직출력 경로만 남긴다.
3. `src/lib/figmaToNull.ts`에서 semantic vector wrapper collapse import 경로를 제거하고 기존 `GROUP` import 흐름만 남긴다.
4. `src/lib/figmaImportFidelity.ts`에서 multiple mask bands 허용 규칙을 제거하고 single simple mask만 editable로 되돌린다.
5. `src/advanced/runtime/renderer.tsx`에서 mask band 해석을 제거하고 기존 `first child mask` 경로만 남긴다.
6. 관련 테스트와 진행 문서 변경을 되돌린다.

롤백 후 확인:

1. `tests/nullToFigma.test.ts`, `tests/figma-import-fidelity.test.ts`, `tests/mask-semantic-model.test.ts`, `tests/runtime-renderer-mask.test.tsx`를 제거하거나 이전 상태로 되돌린다.
2. `tests/layout.test.ts`, `tests/figmaToNull.test.ts`, `tests/figmaFileToNull.test.ts`, `tests/scene-clone.test.ts`, `tests/doc-parity.test.ts`, `tests/figma-roundtrip.test.ts`, `tests/runtime-renderer-fixtures.test.tsx`가 다시 통과하는지 확인한다.
3. `next build`가 다시 통과하는지 확인한다.
