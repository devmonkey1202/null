# NULL Figma Library Publish / Consume / Update 설계

## 1. 목표

현재 NULL에는 `styles`, `variables`, `components`, `variants`, `propertyDefinitions`, `libraries` 모델이 이미 있다.
하지만 이것만으로는 Figma의 실제 팀 라이브러리 흐름을 대체하지 못한다.

이 문서의 목표는 아래 세 흐름을 고정하는 것이다.

1. `publish`
   - 로컬 컴포넌트/스타일/변수를 버전 있는 라이브러리로 승격한다.
2. `consume`
   - 다른 문서가 published library를 참조한다.
3. `update`
   - upstream 변경을 pull하면서 override와 충돌을 관리한다.

이번 범위는 `NULL 고유 marketplace`가 아니라 `Figma식 디자인 시스템 라이브러리`다.

## 2. 현재 상태

- 문서 모델에는 `styles`, `variables`, `variableModes`, `components`, `variants`, `propertyDefinitions`, `libraries`가 있다.
- 에디터에는 token export/import와 component/variant/property 편집이 있다.
- `/library` 화면은 작업물 브라우징에 가깝고, 팀 라이브러리 publish/consume/update 흐름은 아직 아니다.
- 따라서 현재는 `로컬 디자인 시스템 편집`은 가능하지만 `버전 있는 팀 라이브러리 운영`은 빠져 있다.

## 3. 핵심 문제

Figma급 라이브러리가 되려면 아래가 필요하다.

1. 로컬 ID와 published ID를 분리해야 한다.
2. library version이 올라가도 consumer 문서의 ref가 안정적으로 살아야 한다.
3. instance override는 살리고 source update는 받을 수 있어야 한다.
4. style/token alias와 mode도 library 경계를 넘어야 한다.
5. library update가 node tree를 통째로 교체하지 않고 semantic diff로 들어와야 한다.

## 4. 모델 설계

### 4.1 로컬 문서 모델 유지 원칙

기존 `scene.ts`의 로컬 구조는 유지한다.
추가되는 건 published reference metadata다.

필수 필드:

- `libraryId`
  - 라이브러리 자체 식별자
- `libraryVersionId`
  - publish snapshot 식별자
- `publishedKey`
  - component/style/variable의 안정 ref
- `sourceLibraryId`
  - consume된 항목의 출처
- `sourceVersionId`
  - 현재 붙어 있는 upstream 버전
- `sourcePublishedKey`
  - update 매칭에 쓰는 키

### 4.2 publish 단위

publish 대상은 세 묶음으로 나눈다.

1. component bundle
   - component root
   - variants
   - propertyDefinitions
   - component property source mapping
2. style bundle
   - fill / stroke / effect / text style token
3. variable bundle
   - variable
   - variableModes
   - alias 관계

### 4.3 library manifest

publish 결과물은 `manifest + snapshot` 구조로 간다.

- `manifest`
  - library meta
  - available published keys
  - latest stable version
- `snapshot`
  - 특정 version의 component/style/variable payload
  - diff base 정보
  - migration metadata

## 5. Publish 흐름

1. 로컬 문서에서 publish 대상 선택
2. published key가 없으면 신규 발급
3. snapshot 직렬화
4. manifest 갱신
5. consumer에 update available 신호 발생

publish 시 고정 규칙:

- node runtime id는 publish key로 쓰지 않는다.
- variant는 `component publishedKey + axis props` 기준으로 식별한다.
- propertyDefinition은 `source node publishedKey` 기준으로 묶는다.
- variable alias는 library 내부 ref로 저장한다.

## 6. Consume 흐름

consumer 문서에 들어오는 건 로컬 복제본이 아니라 `linked local copy`다.

규칙:

1. consume 시 source snapshot을 로컬 문서 구조로 materialize한다.
2. 모든 imported node/style/variable에 `sourceLibraryId`, `sourceVersionId`, `sourcePublishedKey`를 단다.
3. instance는 local `instanceOf`를 유지하되 source metadata도 같이 가진다.
4. style/token ref는 local id가 아니라 `publishedKey -> local resolved id` 매핑을 한 번 거친다.

즉, 에디터는 지금처럼 로컬 문서를 편집하지만, update는 source metadata 기준으로 받을 수 있다.

## 7. Update 흐름

update는 `replace all`이 아니라 `semantic patch`다.

### 7.1 component update

- source component tree를 published key 기준으로 매칭한다.
- consumer 문서의 instance override는 유지한다.
- source에서 사라진 node는 삭제 후보로 표시한다.
- source에서 추가된 node는 default state로 삽입한다.
- propertyDefinition rename은 `publishedKey`가 같으면 rename으로 처리한다.

### 7.2 variant update

- variant는 axis/value 조합으로 먼저 매칭한다.
- 그다음 `publishedKey`를 본다.
- consumer instance의 `variantId`는 최신 local resolved variant로 재연결한다.

### 7.3 style / variable update

- style/token의 local id는 바뀌어도 `publishedKey`가 같으면 같은 항목으로 본다.
- ref는 id가 아니라 published key 매핑을 거쳐 재연결한다.
- mode 추가/삭제는 diff preview를 먼저 띄운다.

## 8. 충돌 정책

library update 충돌은 세 등급으로 나눈다.

1. 자동 병합
   - source 추가
   - non-breaking rename
   - style value 변경
2. 반자동 병합
   - variant axis 구조 변경
   - property kind 변경
   - token alias target 변경
3. 수동 해결
   - component tree 대규모 재배치
   - instance override와 source patch가 같은 필드를 동시에 변경

수동 해결이 필요한 경우 update를 즉시 적용하지 않고 preview diff를 띄운다.

## 9. UI 원칙

지금 UI를 크게 바꾸지 않는다.

추가되는 최소 UI만 정의한다.

- `Publish Library`
- `Library Status`
- `Update Available`
- `Review Update`
- `Apply Update`

컴포넌트/토큰 패널은 유지하고, library 상태 뱃지와 update review 다이얼로그만 붙인다.

## 10. 검증 기준

이 설계가 구현되면 아래를 통과해야 한다.

1. component publish -> consume -> update 후 instance override 유지
2. variant axis 변경 후 consumer instance 재연결
3. style/token publish -> consume -> update 후 ref 유지
4. variable mode 추가/삭제 후 node ref와 fallback 유지
5. library update preview가 destructive change를 명시

## 11. 구현 순서

1. metadata 필드 추가
2. publish snapshot serializer
3. consumer import resolver
4. update diff engine
5. update review UI

## 12. 이번 문서의 역할

이 문서는 `library publish / consume / update 설계`를 닫기 위한 실행 기준이다.
실제 구현은 기존 component/token 시스템을 버리지 않고 그 위에 metadata와 diff layer를 얹는 방향으로만 진행한다.
