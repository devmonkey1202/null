# NULL 에디터 Figma 매핑 표

기준 파일:
- `src/advanced/doc/scene.ts`
- `src/lib/figmaToNull.ts`

이 문서는 현재 코드 기준으로 `Figma 개념 -> NULL 문서 모델 / 임포트 경로`를 정리한 표다.
목적은 두 가지다.

- 현재 이미 대응된 것과 아직 비는 것을 분리한다.
- 이후 모델 변경 시 "Figma 이상" 목표에 필요한 누락분을 추적한다.

상태 기준:
- `직접 대응`: 현재 모델과 임포트 경로가 둘 다 존재
- `부분 대응`: 모델 또는 임포트 경로 한쪽만 있거나, 의미 손실이 있음
- `미대응`: 핵심 개념이 현재 모델이나 임포트 경로에 없음

## 1. 노드 / 계층

| Figma 개념 | NULL 현재 대응 | 상태 | 근거 / 비고 |
| --- | --- | --- | --- |
| Figma Page / Canvas | `Doc.pages` + page root frame | 부분 대응 | 다중 canvas를 다중 page로 가져오지만, canvas 전용 메타는 아직 제한적 |
| Frame | `NodeType: "frame"` | 직접 대응 | `FRAME`은 현재 frame으로 구조화되어 들어감 |
| Section | `NodeType: "section"` | 직접 대응 | 임포트에서 `SECTION -> section`으로 보존됨 |
| Group | `NodeType: "group"` | 직접 대응 | 그룹 계층 유지 |
| Rectangle | `NodeType: "rect"` | 직접 대응 | radius 포함 |
| Ellipse | `NodeType: "ellipse"` | 직접 대응 | 일반 ellipse는 대응, arc는 부분 대응 |
| Line | `NodeType: "line"` | 직접 대응 | 기본 shape 대응 |
| Arrow | `NodeType: "arrow"` 모델만 있음 | 미대응 | Figma 임포트 경로에 별도 매핑 없음 |
| Polygon | `NodeType: "polygon"` | 직접 대응 | `pointCount` 일부 반영 |
| Star | `NodeType: "star"` | 직접 대응 | `pointCount` 일부 반영 |
| Vector | `NodeType: "path"` + `shape.pathData/segments/vectorNetwork` | 부분 대응 | 단순 vector geometry는 editable path/segments와 derived vector network로 유지하고, vectorNetwork-only fallback path 복원도 가능하지만 복잡 벡터는 여전히 fallback |
| Boolean Operation | `path` + `shape.booleanMeta/vectorNetwork` 또는 fallback | 부분 대응 | simple boolean result와 op/operand trace, operand별 local path/frame/fills, derived vector network는 보존하지만 완전한 재편집 semantic은 아직 없음 |
| Slice | `NodeType: "slice"` | 직접 대응 | 기본 노드만 유지 |
| Component | `NodeType: "component"` | 부분 대응 | standalone component는 component root + default variant root로 보존되지만 property/override 깊이는 아직 부족 |
| Instance | `NodeType: "instance"` | 부분 대응 | `componentId`, `instanceOf`, `variantId`, 기본 `sourceId` linking, component property value import까지 연결되지만 deep roundtrip은 아직 부족 |
| Component Set | `component` + `variants[].props` | 부분 대응 | set 구조를 component container + variant roots + axis/value props로 재구성하지만 export/roundtrip은 아직 미완 |
| Mask | `isMask` + child order 보정 | 부분 대응 | simple mask chain은 구조 보존, 복합 마스크는 여전히 fallback |

## 2. 위치 / 크기 / 레이아웃

| Figma 개념 | NULL 현재 대응 | 상태 | 근거 / 비고 |
| --- | --- | --- | --- |
| Absolute frame | `Node.frame` | 직접 대응 | `absoluteBoundingBox` 기반 |
| Rotation | `frame.rotation` | 직접 대응 | 기본 회전값 보존, geometry inspector에서 0.1도 input + normalize 규칙 반영 |
| Constraints | `Node.constraints` | 직접 대응 | LEFT/RIGHT/CENTER/SCALE 매핑과 editor matrix preset UI까지 연결 |
| Auto Layout row/column | `layout.mode = "auto"` | 직접 대응 | dir, gap, padding, align, justify, wrap, wrapGap, includeStrokeInBounds 반영 |
| Auto Layout gap mode | `gapMode` + `justify` | 직접 대응 | inspector/engine/Figma import에서 `SPACE_BETWEEN`을 같은 의미로 처리 |
| Auto Layout baseline | `align: "baseline"` | 부분 대응 | text metric 기반 baseline 정렬까지 보강했지만 mixed content 정밀도는 계속 보강 필요 |
| Layout sizing fixed/fill/hug | `layoutSizing` | 직접 대응 | `layoutSizingHorizontal/Vertical`와 parent auto-layout의 `layoutGrow/layoutAlign` fallback까지 import |
| Min/Max size | `layoutSizing.min/max` | 직접 대응 | Figma min/max size를 import 경로에서 채움 |
| Layout Grid | `layoutGrid` | 부분 대응 | 기본 columns/rows/grid overlay는 import되지만 grid layout semantics는 별개 |
| Grid layout mode | 없음 | 미대응 | Figma 이상 목표를 위해 별도 모델 추가 필요 |
| Clip content | `clipContent` | 직접 대응 | `clipsContent` 매핑 |
| Overflow scrolling | `overflowScrolling` | 직접 대응 | vertical/horizontal/both 변환, scroll 축에서는 viewport가 hug sizing으로 내용 크기까지 늘어나지 않도록 보정 |
| Sticky | `sticky` 모델 있음 | 미대응 | 임포트 경로 없음 |

