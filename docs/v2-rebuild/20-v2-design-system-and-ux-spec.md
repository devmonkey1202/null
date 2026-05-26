# 20. v2 Design System and UX Specification

이 문서는 **v2 에디터 자체의 UI/UX 기준**을 잠급니다.  
현재 문서 보강의 중심은 Builder UX, Canvas UX, Inspector UX, Keyboard UX, 접근성, 디자인 시스템입니다.

## 1. 목표

- 편집기 자체가 상용 툴 수준으로 정리돼 있어야 함
- 캔버스/패널/입력 흐름이 작업을 방해하면 안 됨
- 디자인 시스템과 정보 구조가 기술 구조와 분리되지 않아야 함
- 에디터 산출물은 이후 runtime/publish/AI 수정으로 이어질 수 있어야 함

## 2. Builder UX 원칙

### 2.1 레이아웃

- top bar 고정
- left rail: navigation / layers / assets
- center: canvas or runtime preview
- right rail: inspector
- bottom rail: diagnostics / AI / devtools

### 2.2 패널 규칙

- 같은 의미의 편집 항목은 항상 같은 위치
- 선택 기반 inspector는 selection 없을 때 비활성 state를 분명히 노출
- hidden overlay가 입력/클릭을 가로채면 안 됨
- modal보다 side panel 우선
- destructive action은 inline보다 confirm flow 우선

### 2.3 AI surface 규칙

- AI 입력창은 canvas를 가리지 않는 독립 영역
- AI patch는 preview -> diff -> apply 순서 강제
- “바로 적용” 버튼 금지

### 2.4 탐색 규칙

- 페이지 전환과 문서 전환을 분리
- builder 내부 route는 shallow
- preview route와 editor route를 섞지 않음

## 3. Builder 디자인 시스템

### 3.1 토큰 체계

필수 토큰 그룹:

- color
- typography
- spacing
- radius
- border
- elevation
- motion
- z-index

### 3.2 컬러 계층

- `bg.canvas`
- `bg.surface`
- `bg.panel`
- `bg.overlay`
- `fg.primary`
- `fg.secondary`
- `fg.muted`
- `accent.primary`
- `accent.positive`
- `accent.warning`
- `accent.danger`
- `stroke.default`
- `stroke.focus`

### 3.3 타이포

builder 기준 고정 scale:

- `display-1`
- `title-1`
- `title-2`
- `body-1`
- `body-2`
- `label-1`
- `label-2`
- `mono-1`

### 3.4 간격

기본 단위:

- 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48

패널 내부는 8px grid 기준.

### 3.5 radius

- button / input: 10
- panel / card: 14
- modal / floating container: 18

## 4. Builder 컴포넌트 카탈로그

필수 primitive:

- button
- icon button
- segmented control
- tabs
- input
- select
- combobox
- switch
- checkbox
- radio
- textarea
- token picker
- color picker
- layer row
- property row
- empty state
- toast
- dialog
- context menu

## 5. Inspector UX 규칙

- 모든 field는 label / current value / reset affordance를 가짐
- mixed value state 지원
- multi-select 편집 시 공통 속성만 노출
- variable binding과 static value를 시각적으로 분리
- invalid value는 즉시 표시
- long form 속성은 section / subsection / disclosure로 정보 밀도 제어
- 포커스가 입력창에 있을 때 selection이 비의도적으로 풀리면 안 됨
- 색상/토큰/변수/바인딩 picker는 동일한 interaction grammar 사용

## 6. Canvas UX 규칙

- selection, hover, focus ring은 서로 다른 의미여야 함
- marquee와 drag preview가 혼동되지 않아야 함
- snap line은 실제 commit 결과와 일치
- zoom level에 따라 control density 조절
- hidden overlay / onboarding layer가 캔버스와 인스펙터 입력을 가로채면 안 됨
- pointer / keyboard / wheel 입력 우선순위가 명확해야 함

## 7. Keyboard UX

필수:

- select / multi-select
- nudge
- duplicate
- undo/redo
- group / ungroup
- zoom / pan
- command palette
- frame enter / exit
- deep select
- align / distribute quick action

단축키 충돌은 OS / 브라우저 예약키와 분리.

## 8. Accessibility

builder도 접근성 대상입니다.

필수:

- keyboard-only flow
- focus visible
- aria labeling
- reduced motion respect
- screen reader friendly inspector structure
- high contrast usable
- zoom 200% 환경에서 패널/캔버스 핵심 기능 유지

## 9. Builder 시각 품질 기준

에디터가 “보여주기”가 아니라 “실무용 도구”가 되려면 아래가 필요합니다.

- typography hierarchy 명확
- spacing 일관
- state complete
- canvas / inspector 대비 명확
- clipped text 없음
- copy tone 일관
- 다크/라이트 모드 전환 시 계층 혼란 없음

## 10. 디자인 리뷰 게이트

출시 전 수동 리뷰 항목:

- alignment drift
- spacing inconsistency
- clipped text
- unreadable contrast
- panel overload
- ambiguous action naming
- hidden critical state
- broken keyboard affordance
- overlay interference
- inspector hierarchy confusion

## 11. 최소 산출물 UX 원칙

이번 문서의 중심은 에디터 자체지만, 산출물에 대해서는 아래 최소 원칙만 유지합니다.

- editor preview와 publish 결과가 시각적으로 어긋나면 안 됨
- output primitive는 design token을 상속 가능해야 함
- loading / empty / error / success / permission denied 상태는 generator가 만들 수 있어야 함

## 12. 최종 결론

v2는 엔진만 강하면 되는 것이 아니라  
**Builder UX, Canvas UX, Inspector UX, Keyboard UX, 접근성, 디자인 시스템이 동시에 상용 수준을 가져야 합니다.**
