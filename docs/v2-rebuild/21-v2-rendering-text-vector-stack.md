# 21. v2 Rendering / Text / Vector Stack Decisions

이 문서는 v2 편집기 품질에 직접 연결되는 렌더링, 텍스트, 벡터 엔진 결정을 정리합니다.

## 1. 목표

- DOM scene graph 의존 제거
- 대형 문서에서도 예측 가능한 프레임 유지
- 텍스트/벡터 결과가 preview/publish에서 일관되게 보임

## 2. 렌더링 결정

### 2.1 기본 결정

- scene renderer는 **DOM이 아니라 GPU 기반 renderer**
- 초기 기본 backend는 **WebGL2**
- Canvas2D는 fallback/debug 용도
- WebGPU는 future optimization 대상이지 v2 초기 기본이 아님

이유:

- 브라우저 호환성
- WebGL2 tooling 성숙도
- WebGPU 초기 도입 리스크 회피

### 2.2 renderer 구조

파이프라인:

`SceneDoc -> SceneGraph -> LayoutSnapshot -> RenderList -> Backend Draw Calls`

즉, shell은 draw primitive를 직접 만들지 않습니다.

## 3. 텍스트 엔진 결정

### 3.1 shaping

초기 결정:

- shaping: `rustybuzz`
- font parse/metrics: `ttf-parser`

### 3.2 glyph / raster

초기 결정:

- glyph raster / atlas generation: `swash` 계열 통합 검토
- renderer는 glyph atlas 기반 draw path 지원

### 3.3 텍스트 규칙

- caret geometry는 kernel 계산
- line breaking, selection range, multi-style run은 kernel 소유
- shell은 input mediation만 담당

## 4. 벡터 엔진 결정

### 4.1 path / tessellation

초기 결정:

- path/geometry 기본: `lyon`
- bezier/path utility: `kurbo`

### 4.2 boolean ops

여기는 거짓으로 특정 crate를 못 박지 않습니다.  
현재 시점에서 정확한 최종 결론은:

- public API 경계는 `kernel-vector`로 고정
- boolean implementation은 **spike gate 통과 후 확정**
- acceptance gate를 통과하지 못하면 교체 가능

즉, 구현 경계는 잠겼고, 하부 dependency는 gate 기반 결정입니다.

## 5. 히트테스트 / selection

- hit test는 renderer 기준이 아니라 scene/layout 기준
- stroke/fill/path handle hit zone을 분리
- selection geometry와 draw geometry가 달라지면 안 됨

## 6. 캐시 전략

필수 캐시:

- text measure cache
- glyph atlas cache
- geometry tessellation cache
- render list diff cache
- viewport culling cache

## 7. GPU 리소스 전략

- texture atlas는 LRU eviction
- frame 단위 transient buffer 재사용
- selection/snap/debug overlay는 별도 layer

## 8. publish parity 규칙

편집기와 publish가 다른 렌더 경로를 가지면 안 됩니다.

허용:

- 같은 render command + 다른 host shell

금지:

- preview는 canvas, publish는 DOM
- editor text layout과 runtime text layout이 다른 엔진 사용

## 9. fallback 정책

### 허용 fallback

- low capability browser -> Canvas2D reduced mode
- debug inspection mode -> CPU path

### 금지 fallback

- 기능별 제멋대로 DOM fallback
- 텍스트만 브라우저 임의 측정으로 따로 처리

## 10. 품질 게이트

텍스트/벡터/렌더는 아래를 통과해야 합니다.

- visual regression
- large doc pan/zoom benchmark
- text selection/caret correctness tests
- boolean op fixture suite
- hit test consistency tests

## 11. 남겨두는 진실한 경계

지금 문서 수준에서 정확히 말할 수 있는 것은:

- render architecture는 충분히 잠겼다
- text shaping stack도 거의 잠겼다
- vector boolean dependency 하나는 spike gate를 남겨 둔다

이건 미완성이라서가 아니라, 현재 시점에 검증 없이 특정 라이브러리를 박아 넣는 것이 더 위험하기 때문입니다.

## 12. 최종 결론

v2 렌더링 축은 **WebGL2 기반 GPU renderer + Rust text/vector kernel + render command parity**로 간다.

## 13. Text implementation checkpoint

Implemented in `kernel-text` Phase 1:

- Unicode grapheme segmentation
- Unicode line-break opportunities and deterministic wrapping
- UTF-16 browser offset contract
- paragraph spacing and left/center/right/justify geometry
- multi-style metric runs
- line/baseline/grapheme/caret/selection geometry
- scene auto-height and WASM `text_layout` query integration

Not yet implemented and still release-blocking:

- bundled font registry and font-file loading
- `ttf-parser` metrics and `rustybuzz` shaping
- bidi/script itemization and OpenType feature handling
- glyph raster/atlas and GPU render commands
- editor/preview/publish shaped-text visual parity

The current `deterministic_fallback` measurement mode must not be described as Figma-grade text rendering.
