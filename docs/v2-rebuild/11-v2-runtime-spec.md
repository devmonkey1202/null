# 11. v2 Runtime Specification

이 문서는 v2 런타임 엔진의 상세 명세입니다.  
현재 phase에서 runtime은 **에디터 산출물을 preview/publish 가능한 구조로 넘기기 위한 보조 계약**입니다.

## 1. 목표

v2 런타임은 더 이상 “패턴 이름 해석기”가 아니어야 합니다.  
모든 동작은 **명시적 그래프와 바인딩**으로 실행되어야 합니다.

## 2. 런타임 핵심 역할

- route resolution
- page composition
- component instantiation
- state graph evaluation
- action graph execution
- service binding invocation
- minimal realtime event handling
- render command emission

## 3. 핵심 원칙

1. 암묵적 라벨/페이지 이름 추론 금지
2. 런타임 상태와 편집기 상태 분리
3. side effect는 action executor를 통해서만 발생
4. route/state/action/permission은 별도 그래프로 정의

## 4. Route Graph

각 page는 route graph로 연결됩니다.

필수:

- path
- page target
- guard
- loader
- error boundary target
- layout target

## 5. State Graph

상태는 scope를 가져야 합니다.

- local
- component
- page
- app
- session

필수 기능:

- initial value
- derived/computed state
- async load state
- error state
- reset semantics

## 6. Action Graph

action은 이벤트에 매핑된 실행 노드입니다.

트리거 예:

- click
- submit
- input change
- route load
- timer
- realtime event

액션 종류:

- navigate
- set_state
- upload_file
- emit_realtime
- open_modal
- close_modal
- call_custom_function
- call_service

## 7. Binding Resolver

binding은 node property와 data/state/service를 연결합니다.

지원 대상:

- text
- visibility
- enabled/disabled
- src/media
- list repeat
- form value
- token/variable interpolation

원칙:

- binding failure는 조용히 무시하지 말고 진단 리포트에 남김

## 8. Repeat/List Model

목록/카드는 1급 모델이어야 합니다.

필수:

- list data source
- sort/filter/pagination
- empty state
- loading state
- detail navigation target

반복 아이템 내부에서 item scope를 제공해야 합니다.

## 9. Form Model

필수:

- field binding
- validation
- submit action
- pending state
- success state
- error state
- field-level error

## 10. Permission-aware Runtime

런타임은 permission model을 실행 시점에 반영해야 합니다.

예:

- page guard
- button hidden/disabled
- field readonly
- publish action deny

## 11. Realtime Runtime

필수:

- channel subscribe
- presence update
- reconnect recovery

원칙:

- realtime는 parity 검증과 협업 보조에 필요한 최소 범위부터 구현

## 12. Service Binding Execution

runtime는 직접 DB를 몰라야 합니다.  
service binding을 통해서만 서버 액션을 호출합니다.

예:

- `platform.auth.login`
- `publish.snapshot.load`
- `media.asset.resolve`
- `collab.comment.create`

## 13. Failure Model

필수 실패 상태:

- loader failed
- action failed
- validation failed
- permission denied
- realtime disconnected
- stale data conflict

모든 실패는 UI state와 diagnostics에 반영돼야 합니다.

## 14. Runtime Preview / Publish Parity

에디터 preview와 퍼블릭 publish 결과는 동일한 엔진을 써야 합니다.

금지:

- preview 전용 특수처리
- publish 전용 특수처리

## 15. Debuggability

런타임은 디버그 가능한 구조여야 합니다.

필수 devtools:

- current route
- state tree
- last action
- recent service calls
- permission evaluation result
- realtime events

## 16. 완료 기준

다음을 만족해야 **Runtime Acceptance Gate**를 통과한 것으로 봅니다.

- preview / publish parity
- route/state/action graph 동작
- list / form / failure state 동작
- permission-aware render
- collaboration/publish hook 연결 가능

이 다섯이 **같은 엔진** 위에서 동작해야 합니다.
