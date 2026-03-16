# NULL Figma Renderer 전환 설계

## 1. 목표

현재 NULL은 DOM/SVG 기반 렌더러와 에디터 오버레이로 동작한다.
이 구조는 빠르게 기능을 붙이기엔 좋지만, Figma급 대문서 성능과 정확도를 끝까지 책임지긴 어렵다.

이 문서는 세 항목을 고정한다.

1. DOM/SVG 기반 한계 구간 분리
2. canvas/WebGL 전환 대상 명확화
3. 대문서 렌더링 기준 수립

## 2. 현재 구조

- 문서 모델: `src/advanced/doc/scene.ts`
- 레이아웃 엔진: `src/advanced/layout/engine.ts`
- 런타임 렌더러: `src/advanced/runtime/renderer.tsx`
- 에디터 오버레이: `src/advanced/ui/AdvancedEditorView.tsx`

현재 장점:

- 기능 추가 속도가 빠르다.
- CSS/SVG 기반 inspect와 export가 쉽다.
- text editing, dev handoff, snapshot 회귀가 단순하다.

현재 한계:

- 노드 수가 커질수록 DOM tree 비용이 급증한다.
- smart guide / selection / hit test가 scene DOM에 종속되기 쉽다.
- filter/effect, clipping, mask, blend 조합이 무거워진다.
- vector 편집과 대문서 pan/zoom이 같은 트리 비용을 공유한다.

## 3. DOM/SVG 한계 구간

DOM/SVG를 계속 써도 되는 영역과 아닌 영역을 분리한다.

### 3.1 DOM/SVG 유지 영역

- inspector
- property panel
- dev mode spec UI
- text input overlay
- small document preview
- export/debug tooling

### 3.2 DOM/SVG가 병목이 되는 영역

- 캔버스 본문 scene render
- 대량 선택 박스와 hover feedback
- smart guide / distance overlay 계산 결과 렌더
- path anchor / handle 편집 오버레이
- mask / blend / blur가 많은 장면
- 5천 노드 근처 문서의 pan / zoom / scroll

즉, UI shell은 DOM을 유지하고, scene stage는 분리한다.

## 4. 전환 대상

### 4.1 1차 전환 대상: Scene Stage

가장 먼저 옮길 대상은 `scene body`다.

대상:

- frame/section/group/path/image 기본 렌더
- layout box와 clipping
- selection background hit layer
- viewport transform

유지:

- inspector
- panel
- floating toolbar
- text edit overlay

### 4.2 2차 전환 대상: Vector / Overlay

다음은 아래를 옮긴다.

- vector path draw
- anchor / edge / handle overlay
- smart guides
- distance guides
- selection bounds

이 단계부터 canvas hit map이 필요하다.

### 4.3 3차 전환 대상: Effects / Large Doc

WebGL 전환은 여기서부터 적용한다.

대상:

- tiled large-scene raster cache
- shadow / blur / blend 합성
- large image layer
- deep clip/mask stack

원칙:

- 기본 렌더는 canvas 2D 우선
- effect-heavy 구간만 WebGL로 승격
- text input과 dev inspect는 DOM 유지

## 5. 최종 하이브리드 구조

최종 구조는 4층이다.

1. DOM shell
   - panel / toolbar / inspector / text editor
2. canvas scene
   - 일반 노드 렌더
3. WebGL effect layer
   - blur / shadow / blend / tiled cache
4. debug / hit / guide overlay
   - selection / guide / anchor / measurement

한 번에 전부 바꾸지 않는다.
계층을 분리하고 한 층씩 교체한다.

## 6. 대문서 기준

사용자 목표는 페이지 단위에서 약 `5,000` 노드다.
이 기준으로 성능 버짓을 고정한다.

### 6.1 문서 등급

- `S`
  - 0~1,500 nodes
  - DOM/SVG도 허용
- `M`
  - 1,500~3,000 nodes
  - canvas scene 기본
- `L`
  - 3,000~5,000 nodes
  - canvas scene + cache + selective WebGL
- `XL`
  - 5,000+
  - 편집 범위 제한, aggressive virtualization, tile cache 필수

### 6.2 성능 기준

- pan/zoom 중 입력 지연 체감 1프레임 이상 튀지 않아야 한다.
- selection drag는 60fps 체감을 목표로 한다.
- 5,000 노드에서도 viewport 이동과 선택 박스는 usable 해야 한다.
- offscreen 영역은 반드시 cull 해야 한다.

## 7. 렌더링 원칙

1. layout 계산과 render를 분리한다.
2. selection/hit test는 scene render와 별도 자료구조를 쓴다.
3. text metric은 공통 helper를 유지하고, 렌더러만 교체한다.
4. node tree 전체 재렌더 대신 viewport/tile 단위 invalidation으로 간다.
5. export와 editor preview는 동일 scene graph를 공유한다.

## 8. 안전장치

전환은 shadow renderer 방식으로 한다.

- 기존 DOM/SVG renderer 유지
- 새 scene renderer를 병행 추가
- representative fixture render regression 유지
- 특정 문서/플래그에서만 새 renderer 활성화

즉, 기존 렌더러를 바로 지우지 않는다.

## 9. 구현 순서

1. scene graph 정규화
2. canvas stage prototype
3. selection / guide overlay 분리
4. viewport culling + tile cache
5. effect layer WebGL 승격
6. large doc mode 자동 전환

## 10. 완료 기준

이 설계가 구현되면 아래가 충족돼야 한다.

1. representative fixture에서 기존과 시각 parity 유지
2. 5,000 노드 기준 pan/zoom/selection usable
3. vector edit overlay가 DOM tree 병목 없이 동작
4. text edit overlay는 기존 UX를 유지
5. 기존 renderer로 롤백 가능한 구조 유지