## 3. 스타일 / 효과 / 텍스트

| Figma 개념 | NULL 현재 대응 | 상태 | 근거 / 비고 |
| --- | --- | --- | --- |
| Solid fill | `style.fills` | 직접 대응 | 색/opacity 반영 |
| Linear gradient | `style.fills: linear` | 직접 대응 | handle position 기반 angle 계산 |
| Radial / Angular / Diamond gradient | image fallback | 부분 대응 | 현재 복잡 gradient는 rasterize 경로로 회피 |
| Image fill | `image` 노드 또는 image fallback | 부분 대응 | fill semantic 보존보다 이미지 렌더 우선 |
| Stroke color/weight/align | `style.strokes` | 직접 대응 | inside/center/outside 반영 |
| Stroke dash | `style.strokes[].dash` | 직접 대응 | Figma `strokeDashes`를 그대로 가져옴 |
| Stroke cap / join | `style.strokeCap`, `style.strokeJoin` | 직접 대응 | 기본 round/square/bevel/round 매핑 반영 |
| Advanced stroke (pattern / full fidelity) | 모델 일부만 있음 | 부분 대응 | dash/cap/join은 반영되지만 pattern과 세부 stroke fidelity는 아직 부족 |
| Blend modes | `normal/multiply/screen/overlay/darken/lighten` | 부분 대응 | Figma 전체 blend mode 집합보다 적음 |
| Drop shadow | `effects: shadow` | 직접 대응 | offset/radius/color 매핑 |
| Inner shadow | `effects: shadow` | 부분 대응 | inner/outer 구분이 사라짐 |
| Layer blur | `effects: blur` | 직접 대응 | blur 반영 |
| Background blur | `effects: blur` | 부분 대응 | background blur semantic 분리 없음 |
| Corner radius | `style.radius` | 직접 대응 | 단일 / 각 코너별 반영 |
| Text family/size/weight/line-height | `Node.text.style` | 직접 대응 | editor/runtime가 공통 text metric helper를 사용해 baseline/height 계산을 맞춤 |
| Text align / justify | `Node.text.style.align` | 부분 대응 | left/center/right/justify import와 editor/runtime render 반영, repeated spaces + punctuation-aware wrap + CJK closing punctuation guard까지 보강 |
| Text case / underline / strike | `Node.text.style` | 직접 대응 | 기본 장식 반영 |
| Text range styles | 없음 | 미대응 | rich text span 모델 부재 |
| OpenType / variable font axes | `fontFeatureSettings`, `fontVariationSettings` 모델 있음 | 부분 대응 | Figma text style에 값이 있으면 import 경로에서 보존하고 editor/runtime/dev CSS에도 반영, richer typography export/roundtrip은 계속 보강 필요 |
| Text auto resize | `autoSize` + `wrap` + `layoutSizing` | 부분 대응 | `WIDTH_AND_HEIGHT/HEIGHT/TRUNCATE`를 text box 동작 + `layoutSizing hug`로 추적하고 내용 변경 시 hug sizing까지 반영하지만 truncate semantic은 아직 손실 |
| Text on path | 없음 | 미대응 | 별도 모델 필요, `docs/에디터_Figma_text_on_path_설계.md`로 설계 시작 |

## 4. 컴포넌트 / 디자인 시스템

