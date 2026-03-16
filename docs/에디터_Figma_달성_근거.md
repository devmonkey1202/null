# 에디터 Figma 달성 근거

이 문서는 이번 턴까지 실제로 증명된 범위를 정리한다.

목적은 두 가지다.

1. `Figma 비교 기준`에서 이미 닫힌 항목의 근거를 코드와 테스트 기준으로 명확히 남긴다.
2. 아직 남아 있는 범위와 이번 턴에서 실제로 닫은 범위를 분리해서 과장을 막는다.

## 1. 이번 턴에서 실제로 닫힌 것

### 1.1 NULL -> Figma export 실구현

추가 파일:

- `src/lib/nullToFigma.ts`
- `src/app/api/pages/[pageId]/figma/export/route.ts`
- `tests/nullToFigma.test.ts`

이번 export는 다음 범위를 직접 다룬다.

- page -> `DOCUMENT/CANVAS`
- frame / section / group / rect / ellipse / line / polygon / star / text / path
- boolean path -> `BOOLEAN_OPERATION` + operand children
- auto layout / sizing / constraints / layout grid / export settings
- shared style refs
- local variables / modes / fillRef / strokeRef -> `boundVariables`
- component set / component / instance / variant props
- component property definitions / references / instance componentProperties

### 1.2 roundtrip 검증 추가

`tests/nullToFigma.test.ts`에서 아래 4개 대표 fixture를 `NULL -> Figma -> NULL`로 다시 읽어 검증한다.

- token/style/variable fixture
- auto-layout wrap fixture
- vector/boolean fixture
- component/variant/instance fixture

즉, 이번 턴 기준으로는 export가 문서만 있는 상태가 아니라 실제 re-import 가능한 구조를 만든 상태다.

## 2. 코드 근거

핵심 파일:

- `src/lib/nullToFigma.ts`
  - style / variable / mode export
  - vector / boolean export
  - auto-layout / constraints / layout grid export
  - component set / instance / property export
- `src/app/api/pages/[pageId]/figma/export/route.ts`
  - 현재 페이지 `content_json`을 hydrate 후 export payload 반환
- `src/lib/figmaToNull.ts`
  - 기존 import와 이번 export가 같은 Figma REST shape 위에서 왕복되도록 유지

연관 문서:

- `docs/에디터_Figma_매핑_표.md`
- `docs/에디터_Figma_import_export_공통_제약표.md`
- `docs/에디터_Figma_검증_기준.md`

## 3. 검증 근거

실행한 검증:

- `npx eslint src/lib/nullToFigma.ts src/lib/figma.ts src/app/api/pages/[pageId]/figma/export/route.ts tests/nullToFigma.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/figma-roundtrip.test.ts --quiet`
- `npx vitest run tests/nullToFigma.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/figma-roundtrip.test.ts tests/vector-edit-model.test.ts tests/figma-import-fidelity.test.ts tests/boolean-trace.test.ts tests/scene-clone.test.ts tests/vector-network.test.ts tests/path-edit-shape.test.ts tests/doc-parity.test.ts`
- `npx next build`

결과:

- eslint 통과
- vitest `11 files / 69 tests` 통과
- `next build` 통과

주의:

- 현재 `next build`는 `next.config.ts`에서 타입 검증을 건너뛴다.
- 따라서 `build 통과 = 전체 타입 안정성 확보`는 아니다.

## 4. 이번 턴 기준으로 명확해진 비교 근거

이번 턴 이후에는 아래 주장을 코드와 테스트로 뒷받침할 수 있다.

1. 이 저장소는 이제 `Figma import 전용`이 아니라 `Figma-compatible export`까지 가진다.
2. token / layout / vector / component 핵심 fixture는 `NULL -> Figma -> NULL` 왕복 검증이 생겼다.
3. export는 style ref, variable mode, boolean operand, component variant/property를 무시하지 않고 다시 내보낸다.
4. export route가 생겨 실제 페이지 데이터에서 바로 payload를 얻을 수 있다.

## 5. 아직 과장하면 안 되는 것

이 문서는 `전체 제품이 이미 Figma 전체 범위를 완전히 초과했다`고 선언하는 문서가 아니다.

아직 남아 있는 것:

- `.fig` 바이너리 직접 호환
- richer text span / full typography roundtrip
- full prototype export
- renderer 전환
- CRDT multiplayer
- 전체 타입 검증 복구

즉, 이번 턴에서 명확해진 것은 다음이다.

- `마지막 두 체크 항목` 기준의 export 근거는 실제 코드와 테스트로 닫혔다.
- 하지만 제품 전체의 절대적 완결성은 이후 phase와 별개로 계속 검증돼야 한다.
