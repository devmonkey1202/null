# 10. v2 Editor Specification

이 문서는 v2 편집기의 상세 명세입니다.  
이 문서는 현재 v2 문서 세트에서 **최상위 핵심 문서**입니다.  
목표는 “좋아 보이는 에디터”가 아니라 **상용 수준 편집기**입니다.

## 1. 제품 기준

v2 편집기는 다음을 동시에 만족해야 합니다.

- Figma에 익숙한 사용자가 낯설지 않게 사용할 수 있음
- 대형 문서에서도 반응성이 무너지지 않음
- 멀티페이지/컴포넌트/변수/프로토타입/앱 상태를 한 문서 체계에서 관리 가능
- 협업, undo/redo, 선택, 입력, 패널 편집이 결정론적으로 동작
- AI가 구조적으로 수정할 수 있는 문서 모델을 제공

## 2. 절대 요구사항

### 2.1 반응성

- 노드 선택 응답: p95 16ms 이하
- 드래그 이동 프레임 유지: 60fps 목표, 최저 45fps 하한
- 텍스트 입력 지연: p95 20ms 이하
- 5,000 visible node 문서에서 패닝/줌 체감 끊김 최소화
- 20,000 total node 문서도 열고 저장 가능

### 2.2 안정성

- 선택 상태가 의도 없이 해제되면 안 됨
- 패널 입력이 오버레이/숨은 레이어에 가로채이면 안 됨
- undo/redo는 결정론적으로 동일 결과를 재현해야 함
- 문서 autosave 후 reload 시 시각/구조 손실이 없어야 함

### 2.3 예측 가능성

- 모든 편집은 command 기반
- command -> kernel apply -> snapshot delta 흐름 고정
- React state가 문서 원본을 직접 mutate 하면 안 됨

## 3. 문서 모델

### 3.1 최상위 구조

- document
- pages
- nodes
- components
- tokens
- variables
- app model ref
- metadata

### 3.2 Node 종류

최소 지원:

- frame
- text
- shape(rect, ellipse, line, polygon, path)
- image
- video
- component
- instance
- slot
- group

### 3.3 Node 공통 속성

- id
- name
- parentId
- childIds
- frame(x, y, w, h, rotation)
- visibility
- opacity
- blendMode
- clipping
- layout spec
- style spec
- binding refs
- behavior refs

## 4. Editor Kernel 기능 명세

### 4.1 Selection

필수:

- single select
- multi select
- marquee select
- parent select
- deep select
- locked/hidden node 제외 처리
- keyboard navigation

규칙:

- selection source는 kernel이 관리
- selection rectangle과 node hit result는 항상 같은 계산 기준 사용

### 4.2 Transform

필수:

- move
- resize
- rotate
- distribute
- align
- nudge
- scale with constraints

규칙:

- transform 중 snap preview 분리
- snap commit은 실제 결과와 동일해야 함

### 4.3 Layout

필수:

- frame layout
- auto layout row/column
- gap/padding/alignment
- min/max
- hug/fill/fixed
- absolute child
- constraints for non-auto layout parents

### 4.4 Components

필수:

- component create
- instance create
- detached instance
- variant group
- variant property
- override system

원칙:

- component 정의와 instance override를 분리 저장
- variant switching은 node copy가 아니라 참조 모델이어야 함

### 4.5 Tokens and Variables

필수:

- local token
- shared token
- theme mode
- variable mode
- node binding
- formula/computed variable

### 4.6 History

필수:

- undo
- redo
- transaction grouping
- coalescing typing
- drag command batching

원칙:

- UI interaction 단위와 history 단위가 일치해야 함

### 4.7 Text Engine

최소 범위:

- multi-style text runs
- caret/selection model
- paragraph alignment
- line height
- letter spacing
- font fallback
- text box resize mode

권장:

- shaping library 사용
- selection/caret geometry는 kernel 계산

구현 단계 구분:

- Phase 1: Unicode grapheme, UAX#14 line-break opportunity, wrapping, alignment, baseline, caret/selection geometry, multi-style metrics, auto-height
- Phase 2A: bundled font registry, Regular/Italic variable font loading, `ttf-parser` glyph coverage, `rustybuzz` shaping/positioning, glyph/cluster geometry, shaped/mixed/fallback diagnostics
- Phase 2B: user font registration/streaming, CJK font set, fallback chain, bidi paragraph/visual-order geometry, RTL shaping, script itemization, shaping/measurement cache
- Phase 3: glyph raster/atlas, render-command integration, editor/preview/publish text parity
- Phase 1의 `deterministic_fallback`과 Phase 2A의 unsupported-glyph fallback은 계약과 편집 흐름을 보존하기 위한 경로이며 상용 텍스트 엔진 완료 판정이 아니다.
- 모든 텍스트 offset 계약은 browser-compatible UTF-16 code unit으로 고정한다.

Phase 2A 구현 checkpoint (`TextLayout.engineVersion = 2`):

