# NULL 에디터 — Figma 전 영역 초과 달성 계획서

> Codex 작업 시 참조용. `docs/에디터_Figma_계획서_점검보정.md`와 함께 읽을 것.

## 완벽의 기준 (기능 + 품질)

**둘 중 하나가 아니라 둘 다 필요한다.**

- **기능**: Figma에 있는 모든 기능을 NULL에도 구현
- **품질**: 해당 기능이 Figma 수준으로 안정적·자연스럽게 동작

각 Phase 완료 시 **품질 검증** 필수: 단위/통합 테스트, 벤치마크, 사용자 피드백 반영.

---

## 이미 구현된 기능 (교차 검증 완료)


| 영역                                                        | 구현됨                                                                                                 | 위치                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Constraints                                               | left, right, top, bottom, left+right, top+bottom, hCenter, vCenter, scaleX, scaleY                  | engine.ts applyConstraintsOnResize                        |
| Auto Layout                                               | row/column, gap, padding, align(baseline 포함), hug/fill/fixed, min/max, gapMode(space-between), wrap | scene.ts, engine.ts                                       |
| LayoutGrid                                                | columns, rows, grid (프레임별)                                                                          | scene.ts LayoutGridItem, AdvancedEditorView layoutGrid UI |
| doc.view.guides                                           | x[], y[] 가이드, 추가/삭제/clear                                                                           | AdvancedEditorView (addGuide, clearGuides, guides 렌더)     |
| gridSnap, guideSnap, pixelSnap                            | ✅                                                                                                   | AdvancedEditorView                                        |
| Path 편집                                                   | pathEdit, anchorIndex, 핸들 드래그                                                                       | AdvancedEditor.types.ts, AdvancedEditorView pathEdit 로직   |
| PathSegment, pathData                                     | ✅                                                                                                   | scene.ts PathSegment, pathData                            |
| letterSpacing, fontFeatureSettings, fontVariationSettings | ✅                                                                                                   | scene.ts TextStyle, AdvancedEditorView 텍스트 패널             |
| PageBreakpoint, breakpointOverrides                       | ✅                                                                                                   | scene.ts, AdvancedEditorView breakpoint UI                |
| Presence, 코멘트                                             | editor:presence, collabPeers, comments API                                                          | socket.ts, AdvancedEditorView                             |
| 플러그인 API, 스토어                                             | PluginManifest, /api/app/[pageId]/plugins                                                           | AdvancedEditorView, src/lib/app-plugins.ts                |
| LOD, performanceMode                                      | useLod, performanceMode                                                                             | AdvancedEditorCanvasNode, AdvancedEditorView              |
| align, distribute                                         | ✅                                                                                                   | AdvancedEditorView                                        |
| Boolean 연산                                                | union, subtract, intersect, exclude                                                                 | geom/boolean.ts                                           |


---

## 현재 상태 vs Figma 갭 요약


| 영역          | NULL 현재                                   | Figma 수준                      | 목표                    |
| ----------- | ----------------------------------------- | ----------------------------- | --------------------- |
| 벡터 편집       | pathData + PathSegment, 앵커 드래그            | Vector Network, Delete & Heal | 벡터 네트워크 + 펜 도구        |
| 렌더링         | SVG (DOM)                                 | WebGL/WASM C++                | Canvas/WebGL/WebGPU   |
| Auto Layout | row/column, hug/fill/fixed, baseline 등 있음 | Flexbox + Grid flow           | layoutMode: "grid" 추가 |
| Constraints | 로직 전부 있음                                  | UI 4×4 매트릭스                   | Constraints 패널 UI     |
| 스마트 가이드     | gridSnap, guideSnap 있음                    | 동적 정렬선 시각 표시                  | 실시간 정렬선/거리 표시         |
| 효과          | shadow, blur, noise                       | 8 drop + 8 inner, glass       | 동등 이상                 |
| 성능          | LOD, React.memo                           | 타일 WebGL                      | 가상화 + GPU 렌더링         |


---

## Phase 0: 기반 작업 (1–2개월)

### 0.1 코드베이스 구조화

- 에디터 코어/플러그인 모듈 분리 (`src/advanced/editor/` 새 구조)
- 단위/통합 테스트 인프라 (벡터 연산, 레이아웃, 제약)
- 성능 프로파일링 도구 (프레임 시간, 메모리) 상시 구동

