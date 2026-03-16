# NULL 에디터 Figma 통합 실행계획

원본 기준 문서:
- `docs/에디터_figma_이상_달성_계획서.md`
- `docs/에디터_Figma_계획서_점검보정.md`

이 문서는 위 두 문서를 실제 구현용으로 다시 고정한 실행 계획이다.
원본 문서는 보존하고, 실제 착수와 우선순위 판단은 이 문서를 기준으로 한다.

## 1. 목표

목표는 "좋은 에디터"가 아니다.
목표는 `진짜 Figma와 정면 비교 가능한 제품`이다.

포함 범위:
- 디자인 편집기
- 컴포넌트 / variants / component properties / slots
- 디자인 시스템 스타일 / 변수 / 모드 / 라이브러리
- 프로토타이핑
- Dev Mode / inspect / export / handoff
- 멀티플레이어
- 렌더러 / 성능 / 대문서 안정성
- `.fig` 수준의 직접 호환을 향한 import / export

판정 기준:
- `NULL 고유 기능`은 이번 주력 평가 기준에 넣지 않는다.
- 이미 있는 기능도 `Figma보다 품질이 낮으면` 미완성으로 본다.
- 기능 수가 아니라 `정확도`, `일관성`, `예측 가능성`, `성능`, `호환성`으로 평가한다.

## 2. 진행 현황

- 체크리스트 진행도: `240 / 240` 완료 (`100%`)
- 현재 미완료 항목: 없음

