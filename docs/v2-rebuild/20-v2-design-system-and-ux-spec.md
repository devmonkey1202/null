# 20. v2 Design System and UX Specification

이 문서는 **v2 에디터 자체의 UI/UX 기준**을 잠급니다.  
현재 중심은 앱 출력물 전체가 아니라 **Builder UX, Canvas UX, Inspector UX, Keyboard UX, 접근성, 디자인 시스템**입니다.

## 1. 목표

v2 에디터 UI는 아래를 동시에 만족해야 합니다.

- Figma 사용자가 학습 비용 없이 바로 적응 가능한 작업 구조
- NULL 시그니처를 잃지 않는 브랜드 마감
- 장식보다 편집 속도와 상태 가시성이 우선인 화면
- 대형 문서에서도 시선 이동과 클릭 흐름이 무너지지 않는 정보 구조
- 에디터 산출물이 이후 runtime / publish / AI patch로 이어질 수 있는 구조적 UI

## 2. 기준 레퍼런스

### 2.1 1차 레퍼런스

- **Figma**

이유:

- 웹 기반 편집기에서 가장 표준적인 작업 밀도
- 상단 / 좌측 / 중앙 / 우측 구조가 명확
- 선택 -> 수정 -> 확인 흐름이 가장 안정적
- 협업 상태, 저장 상태, 줌/뷰 제어가 잘 정리됨

### 2.2 2차 보조 레퍼런스

- **Penpot**
- **Framer 일부 편집 흐름**

참조 목적:

- Penpot: 토큰/컴포넌트/속성 구조 참고
- Framer: 빠른 수정 진입감, 일부 인라인 상호작용 참고

### 2.3 레퍼런스 사용 원칙

- 레퍼런스는 **작업 구조와 조작 리듬**을 참고한다
- 브랜드 색과 마감은 NULL 기준으로 재설계한다
- 시각적 모방이 아니라 **작업성 재현**을 목표로 한다

## 3. 디자인 방향

### 3.1 기본 원칙

- 배치와 작업 흐름은 Figma에 최대한 가깝게 간다
- 색상과 상태 마감은 NULL 시그니처를 유지한다
- 작업용 밀도와 명확한 상태 표현이 장식보다 우선이다
- 패널은 촘촘하되 답답하지 않아야 한다
- 캔버스 피드백은 가장 선명해야 한다

### 3.2 하지 않을 것

- 과한 글래스 효과
- 작업을 방해하는 장식용 애니메이션
- 카드 위에 카드가 겹치는 패널 구조
- 저대비 텍스트
- 의미 없는 대형 CTA 과다 노출
- 온보딩/모달이 편집 입력을 가로채는 구조

## 4. 전체 레이아웃

v2 에디터 레이아웃은 **상단 바 + 좌측 패널 + 중앙 캔버스 + 우측 인스펙터 + 하단 상태 영역**의 5축 구조를 기본으로 합니다.

### 4.1 고정 영역

- **Top Bar**: 문서 전역 상태와 핵심 툴
- **Left Rail**: pages / layers / assets / components
- **Center Stage**: canvas
- **Right Inspector**: design / prototype / inspect / variables / tokens
- **Bottom Status Rail**: diagnostics / selection summary / AI patch / debug state

### 4.2 폭과 밀도 원칙

- 좌측 패널: 고정 또는 1단 리사이즈
- 우측 패널: 고정 또는 1단 리사이즈
- 캔버스는 항상 가장 넓은 영역을 확보
- 패널 접힘/펼침은 허용하되, 접힘 상태에서도 주요 정보는 살아 있어야 함
- 패널 폭을 자주 바꿔야만 작업 가능한 구조는 금지

## 5. Top Bar UX

Top Bar는 “파일 메뉴 바”가 아니라 **작업 상태 바**로 설계합니다.

반드시 포함:

- 문서명
- 저장 상태
- 협업 상태
- 실행 모드 / 뷰 모드
- 줌 / 맞춤 / 프레임 이동
- publish / preview / share 같은 핵심 액션

원칙:

- 상단바는 항상 같은 위치에서 같은 의미를 가진다
- 저장/충돌/오류 상태는 텍스트와 색 모두로 명확히 표현한다
- 버튼 수를 늘리기보다 command palette / overflow로 정리한다

## 6. Left Rail UX

좌측은 **문서 구조 탐색**이 중심입니다.

기본 탭:

- Pages
- Layers
- Assets
- Components

원칙:

- Layers는 트리 가독성이 최우선이다
- 선택 상태와 hover 상태가 명확히 달라야 한다
- drag reorder는 안정적으로 보여야 한다
- visibility / lock / component state는 한 눈에 읽혀야 한다
- Assets와 Components는 디자인 시스템 자산 탐색에 최적화한다

## 7. Canvas UX

캔버스는 가장 비싼 영역이므로 **시각적 멋보다 편집 신뢰성**을 우선합니다.

