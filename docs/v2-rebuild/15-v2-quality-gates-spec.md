# 15. v2 Quality Gates Specification

이 문서는 **상용 수준 에디터 완성**을 목표로 할 때 필요한 게이트를 정의합니다.

## 1. 원칙

완성 판단은 감으로 하지 않습니다.  
모든 phase와 최종 전환은 통과 기준을 가져야 합니다.

## 2. 최상위 원칙

- **에디터 품질 게이트가 release blocker다**
- runtime / service / AI는 에디터 산출물 확장을 위한 보조 게이트다
- internal QA와 staging validation 없이 기본 전환하지 않는다

## 3. 에디터 게이트

- selection stability tests
- drag/resize/rotate tests
- undo/redo determinism tests
- large document benchmark
- inspector interaction tests
- visual regression
- clipboard / import / asset attach tests
- autosave / recovery tests
- component / instance / override tests
- text input / IME / caret tests
- actual font load/hash/license verification
- OpenType shaping/kerning and variable weight/italic tests
- UTF-16 cluster, combining sequence, unsupported glyph, mixed fallback tests
- CJK fallback-chain and bidi visual-order caret tests
- DOM preview / render-command / publish text parity visual tests
- vector boolean / path edit tests

## 4. 런타임 보조 게이트

- route/state/action integration tests
- binding correctness tests
- publish/preview parity tests
- runtime idle leak tests

## 5. 서비스 보조 게이트

- auth/session tests
- document save/version tests
- publish snapshot tests
- collaboration consistency tests
- comment/review anchor tests

## 6. AI 보조 게이트

- patch schema validation
- dry-run success rate
- selection modify accuracy
- no unauthorized destructive patch
- rollback correctness
- before/after visual diff review

## 7. 전환 게이트

다음을 모두 통과해야 **v2 에디터 기본 전환**을 고려할 수 있습니다.

- core editor perf budget green
- editor acceptance gate green
- internal QA green
- staging validation green
- runtime parity green
- collaboration consistency green
- AI patch safety green
- migration rollback tested

## 8. 수동 검수 항목

자동화만으로 안 되는 항목:

- 디자인 품질
- 편집기 사용감
- 정보 구조
- 마감 디테일
- 키보드 흐름
- 캔버스/인스펙터 상호작용

## 9. 운영 게이트

- dashboards ready
- alert rules ready
- oncall playbook ready
- migration playbook ready
- rollback verified

## 10. 최종 판단 규칙

“기능이 된다”는 출시 기준이 아닙니다.  
출시는 다음일 때만 가능합니다.

- 에디터 기능
- 성능
- 안정성
- 운영성
- UX
- 복구성

이 여섯이 동시에 기준을 넘을 때만 가능하며,  
이중 **에디터 품질 게이트 미통과는 단독 release blocker**입니다.

## 11. Text Engine checkpoint 판정

2026-11-14 Phase 2B partial와 RenderList v2 path mesh까지 통과한 항목:

- Rust native font parse/shaping tests
- Inter kerning, variable weight, italic face test
- Unicode grapheme/UTF-16 cluster geometry test
- missing family와 missing glyph 진단 test
- real browser WASM load, mixed fallback, auto-height, undo E2E
- UAX #9 bidi visual order, RTL caret/hit-test, mixed-direction split selection Rust test
- real browser WASM bidi diagnostics와 DOM `dir=auto` E2E
- exact-request cache hit, changed-metric miss, bounded eviction Rust test와 browser WASM cache reuse E2E
- Noto Sans Hebrew RTL glyph shaping/origin Rust test와 browser font loading/family parity E2E
- Unicode 17 script itemization, Common/Inherited 문맥 해소, mixed-script shaping-run 분리 Rust test와 browser `scriptRunCount` E2E
- Noto Sans Arabic script fallback, RTL shaping, browser font loading/family parity E2E
- dynamic font parse/size/count validation, replacement/removal, cache invalidation Rust test
- browser startup font fetch -> WASM registration -> scene auto-height/query shared-handle parity test
- 앞 문단 길이 변경, 문단별 style run 변경, width-only reflow에 대한 paragraph shaping cache hit와 cold-layout geometry parity Rust test
- 동일 길이 문단 로컬 편집 후 unchanged paragraph shaping reuse Playwright E2E
- dirty paragraph 내부 style-run 변경 시 unchanged shaping-run reuse와 cold-layout glyph/caret parity Rust test
- long shaping-run sequence에서 retained-payload byte budget, LRU eviction, stats serialization Rust/FFI test
- large exact-layout sequence와 large multi-paragraph layout에서 계층별 byte-driven eviction 및 상한 준수 Rust test
- WASM bridge cache-stats query와 inspector 기본 총 `40 MiB` 계약 Playwright E2E
- selection style edit -> WASM run-cache reuse -> inspector diagnostics Playwright E2E
- `cargo bench -p kernel-text --bench text_layout` 10k grapheme/100-run incremental release benchmark
- `npm run verify:v2:assets`로 font SHA-256, raw WASM 3 MB, WASM+기본 font gzip 2.5 MB 상한을 CI에서 차단
- shape/path/styled glyph-run RenderList 생성, 절대 transform, 회전 AABB, viewport/overscan culling Rust test
- stable command fingerprint와 added/updated/removed/unchanged RenderDiff Rust/FFI test
- 실제 editor viewport -> WASM `render_frame` -> inspector diagnostics와 text edit incremental diff Playwright E2E
- rect/ellipse/line WebGL2 instanced batch의 z-order/transform/color 단위 test
- browser WebGL2 draw call, Rust/GPU revision parity, non-transparent pixel output, GL error 0, context loss/restore Playwright E2E

아직 release blocker인 항목:

- CJK bundled/streamed fallback font
- Syriac 등 기타 RTL glyph shaping과 Script_Extensions 교집합 기반 정밀 itemization
- geometry tessellation cache, glyph raster/atlas, media texture, WebGL2 visual parity와 DOM/SVG renderer 제거
- multi-script/very-large document benchmark, allocator overhead/fragmentation을 포함한 process-memory profile, calibrated CI performance gate
- editor/preview/publish pixel parity