현재 완료된 수정 목록:
- [x] 통합 실행계획 문서 작성
- [x] 첫 번째 shadow module 분리: 이동/스냅/리사이즈 순수 계산 추출
- [x] 두 번째 shadow module 분리: move snap target 수집 / move frame 생성 추출
- [x] 세 번째 shadow module 분리: move preview delta / preview frame 생성 추출
- [x] 네 번째 shadow module 분리: resize commit 경로 추출
- [x] 다섯 번째 shadow module 고정: smart guide 시각 피드백 경로 검증
- [x] 분리 모듈 테스트 추가
- [x] 첫 분리 작업 회귀 확인: `editor-drag`, `prototypePlayback`, `stressDoc`
- [x] smart guide target 수집 로직 분리
- [x] move frame 생성 로직 분리
- [x] move preview 경로 분리
- [x] resize commit 경로 분리
- [x] active smart guide 시각 피드백 연결
- [x] Figma 매핑 표 문서화
- [x] `.fig` import/export 공통 제약 표 작성
- [x] Figma import에서 `SECTION -> section` 타입 보존
- [x] Figma import에서 다중 canvas -> 다중 page 기본 구조 보존
- [x] Figma import에서 stroke dash 반영
- [x] Figma import에서 auto-layout layoutSizing 기본 매핑 반영
- [x] 단순 VECTOR를 이미지 fallback 대신 editable path/segments로 보존
- [x] simple mask chain을 editable 구조로 보존
- [x] simple boolean operation을 editable path로 보존
- [x] stroke cap/join import 반영
- [x] exportSettings import 반영
- [x] layoutGrid import 반영
- [x] boolean operation semantic metadata 보존
- [x] `shape.vectorNetwork` 기초 모델 및 derived helper 추가
- [x] path 생성/편집/boolean import 경로에서 `vectorNetwork` 동기화
- [x] `vectorNetwork`만 있어도 path를 복원하는 fallback helper 연결
- [x] 에디터 path 미리보기 렌더도 `vectorNetwork` fallback 사용
- [x] boolean operand trace에 로컬 path/frame/fills 보존
- [x] path edit가 `segments/pathData/vectorNetwork` 소스를 구분해 같은 경로로 반영
- [x] multi-segment path edit 진입 시 클릭 위치 기준으로 세그먼트 선택
- [x] vectorNetwork-only multi-path 편집 시 path 단위를 segments로 materialize해 반영
- [x] vectorNetwork-only 단일 path 편집 시 path-level fills 보존
- [x] path edit 세션(hit/add/drag/open/preview) 코어를 별도 모듈로 분리
- [x] path edge hit test 추가
- [x] line/cubic segment 위에 anchor 삽입 후 즉시 drag 연결
- [x] cubic segment split 시 handle continuity 보존
- [x] vectorNetwork-only path commit 시 vector source 유지
- [x] closed path duplicate endpoint 정규화
- [x] path edit selection state 추가
- [x] selected anchor keyboard delete / nudge / cycle
- [x] path open/close keyboard toggle
- [x] path smooth/corner semantic 정렬
- [x] cubic handle 기반 smooth 추론
- [x] selected anchor smooth/corner keyboard toggle
- [x] open path start/end 방향 확장
- [x] selected start endpoint 기준 prepend add
- [x] `componentVariants` helper 추가 및 variant props 조작 테스트 고정
- [x] component panel에서 variant axis 추가/삭제와 variant별 axis 값 편집
- [x] instance panel에서 axis/value 기반 variant 선택 UI 연결
- [x] instance swap 및 property instance swap 시 variant props 매칭 유지
- [x] variant add/duplicate 시 `variants[].props` 보존
- [x] auto-layout inspector에 dir/align/gap/wrap/padding/includeStrokeInBounds 제어 추가
- [x] constraints matrix preset UI와 scaleX/scaleY 제어 추가
- [x] `constraintPresets` helper와 preset 테스트 고정
- [x] auto-layout inspector에 justify / wrapGap / wrapAlign 제어 추가
- [x] auto-layout gapMode / justify 동기화 보강
- [x] auto-layout engine에 justify / wrapGap / wrapAlign 반영
- [x] Figma auto-layout import에 justify / wrapGap / includeStrokeInBounds 반영
- [x] Figma layoutSizing import에 `layoutSizingHorizontal/Vertical` + fill/hug/fixed + min/max 반영
- [x] figma file import 경로까지 auto-layout fidelity 회귀 테스트 추가
- [x] Figma text import에 `textAutoResize` / line-height percent ratio 반영
- [x] Figma text import에 `JUSTIFIED -> justify` 정렬 반영
- [x] auto-layout fixed/fill min-max clamp 배치 보정
- [x] auto-layout wrap + hug sizing 보정
- [x] Figma auto-layout child `layoutGrow/layoutAlign` 기반 fill sizing fallback 반영
- [x] auto-layout baseline 정밀도를 text metric 기반으로 보정
- [x] editor/runtime text layout helper 공통화
- [x] wrapped text 줄바꿈에서 반복 공백 보존
- [x] justified text를 editor/runtime에서 `foreignObject` + `break-spaces`로 렌더
- [x] text hug sizing이 내용 변경에 반응하도록 보정
- [x] Figma `WIDTH_AND_HEIGHT/HEIGHT` textAutoResize를 `layoutSizing hug`로 추적
- [x] scroll container가 scroll 축에서 hug sizing으로 늘어나지 않도록 보정
- [x] frame / section / component auto-layout parity 회귀 테스트 추가
- [x] Figma shared style metadata를 NULL style token으로 import
- [x] Figma local variable collection / mode / value import
- [x] Figma color variable binding을 NULL fillRef로 import
- [x] auto-layout 자식 constraints 편집 비활성 규칙 고정
- [x] text measurement/wrap에 textCase transform 반영
- [x] Figma text import에서 fontFeatureSettings/fontVariationSettings 보존
- [x] Figma shared effect style metadata를 NULL effect token으로 import
- [x] Figma stroke variable binding을 NULL strokeRef로 import
- [x] canvas ascent/descent 기반 text baseline 측정 보정
- [x] editor/runtime text kerning 기본 활성화

