# 26. v2 AI Model Lifecycle

이 문서는 B 단계에서 C 단계로 이어지는 AI 모델 생애주기를 정의합니다.

## 1. 단계 정의

### Stage B1

- 오픈 웨이트 기반
- self-hosted inference
- patch generation / validation / approval 중심

### Stage B2

- 플랫폼 특화 튜닝
- synthetic + human data 축적
- eval set 고정

### Stage B3

- planner / generator / critic 역할 분리
- 도메인 특화 모델 추가

### Stage C1

- continue pretraining 또는 domain pretraining
- 더 강한 내부 모델 운영

### Stage C2

- foundation에 가까운 자체 모델
- planner / patcher / critic / repairer 모두 내부 모델 중심

## 2. promote 기준

모델은 아래를 만족해야 promote 가능합니다.

- eval set pass
- rollback rate 기준 이하
- validator reject rate 기준 이하
- latency budget 충족
- cost budget 충족

## 3. rollback 기준

아래 중 하나면 rollback 가능해야 합니다.

- task success 급락
- approval rate 급락
- rollback rate 상승
- latency 폭증
- 안전성 위반

## 4. artifact 관리

보존 대상:

- model weights
- tokenizer/version metadata
- training config
- dataset lineage
- eval result
- deployment manifest

## 5. serving model vs training model

둘을 분리합니다.

- serving model: 현재 배포 모델
- candidate model: 평가 중 모델
- training model: 학습 중 모델

## 6. B -> C 전환 원칙

전환은 점프가 아니라 누적이어야 합니다.

- B에서 쌓은 request / patch / outcome 로그를 그대로 사용
- `AIPatch` 계약은 유지
- validator / approval / rollback은 유지
- model만 교체하거나 확대

## 7. 최종 결론

B 단계는 C의 대체재가 아니라
**C를 가능하게 만드는 운영/데이터 기반 단계**입니다.
