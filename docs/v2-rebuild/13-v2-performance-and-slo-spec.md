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
- 2026-11-14 Phase 2B partial + RenderList v1 raw WASM은 동적 font registry/FFI, bidi visual-order geometry, RTL shaping, Unicode script itemization, exact `32 entries / 16 MiB`, paragraph `128 entries / 16 MiB`, shaping-run `512 entries / 8 MiB` LRU, render command generation/diff를 포함해 `2,326,115 bytes`; Inter normal/italic과 Noto Sans Hebrew/Arabic은 browser startup에서 병렬 fetch/등록함
- 최초 raw WASM `4,950,594 bytes` 대비 `2,624,479 bytes`(`53.0%`) 감소
- 자동 품질 게이트의 Node gzip level 9 측정은 WASM `732,132 bytes` + 기본 font 4개 `1,512,628 bytes` = 총 `2,244,760 bytes`로 2.5 MB 목표 이내; production HTTP compression/cache와 startup font fetch/parse latency 실측 전에는 성능 release gate 최종 통과로 보지 않음
- exact layout은 `TextLayoutRequest` 전체 동등성으로 보호하고, shaping은 paragraph-relative cache와 script/bidi/font/style/text 기반 run cache로 분리한다. width/alignment/spacing 변화는 shaping을 무효화하지 않고, 한 run의 style 변경은 같은 문단의 나머지 run을 재사용한다.
- 2026-11-14 로컬 release benchmark(`10,000 grapheme`, `100 runs`, `50 edits`) 재실측은 cold `34.644ms`, warm p50 `19.988ms`, warm p95 `25.021ms`, reused/reshaped run `4,950/50`, exact/paragraph/run entries `7/8/150`, total retained cache payload `32,997,630/41,943,040 bytes`, total eviction `87`이다. 해당 장비에서는 warm p95 40ms 목표 안이고 cache 상한도 유지됐지만 calibrated CI runner와 반복 분산 기준이 없으므로 전 환경 SLO 최종 통과로 판정하지 않는다.
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

2026-11-14 RenderList v1 checkpoint:

- Rust가 scene 계층 순서와 절대 transform을 기준으로 rect/ellipse/line/path/styled glyph-run 명령을 생성
- 회전 AABB와 stroke inflation을 포함한 world-space viewport/overscan culling 적용
- command별 stable fingerprint와 이전/다음 프레임 `added/updated/removed/unchanged` diff 생성
- editor pan/zoom viewport를 WASM `render_frame`에 전달하고 inspector에서 command/glyph/visible/cull/diff를 관찰
- WebGL2 shadow backend는 rect/ellipse/line을 단일 instanced draw call로 제출하고 DPR surface, context restore, GL error, unsupported command를 계측
- 현재 수치는 기능 계약 검증 단계이며 20k node culling/frame-time, GPU upload/draw 비용, atlas/texture memory는 아직 측정 전

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
