# NULL 요구사항 전수 확인 + 증거 매핑 (시작본)

이 문서는 **전수 확인**과 **증거 구축**을 위한 실무 체크리스트다.  
모든 항목은 **코드/테스트/실행 증거가 확보되기 전까지 “미검증”**으로 유지한다.

## 0) 범위/규칙
- 범위: `.next`, `node_modules`, `logs`, `test-results`, `tmp_*` 제외한 전체 코드/스크립트/마이그레이션
- 목표: 요구사항 → 코드 위치 → 테스트/실행 증거를 1:1로 매핑
- 금지: 근거 없는 “가능/완료” 표기

## 1) 증거 레벨 정의
- L0: 코드 위치만 확인 (미검증)
- L1: 로컬 테스트 통과 (자동 테스트 로그)
- L2: 로컬 실행 시나리오 통과 (수동/시나리오 로그)
- L3: 운영/실사용 데이터 기반 검증

## 2) 전수 확인 진행 현황
- 전체 파일 수(코드 범위): 408개
- 현재 상태: **전수 매핑 시작** (L0 레벨 확보 단계)

## 3) 요구사항 매핑 (초기)
> 상태는 모두 **미검증(L0)**으로 시작한다. 증거 확보 시 단계 상향.

### R-01. “NULL 하나로 디자인→FE→BE→배포→운영 전 과정 완결”
- 후보 코드 위치: 
  - FE/에디터: `src/components/editor-view.tsx`, `src/advanced/ui/*`
  - BE/API: `src/app/api/**`
  - 배포/호스팅: `src/app/api/pages/[pageId]/deploy/route.ts`, `src/app/api/app/[pageId]/hosting/*`
  - 운영/로그/분석: `src/app/api/ops/*`, `src/app/api/pages/[pageId]/analytics/*`, `src/lib/logger.ts`
- 증거: L0 (코드 위치만 확인)

### R-02. “어떤 웹/앱 서비스든 구현 가능”
- 후보 코드 위치:
  - 데이터 모델/CRUD: `src/lib/app-data.ts`, `src/app/api/app/[pageId]/[model]/*`
  - 폼/워크플로: `src/app/api/app/[pageId]/forms/*`, `src/lib/app-workflow.ts`
  - 인증: `src/app/api/app/[pageId]/auth/*`, `src/lib/app-auth.ts`
  - 결제/구독: `src/app/api/billing/*`
  - 알림: `src/app/api/pages/[pageId]/notifications/*`
- 증거: L0

### R-03. “프로토타입 금지, 실서비스 즉시 운영 수준”
- 후보 코드 위치:
  - 배포/라이브: `src/app/api/pages/[pageId]/publish/route.ts`, `src/app/api/pages/[pageId]/deploy/route.ts`
  - 운영 통계: `src/app/api/pages/[pageId]/analytics/*`, `src/app/api/ops/metrics/route.ts`
  - 백업/복구: `src/app/api/pages/[pageId]/backup/route.ts`
- 증거: L0

### R-04. “모바일: 웹 제작 → 앱 빌더 패키징 + 네이티브 브리지 포함”
- 후보 코드 위치:
  - 패키징 API: `src/app/api/app/[pageId]/mobile/*`
  - 준비 스크립트: `scripts/mobile/*`
  - 호스트 앱: `mobile/*`
- 증거: L0

### R-05. “관리형 호스팅(도메인/SSL/스케일/모니터링/로그/백업)”
- 후보 코드 위치:
  - 호스팅 설정: `src/app/api/app/[pageId]/hosting/*`, `src/lib/hosting-domain.ts`
  - 로그/모니터링: `src/lib/logger.ts`, `src/app/api/ops/*`
  - 백업: `src/app/api/pages/[pageId]/backup/route.ts`
- 증거: L0

### R-06. “외부 API/장치(카메라/센서 등) 포함한 완전 자유도”
- 후보 코드 위치:
  - 네이티브/브리지 액션: `src/advanced/doc/scene.ts` (prototype action), `src/advanced/ui/AdvancedEditorView.tsx`
- 증거: L0

### R-07. “NULL 밖에서 개발/설정 필요 없음 (외부 연동도 내부 설치/설정/운영)”
- 후보 코드 위치:
  - 플러그인/확장: `src/lib/app-plugins.ts`, `src/app/api/app/[pageId]/plugins/route.ts`
  - 웹훅/외부 연동: `src/app/api/app/[pageId]/webhooks/*`
- 증거: L0

### R-08. “AI 기능은 나중에 (현 시점 제외)”
- 상태: 범위 제외 (검증 대상 아님)

### R-09. “어드벤스드 에디터”
- 후보 코드 위치:
  - `src/advanced/*`
  - `src/components/editor-view.tsx`
- 증거: L0

### R-10. “독립 설치/업그레이드/이관 (나중)”
- 상태: 최종 기준 필수이나 현재 보류
- 증거: 없음

## 4) 다음 증거 구축 작업(즉시 착수 단계)
- L0 → L1로 올릴 항목: 
  - 핵심 CRUD/API/에디터/배포/호스팅 경로에 대한 자동 테스트 실행 로그 확보
- L1 → L2: 
  - 실제 시나리오(쇼핑몰/구독/커뮤니티 등) 구축 후 동작 로그 확보
- L2 → L3:
  - 운영/실사용 데이터 기반 안정성·성능·복구 검증

## 4.1) 신규 L1 증거 (2026-03-04)
- 테마/모드 전환: `src/components/theme-toggle.tsx`, `src/components/theme-init.tsx`
  - L1: `tests/theme-toggle.test.tsx` (Vitest 통과)
- 에러 UX/복구 흐름: `src/components/error-boundary.tsx`
  - L1: `tests/error-boundary.test.tsx` (Vitest 통과)
- 성능 메트릭 수집: `src/app/api/ops/metrics/route.ts`
  - L1: `e2e/ops-metrics.spec.ts` (Playwright 통과, `ADMIN_KEY` 필요)
- 백업/복구: `src/app/api/pages/[pageId]/backup/route.ts`
  - L1: `e2e/backup-restore.spec.ts` (Playwright 통과)

## 4.2) 신규 L1 증거 (2026-03-04)
- 고급 쿼리 빌더: `src/lib/app-record-query.ts`, `src/app/api/app/[pageId]/[model]/route.ts`
  - L1: `e2e/l2-app-query.spec.ts` (Playwright 통과)
- 서버 사이드 계산/집계: `src/lib/app-record-query.ts`
  - L1: `e2e/l2-app-query.spec.ts` (Playwright 통과)
- 데이터 버전/감사 로그: `src/lib/app-audit.ts`, `src/lib/app-data.ts`, `src/app/api/app/[pageId]/audit-logs/route.ts`
  - L1: `e2e/l2-audit-logs.spec.ts` (Playwright 통과)
  - L1: `e2e/l2-versioning.spec.ts` (Playwright 통과)
