# 06. v2 Migration and Rollout

이 문서는 v1 유지 상태에서 v2 **에디터**를 병행 구축하고 전환하는 계획입니다.

## 1. 기본 전략

사용자 제안이 맞습니다.

- 기존 에디터/런타임은 그대로 둡니다.
- v2는 새 경로, 새 문서 포맷, 새 커널로 만듭니다.
- 완성 전까지 v1 노출을 유지합니다.
- 충분히 안정화된 후 기본 진입점을 전환합니다.
- 완성 전까지 불필요한 Vercel 배포는 하지 않습니다.
- GitHub는 업데이트하되, 운영 브랜치가 아닌 작업 브랜치로 진행합니다.

이 전략의 장점:

- 현재 사용자 사용성에 영향이 적음
- 롤백 비용 감소
- v1/v2 비교 검증 가능
- 내부 QA / 스테이징 기준의 단계적 검증 가능

## 2. 라우트 병행

### v1 유지

- `/editor/advanced`
- `/p/[pageId]`
- 기존 `/api/*`

### v2 신규

- `/editor/v2`
- `/v2/p/[pageId]`
- `/api/v2/control/*`
- `/api/v2/app/*`
- `/api/v2/ai/*`

중요:

- v2 개발 중에는 기존 기본 내비게이션/기본 진입 경로를 v2로 바꾸지 않습니다.
- v2는 직접 URL 또는 feature flag를 통해서만 접근 가능해야 합니다.

## 3. 문서 포맷 분리

필수:

- v1 문서 포맷 유지
- v2 문서는 `schemaVersion = 2`
- 두 포맷은 혼용하지 않음

## 4. 데이터 병행

### Control Plane

가능하면 기존 계정/워크스페이스 데이터를 재사용합니다.

### Editor Data Plane

문서/버전/협업/publish 데이터는 v2에서 새 경계로 설계합니다.

## 5. 기능 플래그

필수 플래그:

- `editor_v2_enabled`
- `runtime_v2_enabled`
- `ai_v2_enabled`
- `service_kernel_v2_enabled`
- tenant/page/user 단위 override

추가 원칙:

- 기본값은 모두 `off`
- 내부 테스트/개발자 계정/특정 tenant에서만 `on`

## 6. 마이그레이션 단계

### Stage 0. Freeze and Audit

- v1 구조 동결
- v2 대상 범위 확정
- 문서 포맷/계정 모델 확정

### Stage 1. Parallel Skeleton

- `/editor/v2` 셸 생성
- Rust workspace 생성
- v2 API namespace 생성
- feature flags 추가

### Stage 2. Kernel Bring-up

- document kernel
- scene/layout
- selection/history
- minimal render

### Stage 3. Runtime Bring-up

- page routing
- state/action/binding
- basic publish/preview

### Stage 4. Collaboration / Publish Support

- collaboration presence
- publish snapshot
- preview parity support
- minimal auth/session for editor access

### Stage 5. AI Bring-up

- selection modify
- page completion
- structural debug assist

### Stage 6. Importer

- v1 -> v2 importer
- visual/behavioral parity check

### Stage 7. Internal QA / Staging Validation

- 내부 QA
- 스테이징 검증
- 비교 검증

### Stage 8. Default Switch

- 신규 프로젝트는 v2 기본
- v1는 숨김
- 필요 시 읽기 전용 유지

## 7. Importer 전략

v1에서 v2로 넘어갈 수 있어야 합니다.

최소 importer 책임:

- page/frame/text/basic shapes
- auto layout approximation
- components/instances mapping
- tokens/variables mapping
- route graph mapping
- app binding best-effort mapping

Importer 한계는 문서화해야 합니다.

## 8. 롤백 전략

v2는 언제든 되돌릴 수 있어야 합니다.

### 필수 조건

- v1 route 유지
- v2 feature flag off 가능
- v2 publish와 v1 publish 동시 유지 가능
- 데이터 destructive migration 금지

추가:

- `main` 브랜치 미반영 상태에서도 v2 개발/검증이 가능해야 함
- 브랜치 폐기만으로도 운영 서비스 영향이 없어야 함

## 9. 배포 전략

초기 권장:

- Next 셸은 기존 방식 유지 가능
- Rust 서비스는 별도 배포 단위
- AI 오케스트레이터는 별도 서비스 또는 same kernel process

완료 전 배포 정책:

- Vercel production 배포 금지
- 필요 시 로컬/개발 환경/별도 비운영 스테이징만 사용
- GitHub 푸시는 `v2-rebuild` 같은 작업 브랜치에만 수행

이유:

- 현재 레포는 Vercel 프로젝트와 연결되어 있어 `main` 푸시가 자동 배포를 유발할 수 있음
- 토큰/배포 슬롯 낭비 방지
- 운영 서비스 보호

## 10. 검증 전략

전환 전 필수 검증:

- editor latency
- runtime stability
- document save isolation
- publish/preview correctness
- realtime consistency
- comment/review correctness
- visual regression

## 11. 운영 전환 규칙

v2를 기본값으로 전환하기 전, 최소 기준:

- 핵심 편집기 기능 안정
- publish/runtime 안정
- platform auth/session/permission 동작
- AI patch 적용 안전장치 동작
- internal QA 통과
- staging validation 통과

## 12. 최종 결론

v2는 “리팩터링 배포”가 아니라 “병행 플랫폼 교체”로 접근해야 합니다.  
즉, 새 제품을 기존 옆에 놓고 충분히 성숙한 뒤 스위치하는 방식이 맞습니다.
