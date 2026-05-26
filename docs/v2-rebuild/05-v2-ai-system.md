# 05. v2 AI System

이 문서는 v2의 AI 계층을 정의합니다.  
현재 우선순위는 **앱 전체 생성기**가 아니라 **에디터 문서를 구조적으로 수정하는 AI**입니다.

## 1. 기본 판단

AI는 선택 기능이 아니라 핵심 계층이어야 합니다.

이유:

- 상용 수준 에디터일수록 구조와 조작 복잡도가 올라감
- selection, layout, token, component, binding 정리를 수동으로만 하면 생산성이 무너짐
- 문서를 구조적으로 수정하는 보조 계층이 필요함

단, AI는 HTML/CSS를 직접 찍어내면 안 됩니다.  
AI는 항상 **구조화된 내부 모델(IR)**을 읽고 patch를 반환해야 합니다.

## 2. 현재 phase의 AI 역할

### Mode A. Generate

현재 phase에서의 “생성”은 앱 전체 생성이 아니라 다음에 가깝습니다.

- 요구사항 -> 페이지/프레임 구조 생성
- 디자인 시스템 기본값 적용
- 컴포넌트/레이아웃 초안 생성

### Mode B. Continue

사용자가 30~70 정도 만든 상태에서 이어서 완성:

- 누락된 페이지/프레임 생성
- 컴포넌트/토큰 정리
- 반응형/다크모드/상태 화면 보완

### Mode C. Modify Selection

선택한 프레임/컴포넌트/페이지만 수정:

- 레이아웃 변경
- 스타일 변경
- 컴포넌트화
- token/variable 정리
- binding 보정

### Mode D. Debug

동작 문제를 분석하고 고침:

- selection/문서/바인딩 문제 추적
- preview/publish 불일치 분석
- validation report 기반 patch 제안

### Mode E. Polish

마감 품질 정리:

- 디자인 일관성
- spacing/typography/tokens
- 접근성
- 마이크로카피

## 3. Runtime / Service 연결에 대한 위치

Runtime/Service/AI 연결은 현재 phase에서 **보조 계약**입니다.

AI는 필요 시:

- RuntimeGraph hook 생성
- ServiceBinding 연결
- preview/publish 가능한 구조 보강

정도까지만 다룹니다.

즉, 현재 AI의 중심은 **에디터 문서 수정**입니다.

## 4. AI가 직접 다뤄야 하는 IR

현재 phase 최소 대상:

1. `SceneDoc`
2. `DesignTokens`
3. `VariableGraph`
4. `ValidationReport`
5. `RuntimeGraph` (최소 연결용)
6. `ServiceBindings` (최소 연결용)
7. `TestSpec`

핵심 원칙:

AI는 코드 문자열을 직접 생성하는 것이 아니라:

- 노드 추가
- 페이지 추가
- 변수 생성
- 토큰 연결
- 컴포넌트화
- binding 수정
- preview hook 추가

같은 구조화된 diff를 만들어야 합니다.

## 5. AI 시스템 아키텍처

```text
User Intent
  -> Context Assembler
  -> Planner
  -> IR Patch Generator
  -> Static Validator
  -> Visual/Behavior Validator
  -> Patch Preview
  -> User Approve
  -> Apply Patch
  -> Post-apply Verification
```

## 6. 세부 구성요소

### 6.1 Context Assembler

입력:

- 현재 문서/선택 영역
- 디자인 토큰
- 변수
- 검증 결과
- 미리보기 오류
- 기존 변경 이력

### 6.2 Planner

역할:

- 요청 해석
- 수정 범위 제한
- selection/page/document 단위 결정

### 6.3 Patch Generator

역할:

- IR diff 생성
- 변경 사유 설명
- 위험도 표시
- 영향 범위 표시

### 6.4 Static Validator

역할:

- schema validation
- broken binding detection
- token reference validation
- illegal destructive patch 검출

### 6.5 Visual / Behavior Validator

역할:

- preview build
- screenshot diff
- selection/interaction 회귀 검증
- accessibility lint

### 6.6 Patch Apply Engine

역할:

- 승인된 diff만 적용
- undo/rollback 가능하게 기록
- partial apply 지원

## 7. AI 사용 위치

- 에디터 우측 패널 보조
- 하단 AI 콘솔
- selection contextual action

현재 phase에서는 **“앱 전체 생성 wizard”보다 selection/page/document 편집 보조가 우선**입니다.

## 8. 사용자 입력 예시

- “이 화면을 정리된 오토레이아웃 구조로 바꿔줘”
- “선택한 카드들을 컴포넌트화해줘”
- “이 페이지를 다크모드까지 마감해줘”
- “이 문서에서 토큰/간격/정렬 오류를 잡아줘”

## 9. 생성/보완 파이프라인

### 0 -> 100

1. 목표 해석
2. 문서 유형 추론
3. 페이지/프레임 구조 생성
4. 디자인 시스템 부여
5. 컴포넌트/레이아웃 배치
6. 필요한 최소 RuntimeGraph hook 생성
7. 테스트 스펙 생성
8. preview/검증
9. 사용자 승인

### 70 -> 100

1. 현재 문서 파악
2. 누락 구조 탐지
3. 일관성 문제 탐지
4. 토큰/바인딩/selection 문제 탐지
5. patch 생성
6. preview 제공
7. 승인 후 적용

## 10. Debug 파이프라인

1. 문제 재현 데이터 수집
2. validation / preview trace 확인
3. selection / binding / render / parity 분석
4. 원인 후보 생성
5. 수정 patch 제안
6. 회귀 테스트 생성

## 11. 안전장치

필수:

- patch preview
- dry run
- scope lock
- reversible apply
- automatic validation
- failed patch rollback
- audit trail
- user approval gate

AI가 바로 production에 반영되면 안 됩니다.

## 12. AI가 잘 못하는 것

- 모호한 요구사항 해석
- 엣지 케이스 운영 판단
- 미적 판단의 마지막 10%
- 초고난도 협업 충돌 복구

즉, AI는 강한 에디터 커널 위에서 크게 유용하지만,  
최종 제품 책임을 대체하지는 않습니다.

## 13. AI와 Rust 커널의 관계

AI가 잘 작동하려면 Rust 커널이 먼저 안정적이어야 합니다.

이유:

- AI는 구조화된 수정만 해야 함
- 커널이 결정론적이어야 diff 결과가 예측 가능함
- 랜덤한 DOM 조작/암묵적 런타임이면 AI가 실패함

## 14. 우선 개발 순서

### 1차

- selection-aware layout/style edit
- token/style cleanup
- page completion

### 2차

- preview/publish parity fix assist
- minimal RuntimeGraph / ServiceBinding wiring

### 3차

- collaboration/debug assist
- cross-page refactor

## 15. 최종 결론

현재 v2에서 AI는 **에디터 문서를 구조적으로 수정하는 IR Patch 계층**이 우선입니다.  
앱 플랫폼 전체 생성기는 현재 phase의 중심 목표가 아닙니다.