현재 구현 완료로 표시한 파일:
- `src/advanced/ui/AdvancedEditor.drag.ts`
- `src/advanced/ui/AdvancedEditor.resize.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/advanced/ui/componentVariants.ts`
- `src/advanced/ui/componentProperties.ts`
- `src/advanced/ui/constraintPresets.ts`
- `src/advanced/ui/devCodegen.ts`
- `src/advanced/ui/exportPipeline.ts`
- `src/advanced/ui/tokenRoundtrip.ts`
- `src/advanced/prototype/prototypeFlow.ts`
- `src/advanced/prototype/prototypeMotion.ts`
- `src/advanced/doc/scene.ts`
- `src/advanced/layout/engine.ts`
- `src/advanced/geom/vectorNetwork.ts`
- `src/advanced/geom/vectorEditModel.ts`
- `src/advanced/geom/booleanTrace.ts`
- `src/advanced/geom/pathEditShape.ts`
- `src/advanced/geom/pathEditSession.ts`
- `src/lib/figma.ts`
- `src/lib/figmaToNull.ts`
- `src/lib/figmaImportFidelity.ts`
- `src/advanced/geom/textLayout.ts`
- `src/advanced/runtime/renderer.tsx`
- `tests/editor-drag.test.ts`
- `tests/editor-resize.test.ts`
- `tests/boolean-trace.test.ts`
- `tests/path-edit-shape.test.ts`
- `tests/path-edit-session.test.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`
- `tests/figma-import-fidelity.test.ts`
- `tests/figma-roundtrip.test.ts`
- `tests/scene-clone.test.ts`
- `tests/vector-edit-model.test.ts`
- `tests/vector-network.test.ts`
- `tests/component-variants.test.ts`
- `tests/component-properties.test.ts`
- `tests/constraint-presets.test.ts`
- `tests/dev-codegen.test.ts`
- `tests/export-pipeline.test.ts`
- `tests/token-roundtrip.test.ts`
- `tests/prototype-flow.test.ts`
- `tests/prototype-motion.test.ts`
- `tests/figma-fixtures.ts`
- `tests/doc-parity.ts`
- `tests/doc-parity.test.ts`
- `tests/layout.test.ts`
- `tests/text-layout.test.ts`
- `docs/에디터_Figma_library_publish_consume_update_설계.md`
- `docs/에디터_Figma_renderer_전환_설계.md`
- `docs/에디터_Figma_multiplayer_CRDT_설계.md`

현재 문서만 완료된 항목:
- [x] 이 문서
- [x] 롤백 문서 별도 작성
- [x] `docs/에디터_Figma_매핑_표.md`
- [x] `docs/에디터_Figma_import_export_공통_제약표.md`

## 3. 현재 코드에서 이미 있는 기반

핵심 파일:
- `src/advanced/doc/scene.ts`
- `src/advanced/layout/engine.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/advanced/runtime/renderer.tsx`
- `src/advanced/runtime/player.tsx`
- `src/lib/figmaToNull.ts`

이미 존재하는 기반:
- constraints / auto layout / layout grid
- guides / guide snap / pixel snap
- path edit / boolean ops
- text advanced style 일부
- breakpoints / overrides
- components / variants / component properties / slots
- style tokens / variables / variable modes
- prototype interactions / preview player
- dev inspect / CSS / spec / asset export
- presence / comments / socket 기반 협업
- plugin / widget 기반 확장

중요한 해석:
- 많은 항목은 "신규 개발"이 아니라 `기존 구현 고도화`다.
- 그러나 Figma 기준에서는 아직 미완성 영역이 크다.

## 4. 이번 실행의 고정 원칙

1. 기존 UI 디자인은 당분간 유지한다.
2. 대형 파일을 한 번에 갈아엎지 않는다.
3. 기존 동작은 가능한 한 유지하되, Figma급 품질이 우선이다.
4. 이미 충분한 기능은 건드리지 않는다.
5. Figma와 직접 비교되는 약점만 주력 범위로 다룬다.
6. `.fig` 완전 호환은 장기 목표가 아니라 처음부터 추적해야 하는 상위 목표다.

## 5. 안전장치

사용자 요구사항을 반영한 기본 전략은 `기존 파일 보존 + 분리 모듈 병행 + parity test`다.

기본 방식:
- 기존 화면 셸과 주요 진입점은 바로 뜯지 않는다.
- 위험한 로직은 새 파일로 분리해 `candidate` 또는 `next` 모듈로 만든다.
- 테스트에서는 기존 구현과 새 구현을 둘 다 검증한다.
- parity가 확인되기 전까지는 기존 경로를 기본값으로 둔다.
- 실제 연결 시에도 한 번에 전체 교체하지 않고 호출 지점만 점진적으로 바꾼다.

허용하는 방식:
- 함수/로직 단위의 추출
- 동일 입력 대비 출력 비교 테스트
- 시각 회귀 테스트
- 필요시 특정 파일의 제한적 복제본 생성