- `measurementMode`: `shaped | mixed | deterministic_fallback`
- `glyphs`: glyph id, UTF-16 cluster range, line index, baseline 위치, advance/offset, resolved family
- `resolvedFonts`: 실제 shaping에 사용한 family만 기록
- `fontFallbacks`: family unavailable / missing glyph / shaping failure를 구분
- `shapedRunCount`, `fallbackGraphemeCount`: inspector와 acceptance test가 사용하는 수치
- 동적 등록 Inter 4.1 normal/italic variable face와 `wght`, `opsz` axis 적용

Phase 2B bidi geometry checkpoint (`TextLayout.engineVersion = 3`):

- UAX #9 resolved embedding level을 grapheme cluster에 보존하고 line 단위 visual order를 생성
- `baseDirection`, `direction`, `bidiLevel`을 line/grapheme geometry에 명시
- RTL 논리 start/end를 시각 좌표에 매핑한 caret과 hit-test 제공
- 혼합 방향 선택이 시각적으로 분리될 때 여러 selection rectangle을 반환
- `bidiParagraphCount`, `visualRunCount`, `layoutWarnings`를 inspector/acceptance test에 노출
- content/width/alignment/spacing/style runs 전체가 동일할 때만 재사용하는 bounded Rust LRU layout cache를 FFI 경로에 적용하고 `cacheHit`을 진단에 노출

Phase 2B Hebrew shaping checkpoint (`TextLayout.engineVersion = 4`):

- OFL Noto Sans Hebrew variable face를 Rust와 browser가 같은 파일로 사용
- odd bidi-level run에 Rustybuzz `RightToLeft` 방향을 명시하고 실제 glyph id/advance/offset을 반환
- logical cluster 범위와 visual cluster 좌표를 분리해 RTL glyph origin, caret, hit-test를 같은 layout에서 계산
- `Inter` 요청에서도 Hebrew glyph가 필요하면 Noto Sans Hebrew로 fallback하고 `resolvedFonts`에 실제 family를 기록
- 지원하지 않는 Arabic/기타 RTL script는 shaped로 오인하지 않고 `deterministic_fallback` 또는 `mixed`로 유지

Phase 2B script itemization checkpoint (`TextLayout.engineVersion = 5`):

- Unicode 17 Script 속성으로 grapheme의 strong script를 판별하고 Common/Inherited/Unknown은 문단의 인접 strong script로 해소
- script, bidi level, text style, resolved font 중 하나라도 달라지면 shaping run을 분리
- ISO 15924 tag를 Rustybuzz buffer에 명시해 같은 방향의 Latin/Greek 등 서로 다른 script가 하나의 shaping run으로 합쳐지지 않도록 보장
- grapheme별 `script`와 문단별 run 합계인 `scriptRunCount`를 WASM/TypeScript/inspector/acceptance test에 동일하게 노출

Phase 2B Arabic shaping checkpoint (`TextLayout.engineVersion = 5` 계약 유지):

- OFL Noto Sans Arabic variable face를 Rust와 browser가 같은 파일로 사용
- `Arab` script run은 요청 family가 glyph를 제공하지 않을 때 Noto Sans Arabic으로 해소하고 Rustybuzz `RightToLeft` shaping 적용
- Arabic glyph family, script 진단, browser font loading을 Rust test와 Playwright acceptance test로 검증
- Inter normal/italic과 Noto Sans Hebrew/Arabic은 browser startup에서 병렬 fetch한 뒤 WASM font registry에 `Uint8Array`로 등록하며, 자산 하나가 실패해도 editor bridge 전체를 noop으로 강등하지 않음
- registry는 OpenType parse 검증, family/style 교체, 해제, layout cache invalidation, face당 16 MiB/총 32 MiB/32 faces 제한을 적용
- scene auto-height와 `text_layout` query는 같은 `TextLayoutHandle` registry/cache를 사용하여 command snapshot과 inspector geometry 불일치를 막음

Phase 2B incremental paragraph shaping checkpoint (`TextLayout.engineVersion = 6`):

- exact-request layout LRU 아래에 기본 128-entry paragraph shaping LRU를 추가하고 content, base style, paragraph-relative style run을 key로 사용
- width, alignment, paragraph spacing 변경은 glyph shaping을 무효화하지 않고 line wrapping과 geometry만 다시 계산
- 앞 문단 길이가 바뀌어도 뒤 문단의 UTF-16 cluster/glyph offset을 재배치하여 동일 shaping 결과를 재사용
- 문단 content 또는 해당 문단과 교차하는 style run만 바뀌면 dirty 문단만 다시 shape하고 나머지 문단은 재사용
- font 등록, 교체, 해제 시 exact-request cache와 paragraph cache를 함께 비워 stale glyph geometry를 차단
- `paragraphCacheHits`, `paragraphCacheMisses`를 WASM/TypeScript/inspector에 노출하고 Rust cold-layout parity test와 Playwright 편집 test로 검증
- 한 문단 내부에서 변경되지 않은 shaping run까지 부분 재사용하는 run-level cache는 아직 구현되지 않았으며 후속 성능 게이트로 유지

