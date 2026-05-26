# 12. v2 Service Kernel Specification

이 문서는 **에디터 완성에 필요한 최소 서비스 커널**을 정의합니다.  
현재 phase의 목표는 범용 앱 플랫폼이 아니라, **상용 수준 에디터를 안정적으로 저장·협업·발행·검증할 수 있는 서비스 계층**입니다.

## 1. 현재 phase의 역할

서비스 커널은 아래만 책임집니다.

- 플랫폼 로그인과 편집 권한
- 문서 저장 / 버전 / 복구
- 협업 세션 / presence / comment
- publish snapshot 생성
- 에셋 업로드 / 참조 / 정리
- AI patch 검증 및 적용 진입점

다루지 않는 것:

- 범용 SaaS 백엔드 전체 구현
- 결제/정산/보증금/에스크로
- 마켓플레이스 / 예약 / 커뮤니티 / 운영툴 도메인
- “어떤 앱이든 다 되는 플랫폼” 중심 설명

## 2. 핵심 원칙

1. **Editor Kernel이 source of truth다.**
2. 서비스 커널은 문서 원본을 직접 해석해서 임의 수정하지 않는다.
3. 모든 저장/협업/발행은 `SceneDoc`, `EditorSnapshot`, `ValidationReport` 계약을 따른다.
4. runtime/service 연결은 **에디터 산출물 확장을 위한 최소 계약**으로만 유지한다.

## 3. 책임 경계

### A. React / Next Shell

- 라우트
- 패널 UI
- 대시보드
- 설정
- 인스펙터
- AI 콘솔

### B. Rust/WASM Editor Kernel

- 문서 모델
- scene graph
- selection / hit testing
- transform / layout / snap
- history
- text / vector
- render command
- collaboration document ops

### C. Rust Service Kernel

- platform auth / session
- document persistence
- collaboration transport / presence
- comment/review hooks
- publish snapshot service
- asset orchestration
- AI patch validation / apply entrypoint

## 4. 서비스 모듈

현재 phase 권장 모듈:

- `service-auth`
- `service-documents`
- `service-collab`
- `service-publish`
- `service-media`
- `service-ai`
- `service-control-plane`

## 5. Platform Auth

필수:

- 플랫폼 사용자 로그인
- 세션 발급 / 회전 / 폐기
- workspace membership
- project/document 접근 권한 확인

현재 phase에서 필요한 역할:

- `owner`
- `editor`
- `reviewer`
- `viewer`

이 역할은 아래에 적용됩니다.

- document read/write
- version restore
- comment write/resolve
- publish snapshot create

## 6. Document Persistence

필수:

- SceneDoc 저장
- autosave checkpoint
- explicit version checkpoint
- recoverable failed save state
- schemaVersion validation

저장 단위:

- current document
- document version
- publish snapshot
- validation report archive(optional)

원칙:

- 저장 전에 kernel validation 수행
- invalid document는 강제 publish 금지
- failed save는 사용자에게 복구 가능한 상태로 노출

## 7. Collaboration Service

필수:

- document scoped realtime session
- cursor / viewport / selection presence
- durable document op delivery
- reconnect / replay
- comment anchor synchronization

원칙:

- presence는 ephemeral
- document ops는 durable
- authoritative conflict resolution은 kernel 규칙을 따른다

## 8. Publish Service

필수:

- 현재 문서를 publish snapshot으로 고정
- preview/publish parity 보장
- snapshot metadata 기록
- rollback 가능한 release unit 유지

publish 입력:

- `SceneDoc`
- `RuntimeGraph` (있을 경우)
- validation result

publish 출력:

- immutable snapshot id
- preview/publish runtime input bundle

## 9. Media Service

필수:

- image/video/file upload
- asset metadata 저장
- document node와 asset 참조 연결
- orphan asset cleanup policy

하지 않는 것:

- 범용 CDN product 설계
- 외부 스토리지 커넥터 전체 카탈로그

## 10. AI Service

필수:

- `AIContextBundle` 수집
- `AIPatch` 생성
- schema validation
- dry-run
- preview token 발급
- apply / rollback 기록

원칙:

- AI는 raw HTML을 저장하지 않음
- 항상 구조화된 patch만 반환
- destructive patch는 승인 필요

## 11. 최소 Runtime / Service 연결

현재 phase에서 runtime/service는 아래 정도만 연결합니다.

- publish snapshot load
- minimal route graph handoff
- minimal service binding handoff
- preview/publish parity validation

즉, **에디터 산출물을 실행 가능한 구조로 넘기는 연결층**이지, 범용 앱 플랫폼 전체 구현이 아닙니다.

## 12. API 표면

### Control Plane

- `POST /api/v2/control/projects`
- `GET /api/v2/control/projects/:id`
- `POST /api/v2/control/documents/:documentId/publish`
- `POST /api/v2/control/documents/:documentId/restore`

### Collaboration

- `POST /api/v2/control/documents/:documentId/comments`
- `POST /api/v2/control/documents/:documentId/review/resolve`
- `WS /api/v2/control/realtime/ws`

### AI

- `POST /api/v2/ai/plan`
- `POST /api/v2/ai/patch`
- `POST /api/v2/ai/validate`
- `POST /api/v2/ai/apply`

## 13. 완료 기준

서비스 커널은 아래를 만족해야 현재 phase를 통과합니다.

- 플랫폼 로그인과 문서 권한이 안정적으로 동작
- autosave / version / restore가 신뢰 가능
- 2인 협업에서 문서 파손 없이 op가 동기화
- comment / review hook가 문서 앵커와 일치
- publish snapshot이 preview/publish parity를 보장
- AI patch validate / apply / rollback 흐름이 동작

## 14. 최종 결론

현재 phase의 서비스 커널은  
**에디터를 저장하고 협업하고 발행하고 AI로 수정할 수 있게 만드는 최소 백엔드 계층**입니다.
