# 에디터 Figma 이상 달성 계획서 — 점검 및 보정

## 1. 완벽의 기준 (기능 + 품질)

**둘 중 하나가 아니라 둘 다 필요**
- **기능**: Figma에 있는 모든 기능을 NULL에도 구현
- **품질**: 해당 기능이 Figma 수준으로 안정적·자연스럽게 동작

계획서의 모든 Phase에 **품질 검증** 단계를 명시할 것 (테스트, 벤치마크, 사용자 피드백).

---

## 2. 이미 있는 기능 정리 (계획서 중복/과소평가 보정)

### 2.1 텍스트 (계획서: "기본 스타일 위주" → 실제로는 더 많음)

| 항목 | 현재 상태 | 위치 |
|------|-----------|------|
| letterSpacing (자간) | ✅ 있음 | scene.ts TextStyle, AdvancedEditorView 텍스트 패널 |
| fontFeatureSettings (OpenType) | ✅ 있음 | scene.ts, AdvancedEditorView 텍스트 패널 |
| fontVariationSettings (가변 폰트) | ✅ 있음 | scene.ts, AdvancedEditorView 텍스트 패널 |
| textCase (upper/lower/capitalize) | ✅ 있음 | scene.ts |
| lineThrough, underline | ✅ 있음 | scene.ts |

**추가 필요** (계획서 Phase 4 또는 별도 Phase):
- Kerning (문자 단위 자간) — 현재는 전체 letterSpacing만
- 정교한 텍스트 레이아웃 (줄바꿈 알고리즘, 하이픈, 오버플로우)
- 텍스트 온 패스 (path 위에 텍스트 배치)

### 2.2 반응형 / Breakpoint (계획서: "Constraints, Auto Layout 위주" → 이미 상당부분 있음)

| 항목 | 현재 상태 | 위치 |
|------|-----------|------|
| PageBreakpoint | ✅ 있음 | scene.ts PageBreakpoint 타입 |
| breakpoints (페이지별) | ✅ 있음 | page.breakpoints |
| activeBreakpointId | ✅ 있음 | page.activeBreakpointId |
| breakpointOverrides (노드별) | ✅ 있음 | Node.breakpointOverrides |
| BREAKPOINT_PRESETS | ✅ 있음 | Mobile 375/390, Tablet 768, Laptop 1280, Desktop 1440 |

**추가 필요**:
- Device frame 시각화 (iPhone/Android 프레임 틀)
- 뷰포트 프리셋 UI 강화 (한 번에 여러 해상도 미리보기)
- 브레이크포인트 간 전환 애니메이션

### 2.3 협업 (계획서: "presence, 코멘트 정도" → 실제로 더 많음)

| 항목 | 현재 상태 | 위치 |
|------|-----------|------|
| Presence (커서, 선택, 페이지) | ✅ 있음 | CollabPresence, emitCollabPresence, collabPeers |
| 코멘트 (thread, reply, resolved) | ✅ 있음 | comments API, AdvancedEditorView |
| Socket 실시간 연결 | ✅ 있음 | collabSocketRef, editor:presence |
| 채팅 | ✅ 있음 | /api/pages/[pageId]/chat |
| work-view 실시간 (presence, ghost, click) | ✅ 있음 | work-view.tsx |

**추가 필요** (Phase 12.2에서 구체화):
- 실시간 동시 편집 (CRDT/Yjs 등) — 현재는 presence + 저장 기반
- 충돌 해결 (동시 수정 시 merge 전략)
- 분기/병합 (branch, merge)

### 2.4 Constraints (계획서: "Figma 동등 + 추가" → 이미 대부분 구현됨)

| 항목 | 현재 상태 | 위치 |
|------|-----------|------|
| left, right, top, bottom | ✅ 있음 | engine.ts applyConstraintsOnResize |
| left+right, top+bottom (scale) | ✅ 있음 | engine.ts applyConstraintsOnResize |
| hCenter, vCenter | ✅ 있음 | engine.ts applyConstraintsOnResize |
| scaleX, scaleY | ✅ 있음 | engine.ts applyConstraintsOnResize |

**추가 필요**:
- Constraints UI (Figma 스타일 4x4 매트릭스)
- Auto Layout 프레임 내 constraints 비활성화 규칙
- 수평/수직 독립 조합 검증 (일부 엣지 케이스)

### 2.5 Auto Layout (계획서: "고도화 필요" → 기본은 있음)

