# 25. v2 AI Data and Eval Specification

이 문서는 v2 AI의 데이터 수집 방식과 평가 기준을 정의합니다.

핵심 목적:

- B 단계에서 C 단계로 넘어갈 수 있는 데이터 자산 구축
- 모델 독립적인 학습/평가 데이터 확보
- approval / rejection / repair 이력 구조화

## 1. 저장해야 하는 데이터

### 1.1 request log

- requestId
- actorId
- documentId
- snapshotId
- raw intent
- selection ids
- mode
- timestamp

### 1.2 context bundle

- `SceneDoc` reference
- token/variable summary
- validation summary
- runtime/service summary
- recent edits summary

### 1.3 generation record

- planner output
- prompt/input bundle fingerprint
- model metadata
- generated `AIPatch`
- generation latency

### 1.4 validation record

- schema result
- static validator result
- preview build result
- visual/behavior validator result

### 1.5 outcome record

- approved / rejected
- rejection reason
- post-edit correction
- rollback 여부
- final success 여부

## 2. 데이터 원칙

1. 모델 독립적이어야 함
2. 문자열 프롬프트보다 구조화 결과를 우선 저장
3. 동일 태스크를 재생성 가능한 수준으로 저장
4. 개인정보/민감정보는 redaction 정책 적용

## 3. 학습 데이터 유형

### A. Human-approved patch

가장 강한 supervised signal.

### B. Rejected patch

실패 유형 분류와 critic 학습에 사용.

### C. Repaired patch

AI 초안 -> 사람 수정 -> 최종본 비교 데이터.

### D. Synthetic patch task

의도적으로 생성한 연습/회귀 데이터.

### E. Regression benchmark case

절대 다시 깨지면 안 되는 기준 세트.

## 4. synthetic data 생성

초기에는 synthetic data 비중이 높아야 합니다.

예:

- spacing/align 정리 태스크
- component extraction 태스크
- token binding 보정 태스크
- selection 범위 patch 태스크
- preview parity repair 태스크

## 5. 평가 축

### 5.1 patch validity

- schema valid rate
- validator pass rate

### 5.2 task success

- 요구사항 충족률
- 후수정 필요 정도

### 5.3 safety

- forbidden op rate
- wrong-scope mutation rate

### 5.4 user acceptance

- approval rate
- rejection reason distribution

### 5.5 repair quality

- rollback rate
- follow-up repair success rate

## 6. eval set

반드시 고정된 eval set이 있어야 합니다.

유형:

- layout cleanup
- token normalization
- component extraction
- page completion
- preview/publish parity fix
- selection-scoped patch
- low-risk debug fix

## 7. 데이터 버전

모든 dataset은 버전이 있어야 합니다.

예:

- `dataset-2026q2-b1`
- `eval-editor-2026q2-v1`

## 8. B -> C 전환에 필요한 조건

다음 데이터가 쌓여야 합니다.

- 충분한 approved patch corpus
- 충분한 rejected patch corpus
- stable eval set
- repeated failure taxonomy
- domain별 success/failure 분포

## 9. 최종 결론

v2 AI 데이터 체계의 핵심은
**모델을 학습시키는 것보다, 모델을 바꿔도 재사용 가능한 구조화 데이터 자산을 쌓는 것**입니다.