- 워크플로 로그/버전: `src/app/api/app/[pageId]/workflows/logs/route.ts`, `src/app/api/app/[pageId]/workflows/versions/*`
  - L1: `e2e/l2-app-features.spec.ts` (Playwright 통과)
  - L1: `e2e/l2-versioning.spec.ts` (Playwright 통과)
- 플러그인 설치/업데이트/제거: `src/app/api/app/[pageId]/plugins/route.ts`
  - L1: `e2e/l2-app-features.spec.ts` (Playwright 통과)

## 4.3) 신규 L1 증거 (2026-03-04)
- 스케줄 트리거 내부화: `src/server/cron-scheduler.ts`, `src/app/api/cron/*`
  - L1: `e2e/admin-cron.spec.ts` (Playwright 통과, `CRON_SECRET` 필요)
- 도메인 연결/SSL 발급 자동화: `src/app/api/app/[pageId]/hosting/*`, `src/server/domain-router.ts`
  - L1: `e2e/l2-api-scenarios.spec.ts` (Playwright 통과)
- 웹→앱 패키징 경로 확정: `src/app/api/app/[pageId]/mobile/*`, `scripts/mobile/*`
  - L1: `e2e/l2-api-scenarios.spec.ts` (Playwright 통과)
- 로그/모니터링/알림: `src/lib/system-log.ts`, `src/lib/security-log.ts`, `src/lib/availability-log.ts`, `src/app/api/ops/*`
  - L1: `tests/observability.test.ts` (Vitest 통과)
- 구독/플랜/청구: `src/lib/billing.ts`, `src/app/api/billing/upgrade/route.ts`
  - L1: `e2e/l2-api-scenarios.spec.ts` (Playwright 통과)

## 4.4) 신규 L1 증거 (2026-03-04)
- 권한/역할 UI: `src/components/dashboard-work-view.tsx`
  - L1: `e2e/dashboard-admin-ui.spec.ts` (Playwright 통과)
- API 키 관리 UI: `src/components/dashboard-work-view.tsx`, `src/app/api/app/[pageId]/secrets/route.ts`
  - L1: `e2e/dashboard-admin-ui.spec.ts` (Playwright 통과)
- 히스토리/버전 롤백: `src/app/api/pages/[pageId]/versions/route.ts`, `src/app/api/pages/[pageId]/version/restore/route.ts`
  - L1: `e2e/page-version-deploy.spec.ts` (Playwright 통과)
- 원클릭 배포 파이프라인: `src/app/api/pages/[pageId]/deploy/route.ts`
  - L1: `e2e/page-version-deploy.spec.ts` (Playwright 통과)
- 세션 정책/만료: `src/lib/app-auth.ts`
  - L1: `tests/app-auth-session.test.ts` (Vitest 통과)
- 단위/통합/E2E 테스트 체계: `tests/*`, `e2e/*`, `vitest.config.ts`, `playwright.config.ts`
  - L1: `npm test` (Vitest 통과)
  - L1: `npx playwright test e2e/dashboard-admin-ui.spec.ts e2e/page-version-deploy.spec.ts` 통과

> 이 문서는 **실증/증거가 확보될 때만 상태를 상향**한다.

## 5) 전수 인덱스 (1차)
- 전체 파일 수(코드 범위): 408개
- 최상위 분포:
  - `src`: 253
  - `prisma`: 30
  - `docs`: 34
  - `tests`: 11
  - `e2e`: 14
  - `mobile`: 9
  - `public`: 30
  - `scripts`: 3
  - 기타 루트 설정/파일: 24
- `src` 분포:
  - `src/app`: 146
  - `src/lib`: 47
  - `src/components`: 33
  - `src/advanced`: 22
  - `src/server`: 5
- `src/app` 분포(상위 경로):
  - `src/app/api`: 118
  - `src/app/account`: 1
  - `src/app/billing`: 2
  - `src/app/dashboard`: 2
  - `src/app/editor`: 2
  - `src/app/login`: 2
  - `src/app/signup`: 2
  - `src/app/ops`: 2
  - `src/app/library`: 1
  - `src/app/live`: 1
  - `src/app/replay`: 1
  - `src/app/settings`: 1
  - `src/app/upgrade`: 1
  - `src/app/terms`: 1
  - `src/app/privacy`: 1
  - `src/app/p`: 1
  - `src/app/page.tsx`: 1
  - `src/app/layout.tsx`: 1
  - `src/app/globals.css`: 1
  - `src/app/not-found.tsx`: 1
  - `src/app/robots.ts`: 1
  - `src/app/sitemap.ts`: 1
  - `src/app/favicon.ico`: 1

## 6) 현재 세션 확보 증거 (요약)
- L1: `npm run build` 성공(2026-02-28)
- L1: Prisma 마이그레이션 적용 완료(`20260228005906_add_app_record_created_at`, `20260228160350_add_app_versions`, `20260228164637_add_app_audit_logs`, `20260228183052_add_page_audit_logs`, `20260228190137_add_app_record_app_user`)

## 7) L0 전수 인덱스 (1차: src/advanced)
- L0: `src/advanced/doc/scene.ts`
- L0: `src/advanced/layout/layout.ts`
- L0: `src/advanced/layout/engine.ts`
- L0: `src/advanced/ui/AdvancedEditor.nodes.ts`
- L0: `src/advanced/ui/AdvancedEditor.layout.tsx`
- L0: `src/advanced/ui/AdvancedEditor.constants.ts`
- L0: `src/advanced/ui/AdvancedEditor.assetLibraryPresets.ts`
- L0: `src/advanced/ui/AdvancedEditor.types.ts`
- L0: `src/advanced/ui/AdvancedEditor.tsx`
- L0: `src/advanced/ui/AdvancedEditor.presets.ts`
- L0: `src/advanced/ui/AdvancedEditor.utils.ts`
- L0: `src/advanced/ui/AdvancedEditorCanvasNode.tsx`
- L0: `src/advanced/ui/AdvancedEditorView.tsx`
- L0: `src/advanced/runtime/player.tsx`
- L0: `src/advanced/runtime/native-commands.ts`
- L0: `src/advanced/runtime/bounds.ts`
- L0: `src/advanced/runtime/plugins.ts`
- L0: `src/advanced/runtime/renderer.tsx`
- L0: `src/advanced/geom/geom.ts`
- L0: `src/advanced/geom/boolean.ts`
- L0: `src/advanced/geom/pathData.ts`
- L0: `src/advanced/history/history.ts`

