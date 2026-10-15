# 27. v2 AI Safety and Approval Specification

이 문서는 v2 AI의 안전 장치와 승인 절차를 정의합니다.

## 1. 기본 원칙

- AI는 자동 production 반영 금지
- 모든 patch는 preview 가능해야 함
- destructive patch는 승인 필수
- forbidden operation은 생성되더라도 apply 금지

## 2. approval 단계

1. patch 생성
2. static validation
3. preview build
4. behavior/visual validation
5. user approval
6. apply
7. post-apply verification

## 3. risk 등급

### low

- spacing
- typography
- token cleanup
- selection-limited layout changes

### medium

- component extraction
- route/state/action hook 생성
- multi-node refactor

### high

- destructive delete
- publish/auth binding 변경
- cross-page structural rewrite

## 4. forbidden operations

- raw HTML blob injection
- scope 밖 node mutation
- secret/credential 직접 삽입
- publish/auth destructive rewrite
- validator bypass

## 5. approval 조건

무조건 승인 필요한 경우:

- `risk = high`
- cross-page patch
- runtimeOps/serviceOps 포함
- selection 범위를 넘어서는 구조 변경

## 6. audit trail

반드시 남겨야 하는 것:

- request id
- actor id
- patch id
- model metadata
- validation result
- approval actor
- apply result
- rollback 여부

## 7. rollback

필수:

- pre-apply snapshot
- inverse operation 또는 restore path
- apply failure 즉시 중단

## 8. human correction

AI 적용 후 사람이 수정한 결과는 반드시 기록합니다.
이건 B -> C 학습 데이터의 핵심입니다.

## 9. 최종 결론

v2 AI는 "잘 만드는 모델"만으로 충분하지 않습니다.
**안전하게 제안하고, 검증되고, 승인되고, 되돌릴 수 있어야 상용 계층**입니다.
