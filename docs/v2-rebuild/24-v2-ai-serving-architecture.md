# 24. v2 AI Serving Architecture

이 문서는 v2의 AI 추론 서빙 구조를 정의합니다.

핵심 원칙:

- 외부 상용 LLM API 사용 금지
- 모든 추론은 self-hosted inference cluster에서 수행
- editor shell은 model vendor가 아니라 **AI gateway**와만 통신
- inference 결과는 항상 `AIPatch` 또는 structured diagnostic으로 반환

## 1. 계층

```text
Editor Shell
  -> AI Gateway
  -> Context Assembler
  -> Planner
  -> Model Router
  -> Inference Workers
  -> Critic / Validator
  -> Preview / Approval
  -> Apply / Rollback
```

## 2. 구성 요소

### 2.1 AI Gateway

책임:

- 인증/권한 확인
- request envelope 정규화
- sync vs async 분기
- trace id 발급

### 2.2 Context Assembler

입력:

- `SceneDoc`
- selection
- tokens / variables
- `ValidationReport`
- recent edits
- optional `RuntimeGraph`

출력:

- model-independent context bundle

### 2.3 Planner

책임:

- 요청 intent 분류
- 작업 범위 결정
- allowed operation set 결정
- 필요한 모델 타입 결정

### 2.4 Model Router

책임:

- planner / generator / critic 라우팅
- model registry 조회
- latency budget에 따라 model 선택
- failover model 선택

### 2.5 Inference Workers

유형:

- sync patch worker
- async generation worker
- critic worker
- repair worker

요구사항:

- batch 가능
- timeout 강제
- structured output 강제

## 3. sync / async 분리

### Sync

용도:

- selection 수정
- 작은 레이아웃 정리
- 간단한 patch 제안

제약:

- low latency
- strict timeout
- 작은 context

### Async

용도:

- 큰 문서 보정
- page completion
- 장시간 debug/repair
- 다단계 planning

제약:

- queue 기반
- progress 상태 제공
- cancel 가능

## 4. 요청 흐름

1. shell이 AI 요청 생성
2. gateway가 request envelope 생성
3. context assembler가 구조화 컨텍스트 생성
4. planner가 scope/intent/allowed ops 결정
5. model router가 적절한 worker 선택
6. worker가 patch draft 생성
7. critic/validator가 검증
8. preview artifact 생성
9. 사용자 승인
10. patch apply 또는 rollback

## 5. request envelope

최소 필드:

- `requestId`
- `documentId`
- `snapshotId`
- `userIntent`
- `selectionIds`
- `mode`
- `latencyBudgetMs`
- `allowAsync`
- `traceId`

## 6. response envelope

최소 필드:

- `requestId`
- `status`
- `patchId`
- `previewToken`
- `validationSummary`
- `modelMetadata`
- `latencyMs`
- `requiresApproval`

## 7. 실패 처리

유형:

- timeout
- invalid structured output
- validator reject
- preview build fail
- inference worker unavailable

정책:

- 실패는 patch 미적용
- partial apply 금지
- retry는 planner 단계까지만 허용
- destructive patch는 자동 재시도 금지

## 8. 캐시

허용:

- context hash 기반 short-lived cache
- repeated validation result cache
- retrieval result cache

금지:

- 사용자 승인 없이 이전 patch 자동 재사용
- cross-document context leakage

## 9. 관측성

필수 지표:

- request count
- success rate
- timeout rate
- invalid output rate
- validator reject rate
- approval rate
- rollback rate
- p50/p95 latency
- GPU utilization

## 10. 최종 결론

v2 AI 서빙은 단순한 모델 호출 계층이 아니라
**gateway -> planner -> router -> inference -> validator -> preview -> approval**
전체를 가진 독립 시스템이어야 합니다.