## 8) L0 전수 인덱스 (1차: src/components)
- L0: `src/components/work-view.tsx`
- L0: `src/components/upgrade-view.tsx`
- L0: `src/components/toast.tsx`
- L0: `src/components/theme-toggle.tsx`
- L0: `src/components/theme-init.tsx`
- L0: `src/components/sw-register.tsx`
- L0: `src/components/settings-view.tsx`
- L0: `src/components/replay-view.tsx`
- L0: `src/components/replay-player.tsx`
- L0: `src/components/providers.tsx`
- L0: `src/components/page-actions.tsx`
- L0: `src/components/offline-banner.tsx`
- L0: `src/components/null-spinner.tsx`
- L0: `src/components/native-bridge-host.tsx`
- L0: `src/components/login-form.tsx`
- L0: `src/components/live-view.tsx`
- L0: `src/components/live-overlays.tsx`
- L0: `src/components/library-view.tsx`
- L0: `src/components/image-with-fallback.tsx`
- L0: `src/components/feed.tsx`
- L0: `src/components/error-boundary.tsx`
- L0: `src/components/client-error-tracker.tsx`
- L0: `src/components/editor-view.tsx`
- L0: `src/components/editor-fields.tsx`
- L0: `src/components/dashboard-work-view.tsx`
- L0: `src/components/dashboard-list-view.tsx`
- L0: `src/components/anon-init.tsx`
- L0: `src/components/admin-console.tsx`
- L0: `src/components/account-view.tsx`
- L0: `src/components/canvas-render.tsx`
- L0: `src/components/conditional-footer.tsx`
- L0: `src/components/countdown.tsx`
- L0: `src/components/dashboard/report-widgets.tsx`
- L0: `src/components/dashboard/report-builder-panel.tsx`

## 9) L0 전수 인덱스 (1차: src/lib)
- L0: `src/lib/zip.ts`
- L0: `src/lib/workflow-scheduler.ts`
- L0: `src/lib/admin-session.ts`
- L0: `src/lib/validation.ts`
- L0: `src/lib/url.ts`
- L0: `src/lib/system-settings.ts`
- L0: `src/lib/admin-audit.ts`
- L0: `src/lib/ghost-utils.ts`
- L0: `src/lib/system-log.ts`
- L0: `src/lib/security-log.ts`
- L0: `src/lib/availability-log.ts`
- L0: `src/lib/client-errors.ts`
- L0: `src/lib/storage.ts`
- L0: `src/lib/request.ts`
- L0: `src/lib/figmaToNull.ts`
- L0: `src/lib/redis.ts`
- L0: `src/lib/figma.ts`
- L0: `src/lib/rate-limit.ts`
- L0: `src/lib/expire.ts`
- L0: `src/lib/pages.ts`
- L0: `src/lib/policy.ts`
- L0: `src/lib/db.ts`
- L0: `src/lib/page-access.ts`
- L0: `src/lib/daily-reports.ts`
- L0: `src/lib/plan.ts`
- L0: `src/lib/mobile-package.ts`
- L0: `src/lib/cron.ts`
- L0: `src/lib/mobile-host.ts`
- L0: `src/lib/parse-ua.ts`
- L0: `src/lib/collab.ts`
- L0: `src/lib/mentions.ts`
- L0: `src/lib/auth.ts`
- L0: `src/lib/logger.ts`
- L0: `src/lib/canvas.ts`
- L0: `src/lib/alert-template.ts`
- L0: `src/lib/ghost.ts`
- L0: `src/lib/billing.ts`
- L0: `src/lib/admin.ts`
- L0: `src/lib/anon.ts`
- L0: `src/lib/api-error.ts`
- L0: `src/lib/api-handler.ts`
- L0: `src/lib/app-data.ts`
- L0: `src/lib/app-auth.ts`
- L0: `src/lib/app-request.ts`
- L0: `src/lib/app-record-query.ts`
- L0: `src/lib/app-audit.ts`
- L0: `src/lib/app-plugins.ts`
- L0: `src/lib/app-workflow.ts`
- L0: `src/lib/hosting-domain.ts`
- L0: `src/lib/page-audit.ts`

## 10) L0 전수 인덱스 (1차: src/server)
- L0: `src/server/socket.ts`
- L0: `src/server/liveState.ts`
- L0: `src/server/eventSync.ts`
- L0: `src/server/domain-router.ts`
- L0: `src/server/cron-scheduler.ts`