### 0.2 데이터 모델 확장

- `Node` 스키마에 `vectorNetwork` 필드 추가 (VectorNetwork 타입)
- `AutoLayout`에 `layoutMode: "grid"` 지원 (현재 dir: row|column만 있음)
- `Effect` 타입에 `glass`, `backgroundBlur` 추가

---

## Phase 1: Constraints & Auto Layout 완성 (2–3개월)

### 1.1 Constraints Figma 완전 호환

- **파일:** `src/advanced/layout/engine.ts`
- **현재 상태:** 수평(left, right, left+right, hCenter, scaleX), 수직(top, bottom, top+bottom, vCenter, scaleY) 로직 전부 구현됨 (left+right, top+bottom 포함)
- **필요 작업:**
  - 2축 독립 조합 UI (Figma Constraints 패널 4×4 매트릭스)
  - Auto Layout 프레임 내에서는 constraints 비활성화 (Figma 규칙)

### 1.2 Auto Layout 고도화

- **이미 있음:** hug/fill/fixed, min/max, align(baseline row 지원), gapMode(fixed, space-between), wrap
- **필요 작업:**
  - `align: baseline` column 방향 검증 (현재 row만)
  - `wrap: true` 시 wrap 순서/방향 명세화
  - `layoutMode: "grid"` — 열/행 개수, gutters (Figma 2024 Grid flow, 현재 dir는 row|column만)
  - 중첩 Auto Layout 시 재귀 계산 보정 (overflow 처리)

### 1.3 Layout Grid & Guides

- **이미 있음:** LayoutGridItem(columns/rows/grid), doc.view.guides(x[],y[]), gridSnap/guideSnap/pixelSnap, 가이드 추가/삭제/clear
- **필요 작업:**
  - 프레임 단위 가이드 (프레임 로컬 좌표, doc.view.guides와 분리)
  - 가이드 더블클릭 → 수치 입력 UI

---

## Phase 2: 스마트 가이드 & 스냅 (1.5–2개월)

### 2.1 동적 정렬 가이드
- 이동/리사이즈 시 다른 노드와 정렬선 표시 (좌/우/상/하/중앙)
- 스냅 임계값 조정, 레드라인 스타일
### 2.2 거리 표시
- Option/Alt 드래그 시 선택 ↔ 가장자리/가이드 거리 표시
### 2.3 스냅 정교화
- 픽셀/가이드/객체 경계 스냅, 회전 15°/45° 각도 스냅

## Phase 3: 벡터 네트워크 & 펜 도구 (3–4개월)
- Vector Network 데이터 모델, 펜 도구 UI, Boolean 연산 UI 연동

## Phase 4: 스타일 & 효과 (1.5–2개월)
- Fill/Stroke 확장, Effect 완전 호환, 디자인 토큰, 텍스트 확장(4.4)

## Phase 5: Selection, Transform, Resize (1개월)
- 8방향 리사이즈, 회전/Flip UI, 다중 선택 정렬

## Phase 6: 렌더링 엔진 전환 (3–4개월)
- Canvas/WebGL 도입, feature flag로 점진적 전환
- 가상화 & LOD

## Phase 7~12
- 7: Variants/슬롯/라이브러리 | 8: 프로토타입/인터랙션 | 9: Dev Mode | 10: 성능/안정성 | 11: UI/UX | 12: 협업/반응형/플러그인

---

## 우선순위 요약 (권장 순서)

1. **Phase 1** (Constraints & Auto Layout) — 체감 최대, 구현 비용 적정
2. **Phase 2** (스마트 가이드) — 워크플로 속도 향상
3. **Phase 5** (Transform/Resize) — 일상적 사용 빈도 높음
4. **Phase 4** (효과) — 시각적 품질
5. **Phase 3** (벡터) — 고급 사용자
6. **Phase 6** (렌더링) — 대규모 문서 필수
7. **Phase 9** (Dev Mode) — 개발자 핸드오프
8. 나머지 — 지속 개선

---

## 핵심 파일 참조

- 스키마: `src/advanced/doc/scene.ts`
- 레이아웃: `src/advanced/layout/engine.ts`
- 벡터 유틸: `src/advanced/geom/pathData.ts`
- 렌더러: `src/advanced/runtime/renderer.tsx`
- 에디터 뷰: `src/advanced/ui/AdvancedEditorView.tsx`
