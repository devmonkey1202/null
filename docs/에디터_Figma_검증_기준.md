# 에디터 Figma 검증 기준

## 목적

이 문서는 `Figma 이상` 목표를 향한 작업에서 다음 다섯 가지를 고정한다.

- 고위험 로직의 shadow module 기준
- parity test 틀
- 대표 fixture 문서
- 타입/빌드/테스트 기준
- roundtrip 검증 기준

## 1. Shadow Module 기준

아래 조건 중 하나라도 만족하면 기존 파일 안에 직접 로직을 더 얹지 않고 shadow module을 먼저 만든다.

- `AdvancedEditorView.tsx` 안에서 2개 이상의 상호작용 경로가 얽힌다.
- `engine.ts`, `figmaToNull.ts`, `renderer.tsx`처럼 한 번의 회귀가 넓게 퍼지는 파일을 건드린다.
- 문서 모델(`scene.ts`)과 UI 이벤트를 동시에 바꾼다.
- import/export/roundtrip처럼 ID 보존과 semantic 유지가 핵심인 작업이다.

현재 고위험 shadow module 대상:

- `src/advanced/ui/AdvancedEditor.drag.ts`
- `src/advanced/ui/AdvancedEditor.resize.ts`
- `src/advanced/ui/componentVariants.ts`
- `src/advanced/ui/componentProperties.ts`
- `src/advanced/ui/devCodegen.ts`
- `src/advanced/ui/exportPipeline.ts`
- `src/advanced/ui/tokenRoundtrip.ts`
- `tests/doc-parity.ts`

규칙:

1. 원본 UI shell은 유지한다.
2. 계산/변환/정규화만 shadow module로 분리한다.
3. module 단위 테스트와 parity test가 먼저 통과해야 기존 호출부를 바꾼다.
4. rollback은 module import 제거만으로 가능해야 한다.

## 2. Parity Test 틀

공통 parity helper:

- `tests/doc-parity.ts`

대표 fixture:

- `tests/figma-fixtures.ts`

기본 parity 흐름:

1. 대표 fixture 문서를 만든다.
2. `serialize -> hydrate` roundtrip을 통과시킨다.
3. 필요한 경우 feature-specific roundtrip을 추가한다.
4. `collectDocParitySnapshot(...)` 결과가 같아야 parity 통과로 본다.

현재 고정된 parity 예시:

- token export/import roundtrip parity
- representative fixture serialize/hydrate parity

## 3. 대표 Fixture 문서

현재 기준 fixture는 아래 네 개로 고정한다.

- `tokens-basic`
  - styles, variables, modes, node refs, text style ref
- `layout-wrap`
  - auto-layout wrap, min/max, overflow
- `vector-boolean`
  - pathData, boolean meta, vector network
- `component-variant`
  - component, variant props, instance, override

대표 fixture 구현 위치:

- `tests/figma-fixtures.ts`
- `tests/doc-parity.test.ts`

## 4. Roundtrip 검증 기준

`기준 수립`과 `기능 완료`는 다르다. 이 문서는 완료 여부가 아니라 검증 기준을 고정한다.

roundtrip 검증은 아래 순서로 본다.

1. 내부 문서 roundtrip
   - `serializeDoc -> hydrateDoc`
2. token roundtrip
   - `exportTokenBundle -> importTokenBundleIntoDoc`
3. Figma import fixture 검증
   - `figmaToNull`가 representative feature를 구조 보존 상태로 가져오는지 확인
4. imported Figma document 내부 roundtrip
   - `figmaToNull -> hydrate -> serialize -> hydrate`
5. Figma export roundtrip
   - `NULL -> Figma -> NULL` 대표 fixture roundtrip을 기본 검증으로 포함한다.
   - `nullToFigma`의 직접 export 구조와 re-import 결과를 함께 확인한다.

통과 기준:

- 페이지 구조가 유지된다.
- 핵심 node refs(style/variable/component/variant)가 유지된다.
- vector/component/layout feature가 편집 가능한 구조를 잃지 않는다.
- fallback이 생기면 제약표와 매핑표를 함께 갱신한다.

## 5. 타입/빌드/테스트 기준

현재 기준 명령은 아래로 고정한다.

정적 검사:

- `npx eslint <touched files> --quiet`

회귀 테스트:

- `npx vitest run <feature tests + representative parity tests>`

빌드:

- `npx next build`

주의:

- 현재 Next build는 `next.config.ts`에서 타입 검증을 건너뛴다.
- 따라서 `build 통과 = 타입 안정성 확보`로 간주하지 않는다.
- 타입 관련 별도 복구 작업 전까지는 `eslint + vitest + build`를 최소 기준으로 유지한다.

## 6. 이번 기준을 직접 검증하는 파일

- `src/advanced/ui/tokenRoundtrip.ts`
- `tests/token-roundtrip.test.ts`
- `tests/figma-fixtures.ts`
- `tests/doc-parity.ts`
- `tests/doc-parity.test.ts`
- `tests/figma-roundtrip.test.ts`
- `tests/vector-edit-model.test.ts`
- `tests/figma-import-fidelity.test.ts`
- `src/lib/nullToFigma.ts`
- `tests/nullToFigma.test.ts`

## 7. Rendered Fixture Regression

representative fixture? "문서 parity"만 보는 걸로 끝내지 않는다.
renderer? 실제 출력 구조도 같이 고정한다.

추가 fixture render regression:

- `tests/runtime-renderer-fixtures.test.tsx`
- `tests/__snapshots__/runtime-renderer-fixtures.test.tsx.snap`

규칙:

1. representative fixture? runtime renderer?먯꽌 직접 렌더한다.
2. `svg` 출력 구조 snapshot? 고정한다.
3. 문서 parity가 같아도 renderer snapshot?댁긽 ?댁? render regression으로 본다.