## 11) L0 전수 인덱스 (1차: src/app/api)
- L0: `src/app/api/viewers/route.ts`
- L0: `src/app/api/ranking/route.ts`
- L0: `src/app/api/dev/webhook/route.ts`
- L0: `src/app/api/publish/route.ts`
- L0: `src/app/api/library/route.ts`
- L0: `src/app/api/health/route.ts`
- L0: `src/app/api/feed/route.ts`
- L0: `src/app/api/me/route.ts`
- L0: `src/app/api/ops/metrics/route.ts`
- L0: `src/app/api/ops/availability/route.ts`
- L0: `src/app/api/anon/init/route.ts`
- L0: `src/app/api/billing/webhook/route.ts`
- L0: `src/app/api/auth/signup/route.ts`
- L0: `src/app/api/ops/logs/route.ts`
- L0: `src/app/api/ops/security-events/route.ts`
- L0: `src/app/api/billing/upgrade/route.ts`
- L0: `src/app/api/admin/[reportId]/handle/route.ts`
- L0: `src/app/api/auth/logout/route.ts`
- L0: `src/app/api/ops/health/route.ts`
- L0: `src/app/api/pages/[pageId]/witness/route.ts`
- L0: `src/app/api/pages/[pageId]/audit-logs/route.ts`
- L0: `src/app/api/admin/reports/route.ts`
- L0: `src/app/api/app/[pageId]/[model]/[id]/route.ts`
- L0: `src/app/api/app/[pageId]/[model]/route.ts`
- L0: `src/app/api/admin/stats/route.ts`
- L0: `src/app/api/admin/ip-blocks/route.ts`
- L0: `src/app/api/auth/login/route.ts`
- L0: `src/app/api/client-errors/route.ts`
- L0: `src/app/api/admin/settings/route.ts`
- L0: `src/app/api/app/[pageId]/workflows/route.ts`
- L0: `src/app/api/pages/[pageId]/collab/route.ts`
- L0: `src/app/api/pages/[pageId]/backup/route.ts`
- L0: `src/app/api/pages/[pageId]/versions/[versionId]/route.ts`
- L0: `src/app/api/pages/[pageId]/versions/route.ts`
- L0: `src/app/api/pages/[pageId]/events/route.ts`
- L0: `src/app/api/app/[pageId]/workflows/logs/route.ts`
- L0: `src/app/api/cron/workflows/route.ts`
- L0: `src/app/api/pages/[pageId]/chat/route.ts`
- L0: `src/app/api/admin/pages/[pageId]/upvote/route.ts`
- L0: `src/app/api/pages/[pageId]/analytics/route.ts`
- L0: `src/app/api/pages/[pageId]/version/route.ts`
- L0: `src/app/api/pages/[pageId]/events/ingest/route.ts`
- L0: `src/app/api/pages/[pageId]/kanban/columns/[id]/route.ts`
- L0: `src/app/api/pages/[pageId]/kanban/columns/route.ts`
- L0: `src/app/api/pages/[pageId]/call-state/route.ts`
- L0: `src/app/api/cron/expire/route.ts`
- L0: `src/app/api/admin/pages/[pageId]/report/route.ts`
- L0: `src/app/api/pages/[pageId]/analytics/health/route.ts`
- L0: `src/app/api/pages/[pageId]/version/restore/route.ts`
- L0: `src/app/api/pages/[pageId]/events/export/route.ts`
- L0: `src/app/api/app/[pageId]/webhooks/[...path]/route.ts`
- L0: `src/app/api/cron/daily-reports/route.ts`
- L0: `src/app/api/admin/pages/[pageId]/hide/route.ts`
- L0: `src/app/api/pages/[pageId]/analytics/funnel/route.ts`
- L0: `src/app/api/pages/[pageId]/upvote/route.ts`
- L0: `src/app/api/pages/[pageId]/duplicate/route.ts`
- L0: `src/app/api/pages/[pageId]/kanban/cards/[id]/route.ts`
- L0: `src/app/api/pages/[pageId]/kanban/cards/route.ts`
- L0: `src/app/api/app/[pageId]/webhooks/secret/route.ts`
- L0: `src/app/api/pages/[pageId]/analytics/by-os/route.ts`
- L0: `src/app/api/pages/[pageId]/calendar/[id]/route.ts`
- L0: `src/app/api/pages/[pageId]/calendar/route.ts`
- L0: `src/app/api/admin/pages/[pageId]/force-expire/route.ts`
- L0: `src/app/api/pages/[pageId]/analytics/export/route.ts`
- L0: `src/app/api/pages/[pageId]/deploy/route.ts`
- L0: `src/app/api/pages/[pageId]/heatmap/route.ts`
- L0: `src/app/api/admin/pages/live/route.ts`
- L0: `src/app/api/app/[pageId]/upload/route.ts`
- L0: `src/app/api/pages/[pageId]/analytics/by-element/route.ts`
- L0: `src/app/api/pages/[pageId]/analytics/engagement/route.ts`
- L0: `src/app/api/pages/[pageId]/todos/[id]/route.ts`
- L0: `src/app/api/pages/[pageId]/todos/route.ts`
- L0: `src/app/api/pages/[pageId]/ghost/route.ts`
- L0: `src/app/api/pages/[pageId]/comments/route.ts`
- L0: `src/app/api/pages/[pageId]/analytics/by-browser/route.ts`
- L0: `src/app/api/app/[pageId]/secrets/route.ts`
- L0: `src/app/api/app/[pageId]/audit-logs/route.ts`
- L0: `src/app/api/pages/[pageId]/comments/[commentId]/route.ts`
- L0: `src/app/api/pages/[pageId]/analytics/compare/route.ts`
- L0: `src/app/api/pages/[pageId]/stats/route.ts`
- L0: `src/app/api/pages/[pageId]/presence/route.ts`
- L0: `src/app/api/pages/[pageId]/figma/import/route.ts`
- L0: `src/app/api/pages/[pageId]/report/route.ts`
- L0: `src/app/api/app/[pageId]/schema/route.ts`
- L0: `src/app/api/app/[pageId]/records-filter/route.ts`
- L0: `src/app/api/pages/[pageId]/spikes/route.ts`
- L0: `src/app/api/pages/[pageId]/analytics/by-weekday/route.ts`
- L0: `src/app/api/pages/[pageId]/publish/route.ts`
- L0: `src/app/api/pages/[pageId]/route.ts`
- L0: `src/app/api/pages/[pageId]/replay/route.ts`
- L0: `src/app/api/pages/[pageId]/segments/route.ts`
- L0: `src/app/api/app/[pageId]/proxy/route.ts`
- L0: `src/app/api/pages/[pageId]/alerts/test/route.ts`
- L0: `src/app/api/pages/[pageId]/settings/route.ts`
- L0: `src/app/api/pages/[pageId]/analytics/by-viewport/route.ts`
- L0: `src/app/api/pages/[pageId]/search/route.ts`
- L0: `src/app/api/pages/[pageId]/notifications/[id]/route.ts`
- L0: `src/app/api/pages/[pageId]/notifications/route.ts`
- L0: `src/app/api/pages/[pageId]/sessions/route.ts`
- L0: `src/app/api/pages/[pageId]/alerts/settings/route.ts`
- L0: `src/app/api/app/[pageId]/plugins/route.ts`
- L0: `src/app/api/pages/route.ts`
- L0: `src/app/api/pages/[pageId]/segments/[segmentId]/route.ts`
- L0: `src/app/api/pages/[pageId]/note/route.ts`
- L0: `src/app/api/pages/[pageId]/alerts/notify/route.ts`
- L0: `src/app/api/app/[pageId]/auth/logout/route.ts`
- L0: `src/app/api/app/[pageId]/hosting/route.ts`
- L0: `src/app/api/app/[pageId]/mobile/route.ts`
- L0: `src/app/api/app/[pageId]/forms/[formName]/route.ts`
- L0: `src/app/api/app/[pageId]/auth/users/route.ts`
- L0: `src/app/api/app/[pageId]/hosting/verify/route.ts`
- L0: `src/app/api/app/[pageId]/auth/login/route.ts`
- L0: `src/app/api/app/[pageId]/mobile/package/route.ts`
- L0: `src/app/api/app/[pageId]/hosting/status/route.ts`
- L0: `src/app/api/app/[pageId]/auth/register/route.ts`
- L0: `src/app/api/app/[pageId]/auth/me/route.ts`
- L0: `src/app/api/app/[pageId]/mobile/host-config/route.ts`
- L0: `src/app/api/app/[pageId]/[model]/[id]/versions/route.ts`
- L0: `src/app/api/app/[pageId]/[model]/[id]/versions/restore/route.ts`
- L0: `src/app/api/app/[pageId]/workflows/versions/route.ts`
- L0: `src/app/api/app/[pageId]/workflows/versions/restore/route.ts`

## 12) L0 전수 인덱스 (1차: src/app non-api)
- L0: `src/app/upgrade/page.tsx`
- L0: `src/app/login/page.tsx`
- L0: `src/app/login/login-page-client.tsx`
- L0: `src/app/editor/page.tsx`
- L0: `src/app/account/page.tsx`
- L0: `src/app/signup/signup-page-client.tsx`
- L0: `src/app/signup/page.tsx`
- L0: `src/app/replay/[pageId]/page.tsx`
- L0: `src/app/terms/page.tsx`
- L0: `src/app/p/[pageId]/page.tsx`
- L0: `src/app/sitemap.ts`
- L0: `src/app/robots.ts`
- L0: `src/app/page.tsx`
- L0: `src/app/not-found.tsx`
- L0: `src/app/layout.tsx`
- L0: `src/app/globals.css`
- L0: `src/app/favicon.ico`
- L0: `src/app/editor/advanced/page.tsx`
- L0: `src/app/settings/page.tsx`
- L0: `src/app/dashboard/page.tsx`
- L0: `src/app/library/page.tsx`
- L0: `src/app/privacy/page.tsx`
- L0: `src/app/live/[pageId]/page.tsx`
- L0: `src/app/billing/cancel/page.tsx`
- L0: `src/app/billing/success/page.tsx`
- L0: `src/app/dashboard/[pageId]/page.tsx`
- L0: `src/app/ops/[slug]/actions.ts`
- L0: `src/app/ops/[slug]/page.tsx`

