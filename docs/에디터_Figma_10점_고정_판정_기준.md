# 에디터 Figma 10점 고정 판정 기준
기준 날짜: `2026-03-14`

이 문서는 `모든 범위를 10점 고정`으로 판단하기 위한 기준 문서입니다.

중요:

- 이 문서는 `10점을 이미 달성했다`는 선언문이 아닙니다.
- 이 문서는 `10점이라고 적을 수 있는 조건`을 고정하는 문서입니다.
- 조건을 통과하기 전에는 어떤 항목도 `10점`으로 기록하지 않습니다.

기준 시점:

- `2026-03-14`
- 비교 기준: `시장 규모 제외`, `제품 기능 + 커뮤니티 기능 포함`
- Figma 공식 기능 축을 기준으로 보고, 내부 fixture / roundtrip / regression 통과 여부로 판정합니다.

## 1. 10점의 의미

`10점`은 아래 조건을 동시에 만족할 때만 사용할 수 있습니다.

1. Figma와 겹치는 기능 범위에 알려진 공백이 없습니다.
2. representative fixture와 roundtrip에서 손실이 없거나, 손실이 문서화되고 일반 경로가 아닙니다.
3. editor, runtime, import/export, handoff 중 한쪽만 되는 기능이 아닙니다.
4. edge case에서도 반복적으로 무너지지 않습니다.
5. 실제 사용 가능한 경로로 검증되었습니다.

즉, `비슷해 보임`은 10점이 아닙니다.

## 2. 10점 금지 조건

아래 중 하나라도 남아 있으면 해당 항목은 10점을 줄 수 없습니다.

- Figma와 겹치는 기능 중 미구현 항목이 남아 있음
- import만 되고 export가 무너지거나, 그 반대
- 모델만 있고 UI에서 직접 편집 불가
- editor에서는 되지만 runtime/export에서 손실 발생
- representative fixture 회귀 실패
- roundtrip 손실이 일반 경로로 남아 있음
- known fallback이 일반 경로로 남아 있음
- `build`는 되지만 `typecheck`가 꺼져 있음

## 3. 항목별 10점 기준

### 3.1 캔버스 기본 편집

- 선택, 이동, 리사이즈, 회전, 다중 선택, 정렬, 분산이 edge case까지 일관적으로 동작
- frame / group / section / component / instance 간 차이가 설명 가능하고 검증됨
- 좌표, preview, commit 결과 사이 오차가 없음

### 3.2 스냅 / 가이드 / 리사이즈 / 회전

- smart guides, spacing guides, distance display, rotation precision이 Figma 비교 기준에서 체감상 밀리지 않음
- resize preview와 commit frame이 어긋나지 않음
- frame / section / component / instance parity가 유지됨

### 3.3 Auto Layout / Constraints / Layout Guide

- direction / align / gap / wrap / baseline / min-max / nested overflow가 Figma와 구조적으로 일치
- `grid flow` 지원
- `ignore auto layout` 지원
- guide와 constraints 우선순위가 문서화되고 fixture 기준으로 일치

### 3.4 텍스트 엔진

- rich span / range 모델 존재
- font metric, kerning, line-height, paragraph spacing이 editor/runtime/export에서 함께 유지
- wrap / auto-size / baseline이 안정적
- `text-on-path` 지원
- text import/export roundtrip에서 손실이 일반 경로로 남지 않음

### 3.5 벡터 / 펜 / Boolean / Mask

- vector network가 편집 가능한 모델로 존재
- path, handle, anchor, segment, boolean, mask가 fallback 없이 주요 경로에서 유지
- boolean operand semantic이 재편집 가능하게 보존
- ordered mask chain이 구조적으로 유지

### 3.6 컴포넌트 / Variants / Properties

- component set / component / instance / variant axis-value / property definition / override가 일관적
- instance swap과 variant 변경에 손실이 없음
- property binding과 variant matrix가 안정적
- component playground 또는 동등한 검증 흐름 존재

### 3.7 Variables / Styles / Modes

- color뿐 아니라 effect / text / gradient stop binding까지 지원
- alias와 mode가 구조적으로 보존
- token replace/import/export 후 node ref가 유지
- prototype / page / component와 연결된 변수 사용이 안정적

### 3.8 Prototype

- interaction, trigger, overlay, transition, smart animate, flow start page가 구조적으로 유지
- runtime playback과 export 구조가 함께 유지
- prototype roundtrip에서 일반 경로 손실이 없음

### 3.9 Dev Mode / Handoff

- inspect가 단순 CSS 보기를 넘어서 실제 handoff 계층으로 동작
- spacing / size / token / variant / property / export / codegen이 연결
- compare changes, code-linked handoff, component playground, code snippet 흐름 존재

### 3.10 Plugin 커뮤니티 기능

- listing / detail / search / category / update 흐름 존재
- install / remove / update / version / policy / approval 구조 존재
- 조직 승인 / 권한 / 보안 메타 흐름 존재

### 3.11 Widget 커뮤니티 기능

- widget runtime뿐 아니라 widget store / listing / install / update / share / approval 흐름 존재
- widget metadata와 배포 흐름 존재
- organization save / approval 흐름 지원

### 3.12 협업 / 브랜치 / 머지

- presence/comment를 넘어서 동시 편집 충돌 해결 구조 존재
- branch / compare / review / merge / conflict resolution 흐름 존재
- 다중 세션 편집에서 문서 붕괴가 없음

### 3.13 Import / Export / `.fig` 호환

- import fidelity와 export fidelity가 모두 높음
- `NULL -> Figma -> NULL`, `Figma -> NULL -> Figma`에서 일반 경로 손실이 거의 없음
- direct `.fig` 경로가 실제로 존재하고 검증됨

### 3.14 성능 / 렌더러 / 대문서

- 목표 문서 규모에서 렌더 / 선택 / 편집 / 저장이 붕괴하지 않음
- renderer 구조가 현재 기능 범위를 감당함
- 장시간 세션과 대문서에서 crash / edit lag가 통제됨

## 4. 전체 10점 고정 선언 조건

아래를 모두 만족해야 `모든 범위 10점 고정`이라고 선언할 수 있습니다.

1. 위 14개 항목 모두에서 known gap이 없습니다.
2. representative fixture가 전부 통과합니다.
3. import/export roundtrip이 전부 통과합니다.
4. rendered regression이 전부 통과합니다.
5. 협업 / 성능 / 브랜치 같은 무거운 축도 별도 검증을 통과합니다.
6. `Phase B/C 완료 = 추가 작업 없음`이 실제로 성립합니다.

## 5. 현재 해석

현재 프로젝트는 이 문서 기준으로 아직 `모든 범위 10점 고정` 상태가 아닙니다.

현재 남은 대표 blocker:

- `direct .fig parser / writer 기반`

즉, `Phase C`가 마무리되기 전까지는 전체 10점 고정 선언을 하지 않습니다.

## 6. 관련 문서

- [에디터_Figma_BC_최종_완결_계약.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_BC_최종_완결_계약.md)
- [에디터_Figma_PhaseC_구현_준비.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_PhaseC_구현_준비.md)
- [에디터_Figma_PhaseC_10점_고정_근거.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_PhaseC_10점_고정_근거.md)
