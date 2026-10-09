# 13. v2 Performance and SLO Specification

이 문서는 v2의 **에디터 중심 성능 목표**와 운영 기준입니다.

## 1. 원칙

성능은 “느낌”이 아니라 예산과 측정으로 관리합니다.

## 2. 에디터 성능 목표

### 문서 열기

- small doc(<1k nodes): p95 500ms 이하
- medium doc(<5k nodes): p95 1200ms 이하
- large doc(<20k nodes): p95 2500ms 이하

### 상호작용

- select: p95 16ms 이하
- drag frame update: budget 16ms/frame
- text input latency: p95 20ms 이하
- zoom/pan: 체감 60fps 목표

### 2.1 Text Engine budget

- 1,000 grapheme single-style shaping: warm p95 8ms 이하
- 10,000 grapheme mixed-run layout: warm p95 40ms 이하
- text edit 이후 재계산은 dirty paragraph/run 범위로 제한
- font parse 결과와 shape plan은 font hash + face index + variation axis 기준으로 cache
- 초기 editor WASM + 필수 font compressed transfer: 2.5 MB 이하 목표
- 2026-10-09 Phase 2B partial raw WASM은 bundled Inter normal/italic, bidi visual-order geometry, 32-entry exact-request LRU cache 포함 `3,989,668 bytes`; compressed transfer와 parse latency를 별도 측정하기 전에는 성능 게이트 통과로 보지 않음
- 현재 cache는 stale geometry 방지를 위해 `TextLayoutRequest` 전체 동등성을 key로 사용하며, paragraph/run 단위 incremental shaping cache는 별도 release blocker
- CJK/사용자 font는 Phase 2B에서 lazy fetch + content hash cache로 분리하고 WASM binary에 계속 직접 embed하지 않음

## 3. 런타임 성능 목표

현재 phase에서 런타임은 **에디터 산출물 parity 검증용 최소 실행 계층**입니다.

- page route switch: p95 250ms 이하
- list/detail render: p95 400ms 이하
- form submit visible feedback: 100ms 이내
- runtime idle CPU budget: low

## 4. 실시간 성능 목표

- message fanout end-to-end p95: 300ms 이하
- read receipt propagation p95: 500ms 이하
- presence update p95: 500ms 이하
- reconnect recovery snapshot p95: 1000ms 이하

## 5. 서비스 응답 목표

현재 phase에서 서비스 목표는 **편집기 저장/협업/발행 흐름 안정화**가 우선입니다.

- platform auth login p95: 400ms 이하
- document save p95: 300ms 이하
- document version restore p95: 500ms 이하
- comment create p95: 300ms 이하
- publish snapshot create p95: 1500ms 이하

## 6. 빌드/검증 목표

- preview build validation time budget
- publish preparation under 30s for standard app
- default switch 이후 switchback under 5m

## 7. 운영 SLO

초기 권장:

- control plane monthly availability: 99.9%
- app runtime monthly availability: 99.9%
- realtime subsystem: 99.5% 이상

## 8. Error Budget

월 단위 error budget을 잡고 **internal QA / staging validation / default switch** 판단과 연동해야 합니다.

예:

- default switch 이후 SLO 소모 증가 시 즉시 switchback 검토

## 9. 성능 측정 체계

필수:

- editor client metrics
- runtime client metrics
- API latency metrics
- DB query timing
- queue depth
- websocket connection count
- memory/CPU saturation

## 10. 성능 회귀 방지

필수 게이트:

- editor benchmark suite
- runtime benchmark suite
- ws soak test
- visual perf traces

## 11. 대규모 문서 대응

필수:

- culling
- virtualization
- command batching
- cache invalidation discipline
- incremental render command regeneration

## 12. 대규모 운영 대응

필수:

- workspace isolation
- background job isolation
- rate limit
- queue partitioning
- collaboration room sharding plan

## 13. 완료 기준

“빠르다”는 표현 대신 아래를 만족해야 합니다.

- 측정치 존재
- SLO 존재
- error budget 존재
- regression gate 존재
- **Editor Kernel 성능이 최우선 release blocker로 관리**