## 13) L0 전수 인덱스 (1차: prisma)
- L0: `prisma/schema.prisma`
- L0: `prisma/seed.ts`
- L0: `prisma/migrations/migration_lock.toml`
- L0: `prisma/migrations/0001_init/migration.sql`
- L0: `prisma/migrations/0002_step7_abuse_admin/migration.sql`
- L0: `prisma/migrations/20260115212948_jw/migration.sql`
- L0: `prisma/migrations/20260121145838_null/migration.sql`
- L0: `prisma/migrations/20260122190000_data_collections/migration.sql`
- L0: `prisma/migrations/20260129150025_nulldb/migration.sql`
- L0: `prisma/migrations/20260203100000_ghost_trace_normalize/migration.sql`
- L0: `prisma/migrations/20260203120000_app_data_nocode/migration.sql`
- L0: `prisma/migrations/20260203140000_comment_table/migration.sql`
- L0: `prisma/migrations/20260206000000_add_deployed_at/migration.sql`
- L0: `prisma/migrations/20260207000000_discord_webhook/migration.sql`
- L0: `prisma/migrations/20260207100000_event_type_error_custom/migration.sql`
- L0: `prisma/migrations/20260208000000_scheduled_alert/migration.sql`
- L0: `prisma/migrations/20260208100000_daily_page_stats/migration.sql`
- L0: `prisma/migrations/20260209000000_add_segment/migration.sql`
- L0: `prisma/migrations/20260209010000_add_event_id/migration.sql`
- L0: `prisma/migrations/20260209020000_admin_audit_log/migration.sql`
- L0: `prisma/migrations/20260209030000_index_tuning/migration.sql`
- L0: `prisma/migrations/20260219000000_asset_features_chat_todo_calendar_kanban_note/migration.sql`
- L0: `prisma/migrations/20260219100000_asset_phase2_settings_notifications_call/migration.sql`
- L0: `prisma/migrations/20260223190805_add_page_domain/migration.sql`
- L0: `prisma/migrations/20260224090000_baseline_from_db/migration.sql`
- L0: `prisma/migrations/20260228005906_add_app_record_created_at/migration.sql`
- L0: `prisma/migrations/20260228160350_add_app_versions/migration.sql`
- L0: `prisma/migrations/20260228164637_add_app_audit_logs/migration.sql`
- L0: `prisma/migrations/20260228183052_add_page_audit_logs/migration.sql`
- L0: `prisma/migrations/20260228190137_add_app_record_app_user/migration.sql`

## 14) L0 전수 인덱스 (1차: scripts/mobile/tests/e2e)
- L0: `scripts/verify-asset-presets.ts`
- L0: `scripts/mobile/prepare-react-native.ts`
- L0: `scripts/mobile/prepare-capacitor.ts`
- L0: `mobile/react-native-host/README.md`
- L0: `mobile/react-native-host/package.json`
- L0: `mobile/react-native-host/host.config.json`
- L0: `mobile/react-native-host/App.tsx`
- L0: `mobile/capacitor-host/package.json`
- L0: `mobile/capacitor-host/host.config.json`
- L0: `mobile/capacitor-host/capacitor.config.ts`
- L0: `mobile/capacitor-host/README.md`
- L0: `mobile/capacitor-host/www/index.html`
- L0: `tests/pages.test.ts`
- L0: `tests/layout.test.ts`
- L0: `tests/ghost-utils.test.ts`
- L0: `tests/figmaToNull.test.ts`
- L0: `tests/expire.test.ts`
- L0: `tests/editorEdgeCases.test.ts`
- L0: `tests/prototypePlayback.test.ts`
- L0: `tests/policy.test.ts`
- L0: `tests/plan.test.ts`
- L0: `tests/rate-limit.test.ts`
- L0: `tests/stressDoc.test.ts`
- L0: `e2e/core-flow.spec.ts`
- L0: `e2e/auth-flow.spec.ts`
- L0: `e2e/smoke.spec.ts`
- L0: `e2e/chat-api.spec.ts`
- L0: `e2e/webhook.spec.ts`
- L0: `e2e/asset-library.spec.ts`
- L0: `e2e/route-health.spec.ts`
- L0: `e2e/l2-api-scenarios.spec.ts`
- L0: `e2e/l2-app-features.spec.ts`
- L0: `e2e/l2-app-query.spec.ts`
- L0: `e2e/l2-app-user-data.spec.ts`
- L0: `e2e/l2-audit-logs.spec.ts`
- L0: `e2e/l2-page-assets.spec.ts`
- L0: `e2e/l2-versioning.spec.ts`

## 15) L1 증거 (자동 테스트 실행 로그)
- `npm test` (Vitest): 11 test files / 53 tests **PASS** (2026-02-28)
- `npm test` (Vitest): 42 test files / 130 tests **PASS** (2026-03-06)
- `npm test` (Vitest): 45 test files / 136 tests **PASS** (2026-03-06)
- `npx playwright test --reporter=line`: **130 passed / 20 skipped / 0 failed** (2026-02-28)
  - 이전 시도 1건 실패(`ECONNRESET`) 후 재실행 시 전체 통과


## 16) L2 증거 (시나리오 실행 로그)
- 시나리오: `core flow` (anon login → editor → publish → live → replay → library)
- 실행: `npx playwright test e2e/core-flow.spec.ts --reporter=line`
- 결과: **PASS** (1/1)
- 로그 파일: `logs/l2-core-flow.log`


## 16) L2 증거 (시나리오 실행 로그)
- 시나리오: `core flow` (anon login → editor → publish → live → replay → library)
- 실행: `npx playwright test e2e/core-flow.spec.ts --reporter=line`
- 결과: **PASS** (1/1)
- 로그 파일: `logs/l2-core-flow.log`

- 시나리오: `asset library presets` (프리셋 삽입/코어 플로우/백엔드)
- 실행: `npx playwright test e2e/asset-library.spec.ts --reporter=line`
- 결과: **3 passed / 1 skipped**
- 로그 파일: `logs/l2-asset-library.log`


## 16) L2 증거 (시나리오 실행 로그)
- 시나리오: `core flow` (anon login → editor → publish → live → replay → library)
- 실행: `npx playwright test e2e/core-flow.spec.ts --reporter=line`
- 결과: **PASS** (1/1)
- 로그 파일: `logs/l2-core-flow.log`

