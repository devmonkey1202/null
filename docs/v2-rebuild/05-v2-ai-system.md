# 05. v2 AI System

이 문서는 v2의 AI 계층을 정의합니다.

핵심 전제:

- AI는 선택 기능이 아니라 핵심 계층입니다.
- AI는 외부 상용 LLM API에 의존하지 않습니다.
- 초기 단계는 **B 방식**으로 시작합니다.
  - 오픈 웨이트 모델 사용
  - 자체 호스팅 추론
  - 자체 오케스트레이션 / 검증 / 승인 / 롤백
- 장기적으로는 **C 방식**으로 확장합니다.
  - 더 큰 자체 모델
  - 자체 튜닝 / 평가 / 배포
  - 더 높은 자율성

즉, v2 AI는 "남의 모델 API를 호출하는 보조 챗봇"이 아니라
**에디터 문서를 구조적으로 수정하는 자체 AI 시스템**입니다.

## 1. 기본 판단

상용 수준 에디터일수록 아래 복잡도가 급격히 올라갑니다.

- selection
- layout
- token
- component
- variable
- binding
- preview / publish parity

이걸 전부 수동으로만 다루면 생산성이 무너집니다.
따라서 AI는 필수입니다.

단, AI가 HTML/CSS/JS를 통째로 생성하면 안 됩니다.
AI는 항상:

- `SceneDoc`
- `EditorCommand`
- `ValidationReport`
- `RuntimeGraph`
- `ServiceBinding`
- `AIPatch`

같은 구조화된 내부 표현을 읽고, **구조적 patch**만 반환해야 합니다.

## 2. 외부 API 금지 원칙

v2 AI의 기본 운영 원칙은 다음과 같습니다.

1. 외부 상용 LLM inference API 사용 금지
2. 모든 추론은 self-hosted inference cluster에서 수행
3. 모든 AI 요청/응답은 구조화 로그로 저장
4. 모든 patch는 validator / approval / rollback 경로를 통과
5. 모델 교체와 무관하게 `AIPatch` / `ValidationReport` 계약은 유지

이 원칙은 비용 구조보다도 **통제권과 장기 데이터 자산** 때문에 중요합니다.

## 3. B -> C 전략

### B. 현실적인 자체 개발

초기 단계는 다음 구조로 갑니다.

- 오픈 웨이트 기반 모델 사용
- 자체 GPU/추론 서버에서 서빙
- 플랫폼 특화 prompt / planner / validator / patch executor 직접 개발
- 사용자 승인/거절/수정 데이터를 지속 축적

### C. 장기 확장

B 단계에서 축적한 아래 데이터를 기반으로 C로 넘어갑니다.

- 사용자 요청 원문
- 선택/문서 맥락
- 생성된 `AIPatch`
- validator 실패 원인
- 승인/거절 여부
- 사용자 후수정 결과
- 평가 점수

즉, B는 임시방편이 아니라 **C를 위한 데이터 수집기**여야 합니다.

## 4. 현재 phase의 AI 역할

현재 구현 우선순위는 "앱 전체 생성기"가 아니라
**에디터 문서를 구조적으로 수정하는 AI**입니다.

### Mode A. Generate

현재 phase에서의 생성은 아래에 가깝습니다.

- 요구사항 -> 페이지/프레임 구조 생성
- 디자인 시스템 기본값 적용
- 컴포넌트/레이아웃 초안 생성

### Mode B. Continue

사용자가 30~70 정도 만든 상태에서 이어서 완성합니다.

- 누락된 페이지/프레임 생성
- 컴포넌트/토큰 정리
- 상태 화면 보완
- 반응형 보완

### Mode C. Modify Selection

선택한 프레임/컴포넌트/페이지만 수정합니다.

- 레이아웃 변경
- 스타일 변경
- 컴포넌트화
- token / variable 정리
- binding 보정

### Mode D. Debug

동작 문제를 분석하고 고칩니다.

- selection / 문서 / 바인딩 문제 추적
- preview / publish 불일치 분석
- validation report 기반 patch 제안

### Mode E. Polish

마감 품질을 정리합니다.

- 디자인 일관성
- spacing / typography / tokens
- 접근성
- 마이크로카피

## 5. Runtime / Service 연결 위치

현재 phase에서 Runtime / Service / AI는 **보조 계약**입니다.

AI는 필요 시:

- RuntimeGraph hook 생성
- ServiceBinding 연결
- preview / publish 가능한 구조 보강

정도까지만 다룹니다.

즉, 현재 AI의 중심은 **에디터 문서 수정**이고,
runtime/service는 그 산출물을 실행 가능한 구조로 넘기기 위한 최소 연결층입니다.

## 6. AI가 직접 다뤄야 하는 IR

현재 phase 최소 대상:

1. `SceneDoc`
2. `DesignTokens`
3. `VariableGraph`
4. `ValidationReport`
5. `RuntimeGraph`
6. `ServiceBindings`
7. `TestSpec`

AI는 코드를 직접 생성하는 것이 아니라:

- 노드 추가
- 페이지 추가
- 변수 생성
- 토큰 연결
- 컴포넌트화
- binding 수정
- runtime hook 추가