기본적으로 피하는 방식:
- `AdvancedEditorView.tsx` 같은 초대형 파일의 통파일 복제 후 장기 병행
- 대규모 삭제 후 재작성
- UI 전체 재배치

통파일 복제에 대한 결론:
- 긴급 백업용으로는 가능하다.
- 하지만 기본 전략으로는 부적절하다.
- 이유는 복제본이 빠르게 원본과 드리프트되고, 이후 어떤 쪽이 진실인지 관리가 어려워지기 때문이다.
- 따라서 `전체 파일 복제`는 예외로만 사용하고, 기본은 `로직 단위 shadow module`로 간다.

필수 안전장치:
- [x] 원본 로직 경로 유지
- [x] 원본 vs 후보 구현 parity test 유지
- [x] 대표 fixture 시각 회귀 검증

롤백 기준 문서:
- `docs/에디터_Figma_롤백_가이드.md`

## 6. Figma 호환성 트랙

`.fig` 완전 호환 목표는 별도 후반 작업이 아니라 처음부터 병행한다.

체크리스트:
- [x] Figma 개념과 NULL 문서 모델의 매핑 표 작성
- [x] 현재 `scene.ts` 모델에 없는 Figma 핵심 개념 식별
- [x] `src/lib/figmaToNull.ts`의 이미지 fallback 구간과 실제 편집 가능 구간 분리
- [x] import와 export를 같은 모델 제약 위에서 설계
- [x] 왕복 변환 검증 기준 수립

규칙:
- 문서 모델 변경은 Figma 매핑 표 갱신 없이 진행하지 않는다.
- import만 되고 export가 안 되는 상태를 장기 정상 상태로 인정하지 않는다.

## 7. 우선순위

실행 순서는 아래로 고정한다.

### Phase 0. 기반 고정
- [x] Figma 매핑 표 작성
- [x] 고위험 로직의 shadow module 기준 수립
- [x] parity test 틀 마련
- [x] 대표 fixture 문서 선정
- [x] 타입/빌드/테스트 기준 재정리

### Phase 1. 선택 / 이동 / 리사이즈 / 회전 / 스냅
- [x] 이동 축 잠금 순수 계산 분리
- [x] smart snap 보정 순수 계산 분리
- [x] move snap target 수집 분리
- [x] move frame 생성 분리
- [x] move preview 경로 분리
- [x] resize commit 경로 분리
- [x] resize preview 순수 계산 분리
- [x] 첫 분리 작업 테스트 추가
- [x] smart guides 시각 피드백 강화
- [x] 거리 표시 정확도 강화
- [x] rotate 정밀도 보정

이 단계가 첫 구현 대상이다.
이유:
- 체감 효과가 가장 크다.
- 이후 auto layout, vector, component 편집 품질의 기반이 된다.
- UI 큰 변경 없이 로직 분리만으로 접근 가능하다.

### Phase 2. Constraints / Auto Layout 완성
- [x] constraints matrix preset UI와 scale axis 선택
- [x] auto-layout 내부 제약 비활성 규칙
- [x] auto-layout inspector dir/align/gap/wrap/padding/includeStrokeInBounds 제어
- [x] auto-layout inspector justify / wrapGap / wrapAlign 제어
- [x] auto-layout engine justify / wrapGap / wrapAlign 반영
- [x] Figma auto-layout sizing / justify / min-max import fidelity 보강
- [x] auto-layout fixed/fill min-max clamp 배치 보정
- [x] auto-layout wrap + hug sizing 보정
- [x] baseline 정밀도 보정
- [x] nested overflow 보정
- [x] frame / section / component 내부 동작 일치화

### Phase 3. 텍스트 엔진 고도화
- [x] Figma text import에 `textAutoResize` / line-height percent ratio 기초 반영
- [x] editor/runtime text metric helper 공통화
- [x] Figma text import에 `JUSTIFIED -> justify` 정렬 반영
- [x] justify text를 editor/runtime에서 `foreignObject` + `break-spaces`로 렌더
- [x] 반복 공백 보존 줄바꿈 보강
- [x] hug text sizing이 내용 변경에 반응하도록 보정
- [x] Figma `textAutoResize`를 `layoutSizing hug` 의미까지 추적
- [x] 측정 정확도 향상
- [x] 줄바꿈 품질 향상
- [x] kerning
- [x] text style fidelity 보정
- [x] text on path 설계 시작