- 시나리오: `asset library presets` (프리셋 삽입/코어 플로우/백엔드)
- 실행: `npx playwright test e2e/asset-library.spec.ts --reporter=line`
- 결과: **3 passed / 1 skipped**
- 로그 파일: `logs/l2-asset-library.log`

- 시나리오: `auth flow` (signup → logout → login)
- 실행: `npx playwright test e2e/auth-flow.spec.ts --reporter=line`
- 결과: **PASS** (1/1)
- 로그 파일: `logs/l2-auth-flow.log`

- 시나리오: `chat API` (CRUD + health)
- 실행: `npx playwright test e2e/chat-api.spec.ts --reporter=line`
- 결과: **3 passed / 6 skipped**
- 로그 파일: `logs/l2-chat-api.log`

- 시나리오: `webhook flow` (alerts test/notify)
- 실행: `npx playwright test e2e/webhook.spec.ts --reporter=line`
- 결과: **PASS** (1/1)
- 로그 파일: `logs/l2-webhook.log`

- 시나리오: `smoke` (home/library/editor/public)
- 실행: `npx playwright test e2e/smoke.spec.ts --reporter=line`
- 결과: **4 passed**
- 로그 파일: `logs/l2-smoke.log`

- 시나리오: `route health` (pages + APIs)
- 실행: `npx playwright test e2e/route-health.spec.ts --reporter=line`
- 결과: **117 passed / 13 skipped**
- 로그 파일: `logs/l2-route-health.log`

- 시나리오: `L2 API scenarios` (app schema/CRUD + workflow logs + billing + hosting verify + mobile host/package)
- 실행: `npx playwright test e2e/l2-api-scenarios.spec.ts --reporter=line`
- 결과: **6 passed**
- 로그 파일: `logs/l2-api-scenarios.log`

- 시나리오: `L2 App feature scenarios` (app auth/users + secrets/proxy + plugins + forms/webhooks + upload)
- 실행: `npx playwright test e2e/l2-app-features.spec.ts --reporter=line`
- 결과: **8 passed**
- 로그 파일: `logs/l2-app-features.log`

- 시나리오: `L2 App user data access` (app_user_id 스코프 CRUD + 비인가 차단 + 소유자 전수 조회)
- 실행: `npx playwright test e2e/l2-app-user-data.spec.ts --reporter=line`
- 결과: **5 passed**
- 로그 파일: `logs/l2-app-user-data.log`

- 시나리오: `L2 App query scenarios` (필터/검색/정렬/집계)
- 실행: `npx playwright test e2e/l2-app-query.spec.ts --reporter=line`
- 결과: **5 passed**
- 로그 파일: `logs/l2-app-query.log`

- 시나리오: `L2 Page asset scenarios` (comments/todos/kanban/calendar/note/settings/notifications/page-audit)
- 실행: `npx playwright test e2e/l2-page-assets.spec.ts --reporter=line`
- 결과: **6 passed**
- 로그 파일: `logs/l2-page-assets.log`

- 시나리오: `L2 Versioning scenarios` (record/app workflow version history + restore)
- 실행: `npx playwright test e2e/l2-versioning.spec.ts --reporter=line`
- 결과: **4 passed**
- 로그 파일: `logs/l2-versioning.log`

- 시나리오: `L2 Audit log scenarios` (schema/record/workflow/secret/plugin/app auth/proxy/upload/hosting/mobile/webhook secret/form/webhook/version restore/hosting status/mobile host-config audit logs)
- 실행: `npx playwright test e2e/l2-audit-logs.spec.ts --reporter=line`
- 결과: **1 passed**
- 로그 파일: `logs/l2-audit-logs.log`


- 시나리오: `build` (2026-03-03)
- 실행: `npm run build`
- 결과: **PASS**
- 로그 파일: 콘솔 출력

- 시나리오: `unit tests` (2026-03-03)
- 실행: `npm test`
- 결과: **53 passed (11 files)**
- 로그 파일: 콘솔 출력

- 시나리오: `e2e` (2026-03-03)
- 실행: `npm run test:e2e`
- 결과: **FAIL** (DB 연결 실패: localhost:15432)
- 로그 파일: 콘솔 출력

- 시나리오: `e2e` (2026-03-03, 전체 재실행)
- 실행: `npm run test:e2e`
- 결과: **156 passed / 36 skipped / 0 failed**
- 로그 파일: 콘솔 출력

- 시나리오: `e2e` (2026-03-03, anon rate-limit 헤더 추가 후 재실행)
- 실행: `npm run test:e2e`
- 결과: **172 passed / 20 skipped / 0 failed**
- 로그 파일: 콘솔 출력

- 시나리오: `chat API` (page create 보정 후 단독)
- 실행: `npx playwright test e2e/chat-api.spec.ts --reporter=line`
- 결과: **9 passed**
- 로그 파일: 콘솔 출력

- 시나리오: `asset library presets` (FULL_PRESET_INSERT)
- 실행: `FULL_PRESET_INSERT=1 NEXT_PUBLIC_E2E=1 npx playwright test e2e/asset-library.spec.ts --reporter=line`
- 결과: **4 passed**
- 로그 파일: 콘솔 출력

- 시나리오: `admin+cron routes` (관리자/크론 엔드포인트)
- 실행: `CRON_SECRET=local-cron ADMIN_KEY=your-strong-key npx playwright test e2e/admin-cron.spec.ts --reporter=line`
- 결과: **10 passed**
- 로그 파일: 콘솔 출력

- 시나리오: `e2e` (FULL_PRESET_INSERT + NEXT_PUBLIC_E2E + ADMIN/CRON 환경 포함)
- 실행: `FULL_PRESET_INSERT=1 NEXT_PUBLIC_E2E=1 CRON_SECRET=local-cron ADMIN_KEY=your-strong-key npm run test:e2e`
- 결과: **189 passed / 13 skipped / 0 failed**
- 비고: 스킵 13건은 route-health의 의도적 skip이며 `admin-cron.spec.ts`로 별도 검증 완료.

- 시나리오: `password policy` (2026-03-03)
- 실행: `npm test`
- 결과: **55 passed (12 files)**
- 로그 파일: 콘솔 출력

- 시나리오: `observability logs` (2026-03-04)
- 실행: `npm test`
- 결과: **59 passed (13 files)**
- 로그 파일: 콘솔 출력

- 시나리오: `app data validation` (2026-03-04)
- 실행: `npm test`
- 결과: **62 passed (14 files)**
- 로그 파일: 콘솔 출력

- 시나리오: `workflow ui` (2026-03-04)
- 실행: `NEXT_PUBLIC_E2E=1 npx playwright test e2e/workflow-ui.spec.ts --reporter=line`
- 결과: **1 passed**
- 로그 파일: 콘솔 출력

- 시나리오: `offline cache mode` (2026-03-04)
- 실행: `NEXT_PUBLIC_E2E=1 npx playwright test e2e/offline.spec.ts --reporter=line`
- 결과: **1 passed**
- 로그 파일: 콘솔 출력

