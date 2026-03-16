# 에디터 Figma Phase C 진행표
기준 날짜: `2026-03-14`

현재 상태:

- 현재 완료: `19 / 20`
- 현재 주력: `C-3 Direct .fig Compatibility`
- 남은 핵심: `direct .fig parser / writer 기반`

## C-1. Renderer / Scale Baseline

- [x] scene graph render / interaction 분리
- [x] canvas / WebGL 경로 1차 삽입
- [x] selection / edit overlay 분리
- [x] 5k node benchmark fixture
- [x] renderer parity / fallback 규칙

## C-2. CRDT Multiplayer

- [x] operation 모델 정리
- [x] CRDT 문서 동기화 bridge
- [x] presence와 document edit 분리
- [x] merge / conflict resolution 경로
- [x] multiplayer 부하 / soak 테스트

## C-3. Direct `.fig` Compatibility

- [ ] direct `.fig` parser / writer 기반
- [x] component / style / variable / prototype fidelity 강화
- [x] pluginData / shared metadata 보존
- [x] roundtrip diff fixture
- [x] compatibility 오류 리포트

보강 완료:

- raw Figma REST payload / file / bundle / gzip / base64-gzip source sniffing
- direct fig package zip import / export
- `figFile` / `packageFile` / `package-base64` direct source 경로
- direct `.fig` binary adapter hook / writer route scaffold
- env 기반 direct `.fig` CLI adapter 실행 경로
- unsupported binary `.fig` 입력에 대한 명시적 오류 리포트
- bundle import/export API의 source descriptor / compatibility report 응답

## C-4. Type Gate / Soak / Hardening

- [x] `ignoreBuildErrors` 의존 제거
- [x] `tsc --noEmit` 전체 통과
- [x] 대문서 / 장시간 세션 soak
- [x] 메모리 / 충돌 / 복구 검증
- [x] 최종 10점 고정 근거 문서 갱신

## 이번 단계 검증 기록

- [x] `eslint` touched files 통과
- [x] `tsc --noEmit` 통과
- [x] `vitest` Figma / roundtrip / compatibility 회귀 통과
- [x] `next build` 통과

주의:

- `Phase C`는 아직 끝나지 않았습니다.
- `direct .fig parser / writer 기반`이 남아 있으므로, 현재는 `19 / 20`입니다.
- 전체 `10점 고정`은 위 남은 항목까지 닫힌 뒤에만 선언합니다.
