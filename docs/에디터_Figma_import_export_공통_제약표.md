# NULL 에디터 Figma import/export 공통 제약 표

기준 문서:
- `docs/에디터_Figma_매핑_표.md`
- `src/advanced/doc/scene.ts`
- `src/lib/figmaToNull.ts`

목적:
- import와 export를 같은 규칙 위에서 설계한다.
- 한쪽만 되는 임시 호환을 장기 정상 상태로 인정하지 않는다.
- `Figma 이상` 목표에서 허용되는 손실과 허용되지 않는 손실을 명시한다.

## 1. 원칙

1. import에서 읽은 개념은 export에서도 다시 쓸 수 있어야 한다.
2. 편집 가능한 구조를 이미지 fallback보다 우선한다.
3. 이미지 fallback은 임시 우회일 뿐, 최종 호환 판정에서는 감점 대상이다.
4. `직접 대응`으로 승격하려면 모델, import, export, 편집 동작, 테스트가 모두 있어야 한다.
5. export 결과가 Figma에서 다시 열렸을 때 핵심 구조가 보존되어야 한다.

## 2. 판정 등급

| 등급 | 의미 | 허용 여부 |
| --- | --- | --- |
| Lossless | import 후 편집하고 export해도 구조 의미가 유지됨 | 목표 상태 |
| Structured Lossy | 구조는 유지되지만 일부 세부 의미가 약해짐 | 과도기만 허용 |
| Raster Fallback | 이미지로 우회되어 편집 의미가 사라짐 | 단기 예외만 허용 |
| Unsupported | 읽지도 쓰지도 못함 | 목표 범위에서는 불가 |

## 3. 공통 제약 표

| 영역 | 공통 제약 | import 기준 | export 기준 | 현재 상태 |
| --- | --- | --- | --- | --- |
| Node identity | 노드 ID는 안정적으로 왕복 가능해야 함 | `figma_<id>` 형태 안정 매핑 필요 | 원래 Figma ID 또는 trace metadata 복원 필요 | 부분 대응 |
| Page / canvas | Figma page와 NULL page 대응 규칙 고정 | 다중 page import 기본 지원 | page 단위 export 필요 | 부분 대응 |
| Section | `section` 의미를 frame으로 잃지 말아야 함 | `SECTION -> section` 보존 | export도 section으로 내보내기 | 부분 대응 |
| Vector | 벡터는 가능한 한 path/segment/network로 구조 보존 | simple vector는 editable path/segment + derived network import, vectorNetwork-only fallback path 복원 가능 | editable vector로 내보내기 | 부분 대응 |
| Boolean ops | union/subtract/intersect/exclude 의미 보존 | simple result path + op trace + operand local path/frame/fills + derived network import | 같은 연산으로 재구성 | 부분 대응 |
| Mask | mask chain 유지 | simple mask chain import | 동일 마스킹 구조 export | 부분 대응 |
| Auto layout | row/column/wrap/padding/gap/align/justify/wrapGap/includeStrokeInBounds 일치 | Figma align/spacing/stroke-in-layout까지 수집 | 같은 의미로 재내보내기 | 부분 대응 |
| Layout sizing | fixed/fill/hug/min/max 보존 | `layoutSizingHorizontal/Vertical`와 parent auto-layout `layoutGrow/layoutAlign`, min/max import | 같은 제약으로 export | 부분 대응 |
| Layout grid | columns/rows/grid 오버레이 보존 | 기본 grid import 지원 | grid export 필요 | 부분 대응 |
| Constraints | pin/center/scale 의미 일치 | 현재 매핑 유지 | 같은 semantic export | 직접 대응 후보 |
| Fill / stroke | 색, gradient, stroke align, dash, cap, join 보존 | 선형 외 gradient 구조 수집 | gradient 유형 유지 export | 부분 대응 |
| Effects | inner/background blur 의미 분리 보존 | effect semantic 유지 | 같은 effect type export | 부분 대응 |
| Text block | 폰트/정렬/줄간격/장식 보존 | 현재 수준 유지 | 동일 속성 export | 직접 대응 후보 |
| Rich text | range style/span 보존 | span 모델 필요 | span export 필요 | 미대응 |
| Text auto size | box/hug 동작 보존 | `textAutoResize`를 `autoSize/wrap/layoutSizing(hug)`로 추적하고 내용 변경 시 hug sizing 반영 | sizing export | 부분 대응 |
| Components | component root와 instance 참조 보존 | component/instance 관계 수집 | 재내보내기 가능해야 함 | 부분 대응 |
| Component set / variants | variant 축/속성 보존 | set 구조 import + axis/value 편집 + instance axis 선택 | set 구조 export | 부분 대응 |
| Component properties | text/boolean/instance swap 속성 보존 | property 정의/값 수집 + nested instance swap props 매칭 | 동일 property export | 부분 대응 |
| Styles | shared style ID와 참조 보존 | shared fill/stroke/text/effect style ID를 token + node ref로 import | token JSON roundtrip에서는 semantic key 기반 style ref rebinding을 지원하고, `nullToFigma`는 Figma style metadata와 node style refs를 다시 export한다 | 부분 대응 |
| Variables | variable / mode / alias 보존 | local variable collection/mode/value import + color fill/stroke binding + alias flatten | token JSON roundtrip에서는 mode/ref rebinding을 지원하고, `nullToFigma`는 local variable collection/mode/value와 fill/stroke boundVariables를 다시 export한다 | 부분 대응 |
| Prototype | trigger/action/transition 보존 | interaction import | editor/runtime에서는 diagnostics, overlay presentation, transition editing 지원, export는 계속 보강 | 부분 대응 |
| Smart animate | 레이어 매칭 기준 유지 | matching metadata 필요 | editor/runtime에서는 sourceId/name 매칭 기반 transition 지원, export는 계속 보강 | 부분 대응 |
| Export settings | asset export 규칙 보존 | 기본 export 설정 import | scale/format naming, deterministic batch manifest export | 부분 대응 |

## 4. 금지 상태

아래는 최종 목표에서 허용하지 않는다.

- import는 되지만 export가 구조를 잃는 상태
- export는 되지만 다시 import하면 다른 문서가 되는 상태
- component/variant/variable이 이미지 fallback으로 사라지는 상태
- boolean/mask/vector가 편집 불가능한 bitmap으로만 남는 상태
- prototype을 "링크만 남는 수준"으로 축소하는 상태

## 5. 과도기 허용 규칙

아래는 단기적으로만 허용한다.

- 복잡 벡터 image fallback
- 비선형 gradient raster fallback
- section의 frame 다운캐스트
- component set의 flat component 변환

단, 이 경우에도 반드시 아래를 남긴다.

- 문서화
- 테스트
- 승격 조건

## 6. 우선 승격 대상

현재 상태 기준으로 먼저 `Lossless`에 가깝게 올려야 할 항목:

1. Section / page / hierarchy
2. Vector / boolean / mask
3. Auto layout / layout sizing / layout grid
4. Components / variants / properties
5. Styles / variables / modes
6. Prototype / smart animate

## 7. 작업 규칙

- 새 Figma 호환 작업은 이 표의 행을 하나 이상 개선해야 한다.
- `Raster Fallback`을 추가할 때는 제거 계획이 같이 있어야 한다.
- `부분 대응` 항목을 손대면 `docs/에디터_Figma_매핑_표.md`도 같이 갱신한다.
