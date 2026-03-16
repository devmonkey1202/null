# 에디터 Figma Phase A 진행표
기준 날짜: `2026-03-13`

현재 상태:

- 현재 완료: `38 / 38`
- 현재 주력: `Phase A 완료`
- 이번 배치 완료:
  - `prototype export`
  - `prototype roundtrip 최종화`
  - `Figma official interactions import`
  - `flowStartingPoints / prototypeStartNodeID export-import`

## A-1. Text Engine

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

## A-2. Auto Layout / Constraints

- [x] nested overflow 보정
- [x] wrap / min-max / baseline parity 보정
- [x] frame / section / component 내부 동작 일치화
- [x] grid flow
- [x] ignore auto layout
- [x] layout guide + constraints 우선순위 최종화

## A-3. Vector / Boolean / Mask

- [x] vector network 기초 편집 모델
- [x] boolean operand semantic trace
- [x] mask chain editable base
- [x] vector semantic roundtrip
- [x] mask semantic model 완성

## A-4. Variables / Styles

- [x] fill / stroke binding
- [x] local variables / modes import
- [x] effect style import
- [x] text variable binding 확장
- [x] gradient stop binding
- [x] alias / mode roundtrip 최종화

## A-5. Prototype

- [x] interaction / overlay / smart animate base
- [x] flow diagnostics
- [x] prototype export
- [x] prototype roundtrip 최종화

## 이번 배치 검증

- [x] `eslint` touched files 통과
- [x] `vitest` `7개 파일 / 58개 테스트` 통과
- [x] `next build` 통과

주의:

- `next build`는 현재 타입 검증을 건너뜁니다.
