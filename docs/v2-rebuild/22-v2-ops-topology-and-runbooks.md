# 22. v2 Ops Topology and Runbooks

이 문서는 v2 **에디터 재구축**을 실제 운영 가능한 상태로 만들기 위한 배포 토폴로지와 운영 절차를 정리합니다.

## 1. 목표

- 장애 시 복구 가능
- default switch / switchback 명확
- editor SLO 측정 가능
- 편집기 / 협업 / publish / AI 계층이 운영 가능한 구조

## 2. 환경 구분

필수 환경:

- local
- dev
- staging
- production

원칙:

- staging은 production과 최대한 같은 topology
- dev 편의용 설정을 production 가정에 섞지 않음

## 3. 런타임 토폴로지

### 3.1 Next shell

- 역할: UI shell / edge-safe route / basic SSR
- 배치: Vercel 또는 container

### 3.2 Rust service kernel

- 역할: auth / document persistence / collaboration / publish / media / ai orchestration
- 배치: container or VM, long-lived process

### 3.3 background workers

분리 권장:

- publish worker
- validation worker
- media worker
- AI orchestration worker

### 3.4 storage

- Postgres: source of truth
- Redis: cache / queue / presence / fanout
- Object storage: media/assets/files

## 4. 최소 production shape

- Next shell instances
- Rust api instances
- Rust ws/realtime instances
- background worker instances
- managed Postgres
- managed Redis
- object storage
- telemetry backend

## 5. 네트워크 경계

- public ingress -> Next shell / API gateway
- internal service network -> Rust kernel / workers / Redis / Postgres
- DB direct access는 service 계층으로만 제한

## 6. observability stack

필수:

- structured logs
- metrics
- tracing
- error aggregation
- dashboarding
- alerting

최소 대시보드:

- request latency
- error rate
- ws active connections
- replay lag
- queue depth
- worker failure rate
- DB saturation
- Redis saturation

## 7. release flow

1. branch push
2. CI validate
3. preview / staging deploy
4. contract + integration + perf gates
5. internal QA / staging validation
6. observe error budget
7. default switch or switchback 판단

## 8. rollback 규칙

필수 rollback 종류:

- shell deploy rollback
- service binary rollback
- feature flag rollback
- schema-compatible runtime rollback

금지:

- irreversible migration 직후 no-rollback deploy

## 9. migration runbook

1. migration dry run
2. backup snapshot check
3. staging apply
4. compatibility verify
5. production scheduled apply
6. post-apply smoke test
7. rollback path 확인

## 10. incident classes

### Sev 1

- editor login outage
- document save/publish full outage
- collaboration total outage
- document corruption

### Sev 2

- degraded latency
- partial publish failure
- preview/publish mismatch

### Sev 3

- localized UI regression
- non-critical worker delay

## 11. oncall runbook 최소 항목

- incident owner
- communication channel
- mitigation checklist
- rollback checklist
- customer impact notes
- follow-up RCA template

## 12. backup / restore

필수:

- Postgres scheduled backups
- point-in-time recovery capability
- object storage versioning
- release snapshot retention

## 13. security 운영 항목

- secret rotation
- audit log retention
- admin action audit
- ws token expiry
- session revocation path
- workspace isolation checks

## 14. 비용 통제

필수 예산 축:

- AI token cost
- collaboration connection cost
- storage/egress cost
- DB/Redis compute cost

운영 rule:

- AI high-cost flow rate limit
- inactive document presence compaction
- large media derivative cap

## 15. launch checklist

- SLO dashboard ready
- alerts tuned
- rollback tested
- migration runbook tested
- internal QA green
- staging validation green
- security review complete
- editor perf budget green

## 16. 최종 결론

v2는 기능만 되는 에디터가 아니라  
**default switch / switchback / incident / cost / observability까지 운영 가능한 상용 에디터**여야 합니다.