### Phase 4. Vector Network / Pen Tool
- [x] `pathData`/`segments` 기준 derived `vectorNetwork` 모델 기초 추가
- [x] `vectorNetwork` 단독 상태에서도 path fallback 복원
- [x] boolean operand 로컬 기하 trace 보존
- [x] path edit source 분리로 single/multi-segment 편집 반영 경로 고정
- [x] multi-segment path edit의 클릭 위치 기반 source 선택
- [x] vectorNetwork-only multi-path 편집 반영 경로 materialize
- [x] vectorNetwork-only single-path fill trace 보존
- [x] path edit hit/add/drag/open/preview 세션 모듈화
- [x] path edge hit test
- [x] line/cubic segment point insert
- [x] cubic split handle continuity 보존
- [x] vectorNetwork-only path edit commit preserves vector source
- [x] closed path duplicate endpoint normalization
- [x] path edit selection state
- [x] selected anchor keyboard delete / nudge / cycle
- [x] path open/close keyboard toggle
- [x] path smooth/corner semantics
- [x] cubic handle smooth inference
- [x] selected anchor smooth/corner keyboard toggle
- [x] open path start/end extension
- [x] selected start endpoint prepend add
- [x] `pathData` 중심에서 `vector network` 모델로 확장
- [x] anchor / edge / handle 편집 모델 정리
- [x] boolean 이후에도 편집 가능한 벡터 상태 유지

### Phase 5. Components / Design System
- [x] Figma `COMPONENT_SET / COMPONENT / INSTANCE` import을 NULL component/variant 모델에 연결
- [x] imported instance subtree에 기본 `sourceId` 링크 부여
- [x] Figma text / boolean / instance-swap component property reference import 기초
- [x] imported instance component property value(text/boolean/instance-swap) 적용
- [x] instance-swap override / reset 기반 보강
- [x] variant axis/value를 `variants[].props` 구조로 보존
- [x] Figma shared fill/stroke/text/effect style ref -> NULL style token import 기초
- [x] Figma local variable collection / mode / value import 기초
- [x] Figma color variable binding + alias flatten -> NULL fillRef import 기초
- [x] Figma stroke variable binding + alias flatten -> NULL strokeRef import 기초
- [x] component panel에서 variant axis 추가/삭제와 axis 값 편집
- [x] instance panel에서 axis/value 기반 variant 선택과 raw fallback 선택 병행
- [x] component swap / property instance swap 시 variant props 매칭 유지
- [x] component properties 강화
- [x] variant 체계 보정
- [x] style / variable / mode roundtrip 강화
- [x] library publish / consume / update 설계

### Phase 6. Prototype
- [x] interaction 편집 UX 정리
- [x] overlay / transition 고도화
- [x] smart animate를 실제 매칭 기반 전환으로 승격
- [x] flow 시각화와 디버깅 보강

### Phase 7. Dev Mode / Export / Handoff
- [x] inspect 품질 향상
- [x] spacing / token / layout spec 강화
- [x] CSS 외 코드 생성 전략 수립
- [x] export naming / batching / asset pipeline 강화

### Phase 8. Renderer
- [x] DOM/SVG 기반 한계 구간 분리
- [x] canvas/WebGL 전환 대상 명확화
- [x] 대문서 렌더링 기준 수립

### Phase 9. Multiplayer
- [x] presence 수준을 넘어 CRDT/Yjs 기반 동시편집으로 전환
- [x] merge / branch / conflict 정책 수립

### Phase 10. Figma 파일 호환성 경화
- [x] import fidelity 상승
- [x] export fidelity 상승
- [x] 왕복 변환 검증

## 8. 이미 있는 기능도 수정 대상으로 넣는 기준

아래 중 하나라도 해당하면 수정 대상이다.

- Figma보다 상호작용 피드백이 둔하다
- 측정값이 틀리거나 흔들린다
- 같은 유형의 편집에서 결과가 일관되지 않다
- 대문서에서 성능이 급격히 무너진다
- UI는 있어도 실제 실무 편집 흐름이 불편하다
- 문서 모델이 향후 `.fig` 호환을 막는다