| Figma 개념 | NULL 현재 대응 | 상태 | 근거 / 비고 |
| --- | --- | --- | --- |
| Component root | `type: "component"` | 직접 대응 | 기본 노드 존재 |
| Instance reference | `instanceOf`, `componentId`, `variantId`, `sourceId` | 부분 대응 | 기본 ref + selected variant + 기본 source linking은 보존, 깊은 override/property linking은 미완 |
| Variants | `variants`, `variantId`, `variants[].props` | 부분 대응 | component set import, component panel axis/value 편집, instance panel axis 선택, swap 시 props 매칭, matrix 누락/중복 진단과 missing variant auto-fill까지는 됐지만 export와 roundtrip은 아직 미완 |
| Component properties | `propertyDefinitions` + imported `sourceId` links + instance value apply | 부분 대응 | text/boolean/instance-swap reference와 imported value 적용, nested instance swap 시 variant props 매칭, property name 정규화/kind guard까지는 됐지만 property export/roundtrip은 미완 |
| Component properties | `propertyDefinitions` | 부분 대응 | 모델은 있으나 Figma import/export 연동 부족 |
| Slots | `slotId`, `overrides.slotContents` | 부분 대응 | NULL 쪽 모델은 있으나 Figma 대응 개념과 직접 매핑 정리 필요 |
| Styles library | `styles`, `fillStyleId`, `strokeStyleId`, `effectStyleId`, `styleRef` | 부분 대응 | shared fill/stroke/text/effect style ID를 token + node ref로 import하고 token JSON roundtrip에서는 semantic key 기반 ref rebinding까지 지원한다. 여기에 `nullToFigma`가 style metadata와 node style refs를 다시 Figma REST shape로 export하도록 연결됐고, team library publish/update는 계속 보강 대상이다 |
| Variables | `variables`, `variableModes`, `variableMode`, `fillRef`, `strokeRef` | 부분 대응 | local variable collection/mode/value import와 color fill/stroke binding, alias flatten import에 더해 token JSON roundtrip에서 mode/ref rebinding을 지원한다. 여기에 `nullToFigma`가 local variable collection/mode/value와 fill/stroke boundVariables export를 추가했고, wider property binding은 계속 보강 대상이다 |
| Team library | `libraries`, `instanceLibraryId` | 부분 대응 | 모델은 있음, 실제 Figma 라이브러리 동기화는 미완성 |
| Component versions | `componentVersions` | NULL 고유 | Figma 직접 대응보다 NULL 내부 버전 개념에 가까움 |

## 5. 프로토타입 / Dev Mode / Export

| Figma 개념 | NULL 현재 대응 | 상태 | 근거 / 비고 |
| --- | --- | --- | --- |
| Prototype start page | `doc.prototype.startPageId` | 직접 대응 | 임포트 시 기본 page에 설정 |
| Prototype interactions | `Node.prototype.interactions` | 부분 대응 | Figma 임포트는 아직 읽지 않지만 editor/runtime에서는 interaction summary, diagnostics, overlay presentation, smart matching transition까지 지원 |
| Overlay / back / navigate / set variable | 모델 있음 | 부분 대응 | NULL 런타임은 지원, Figma import/export 경로는 미완성 |
| Smart Animate | `transition.type = "smart"` | 부분 대응 | 모델/런타임 이름은 있으나 Figma급 레이어 매칭 아님 |
| Inspect / spec / export settings | `exportSettings`, Dev UI 일부 | 부분 대응 | quick spec, token/layout spacing spec, React style/JSX/Tailwind codegen까지는 붙었지만 full handoff 기준으로는 계속 보강 필요 |
| Asset export | `exportSettings` | 부분 대응 | 기본 export 설정 import, deterministic naming, batch manifest까지는 됐지만 full Figma parity는 아직 부족 |

## 6. 현재 Figma import의 실제 성격

현재 `src/lib/figmaToNull.ts`는 "완전한 Figma 문서 호환기"가 아니다.
실제 성격은 아래에 가깝다.

- 단순 노드와 기본 스타일은 구조화해서 가져온다.
- 다중 canvas는 기본적으로 다중 page 구조로 보존한다.
- section과 stroke dash는 구조화해서 가져온다.
- 단순 vector geometry는 editable path/segments와 derived vector network로 유지한다.
- simple boolean result는 editable path와 derived vector network로 유지한다.
- simple mask chain은 editable node 구조로 유지한다.
- 복잡 벡터/마스크/비선형 gradient/일부 instance 계열은 이미지 fallback으로 우회한다.
- variables, styles, prototype, library 정보는 대부분 가져오지 않는다.
- component set / variants / imported instance property 값은 구조화해서 가져오지만 export/roundtrip은 아직 미완이다.
- 즉 현재는 `편집 가능한 구조 import + 복잡 요소 raster fallback` 혼합 상태다.

이 상태는 초기 호환 레이어로는 유효하지만, `Figma 이상` 목표의 최종 상태로는 인정하지 않는다.

## 7. Figma 이상 목표를 위한 우선 모델 갭

현재 코드 기준으로 우선순위가 높은 갭은 아래다.

1. 벡터
- vector network
- boolean operation semantic 유지
- mask chain 보존

2. 레이아웃
- grid layout mode
- layout sizing / hug / fill / min-max의 실제 import/export 정합
- layout grid의 실제 임포트

3. 텍스트
- rich text range
- auto size / text box behavior
- text-on-path

4. 컴포넌트 / 시스템
- component properties / instance overrides / roundtrip 정교화
- styles / variables / modes / team library 실제 동기화

5. 프로토타입
- interaction import/export
- smart animate 실동작 고도화

6. 호환성
- import와 export를 같은 제약 표 위에서 설계
- 이미지 fallback을 "임시 호환 경로"로만 두고 편집 가능한 구조 import 비율을 높임

## 8. 작업 규칙

- `scene.ts` 모델 변경 전에는 이 문서를 먼저 갱신한다.
- `figmaToNull.ts`에서 새로운 Figma 개념을 가져오면 이 문서의 상태를 같이 바꾼다.
- `부분 대응` 항목을 `직접 대응`으로 바꾸려면 모델, 임포트, 편집기 동작, 검증이 모두 있어야 한다.
