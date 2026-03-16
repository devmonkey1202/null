# C-0066. Prototype export + roundtrip finalization

변경 목적:

- Figma 공식 `interactions`와 `flowStartingPoints` 기준으로 prototype export를 연결한다.
- `NULL -> Figma -> NULL` 왕복 시 richer action 데이터를 `sharedPluginData.NULL.prototype`로 보존한다.
- 외부 Figma 파일의 공식 interaction schema를 NULL prototype 모델로 import한다.

수정 파일:

- `src/lib/figma.ts`
- `src/lib/prototypeFigmaInterop.ts`
- `src/lib/nullToFigma.ts`
- `src/lib/figmaToNull.ts`
- `tests/nullToFigma.test.ts`
- `tests/figmaToNull.test.ts`
- `docs/에디터_Figma_PhaseA_진행표.md`
- `docs/에디터_Figma_PhaseA_구현_준비.md`

검증 방법:

- `npx eslint src/lib/figma.ts src/lib/prototypeFigmaInterop.ts src/lib/nullToFigma.ts src/lib/figmaToNull.ts tests/nullToFigma.test.ts tests/figmaToNull.test.ts --quiet`
- `npx vitest run tests/nullToFigma.test.ts tests/figmaToNull.test.ts tests/figma-roundtrip.test.ts tests/prototypePlayback.test.ts tests/prototype-flow.test.ts tests/prototype-motion.test.ts tests/runtime-renderer-fixtures.test.tsx`
- `npx next build`

수동 롤백 순서:

1. `src/lib/prototypeFigmaInterop.ts`를 제거한다.
2. `src/lib/nullToFigma.ts`에서 prototype 관련 export spread와 canvas flow export를 제거한다.
3. `src/lib/figmaToNull.ts`에서 imported prototype apply 경로와 start page resolution을 제거한다.
4. `src/lib/figma.ts`에서 prototype interaction / flow / shared plugin data 타입을 제거한다.
5. 관련 테스트와 진행 문서 변경을 되돌린다.

롤백 후 확인:

1. `tests/nullToFigma.test.ts`, `tests/figmaToNull.test.ts`, `tests/figma-roundtrip.test.ts`, `tests/prototypePlayback.test.ts`, `tests/prototype-flow.test.ts`, `tests/prototype-motion.test.ts`, `tests/runtime-renderer-fixtures.test.tsx`가 다시 통과하는지 확인한다.
2. `next build`가 다시 통과하는지 확인한다.