반드시 명확해야 할 것:

- selection ring
- hover state
- focus state
- resize handle
- rotate handle
- snap guide
- distance / spacing indicator
- marquee selection
- multi-select bounds

원칙:

- selection, hover, focus ring은 서로 다른 의미를 가진다
- snap preview와 commit 결과는 반드시 일치한다
- zoom level에 따라 control density가 조절되어야 한다
- 캔버스 위 보조 UI는 문서를 가리지 않아야 한다
- hidden overlay / onboarding layer가 캔버스나 패널 입력을 막으면 안 된다

## 8. Right Inspector UX

우측 인스펙터는 **선택 요소의 진실을 보여주는 곳**입니다.

큰 축:

- Design
- Prototype
- Inspect

에디터 우선 추가 축:

- Variables
- Tokens
- Component
- Layout

원칙:

- 모든 field는 label / current value / reset affordance를 가진다
- mixed value 상태를 명확히 표시한다
- variable binding과 static value는 시각적으로 분리한다
- invalid value는 즉시 드러난다
- 긴 속성 묶음은 section / subsection / disclosure로 정리한다
- 입력 중 selection이 비의도적으로 이동하면 안 된다
- picker 상호작용 규칙은 색상, 토큰, 변수에서 일관돼야 한다

## 9. Bottom Status Rail UX

하단 영역은 단순 로그 창이 아니라 **작업 상태 진단층**입니다.

포함 범위:

- 선택 요소 요약
- 좌표 / 크기 / 회전 / 부모 정보
- validation / diagnostics
- AI patch preview 진입
- debug / perf 상태

원칙:

- 평소에는 조용해야 한다
- 경고와 오류는 즉시 눈에 띄어야 한다
- AI 관련 기능은 캔버스를 가리지 않고 이 영역 또는 별도 side surface에서 다룬다

## 10. AI Surface UX

AI는 별도 장난감 화면이 아니라 **선택 요소 기반 보조 작업면**입니다.

원칙:

- AI 입력창이 캔버스를 장시간 가리지 않는다
- patch는 `preview -> diff -> apply` 순서를 강제한다
- 바로 적용하는 destructive action 금지
- selection scoped patch와 document scoped patch를 구분한다
- AI 결과는 사람이 검토 가능한 구조적 diff로 보여야 한다

## 11. Keyboard UX

에디터는 마우스 친화적이어야 하지만, 생산성은 키보드에서 나옵니다.

필수:

- select / multi-select
- nudge
- duplicate
- undo / redo
- group / ungroup
- zoom / pan
- command palette
- frame enter / exit
- deep select
- align / distribute quick action

원칙:

- OS / 브라우저 충돌 키를 분리한다
- 입력 포커스가 field 안에 있을 때와 canvas에 있을 때 키 동작이 달라야 한다
- 단축키는 문서화되고 discoverable해야 한다

## 12. 디자인 시스템

### 12.1 토큰 그룹

- color
- typography
- spacing
- radius
- border
- elevation
- motion
- z-index

### 12.2 컬러 원칙

- 배경은 저채도 중립색 위주
- NULL 시그니처 accent는 선택, 활성, 포커스, 주요 CTA, 가이드라인에 제한적으로 사용
- 브랜드 색으로 패널 전체를 칠하지 않음

필수 semantic color:

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

### 12.3 타이포

builder 기준 고정 scale:

- `display-1`
- `title-1`
- `title-2`
- `body-1`
- `body-2`
- `label-1`
- `label-2`
- `mono-1`

### 12.4 간격과 반경

기본 단위:

- 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48

기본 규칙:

- 8px grid 기준
- button / input: 10
- panel / card: 14
- modal / floating container: 18

## 13. 접근성

builder도 접근성 대상입니다.

필수:

- keyboard-only flow
- focus visible
- aria labeling
- reduced motion respect
- screen reader friendly inspector structure
- high contrast usable
- zoom 200% 환경에서 주요 기능 유지

## 14. 리뷰 기준

출시 전 UI 리뷰는 아래를 기준으로 합니다.

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

## 15. 최소 산출물 UX 원칙

이번 문서의 중심은 에디터 자체지만, 산출물에 대해서도 최소 원칙은 유지합니다.

- editor preview와 publish 결과가 시각적으로 다르면 안 된다
- output primitive는 design token과 연결 가능해야 한다
- loading / empty / error / success / permission denied 상태를 생성 가능한 구조여야 한다

## 16. 최종 결론

v2 에디터 UI는 단순히 예쁜 화면이 아니라, 아래를 동시에 만족해야 합니다.

- Figma에 가까운 작업 구조
- NULL 시그니처를 유지한 시각 마감
- 편집 신뢰성을 우선하는 캔버스/패널/인스펙터 구조
- AI patch와 확장 가능한 문서 모델을 품은 상용 수준 편집기 UX
