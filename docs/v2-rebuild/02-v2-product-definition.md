# 02. v2 Product Definition

이 문서는 NULL v2의 **최종 방향**과 **현재 구현 우선순위**를 분리해서 고정합니다.

## 1. 최종 방향

NULL v2의 최종 방향은 장기적으로 아래까지 확장 가능한 구조를 갖는 것입니다.

- 실행 가능한 문서 모델
- 런타임/배포/AI 수정/서비스 연결
- 앱 플랫폼 전체로의 확장
- 서비스 빌더 전체로의 확장
- 백엔드 도메인 전체로의 확장

즉, 장기적으로는 단순 디자인 툴이 아니라 **확장 가능한 제품 기반**을 목표로 합니다.

## 2. 현재 구현 우선순위

하지만 현재 Phase 1의 최우선 목표는 위 전체를 한 번에 완성하는 것이 아닙니다.

> NULL v2는 우선 **상용 수준 에디터 완성**을 목표로 한다.

정확히는:

- 기존 NULL 에디터를 Rust/WASM 기반 Editor Kernel 구조로 교체
- React/Next는 셸, 라우트, 패널, 인스펙터, 대시보드 UI만 담당
- 문서 모델, scene graph, selection, hit testing, transform, layout, snapping, history, text, vector, render command, collaboration document ops는 Rust/WASM kernel 중심으로 분리

즉, 지금은 “무엇이든 만드는 플랫폼 전체”보다 **실행 가능한 문서 모델을 가진 상용 수준 에디터**를 먼저 완성하는 단계입니다.

## 3. v2의 제품 성격

v2는 단순 디자인 도구가 아닙니다.

정확한 정의:

> v2는 결과물이 이후 runtime / publish / AI patch / service binding으로 이어질 수 있는 문서 모델을 가진 에디터다.

즉:

- 에디터 자체가 핵심 제품
- 산출물은 정적인 화면이 아니라 구조화된 문서
- 그 문서는 이후 실행 가능한 구조로 넘겨질 수 있어야 함

## 4. 대상 사용자

주 대상은 아래와 같습니다.

- Figma 사용 경험이 있는 디자이너
- 구조 감각이 있는 프론트엔드/프로덕트 인력
- 시각적 편집기 안에서 구조와 상태를 다루고 싶은 사용자

전제:

- 완전 초보 친화성이 최우선 목표는 아님
- Figma의 정신 모델과 상호작용 패턴을 이해하는 사용자를 가정

## 5. v2 성공 조건

다음을 만족해야 v2의 현재 단계가 성공입니다.

### A. Editor Kernel

- 프레임/오토레이아웃/제약/정렬/스냅 안정성
- 컴포넌트/인스턴스/변형/토큰/변수 사용 가능
- 멀티페이지 문서 편집 가능
- 텍스트/벡터/렌더 경로가 일관됨
- 큰 문서에서도 편집 반응성이 유지됨
- 작업 상태와 문서 상태가 결정론적으로 유지됨

### B. Editor UX

- Builder UX / Canvas UX / Inspector UX / Keyboard UX가 상용 편집기 수준으로 정리됨
- selection 해제, overlay 간섭, 입력 씹힘 같은 문제가 없음
- 디버깅 가능한 상태/진단 출력이 존재

### C. 확장 가능한 문서 모델

- SceneDoc이 preview / publish / AI patch로 이어질 수 있음
- RuntimeGraph와 ServiceBinding은 에디터 산출물을 실행 가능한 구조로 넘기기 위한 최소 계약을 가짐
- WASM Bridge가 shell과 kernel을 안정적으로 연결함

### D. 운영과 전환

- Internal QA와 Staging Validation을 통과한 품질
- 로그/트레이스/메트릭/복구체계 존재
- default switch와 switchback이 가능한 운영 구조

## 6. “완벽”의 정의

문자 그대로의 완벽은 목표가 아닙니다.

배제:

- 버그 0
- 장애 0
- 모든 케이스 100% 선점
- Figma 전체 복제

목표:

> 상용 편집기에 요구되는 반응성, 일관성, 복구성, 디버그 가능성을 만족하는 것

## 7. 현재 범위

현재 문서 보강과 초기 구현에서 강하게 다루는 범위:

- Editor Kernel
- SceneDoc / EditorCommand / EditorSnapshot / ValidationReport / WASM Bridge
- selection / transform / layout / snapping
- history / undo / redo
- text / vector / render stack
- collaboration document ops
- Builder UX / Canvas UX / Inspector UX / Keyboard UX
- editor performance / quality gate
- AI patch를 통한 구조적 편집
- editor 산출물의 runtime / service 연결 계약

## 8. 현재 범위 밖

이번 문서 보강과 초기 구현의 중심이 아닌 것:

- 금융/정산/자동충전/에스크로
- 마켓플레이스 전체 도메인
- 예약/커뮤니티/운영툴 전체 도메인
- 모든 앱 유형 자동 생성 중심의 플랫폼 서술
- 외부 사용자 공개를 전제로 한 미완성 노출 흐름

이 항목들은 장기적으로 확장될 수 있지만, 현재 단계의 중심은 아닙니다.

## 9. 난이도

v2는 쉬운 도구가 아닙니다.  
대신 높은 난이도를 감당 가능한 수준으로 다룹니다.

### 쉬움

- 기본 프레임/텍스트/스타일 편집
- 페이지 구조 편집
- 토큰/변수 적용

### 보통

- 컴포넌트/인스턴스/변형
- 오토레이아웃/제약
- 문서 전체 구조 편집

### 어려움

- 대형 문서 성능 유지
- 텍스트/벡터 정확 동작
- collaboration document ops
- 구조적 AI patch 안정화

## 10. AI의 위치

AI는 이 단계에서 에디터 문서를 구조적으로 수정하는 계층입니다.

우선 모드:

- 선택 영역 수정
- 레이아웃/스타일 정리
- 페이지 이어서 완성
- 문서 구조 디버그

즉, 현재 AI는 범용 앱 생성기보다 **에디터 문서를 안전하게 수정하는 IR Patch 계층**으로 우선 정의합니다.

## 11. 최종 요약

> NULL v2의 장기 방향은 더 넓은 앱 플랫폼으로 확장 가능한 구조를 갖는 것이다.  
> 하지만 현재 구현의 최우선 목표는 Rust/WASM 기반 상용 수준 에디터를 완성하는 것이다.
