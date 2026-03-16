# NULL Figma Multiplayer / CRDT 설계

## 1. 목표

현재 NULL 협업은 `presence + full doc broadcast` 수준이다.
목표는 Figma급 multiplayer이므로 아래 두 항목을 고정한다.

1. presence 수준을 넘어 CRDT/Yjs 기반 동시편집으로 전환
2. merge / branch / conflict 정책 수립

## 2. 현재 상태

- 서버는 `src/server/socket.ts`에서 `editor:presence`, `editor:doc`를 브로드캐스트한다.
- 에디터는 `src/advanced/ui/AdvancedEditorView.tsx`에서 socket을 받아 peer/presence/doc apply를 처리한다.
- branch는 현재 버전 복원과 local branch name 저장 수준이다.

즉, 지금은 충돌을 구조적으로 해결하지 못한다.
거의 `last write replay`에 가깝다.

## 3. 전환 원칙

1. presence는 CRDT와 분리한다.
2. 문서 전체를 매번 보내지 않는다.
3. text는 text용 CRDT를 쓴다.
4. node tree와 selection/presence를 같은 채널로 섞지 않는다.
5. 버전/branch는 CRDT 히스토리와 별개로 유지한다.

## 4. 권장 구조

Yjs를 기준으로 설계한다.

### 4.1 문서 분할

- `doc meta`
  - pages, styles, variables, libraries
- `page map`
  - node records
- `node map`
  - frame/style/layout/text/shape/prototype
- `presence`
  - cursor, viewport, selection, active tool

presence는 `awareness` 계층으로 분리하고, 저장 대상이 아니다.

### 4.2 node 표현

node는 `Y.Map` 기반으로 저장한다.

필드 전략:

- scalar
  - `name`, `hidden`, `locked`, `rotation`
- object
  - `frame`, `style`, `layout`, `layoutSizing`, `constraints`
- rich text
  - `Y.Text`
- ordered children
  - `Y.Array<string>`

### 4.3 path / vector 편집

`shape.pathData`만 보내지 않는다.
이번에 정리한 `vectorNetwork` 편집 모델을 CRDT 기준 모델로 삼는다.

- vertices: `Y.Map`
- segments: `Y.Map`
- path order: `Y.Array`

이렇게 해야 anchor/edge/handle 동시 편집 충돌을 줄일 수 있다.

## 5. 충돌 정책

### 5.1 자동 해결

- selection / cursor / viewport
- 단순 scalar 편집
- 서로 다른 node 편집
- 서로 다른 style/token 편집

### 5.2 구조 충돌

- 같은 node의 children reorder
- 같은 path의 동일 anchor 편집
- 같은 component variant props 편집

이 경우 정책은 아래로 간다.

1. CRDT order를 우선 적용
2. semantic validator로 이상 상태 검사
3. invalid state면 conflict badge를 남기고 review 큐에 넣는다

### 5.3 text 충돌

text는 `Y.Text`로 자동 병합한다.
별도 last-write 규칙을 쓰지 않는다.

## 6. Branch / Merge 정책

branch는 단순 localStorage 이름 저장이 아니라 `named version head`로 올린다.

### 6.1 branch 생성

- 특정 version snapshot에서 branch 생성
- branch는 별도 CRDT doc head를 가진다

### 6.2 merge

- branch -> target merge는 CRDT update replay + semantic diff preview
- 자동 병합 가능한 항목은 즉시 merge
- 구조 충돌은 review list에 표시

### 6.3 conflict 분류

- `safe`
  - 자동 merge
- `review`
  - diff preview 후 승인
- `manual`
  - 사용자 선택 필요

## 7. 버전과 CRDT의 관계

CRDT를 쓰더라도 version 시스템은 유지한다.

- version
  - publish/restore/review용 스냅샷
- CRDT state
  - 실시간 편집용 head

즉, 실시간 협업과 버전 복원을 합치지 않는다.

## 8. 네트워크 원칙

현재 socket.io를 버리지 않는다.
먼저 socket.io 위로 CRDT update를 올린다.

전송 채널:

- `editor:presence`
- `editor:awareness`
- `editor:update`
- `editor:sync`
- `editor:checkpoint`

처음부터 transport를 바꾸지 않고, payload를 바꾼다.

## 9. 오프라인 / 재접속

필수 정책:

1. reconnect 후 document sync
2. local unsent update replay
3. awareness 복구
4. branch head 재연결

## 10. 구현 순서

1. doc broadcast를 op/update 구조로 교체
2. presence와 awareness 분리
3. text CRDT 전환
4. node map / child order CRDT 전환
5. vectorNetwork CRDT 전환
6. branch/merge UI와 review queue 추가

## 11. 완료 기준

1. 같은 문서를 두 사용자가 동시에 편집해도 구조가 깨지지 않는다.
2. text와 vector edit가 동시에 들어와도 usable 하다.
3. reconnect 후 문서와 awareness가 복구된다.
4. branch merge에서 destructive conflict가 review 없이 적용되지 않는다.
5. 기존 version/publish 흐름과 충돌하지 않는다.