같은 **구조화된 diff**를 만들어야 합니다.

## 7. AI 시스템 레이어

```text
User Intent
  -> Context Assembler
  -> Planner
  -> Patch Generator
  -> Static Validator
  -> Visual / Behavior Validator
  -> Patch Preview
  -> User Approve
  -> Patch Apply Engine
  -> Post-apply Verification
  -> Structured Log / Eval Sink
```

### 7.1 Context Assembler

입력:

- 현재 문서 / 선택 영역
- 디자인 토큰
- 변수
- validation 결과
- preview 오류
- 최근 변경 이력

### 7.2 Planner

역할:

- 요청 해석
- 수정 범위 제한
- selection / page / document 범위 결정

### 7.3 Patch Generator

역할:

- `AIPatch` 생성
- 변경 이유 설명
- 위험도 표시
- 영향 범위 표시

### 7.4 Static Validator

역할:

- schema validation
- broken binding detection
- token reference validation
- illegal destructive patch 검출

### 7.5 Visual / Behavior Validator

역할:

- preview build
- screenshot diff
- selection / interaction smoke 검증
- accessibility lint

### 7.6 Patch Apply Engine

역할:

- 승인된 diff만 적용
- undo / rollback 경로 유지
- partial apply 금지

## 8. 모델 / 서비스 분리

AI는 "모델 1개"가 아닙니다.

권장 분리:

- `intent-parser`
- `planner`
- `patch-generator`
- `critic`
- `repairer`

각 단계는 같은 모델을 재사용할 수도 있고, 다른 모델로 나눌 수도 있습니다.
중요한 것은 **모델이 아니라 출력 계약이 고정**되어야 한다는 점입니다.

## 9. 모델 독립 로그 원칙

B에서 C로 자연스럽게 가려면, 처음부터 아래를 저장해야 합니다.

- `requestId`
- 사용자 요청 원문
- 현재 `SceneDoc` snapshot id
- 선택/문맥 정보
- 사용된 model metadata
- 생성된 `AIPatch`
- validator 결과
- 승인/거절 결과
- 적용 후 snapshot id
- 사용자 후수정 결과

이 로그는 특정 모델에 종속되면 안 됩니다.
즉, prompt 문자열보다 **구조화된 입출력 기록**이 더 중요합니다.

## 10. self-hosted inference 원칙

AI 추론은 아래 구조를 따릅니다.

- editor shell -> AI gateway
- AI gateway -> model router
- model router -> self-hosted inference worker
- inference result -> validator / critic
- validator pass -> preview / approval

추론은 동기/비동기를 나눕니다.

- 즉시 UI 보조: synchronous
- 큰 문서 생성/정리: asynchronous job

## 11. 학습 / 평가 전략

초기에는 foundation model을 직접 pretrain 하지 않습니다.

대신:

1. 오픈 웨이트 기반 모델 선택
2. 플랫폼 특화 instruction tuning
3. synthetic task dataset 생성
4. 승인/거절/수정 이력 축적
5. 평가 세트 고정
6. 반복 튜닝

장기적으로는:

- continue pretraining
- domain-specific post-training
- planner / patch / critic 분리 모델

로 확장합니다.

## 12. AI가 잘 하는 것 / 못 하는 것

### 강한 영역

- 레이아웃 정리
- spacing / token 정리
- 컴포넌트화
- 구조적 diff 생성
- selection 기반 수정
- preview / publish 불일치 보조 분석

### 약한 영역

- 모호한 요구사항 해석
- 제품 정책 판단
- 고난도 실시간 충돌 해결
- 미적 마감의 마지막 10%

즉, AI는 강한 보조 계층이지만 제품 책임 전체를 대체하지는 않습니다.

## 13. 안전 장치

필수:

- patch preview
- dry run
- scope lock
- reversible apply
- automatic validation
- failed patch rollback
- audit trail
- user approval gate

AI가 바로 production 결과를 자동 반영하면 안 됩니다.

## 14. 개발 우선순위

### 1차

- selection-aware layout/style edit
- token/style cleanup
- page completion

### 2차

- preview / publish parity fix assist
- minimal RuntimeGraph / ServiceBinding wiring

### 3차

- collaboration/debug assist
- cross-page refactor

## 15. Rust 커널과의 관계

AI가 제대로 작동하려면 Rust 커널이 먼저 안정적이어야 합니다.

이유:

- AI는 구조적 수정만 해야 함
- 커널이 결정론적이어야 diff 결과가 예측 가능함
- shell이 DOM 조작/임시 상태 중심이면 AI 품질이 무너짐

즉, AI는 Rust 커널 위에서만 상용 수준으로 작동할 수 있습니다.

## 16. 최종 결론

v2 AI는:

- 외부 상용 API 의존 없이
- 자체 호스팅 inference를 사용하고
- `AIPatch` / validator / approval / rollback 구조를 갖추며
- B 단계에서 데이터를 축적한 뒤
- C 단계의 더 강한 자체 모델로 확장 가능한

**에디터 중심 구조 수정 AI 시스템**이어야 합니다.
