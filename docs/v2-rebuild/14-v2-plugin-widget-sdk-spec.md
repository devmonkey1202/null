# 14. v2 Plugin / Widget SDK Specification

이 문서는 v2 확장모델을 정의합니다.

## 1. 목표

자유도를 높이려면 코어 바깥의 확장 계약이 필요합니다.  
현재 v1은 위젯/플러그인/프리셋/특수처리가 조각으로 흩어져 있습니다.  
v2는 이를 **플랫폼 계약**으로 정리해야 합니다.

## 2. 확장 종류

### Widget

- 문서/런타임 안에서 렌더되는 UI 단위

### Plugin

- 에디터 확장, 자산 생성, 변환, 분석, 대량 수정

### Server Action Extension

- 서비스 커널에서 실행되는 사용자 정의 서버 함수

## 3. Widget 계약

필수:

- props schema
- event output schema
- binding capability
- layout capability declaration
- permission requirement declaration

예:

- input widget
- chart widget
- map widget
- custom timeline widget

## 4. Plugin 계약

플러그인은 다음 능력을 가져야 합니다.

- read scene
- propose patch
- add asset
- inspect tokens
- transform selection
- run analysis

중요:

- 플러그인은 문서를 직접 mutate 하면 안 됨
- 반드시 patch를 반환하거나 command를 통해 반영

## 5. Server Action 계약

필수:

- input schema
- output schema
- secret access policy
- timeout limit
- retry policy
- audit logging

## 6. 보안 경계

필수:

- capability-based permission
- secret isolation
- no raw unrestricted DB access for arbitrary extension
- storage scope restriction
- network allowlist/egress policy

## 7. 버전 계약

필수:

- sdk version
- minimum runtime version
- breaking change policy
- compatibility check

## 8. AI와 확장모델

AI는:

- widget 조합
- plugin 실행
- server action wiring

까지 할 수 있어야 합니다.  
그러려면 SDK 메타데이터가 충분히 구조화돼 있어야 합니다.

## 9. 완료 기준

v2 확장모델은 최소 다음을 만족해야 합니다.

- custom widget 1개 추가 가능
- selection transform plugin 1개 추가 가능
- server action 1개 등록 가능
- AI가 이 세 가지를 호출/제안 가능