| 항목 | 현재 상태 | 위치 |
|------|-----------|------|
| dir: row, column | ✅ 있음 | engine.ts |
| gap, padding | ✅ 있음 | layout.padding, layout.gap |
| align: start, center, end, stretch, baseline | ✅ 있음 | scene.ts AutoLayout |
| layoutSizing: hug, fill, fixed | ✅ 있음 | LayoutSizingAxis |
| minWidth, maxWidth, minHeight, maxHeight | ✅ 있음 | LayoutSizingAxis |
| gapMode: fixed, space-between | ✅ 있음 | AutoLayout.gapMode |
| wrap | ✅ 있음 | layout.wrap |
| includeStrokeInBounds | ✅ 있음 | layout.includeStrokeInBounds |

**추가 필요**:
- layoutMode: "grid" (열/행 개수, gutters)
- baseline 정확도 검증
- wrap 시 순서/방향 명세
- 중첩 Auto Layout overflow 처리

### 2.6 플러그인 (계획서: "API, 스토어 언급")

| 항목 | 현재 상태 | 위치 |
|------|-----------|------|
| PluginManifest | ✅ 있음 | AdvancedEditorView.tsx |
| Plugin store API | ✅ 있음 | /api/app/[pageId]/plugins |
| installPlugins, storeId, storeVersion | ✅ 있음 | |
| ALLOWED_PLUGIN_ACTIONS | ✅ 있음 | align, distribute, export, createWidget 등 |
| Plugin policies (manual/auto/pinned) | ✅ 있음 | PluginUpdatePolicy |

**추가 필요** (Phase 12.3):
- 플러그인 샌드박스 강화
- codegen 플러그인 (Dev Mode 연동)
- 커스텀 노드 타입 등록 API

### 2.7 기타 이미 있는 항목

| 계획서 항목 | 현재 상태 |
|-------------|-----------|
| pixelSnap | ✅ 있음 |
| guideSnap | ✅ 있음 |
| doc.view.guides | ✅ 있음 |
| LayoutGridItem (columns, rows, grid) | ✅ 있음 (scene.ts) |
| Boolean 연산 (boolean.ts) | ✅ 있음 |
| PathSegment, pathData | ✅ 있음 |
| Path anchor 드래그 (pathEdit) | ✅ 있음 |
| frame.rotation | ✅ 있음 |
| distribute | ✅ 있음 |
| align (l, r, t, b, hc, vc) | ✅ 있음 |
| LOD placeholder | ✅ 있음 |

---

## 3. 계획서에 반영된 항목 (docs/에디터_figma_이상_달성_계획서.md 동기화 완료)

### 3.1 텍스트 → Phase 4.4 반영됨

- Kerning (per-char), 텍스트 온 패스, fontFeatureSettings/Variation UI — 계획서에 명시됨

### 3.2 반응형 → Phase 12.2 반응형 미리보기 반영됨

- Device frame (iPhone, iPad, Desktop)
- 2-up / 4-up 동시 미리보기

### 3.3 협업 → Phase 12.2 협업 확장 반영됨

- 실시간 동시 편집 (CRDT/Yjs) — 계획서에 명시 (현재 미구현)
- presence, 코멘트는 이미 있음

### 3.4 플러그인 → Phase 12.3 유지

- Codegen, 커스텀 노드 타입, 샌드박스 — 계획서에 반영

---

## 4. Phase별 수정 요약 (docs/에디터_figma_이상_달성_계획서.md 반영 완료)

| Phase | 수정 내용 |
|-------|-----------|
| Phase 0 | leftRight/topBottom 제거 (이미 engine에 있음), layoutMode grid·Effect glass/backgroundBlur 명시 |
| Phase 1.1 | "현재 상태" 표 명시, **필요 작업**: UI 4×4 매트릭스, Auto Layout 내 constraints 비활성화 |
| Phase 1.2 | **이미 있음** 표, 필요 작업: grid, baseline column 검증, overflow |
| Phase 1.3 | **이미 있음** 표, 필요 작업: 프레임 단위 guides, 가이드 더블클릭 입력 |
| Phase 2 | 유지 (동적 정렬선, 거리 표시, 0.5px 옵션) |
| Phase 4 | **4.4 텍스트 확장** 추가 (Kerning, 텍스트 온 패스, fontFeature/Variation UI) |
| Phase 12.2 | **협업 & 반응형** 통합, CRDT/Yjs 실시간 편집, Device frame, 2-up/4-up 미리보기 |

---

## 5. 결론

- **플러그인·텍스트·반응형·협업**: 다 하면 된다 → 맞음. 다만 계획서에 **추가할 항목**을 위와 같이 명시해야 누락 없음.
- **협업은 이미 있음** → presence, 코멘트, socket 기반 실시간은 있음. **실시간 동시 편집(CRDT)** 은 아직 없음 → 12.2에 추가.
- **완벽 = 기능 + 품질** → 각 Phase에 품질 검증 체크포인트 추가 권장.
- **이미 있는 기능** → 위 표대로 계획서에서 "신규"로 적힌 것 중 상당수는 "보강/UI 완성" 수준으로 수정하는 것이 정확함.