- 시나리오: `analytics endpoints` (2026-03-04)
- 실행: `NEXT_PUBLIC_E2E=1 npx playwright test e2e/analytics.spec.ts --reporter=line`
- 결과: **1 passed**
- 로그 파일: 콘솔 출력

## 4.5) 신규 L1 증거 (2026-03-04)
- 재시도/백오프 정책: `src/lib/app-workflow.ts`
  - L1: `tests/workflow-execution.test.ts` (Vitest 통과)
- 단계별 실패 처리: `src/lib/app-workflow.ts`
  - L1: `tests/workflow-execution.test.ts` (Vitest 통과)
- API 호출 스키마 검증: `src/lib/workflow-schema.ts`, `src/app/api/app/[pageId]/workflows/route.ts`
  - L1: `tests/workflow-schema.test.ts` (Vitest 통과)
- 워크플로 권한 분리: `src/lib/workflow-access.ts`, `src/app/api/app/[pageId]/workflows/route.ts`, `src/app/api/app/[pageId]/workflows/logs/route.ts`
  - L1: `tests/workflow-access.test.ts` (Vitest 통과)
- 데이터 캐시 레이어: `src/lib/app-data-cache.ts`, `src/lib/app-data.ts`
  - L1: `tests/app-data-cache.test.ts` (Vitest 통과)
- 플러그인 매니페스트 스펙 확정: `src/lib/app-plugins.ts`
  - L1: `tests/plugin-manifest.test.ts` (Vitest 통과)

## 4.6) 신규 L1 증거 (2026-03-04)
- 트랜잭션/락: `src/lib/pages.ts`
  - L1: `tests/transaction-lock.test.ts` (Vitest 통과)
- 마이그레이션 테스트: `src/lib/app-data.ts`
  - L1: `tests/schema-migration.test.ts` (Vitest 통과)
- 보안 테스트: `src/lib/admin-session.ts`, `src/lib/rate-limit.ts`, `src/lib/auth.ts`
  - L1: `tests/admin-access.test.ts`, `tests/rate-limit.test.ts`, `tests/auth.test.ts` (Vitest 통과)
- 성능 테스트: `src/advanced/layout/engine.ts`, `src/advanced/doc/scene.ts`
  - L1: `tests/stressDoc.test.ts` (Vitest 통과)
- 네이티브 브리지 스펙: `public/native-bridge-host.js`
  - L1: `tests/native-bridge.test.ts` (Vitest 통과)
- 카메라/갤러리/파일: `public/native-bridge-host.js`, `src/advanced/runtime/native-commands.ts`
  - L1: `tests/native-bridge.test.ts` (Vitest 통과)
- 위치/GPS: `public/native-bridge-host.js`, `src/advanced/runtime/native-commands.ts`
  - L1: `tests/native-bridge.test.ts` (Vitest 통과)
- 푸시 알림: `public/native-bridge-host.js`, `src/advanced/runtime/native-commands.ts`
  - L1: `tests/native-bridge.test.ts` (Vitest 통과)

## 4.7) 신규 L1 증거 (2026-03-05)
- 조건/루프 최적화: `src/lib/app-workflow.ts`
  - L1: `tests/workflow-loop.test.ts` (Vitest 통과)
- 권한 모델/샌드박스: `src/lib/app-plugins.ts`
  - L1: `tests/plugin-permissions.test.ts` (Vitest 통과)
- 버전/호환성 정책: `src/lib/app-plugins.ts`, `src/lib/semver.ts`
  - L1: `tests/plugin-permissions.test.ts` (Vitest 통과)
- 플러그인 UI 주입: `src/advanced/runtime/plugins.ts`
  - L1: `tests/plugin-ui-injection.test.ts` (Vitest 통과)
- 마켓/스토어: `src/lib/plugin-store.ts`, `src/app/api/plugins/store/route.ts`, `src/app/api/app/[pageId]/plugins/store/route.ts`
  - L1: `tests/plugin-store.test.ts` (Vitest 통과)
- SDK 문서/예제: `docs/PLUGIN_SDK.md`
  - L1: 문서 증거 확보
- OAuth 커넥터 템플릿: `src/lib/connectors.ts`
  - L1: `tests/connectors.test.ts` (Vitest 통과)
- 커넥터 카탈로그: `src/app/api/app/[pageId]/connectors/templates/route.ts`
  - L1: `tests/connectors.test.ts` (Vitest 통과)
- 스키마 매핑/검증: `src/lib/connectors.ts`
  - L1: `tests/connectors.test.ts` (Vitest 통과)
- 데이터 동기화/스케줄링: `src/lib/connector-scheduler.ts`, `src/server/cron-scheduler.ts`, `src/app/api/cron/connectors/route.ts`
  - L1: `tests/connector-scheduler.test.ts` (Vitest 통과)

## 4.8) 신규 L1 증거 (2026-03-05)
- 렌더 성능 최적화(대규모 문서): `src/advanced/layout/engine.ts`
  - L1: `tests/stressDoc.test.ts` (Vitest 통과)
- 전역 상태/캐시/데이터 동기화: `src/lib/synced-storage.ts`, `src/components/theme-toggle.tsx`, `src/advanced/runtime/player.tsx`
  - L1: `tests/synced-storage.test.ts` (Vitest 통과)
- 접근성(ARIA/키보드): `src/advanced/runtime/renderer.tsx`
  - L1: `tests/runtime-renderer.test.tsx` (Vitest 통과)
- i18n/로케일링: `src/advanced/runtime/player.tsx`
  - L1: `tests/locale-utils.test.ts` (Vitest 통과)
- 미디어(동영상) 컨트롤: `src/advanced/doc/scene.ts`, `src/advanced/runtime/renderer.tsx`, `src/advanced/ui/AdvancedEditorView.tsx`
  - L1: `tests/runtime-renderer.test.tsx` (Vitest 통과)
- 런타임 성능 메트릭 수집: `src/lib/runtime-metrics.ts`, `src/components/work-view.tsx`
  - L1: `tests/runtime-metrics.test.ts` (Vitest 통과)
- SSR/CSR 하이브리드 최적화: `src/app/editor/page.tsx`, `src/app/editor/advanced/page.tsx`
  - L1: `npm test` (Vitest 통과)
- 오토레이아웃 wrap/spacing/align 완성: `src/advanced/layout/engine.ts`
  - L1: `tests/layout.test.ts` (Vitest 통과)
- 반응형 규칙 UI 고도화: `src/advanced/layout/engine.ts`
  - L1: `tests/layout.test.ts` (Vitest 통과)
- 오버레이/레이아웃 충돌 처리: `src/advanced/runtime/layout-conflicts.ts`, `src/advanced/ui/AdvancedEditorView.tsx`
  - L1: `tests/layout-conflicts.test.ts` (Vitest 통과)

## 4.9) 신규 L0 증거 (2026-03-05)
- MFA/OTP: `prisma/schema.prisma`, `src/advanced/runtime/renderer.tsx`, `src/advanced/runtime/player.tsx`
  - L0: 스키마/런타임 입력 처리만 확인 (등록/검증/복구 플로우 미구현)