현재 명시적 한계:

- 현재 기본 face 4개(Inter regular/italic, Noto Sans Hebrew/Arabic)는 같은 origin의 public asset을 동적 등록하며 WASM binary에 font bytes를 내장하지 않는다.
- 동적 registry/FFI는 구현됐지만 end-user font upload UI, project font manifest, 영속 저장, content-hash persistent cache는 아직 구현되지 않았다.
- 한글/이모지 등 Inter 미지원 glyph는 추정 폭 fallback이며 숨기지 않고 `mixed`로 표시한다.
- 기본 script itemization과 Hebrew/Arabic bidi visual-order/caret/selection/shaping은 구현됐지만 Script_Extensions 교집합 기반 정밀 itemization과 Syriac 등 기타 RTL shaping은 아직 완료되지 않았다. 미지원 grapheme은 추정 폭 fallback이며 `fontFallbacks`로 숨김없이 표시한다.
- DOM/CSS canvas text와 Rust geometry는 같은 font asset을 사용하지만 glyph atlas 기반 단일 renderer parity는 Phase 3 게이트다.

### 4.8 Vector Engine

최소 범위:

- pen/path edit
- point move
- bezier handles
- boolean union/intersect/subtract/exclude
- stroke/fill
- path flatten/export

권장:

- geometry crate와 render command crate 분리

### 4.9 Clipboard / Import / Asset Ingestion

필수:

- copy
- cut
- paste
- duplicate
- drag in asset
- image/video asset attach
- file import entrypoint

원칙:

- paste는 raw DOM fragment에 의존하지 않음
- import 결과도 command 기반으로 문서에 반영

### 4.10 Version / Recovery

필수:

- autosave
- local crash recovery hook
- document version snapshot
- recoverable failed save state

## 5. UI Shell 명세

### 5.1 화면 구성

- top bar
- left layers/assets/presets/navigation
- center canvas
- right inspector
- bottom status/devtools/AI console

레이아웃 원칙:

- 전체 구조는 Figma형 작업 리듬을 따른다
- top / left / center / right / bottom의 5축은 고정 의미를 가진다
- 좌우 패널은 문서 구조 탐색과 속성 수정에 집중하고, 캔버스 면적을 침범하지 않는다
- NULL 시그니처 색은 상태 강조에 제한적으로 사용하고, 패널 전체 배경을 브랜드 색으로 덮지 않는다
- decorative card layout보다 dense work surface 구조를 우선한다

### 5.2 Inspector 원칙

- 현재 selection 기준으로만 렌더
- hidden overlay가 클릭 가로채면 안 됨
- 입력 포커스와 selection 연동이 깨지면 안 됨
- token/variable/data/binding/action 탭은 같은 의미 체계 사용

### 5.3 Onboarding 규칙

- onboarding은 별도 모달 시스템 사용
- 편집 흐름을 막는 전체 차단형 오버레이 금지
- 차단형 모달이 필요하면 닫기/skip/never show again 보장

## 6. 협업 명세

### 6.1 Presence

- cursor
- viewport
- selection
- user name/color

### 6.2 Doc operations

- node create/update/delete
- reorder
- text edit
- variable/token edit

### 6.3 충돌 처리 원칙

- presence는 ephemeral
- document ops는 durable
- text와 layout ops 충돌 의미론 분리
- optimistic UI 허용, authoritative resolution은 kernel

### 6.4 Comment / Review / Version Hooks

현재 phase 필수:

- comment anchor hook
- selection-linked review marker hook
- document version checkpoint hook

이 단계에서는 UI 전체 완성보다, 문서 모델과 kernel 경계가 먼저 잠겨야 합니다.

## 7. 퍼포먼스 구조

### 7.1 렌더

권장:

- Canvas/WebGL/WebGPU 중심
- DOM은 chrome/UI와 접근성 보조에 제한

### 7.2 가시성

- virtualized layer tree
- viewport culling
- text measurement cache
- geometry cache
- render command diffing

### 7.3 브리지

- JS <-> WASM 왕복 최소화
- per-frame fine-grained chatty API 금지
- batch command / batch snapshot delta

## 8. AI 친화 조건

에디터는 AI가 다루기 쉬워야 합니다.

필수:

- stable node ids
- structural diff apply
- selection-scoped patch apply
- diagnostics output
- preview mode

## 9. 비목표

초기 v2 에디터에서 당장 안 해도 되는 것:

- 전체 Figma plugin parity
- multiplayer voice/video inside editor
- 3D scene authoring
- advanced illustration suite 수준 vector editing

## 10. 완료 기준

다음을 통과해야 **Editor Acceptance Gate**를 통과한 것으로 봅니다.

- 5k visible node 문서 편집 가능
- component/variant/override 동작
- token/variable 연결 가능
- publish preview와 editor 결과 일치
- inspector 클릭/입력 안정
- 2인 협업에서 문서 파손 없음
- clipboard/import/asset attach 흐름 안정
- autosave/recovery 흐름 확인
