# 에디터 Figma Phase A 구현 준비
기준 날짜: `2026-03-13`

## 상태

- Phase A 진행도: `38 / 38`
- 완료:
  - `A-1 Text Engine`
  - `A-2 Auto Layout / Constraints`
  - `A-3 Vector / Boolean / Mask`
  - `A-4 Variables / Styles`
  - `A-5 Prototype`
- 다음 시작점:
  - `Phase B`
  - `Phase C`

## 범위

이번 Phase A에서 마무리한 것:

1. text engine 완성
2. auto layout / grid / layout guide / constraints 완성
3. vector / boolean / mask semantic 편집 강화
4. variables / styles binding 고도화
5. prototype export / roundtrip 강화

Phase A 이후로 넘긴 것:

- plugin store 고도화
- widget store
- Dev Mode 고도화
- library publish / consume / update
- branch / review / merge
- renderer 전환
- CRDT multiplayer
- direct `.fig` 호환 대공사
- 전체 타입 게이트 복구

## 안전 규칙

1. 기존 UI shell은 유지한다.
2. 계산 / 정합성 / 매핑은 shadow module로 먼저 분리한다.
3. 매 배치마다 롤백 문서를 추가한다.
4. 검증 없이 완료 처리하지 않는다.

## 검증 규칙

- 정적 검증: `npx eslint <touched files> --quiet`
- 기능 검증: `npx vitest run <관련 테스트>`
- 빌드 검증: `npx next build`

현재 주의점:

- `next build`는 타입 검증을 건너뜁니다.
- 따라서 `build 통과`만으로 완료 판정하지 않습니다.

## Phase A 체크리스트

### A-1. Text Engine

- [x] rich text range 문서 모델
- [x] text-on-path 렌더 경로
- [x] Figma text style override import/export 기초
- [x] text inspector shadow module
- [x] rich text range inspector UI
- [x] text-on-path inspector UI
- [x] range/path 변경 시 hug measurement 보정
- [x] direct text edit와 range 병합 보정
- [x] rich range 편집: weight / size / fill
- [x] rich range 편집: family / line-height / letter-spacing / strike
- [x] rich range style reset 경로
- [x] paragraph spacing fidelity
- [x] text-on-path preset editing
- [x] representative text fixture parity
- [x] clone / parity / test 보강
- [x] rich text span 편집 UX 고도화
- [x] text-on-path 핸들 / 시각 편집

### A-2. Auto Layout / Constraints

- [x] nested overflow 보정
- [x] wrap / min-max / baseline parity 보정
- [x] frame / section / component 내부 동작 일치화
- [x] grid flow
- [x] ignore auto layout
- [x] layout guide + constraints 우선순위 최종화

### A-3. Vector / Boolean / Mask

- [x] vector network 기초 편집 모델
- [x] boolean operand semantic trace
- [x] mask chain editable base
- [x] vector semantic roundtrip
- [x] mask semantic model 완성

### A-4. Variables / Styles

- [x] fill / stroke binding
- [x] local variables / modes import
- [x] effect style import
- [x] text variable binding 확장
- [x] gradient stop binding
- [x] alias / mode roundtrip 최종화

### A-5. Prototype

- [x] interaction / overlay / smart animate base
- [x] flow diagnostics
- [x] prototype export
- [x] prototype roundtrip 최종화

## 이번 배치에서 손댄 것

- `src/lib/figma.ts`
  - Figma prototype interaction / flow / shared plugin data 타입 추가
- `src/lib/prototypeFigmaInterop.ts`
  - 공식 interaction export-import와 NULL metadata roundtrip helper
- `src/lib/nullToFigma.ts`
  - node interactions export
  - flowStartingPoints / prototypeStartNodeID export
- `src/lib/figmaToNull.ts`
  - official interactions import
  - shared metadata 우선 복원
  - imported start page resolution
- `tests/nullToFigma.test.ts`
  - prototype export / roundtrip 회귀
- `tests/figmaToNull.test.ts`
  - official Figma interaction import 회귀

## 이번 배치 검증 결과

- `eslint` 통과
- `vitest`
  - `tests/nullToFigma.test.ts`
  - `tests/figmaToNull.test.ts`
  - `tests/figma-roundtrip.test.ts`
  - `tests/prototypePlayback.test.ts`
  - `tests/prototype-flow.test.ts`
  - `tests/prototype-motion.test.ts`
  - `tests/runtime-renderer-fixtures.test.tsx`
  - 결과: `7개 파일 / 58개 테스트` 통과
- `next build` 통과

## 다음 작업

1. `Phase B`
2. `Phase C`
