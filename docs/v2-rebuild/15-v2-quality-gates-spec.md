# 15. v2 Quality Gates Specification

이 문서는 **상용 수준 에디터 완성**을 목표로 할 때 필요한 게이트를 정의합니다.

## 1. 원칙

완성 판단은 감으로 하지 않습니다.  
모든 phase와 최종 전환은 통과 기준을 가져야 합니다.

## 2. 최상위 원칙

- **에디터 품질 게이트가 release blocker다**
- runtime / service / AI는 에디터 산출물 확장을 위한 보조 게이트다
- internal QA와 staging validation 없이 기본 전환하지 않는다

## 3. 에디터 게이트

- selection stability tests
- drag/resize/rotate tests
- undo/redo determinism tests
- large document benchmark
- inspector interaction tests
- visual regression
- clipboard / import / asset attach tests
- autosave / recovery tests
- component / instance / override tests
- text input / IME / caret tests
- vector boolean / path edit tests

## 4. 런타임 보조 게이트

- route/state/action integration tests
- binding correctness tests
- publish/preview parity tests
- runtime idle leak tests

## 5. 서비스 보조 게이트

- auth/session tests
- document save/version tests
- publish snapshot tests
- collaboration consistency tests
- comment/review anchor tests

## 6. AI 보조 게이트

- patch schema validation
- dry-run success rate
- selection modify accuracy
- no unauthorized destructive patch
- rollback correctness
- before/after visual diff review

## 7. 전환 게이트

다음을 모두 통과해야 **v2 에디터 기본 전환**을 고려할 수 있습니다.

- core editor perf budget green
- editor acceptance gate green
- internal QA green
- staging validation green
- runtime parity green
- collaboration consistency green
- AI patch safety green
- migration rollback tested

## 8. 수동 검수 항목

자동화만으로 안 되는 항목:

- 디자인 품질
- 편집기 사용감
- 정보 구조
- 마감 디테일
- 키보드 흐름
- 캔버스/인스펙터 상호작용

## 9. 운영 게이트

- dashboards ready
- alert rules ready
- oncall playbook ready
- migration playbook ready
- rollback verified

## 10. 최종 판단 규칙

“기능이 된다”는 출시 기준이 아닙니다.  
출시는 다음일 때만 가능합니다.

- 에디터 기능
- 성능
- 안정성
- 운영성
- UX
- 복구성

이 여섯이 동시에 기준을 넘을 때만 가능하며,  
이중 **에디터 품질 게이트 미통과는 단독 release blocker**입니다.
