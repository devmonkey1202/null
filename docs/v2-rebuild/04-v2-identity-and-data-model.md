# 04. v2 Identity and Data Model

이 문서는 v2 에디터 재구축에 필요한 계정, 멀티테넌시, 문서 데이터 경계를 정의합니다.

## 1. 가장 중요한 결론

현재 phase에서 가장 중요한 분리는 두 가지입니다.

1. `NULL 플랫폼 계정`
2. `에디터 문서/협업 데이터`

또한 장기적으로는:

3. `향후 앱 내부 계정`

을 별도 경계로 유지해야 합니다.

즉, 현재 문서의 핵심은 **에디터 운영 계정과 문서/협업 데이터를 분리**하는 것입니다.

## 2. 현재 phase의 두 평면

### A. Control Plane

NULL 자체 운영 계정과 에디터 운영을 담당합니다.

엔티티 예시:

- `platform_user`
- `platform_session`
- `workspace`
- `workspace_member`
- `project`
- `project_environment`
- `deployment`
- `plugin_installation`

### B. Editor Data Plane

에디터 문서와 협업 상태를 담당합니다.

엔티티 예시:

- `document`
- `document_page`
- `document_component`
- `document_asset`
- `design_token_set`
- `variable_set`
- `document_version`
- `document_comment`
- `document_presence_session`
- `publish_snapshot`
- `audit_event`

## 3. 앱 내부 계정에 대한 현재 입장

`앱 내부 계정` 분리 자체는 여전히 필요합니다.  
다만 이번 문서 보강의 중심은 아닙니다.

현재 phase 원칙:

- platform account와 future app account는 섞지 않음
- 하지만 app internal domain 전체를 이번 phase의 구현 중심으로 두지 않음
- 관련 내용은 **에디터 산출물 확장을 위한 예약 계약**으로만 유지

## 4. 플랫폼 로그인

필수:

- 이메일/패스워드 또는 SSO
- 플랫폼 세션
- workspace membership

용도:

- 프로젝트 편집
- 문서 협업
- 배포 설정
- 내부 QA / 스테이징 검증

## 5. 문서 협업 모델

에디터 완성 기준으로 현재 가장 중요한 데이터 모델:

### 5.1 Document

- 문서 메타데이터
- schemaVersion
- SceneDoc 본문
- runtime hook 참조

### 5.2 Document Version

- autosave checkpoint
- manual checkpoint
- actor 추적
- rollback 기준점

### 5.3 Document Comment

- selection anchor
- page / node reference
- thread 상태

### 5.4 Document Presence Session

- user
- viewport
- cursor
- selection
- heartbeat / expiry

## 6. 권한 모델

현재 phase 최소 역할:

- owner
- editor
- reviewer
- viewer

권한 적용 대상:

- document read/write
- comment write/resolve
- publish snapshot create
- version rollback

## 7. 세션 전략

### Platform

- HTTP-only session cookie
- MFA/session rotation 가능
- workspace scoped permissions

### Collaboration session

- editor realtime session
- document scoped presence session
- reconnect/replay 가능한 짧은 생명주기 토큰

## 8. 멀티테넌시 전략

최소 요구:

- workspace 단위 control plane 격리
- project 단위 문서 격리
- environment 단위 publish snapshot 분리

권장 키:

- `workspace_id`
- `project_id`
- `environment_id`
- `document_id`

## 9. 저장소 선택

현재 phase 권장:

- Postgres: source of truth
- Redis: presence / ephemeral coordination / queue
- Object storage: media/assets/files

## 10. 장기 확장 계약

향후 runtime/service 확장을 위해 남겨둘 최소 참조:

- `appModelRef`
- `runtimeGraphRef`
- `serviceBindingRef`

즉, 지금은 editor-first지만 문서 모델이 이후 확장을 막지는 않아야 합니다.

## 11. 최종 결론

v2의 현재 계정/데이터 설계는 다음 한 줄로 요약됩니다.

> 플랫폼 운영 계정과 에디터 문서/협업 데이터를 명확히 분리하고, 향후 앱 내부 계정은 별도 확장 경계로 남겨둔다.
