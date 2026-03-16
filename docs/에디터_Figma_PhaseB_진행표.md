# 에디터 Figma Phase B 진행표
기준 날짜: `2026-03-14`

현재 상태:

- 현재 완료: `24 / 24`
- 현재 주력: `Phase B 완료`

## B-1. Library / Design System Distribution

- [x] library publish payload 정의
- [x] library consume / install 흐름
- [x] library update / dependency diff
- [x] component / variant / property sync
- [x] style / variable / mode sync
- [x] library usage tracking / update prompt

## B-2. Dev Mode / Handoff

- [x] compare changes 화면
- [x] code-linked handoff registry
- [x] component playground
- [x] ready-for-dev / annotation / measurement 보강
- [x] token / variant / property inspect 심화
- [x] codegen / export spec parity 검증

## B-3. Branch / Compare / Review

- [x] branch 문서 모델
- [x] branch diff / compare viewer
- [x] review 상태 / 승인 흐름
- [x] merge entrypoint
- [x] conflict detection / resolution
- [x] branch / review 헬퍼 테스트

## B-4. Plugin / Widget / Resource Hub

- [x] plugin catalog search / filter / detail
- [x] plugin approval / request / save flow
- [x] widget store listing / install / update
- [x] resource hub 통합 탐색
- [x] share URL / detail page / version flow
- [x] org policy / permission / audit wiring

## 이번 단계 검증 기준

- [x] `eslint` touched files 통과
- [x] `vitest` 관련 테스트 통과
- [x] `next build` 통과

주의:

- `build` 통과만으로 완료 처리하지 않는다.
- 타입 검증 게이트 복구는 `Phase C` 범위다.