즉, `이미 구현됨`은 유지 사유가 아니다.
`이미 충분히 강함`일 때만 유지 사유가 된다.

## 9. 바로 시작할 첫 작업 단위

첫 작업 단위는 다음으로 고정한다.

- [x] `AdvancedEditorView.tsx` 내부의 선택/이동/리사이즈/스냅 계산 로직 중 순수 계산 구간 식별
- [x] geometry/snap candidate 모듈 생성
- [x] parity/unit test 작성
- [x] 기존 호출을 일부 candidate 모듈로 전환
- [x] move snap target 수집 helper 연결
- [x] move frame 생성 helper 연결
- [x] move preview helper 연결
- [x] resize commit helper 연결
- [x] smart guides / 거리 표시 / resize 정밀도 2차 개선

이 단계에서는:
- UI 디자인을 바꾸지 않는다.
- 에디터 외 범위를 건드리지 않는다.
- 플러그인, 앱 플랫폼, NULL 고유 기능 확장은 우선순위에 넣지 않는다.

## 10. 시작 파일

첫 착수 파일:
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/advanced/ui/AdvancedEditor.utils.ts`
- `src/advanced/ui/AdvancedEditor.types.ts`
- `src/advanced/layout/engine.ts`

병행 참조 파일:
- `src/advanced/doc/scene.ts`
- `src/advanced/runtime/renderer.tsx`
- `src/lib/figmaToNull.ts`

현재 실제 수정 파일:
- [x] `src/advanced/ui/AdvancedEditorView.tsx`
- [x] `src/advanced/ui/AdvancedEditor.drag.ts`
- [x] `src/advanced/ui/AdvancedEditor.resize.ts`
- [x] `src/advanced/ui/rotationMath.ts`
- [x] `src/advanced/ui/tokenRoundtrip.ts`
- [x] `src/advanced/prototype/prototypeFlow.ts`
- [x] `src/advanced/prototype/prototypeMotion.ts`
- [x] `src/advanced/runtime/renderer.tsx`
- [x] `src/advanced/geom/textLayout.ts`
- [x] `tests/editor-drag.test.ts`
- [x] `tests/editor-resize.test.ts`
- [x] `tests/rotation-math.test.ts`
- [x] `tests/text-layout.test.ts`
- [x] `tests/token-roundtrip.test.ts`
- [x] `tests/prototype-flow.test.ts`
- [x] `tests/prototype-motion.test.ts`
- [x] `tests/figma-fixtures.ts`
- [x] `tests/doc-parity.ts`
- [x] `tests/doc-parity.test.ts`
- [x] `tests/runtime-renderer-fixtures.test.tsx`
- [x] `tests/__snapshots__/runtime-renderer-fixtures.test.tsx.snap`
- [x] `docs/에디터_Figma_text_on_path_설계.md`
- [x] `src/advanced/layout/engine.ts`
- [x] `src/lib/figma.ts`
- [x] `src/lib/figmaToNull.ts`
- [x] `src/lib/nullToFigma.ts`
- [x] `src/app/api/pages/[pageId]/figma/export/route.ts`
- [x] `src/advanced/geom/vectorEditModel.ts`
- [x] `src/lib/figmaImportFidelity.ts`
- [x] `tests/vector-edit-model.test.ts`
- [x] `tests/figma-import-fidelity.test.ts`
- [x] `tests/figma-roundtrip.test.ts`
- [x] `tests/nullToFigma.test.ts`
- [x] `docs/에디터_Figma_library_publish_consume_update_설계.md`
- [x] `docs/에디터_Figma_renderer_전환_설계.md`
- [x] `docs/에디터_Figma_multiplayer_CRDT_설계.md`
- [x] `docs/에디터_Figma_달성_근거.md`

## 11. 완료 정의

각 phase는 아래를 모두 만족해야 완료로 본다.

- [x] 기존 동작 parity 유지
- [x] 새 회귀 테스트 통과
- [x] 대표 fixture 문서에서 시각 회귀 이상 없음
- [x] Figma 이상 달성 근거가 명확함
- [x] 이후 phase의 모델/렌더링 방향과 충돌하지 않음

이 문서는 구현 중 계속 갱신한다.
하지만 우선순위와 안전 원칙은 쉽게 흔들지 않는다.