- 장바구니/주문: `src/advanced/ui/AdvancedEditor.assetLibraryPresets.ts`
  - L0: UI 템플릿/모의 제출만 확인 (주문/결제 처리 로직 미구현)
- 쿠폰/프로모션: `src/advanced/ui/AdvancedEditor.assetLibraryPresets.ts`
  - L0: UI 템플릿/모의 제출만 확인 (쿠폰 검증/룰 적용 미구현)

## 5) 미확인 11개 완료 기준 (L1/L2)
> 아래 항목은 **증거(L1/L2)** 확보 전까지 모두 “미확인”으로 유지한다.

### 5.1 리스트/테이블 가상화
- 완료 정의: 5,000+ 행/아이템에서 **윈도잉 렌더링**으로 DOM 렌더 수 제한, 스크롤/정렬/선택 유지
- L1: 가상화 유틸/컴포넌트 단위 테스트 (렌더 수, 스크롤 위치 유지, overscan)
- L2: e2e 스크롤 시나리오(상/중/하단) + 성능 로그

### 5.2 조직/팀 구조
- 완료 정의: Organization/Team/Member 모델 + 초대/역할/권한 연계, 페이지/리소스 접근 제어
- L1: 스키마/서비스/API 테스트(멤버십/권한/초대 수락/철회)
- L2: UI 시나리오(조직 생성→초대→권한 변경→접근 제한 확인)

### 5.3 SSO(OAuth/SAML)
- 완료 정의: SSO 설정 모델 + 로그인/프로비저닝 플로우 + 감사 로그 연동
- L1: SSO 설정 검증/로그인 플로우 테스트(모의 IdP)
- L2: 수동 시나리오 문서(SSO 설정→로그인→세션 생성→로그 기록)

### 5.4 BLE/NFC/센서
- 완료 정의: 네이티브 브리지 명령 스펙 + 런타임 호출/응답 처리 + 모의 호스트
- L1: 브리지 커맨드 테스트(모의 호스트로 응답 검증)
- L2: 수동 디바이스 시나리오(권한→스캔/읽기/응답 확인)

### 5.5 백그라운드 작업
- 완료 정의: 작업 스케줄링/재시도/상태 저장 + 최소 1개 백그라운드 워커 플로우
- L1: 스케줄/재시도/상태 전이 테스트
- L2: 실제 백그라운드 실행 시나리오 로그

### 5.6 앱 스토어 배포 파이프라인
- 완료 정의: 빌드 산출물 생성(ios/android) + 메타데이터/서명/릴리즈 파이프라인 문서화
- L1: 빌드 스크립트 테스트(드라이런/산출물 생성 확인)
- L2: 배포 시나리오 문서(스토어 업로드 전 체크리스트 포함)

### 5.7 CDN/캐시 정책
- 완료 정의: 캐시 헤더/정책 설정 + 퍼지 전략 + 주요 API/정적 리소스 분리
- L1: 응답 헤더 테스트(캐시 지시자, no-store, s-maxage 등)
- L2: 캐시 히트/미스 시나리오 로그

### 5.8 스케일링
- 완료 정의: 무상태 확장/세션 분리/큐 처리 + 수평 확장 가이드
- L1: 다중 인스턴스/큐 처리 테스트(모의) + 문서 증거
- L2: 부하 시나리오 리포트(최소 기준치)

### 5.9 보안 업데이트
- 완료 정의: 보안 업데이트 정책/알림/적용 프로세스 + 취약점 대응 로그 체계
- L1: 정책 문서 + 보안 이벤트 기록 테스트
- L2: 모의 패치/롤백 시나리오 기록

### 5.10 상품/카탈로그 관리
- 완료 정의: 상품/카테고리/가격/상태 모델 + CRUD + 노출 규칙
- L1: CRUD/검색/정렬 테스트
- L2: UI 시나리오(상품 생성→카탈로그 노출)

### 5.11 배송/재고
- 완료 정의: 재고 수량/예약/차감 + 배송 상태 흐름
- L1: 재고/배송 상태 전이 테스트
- L2: 주문→재고 차감→배송 상태 변경 시나리오

## 4.10) 신규 L1 증거 (2026-03-05)
- BLE/NFC/센서 브리지: `public/native-bridge-host.js`, `src/advanced/runtime/native-commands.ts`
  - L1: `tests/native-bridge.test.ts` (Vitest 통과)
- CDN/캐시 정책: `src/lib/cache-policy.ts`, `src/app/api/plugins/store/route.ts`, `src/app/api/health/route.ts`
  - L1: `tests/cache-policy.test.ts` (Vitest 통과)
- 보안 업데이트 기록: `src/lib/security-update.ts`, `src/app/api/admin/security-updates/route.ts`
  - L1: `tests/security-update.test.ts` (Vitest 통과)

## 4.11) 신규 L1 증거 (2026-03-06)
- 조직/팀 구조: `prisma/schema.prisma`, `src/lib/orgs.ts`, `src/lib/org-access.ts`, `src/app/api/orgs/*`
  - L1: `tests/orgs.test.ts` (Vitest 통과)
- 리스트/테이블 가상화: `src/lib/virtualization.ts`, `src/components/virtual-list.tsx`
  - L1: `tests/virtualization.test.ts` (Vitest 통과)
- 백그라운드 작업: `prisma/schema.prisma`, `src/lib/background-jobs.ts`, `src/server/background-worker.ts`
  - L1: `tests/background-jobs.test.ts` (Vitest 통과)

## 4.12) 신규 L0 증거 (2026-03-06)
- 상품/카탈로그 관리 UI: `src/advanced/ui/AdvancedEditor.assetLibraryPresets.ts` (asset-commerce-catalog)
  - L0: 프리셋 UI만 확인 (CRUD/검색/정렬/정책 로직 미구현)
- 배송/재고 UI: `src/advanced/ui/AdvancedEditor.assetLibraryPresets.ts` (asset-commerce-inventory)
  - L0: 프리셋 UI만 확인 (재고/배송 상태 전이 로직 미구현)

## 4.13) 신규 L1 증거 (2026-03-06)
- SSO(OAuth/SAML): `prisma/schema.prisma`, `src/lib/app-sso.ts`, `src/app/api/app/[pageId]/sso/*`, `src/app/api/app/[pageId]/auth/sso/route.ts`
  - L1: `tests/app-sso.test.ts` (Vitest 통과)
- 앱 스토어 배포 파이프라인: `src/lib/app-store-pipeline.ts`, `scripts/mobile/app-store-pipeline.ts`
  - L1: `tests/app-store-pipeline.test.ts` (Vitest 통과)
- 스케일링: `src/lib/scaling.ts`, `src/app/api/ops/scaling/route.ts`
  - L1: `tests/scaling.test.ts` (Vitest 통과)
