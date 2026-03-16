# NULL 에디터 Figma 롤백 가이드

이 문서는 Figma 작업 중 발생한 변경을 안전하게 되돌리기 위한 기준 문서다.
원칙은 간단하다.

- 원본 셸은 최대한 유지한다.
- 위험한 변경은 분리 모듈로 넣는다.
- 분리 모듈은 테스트로 검증한다.
- 롤백은 `변경 단위`별로 한다.

## 1. 롤백 원칙

1. 통파일 전체 교체보다 `변경 단위` 롤백을 우선한다.
2. 원본 UI 구조는 가능한 한 유지한다.
3. 롤백 전후 모두 테스트를 돌린다.
4. 롤백 문서에 없는 변경은 완료로 인정하지 않는다.

## 2. 변경 단위 형식

앞으로 모든 변경은 아래 형식으로 기록한다.

- 변경 ID
- 목적
- 수정 파일
- 추가 파일
- 원본 경로 유지 여부
- 검증 방법
- 수동 롤백 절차
- 롤백 후 확인 절차

## 3. 공통 롤백 절차

1. 롤백할 변경 ID를 찾는다.
2. 해당 변경의 수정 파일과 추가 파일을 확인한다.
3. 추가 파일은 연결을 끊고 필요시 삭제한다.
4. 수정 파일은 해당 변경이 건드린 호출부만 원복한다.
5. 지정된 테스트를 다시 실행한다.
6. 통합 실행계획 문서에서 체크 상태를 되돌린다.

## 4. 현재 롤백 항목

### C-0001. 통합 실행계획 문서 추가

목적:
- Figma 작업의 기준 문서를 고정

수정 파일:
- 없음

추가 파일:
- `docs/에디터_Figma_통합_실행계획.md`

원본 경로 유지 여부:
- [x] 해당 없음

검증 방법:
- 문서 존재 확인

수동 롤백 절차:
1. `docs/에디터_Figma_통합_실행계획.md` 삭제

롤백 후 확인 절차:
1. 계획 문서가 더 이상 참조되지 않는지 확인

### C-0002. 롤백 가이드 문서 추가

목적:
- 변경 단위 롤백 기준 고정

수정 파일:
- 없음

추가 파일:
- `docs/에디터_Figma_롤백_가이드.md`

원본 경로 유지 여부:
- [x] 해당 없음

검증 방법:
- 문서 존재 확인

수동 롤백 절차:
1. `docs/에디터_Figma_롤백_가이드.md` 삭제

롤백 후 확인 절차:
1. 계획 문서에서 롤백 가이드 링크 정리

### C-0003. drag/snap/resize 순수 계산 분리

목적:
- `AdvancedEditorView.tsx`의 고위험 계산 로직을 분리 모듈로 이동
- UI 셸은 유지하고, 수학 로직만 분리

수정 파일:
- `src/advanced/ui/AdvancedEditorView.tsx`

추가 파일:
- `src/advanced/ui/AdvancedEditor.drag.ts`
- `tests/editor-drag.test.ts`

원본 경로 유지 여부:
- [x] 기존 `AdvancedEditorView.tsx`가 여전히 주 경로
- [x] 새 모듈은 계산 전용 보조 경로

검증 방법:
- `npx vitest run tests/editor-drag.test.ts`
- `npx vitest run tests/prototypePlayback.test.ts tests/stressDoc.test.ts tests/editor-drag.test.ts`

수동 롤백 절차:
1. `src/advanced/ui/AdvancedEditorView.tsx`에서 아래 import 제거
   - `applyAxisLock`
   - `computeSmartSnapAdjustment`
   - `computeResizePreviewFrame`
2. 이동 드래그 구간에서 축 잠금 계산을 다시 인라인으로 되돌린다.
3. 이동 드래그 구간에서 smart snap 계산을 다시 인라인으로 되돌린다.
4. resize preview 계산을 다시 인라인으로 되돌린다.
5. `src/advanced/ui/AdvancedEditor.drag.ts` 삭제
6. `tests/editor-drag.test.ts` 삭제 또는 보류

인라인 원복 기준:
- 축 잠금:
  - `shift`가 눌리면 더 큰 축만 남기고 나머지 축은 0
- smart snap:
  - 이동 대상의 좌/중앙/우, 상/중앙/하 선과 target 선을 비교
  - threshold 안에서 가장 가까운 차이만 보정
- resize preview:
  - handle 방향에 따라 x/y/w/h를 계산
  - `shift`는 비율 유지
  - `alt`는 중심 기준 리사이즈
  - rotation은 유지

롤백 후 확인 절차:
1. `AdvancedEditorView.tsx`에서 `./AdvancedEditor.drag` import가 없는지 확인
2. `src/advanced/ui/AdvancedEditor.drag.ts`가 제거되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

### C-0004. move snap target / move frame 생성 분리

목적:
- 이동 드래그 중 smart guide 대상선 수집 로직 분리
- 이동 preview / commit에서 공통으로 쓰는 frame 생성 로직 분리

수정 파일:
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/editor-drag.test.ts`

추가 파일:
- 없음

변경된 분리 모듈:
- `src/advanced/ui/AdvancedEditor.drag.ts`
  - `collectMoveSnapTargets`
  - `buildMovedFrames`

원본 경로 유지 여부:
- [x] 기존 `AdvancedEditorView.tsx`가 여전히 주 경로
- [x] 새 helper는 계산 전용 보조 경로

검증 방법:
- `npx vitest run tests/editor-drag.test.ts`
- `npx vitest run tests/prototypePlayback.test.ts tests/stressDoc.test.ts tests/editor-drag.test.ts`

수동 롤백 절차:
1. `src/advanced/ui/AdvancedEditorView.tsx`에서 아래 import 제거
   - `collectMoveSnapTargets`
   - `buildMovedFrames`
2. 이동 드래그 구간에서 smart guide 대상선 수집을 다시 인라인으로 되돌린다.
3. collab preview용 moved frames 생성을 다시 인라인으로 되돌린다.
4. move end commit용 moved frames 생성을 다시 인라인으로 되돌린다.
5. `tests/editor-drag.test.ts`에서 아래 테스트를 제거하거나 이전 상태로 되돌린다.
   - `collects move snap targets while skipping the moving and hidden nodes`
   - `builds moved frames from the original drag origins`
6. 필요시 `src/advanced/ui/AdvancedEditor.drag.ts`의 새 helper 두 개를 제거한다.

인라인 원복 기준:
- move snap target:
  - page root 아래 후보를 순회
  - moving node는 제외
  - hidden node는 제외
  - 각 rect의 좌/중앙/우, 상/중앙/하를 targetX/targetY에 넣는다
  - parent rect는 추가로 한 번 더 넣는다
- moved frames:
  - `drag.ids`를 순회
  - `drag.origins[id]`가 있으면 `x + dx`, `y + dy`로 새 frame을 만든다

롤백 후 확인 절차:
1. `AdvancedEditorView.tsx`에서 `collectMoveSnapTargets`, `buildMovedFrames` 호출이 제거되었는지 확인
2. `tests/editor-drag.test.ts`의 관련 테스트가 정리되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

### C-0005. move preview delta / preview frame 생성 분리

목적:
- 이동 드래그 preview 경로의 delta 계산과 preview frames 생성을 helper로 분리

수정 파일:
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/editor-drag.test.ts`

추가 파일:
- 없음

변경된 분리 모듈:
- `src/advanced/ui/AdvancedEditor.drag.ts`
  - `computeMovePreview`

원본 경로 유지 여부:
- [x] 기존 `AdvancedEditorView.tsx`가 여전히 주 경로
- [x] move preview는 helper 호출로만 치환

검증 방법:
- `npx vitest run tests/editor-drag.test.ts`
- `npx vitest run tests/prototypePlayback.test.ts tests/stressDoc.test.ts tests/editor-drag.test.ts`

수동 롤백 절차:
1. `src/advanced/ui/AdvancedEditorView.tsx`에서 `computeMovePreview` import 제거
2. move 드래그 블록에서 아래 계산을 다시 인라인으로 되돌린다.
   - 기준 origin에서 snapped delta 계산
   - `dragDeltaRef.current`와 `setDragDelta`
   - collab preview용 moved frames 생성
3. `tests/editor-drag.test.ts`에서 아래 테스트를 제거하거나 이전 상태로 되돌린다.
   - `computes move preview delta and frames from the anchor origin`
   - `returns null move preview when the anchor origin is missing`
4. 필요시 `src/advanced/ui/AdvancedEditor.drag.ts`의 `computeMovePreview` helper를 제거한다.

인라인 원복 기준:
- anchor origin이 없으면 preview 계산을 하지 않는다
- `snapValue(origin.x + moveX) - origin.x`
- `snapValue(origin.y + moveY) - origin.y`
- 계산된 delta로 모든 dragged node의 frame을 만든다
- collab preview는 그 frames를 `applyFrameUpdates`에 넣어 broadcast 한다

롤백 후 확인 절차:
1. `AdvancedEditorView.tsx`에서 `computeMovePreview` 호출이 제거되었는지 확인
2. `tests/editor-drag.test.ts`의 관련 테스트가 정리되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

### C-0006. resize commit 경로 분리

목적:
- resize 종료 시 branch 선택 로직을 helper로 분리
- auto-layout / constraints / clone fallback 경로를 `AdvancedEditorView` 밖으로 이동

수정 파일:
- `src/advanced/ui/AdvancedEditorView.tsx`

추가 파일:
- `src/advanced/ui/AdvancedEditor.resize.ts`
- `tests/editor-resize.test.ts`

원본 경로 유지 여부:
- [x] 기존 `AdvancedEditorView.tsx`가 여전히 주 경로
- [x] commit 시점은 동일하고 branch 선택만 helper로 이동

검증 방법:
- `npx vitest run tests/editor-resize.test.ts`
- `npx vitest run tests/editor-drag.test.ts tests/editor-resize.test.ts tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

수동 롤백 절차:
1. `src/advanced/ui/AdvancedEditorView.tsx`에서 `finalizeResizeDoc` import 제거
2. resize 종료 블록에서 아래 인라인 로직을 복원한다.
   - child가 없으면 `commit(cloneDoc(draft))`
   - auto-layout이면 `layoutDoc -> refreshOverridesForSubtree -> commit`
   - 아니면 `applyConstraintsOnResize -> refreshOverridesForSubtree -> commit`
3. `src/advanced/ui/AdvancedEditor.resize.ts` 삭제
4. `tests/editor-resize.test.ts` 삭제 또는 보류

인라인 원복 기준:
- 대상 node가 없거나 자식이 없으면 clone fallback
- auto-layout이면 `layoutDoc(draft)` 후 overrides refresh
- fixed면 `applyConstraintsOnResize(draft, drag.id, drag.origin, node.frame)` 후 overrides refresh

롤백 후 확인 절차:
1. `AdvancedEditorView.tsx`에서 `finalizeResizeDoc` 호출이 제거되었는지 확인
2. `src/advanced/ui/AdvancedEditor.resize.ts`가 제거되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

### C-0007. active smart guide 시각 피드백 연결

목적:
- smart snap 계산 결과를 실제 guide line으로 표시
- snap 수치만 맞는 상태가 아니라 편집기 피드백 품질까지 검증 가능하게 고정

수정 파일:
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/editor-drag.test.ts`

추가 파일:
- 없음

변경된 분리 모듈:
- `src/advanced/ui/AdvancedEditor.drag.ts`
  - `computeSmartSnapFeedback`

원본 경로 유지 여부:
- [x] 기존 `AdvancedEditorView.tsx`가 여전히 주 경로
- [x] smart snap 수학 helper 위에 guide state만 추가 연결

검증 방법:
- `npx vitest run tests/editor-drag.test.ts`
- `npx vitest run tests/editor-drag.test.ts tests/editor-resize.test.ts tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

수동 롤백 절차:
1. `src/advanced/ui/AdvancedEditorView.tsx`에서 `activeSmartGuides` state와 `setActiveSmartGuides` 호출을 제거한다.
2. move 드래그 블록에서 `computeSmartSnapFeedback` 대신 `computeSmartSnapAdjustment` 또는 기존 인라인 snap 계산만 사용하도록 되돌린다.
3. guide overlay에서 active smart guide line 렌더링 블록을 제거한다.
4. `tests/editor-drag.test.ts`에서 아래 테스트를 제거하거나 이전 상태로 되돌린다.
   - `returns smart guide feedback for the snapped axes`
   - `keeps smart guide feedback empty for axes without a valid snap target`
5. 필요시 `src/advanced/ui/AdvancedEditor.drag.ts`의 `computeSmartSnapFeedback` helper를 제거하고 `computeSmartSnapAdjustment`만 유지한다.

인라인 원복 기준:
- smart snap은 delta만 계산해도 된다
- guide line은 따로 표시하지 않는다
- drag 종료 시 smart guide state를 정리하지 않아도 된다

롤백 후 확인 절차:
1. `AdvancedEditorView.tsx`에서 `activeSmartGuides`와 `computeSmartSnapFeedback` 호출이 제거되었는지 확인
2. `tests/editor-drag.test.ts`의 관련 테스트가 정리되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

### C-0008. Figma 매핑 표 문서 추가

목적:
- 현재 `scene.ts` 모델과 `figmaToNull.ts` 임포트 경로 기준으로 Figma 대응 범위를 명시
- 이후 모델 변경 시 "직접 대응 / 부분 대응 / 미대응"을 추적하는 기준표 고정

수정 파일:
- 없음

추가 파일:
- `docs/에디터_Figma_매핑_표.md`

원본 경로 유지 여부:
- [x] 코드 경로 미변경
- [x] 문서 추가만 수행

검증 방법:
- 문서 존재 확인
- 매핑 표에 아래 축이 모두 있는지 확인
  - 노드 / 계층
  - 위치 / 크기 / 레이아웃
  - 스타일 / 효과 / 텍스트
  - 컴포넌트 / 디자인 시스템
  - 프로토타입 / Dev Mode / Export

수동 롤백 절차:
1. `docs/에디터_Figma_매핑_표.md` 삭제
2. `docs/에디터_Figma_통합_실행계획.md`에서 관련 완료 체크를 되돌린다.

롤백 후 확인 절차:
1. 매핑 표 문서가 제거되었는지 확인
2. 통합 실행계획 문서에서 관련 완료 체크가 제거되었는지 확인

### C-0009. Figma import/export 공통 제약 표 문서 추가

목적:
- import와 export를 같은 제약 위에서 설계하는 기준표 고정
- `Lossless / Structured Lossy / Raster Fallback / Unsupported` 판정 기준 명시

수정 파일:
- 없음

추가 파일:
- `docs/에디터_Figma_import_export_공통_제약표.md`

원본 경로 유지 여부:
- [x] 코드 경로 미변경
- [x] 문서 추가만 수행

검증 방법:
- 문서 존재 확인
- 공통 제약 표에 아래 항목이 있는지 확인
  - 원칙
  - 판정 등급
  - 공통 제약 표
  - 금지 상태
  - 과도기 허용 규칙

수동 롤백 절차:
1. `docs/에디터_Figma_import_export_공통_제약표.md` 삭제
2. `docs/에디터_Figma_통합_실행계획.md`에서 관련 완료 체크를 되돌린다.

롤백 후 확인 절차:
1. 공통 제약 표 문서가 제거되었는지 확인
2. 통합 실행계획 문서에서 관련 완료 체크가 제거되었는지 확인

### C-0010. Figma import section / canvas page hierarchy 보존

목적:
- Figma `SECTION`을 `frame`으로 다운캐스트하지 않고 `section`으로 보존
- Figma `DOCUMENT -> CANVAS` 구조를 NULL `pages[]` 기본 구조로 가져오기

수정 파일:
- `src/lib/figmaToNull.ts`
- `tests/figmaToNull.test.ts`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 import 진입점 `figmaNodesToNullDoc` 유지
- [x] 기존 테스트 파일에 새 케이스만 추가

검증 방법:
- `npx vitest run tests/figmaToNull.test.ts`
- `npx vitest run tests/figmaToNull.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

수동 롤백 절차:
1. `src/lib/figmaToNull.ts`에서 `SECTION -> section` 매핑을 `frame`으로 되돌린다.
2. canvas별 page source 분기와 page builder helper를 제거하고, 예전 단일 root import 경로로 되돌린다.
3. `tests/figmaToNull.test.ts`에서 아래 테스트를 제거하거나 이전 상태로 되돌린다.
   - `preserves SECTION nodes instead of downcasting them to frame`
   - `creates one NULL page per Figma canvas and preserves the canvas hierarchy`

롤백 후 확인 절차:
1. `figmaToNull.ts`에서 다중 canvas import helper가 제거되었는지 확인
2. `tests/figmaToNull.test.ts`의 관련 테스트가 정리되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/figmaToNull.test.ts`

### C-0011. Figma stroke dash import 반영

목적:
- Figma `strokeDashes`를 NULL `style.strokes[].dash`로 보존
- 이미 존재하는 렌더러/에디터 dash 지원을 import 단계까지 연결

수정 파일:
- `src/lib/figmaToNull.ts`
- `tests/figmaToNull.test.ts`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 import 진입점 유지
- [x] 기존 stroke 구조를 확장만 수행

검증 방법:
- `npx vitest run tests/figmaToNull.test.ts`
- `npx vitest run tests/figmaToNull.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

수동 롤백 절차:
1. `src/lib/figmaToNull.ts`에서 `convertStrokes`의 `strokeDashes` 인자를 제거한다.
2. stroke 생성 시 `dash` 할당을 제거한다.
3. `tests/figmaToNull.test.ts`에서 `imports stroke dash arrays into NULL stroke definitions` 테스트를 제거하거나 이전 상태로 되돌린다.

롤백 후 확인 절차:
1. `figmaToNull.ts`에서 `strokeDashes` 처리 흔적이 제거되었는지 확인
2. `tests/figmaToNull.test.ts`의 관련 테스트가 정리되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/figmaToNull.test.ts`

### C-0012. Figma auto-layout layoutSizing 기본 매핑 반영

목적:
- Figma auto-layout 컨테이너의 `primaryAxisSizingMode` / `counterAxisSizingMode`를 NULL `layoutSizing`으로 연결
- 최소한의 `fixed/hug` 정보를 import 단계에서 보존

수정 파일:
- `src/lib/figmaToNull.ts`
- `tests/figmaToNull.test.ts`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 import 진입점 유지
- [x] 기존 layout import 로직 위에 sizing helper만 추가

검증 방법:
- `npx vitest run tests/figmaToNull.test.ts`
- `npx vitest run tests/figmaToNull.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

수동 롤백 절차:
1. `src/lib/figmaToNull.ts`에서 `convertLayoutSizing` helper를 제거한다.
2. `convertNode`에서 `layoutSizing` 할당을 제거한다.
3. `tests/figmaToNull.test.ts`에서 `maps auto-layout sizing modes into NULL layoutSizing` 테스트를 제거하거나 이전 상태로 되돌린다.

롤백 후 확인 절차:
1. `figmaToNull.ts`에서 `convertLayoutSizing`과 관련 할당이 제거되었는지 확인
2. `tests/figmaToNull.test.ts`의 관련 테스트가 정리되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/figmaToNull.test.ts`

### C-0013. 단순 VECTOR editable import 보존

목적:
- 단순 VECTOR를 이미지 fallback으로 보내지 않고 editable path/segments로 유지
- `figmaFileToNullDoc` 실제 경로에서 simple vector가 bitmap으로 바뀌지 않도록 고정

수정 파일:
- `src/lib/figmaToNull.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`

추가 파일:
- `tests/figmaFileToNull.test.ts`

원본 경로 유지 여부:
- [x] 기존 import 진입점 유지
- [x] 이미지 fallback 판정 로직만 조건부 완화

검증 방법:
- `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`
- `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

수동 롤백 절차:
1. `src/lib/figmaToNull.ts`에서 simple vector 판정 helper를 제거한다.
2. `shouldRenderAsImage`에서 VECTOR를 다시 항상 image fallback 대상으로 되돌린다.
3. vector geometry를 `shape.segments/pathData`로 넣는 처리 중 새로 추가한 다중 segment 경로를 제거한다.
4. `tests/figmaToNull.test.ts`와 `tests/figmaFileToNull.test.ts`의 관련 테스트를 제거하거나 이전 상태로 되돌린다.

롤백 후 확인 절차:
1. `figmaToNull.ts`에서 simple vector 예외 처리와 segment 생성 코드가 제거되었는지 확인
2. `tests/figmaFileToNull.test.ts`가 제거되었거나 관련 테스트가 정리되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/figmaToNull.test.ts`

### C-0014. simple mask chain editable import 보존

목적:
- simple mask chain을 이미지 fallback으로 보내지 않고 `isMask + child order` 구조로 유지
- 런타임 mask 렌더러가 바로 사용할 수 있는 최소 구조를 import 단계에서 보존

수정 파일:
- `src/lib/figma.ts`
- `src/lib/figmaToNull.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 import 진입점 유지
- [x] mask 판정과 child order 정리만 추가

검증 방법:
- `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`
- `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

수동 롤백 절차:
1. `src/lib/figma.ts`에서 `isMask` 필드를 제거한다.
2. `src/lib/figmaToNull.ts`에서 simple mask 판정 helper와 child order 재배치를 제거한다.
3. `convertNode`에서 `isMask` 할당을 제거한다.
4. `tests/figmaToNull.test.ts`와 `tests/figmaFileToNull.test.ts`의 simple mask 관련 테스트를 제거하거나 이전 상태로 되돌린다.

롤백 후 확인 절차:
1. `figmaToNull.ts`에서 mask 관련 helper와 child order 처리 코드가 제거되었는지 확인
2. 관련 테스트가 정리되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

### C-0015. simple boolean operation editable import 보존

목적:
- simple boolean operation을 이미지 fallback 대신 editable path result로 유지
- boolean operand child를 중복 import하지 않도록 traversal을 차단

수정 파일:
- `src/lib/figmaToNull.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 import 진입점 유지
- [x] boolean 판정과 traversal 제어만 추가

검증 방법:
- `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`
- `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

수동 롤백 절차:
1. `src/lib/figmaToNull.ts`에서 BOOLEAN_OPERATION의 `path` 매핑을 제거하고 이전 상태로 되돌린다.
2. boolean geometry import helper와 child traversal 차단 로직을 제거한다.
3. `tests/figmaToNull.test.ts`와 `tests/figmaFileToNull.test.ts`의 simple boolean 관련 테스트를 제거하거나 이전 상태로 되돌린다.

롤백 후 확인 절차:
1. `figmaToNull.ts`에서 BOOLEAN_OPERATION editable import 처리 코드가 제거되었는지 확인
2. 관련 테스트가 정리되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

### C-0016. stroke cap/join, exportSettings, layoutGrid import 반영

목적:
- 기존 모델과 UI가 이미 지원하는 `stroke cap/join`, `exportSettings`, `layoutGrid`를 Figma import에 연결
- 별도 구조 확장 없이 import fidelity를 올림

수정 파일:
- `src/lib/figma.ts`
- `src/lib/figmaToNull.ts`
- `tests/figmaToNull.test.ts`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 import 진입점 유지
- [x] 기존 모델에 값만 채우는 형태로 확장

검증 방법:
- `npx vitest run tests/figmaToNull.test.ts`
- `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

수동 롤백 절차:
1. `src/lib/figma.ts`에서 `strokeCap`, `strokeJoin`, `layoutGrids` 필드를 제거한다.
2. `src/lib/figmaToNull.ts`에서 stroke cap/join 변환 helper, exportSettings 변환 helper, layoutGrid 변환 helper를 제거한다.
3. `convertNode`에서 `exportSettings`, `layoutGrid` 할당을 제거한다.
4. `tests/figmaToNull.test.ts`의 아래 테스트를 제거하거나 이전 상태로 되돌린다.
   - `imports stroke cap and join settings into node style`
   - `imports Figma export settings into NULL exportSettings`
   - `imports Figma layout grids into NULL layoutGrid items`

롤백 후 확인 절차:
1. `figmaToNull.ts`에서 관련 helper와 할당 코드가 제거되었는지 확인
2. 관련 테스트가 정리되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/figmaToNull.test.ts`

### C-0017. boolean operation semantic metadata 보존

목적:
- boolean 결과 path에 연산 타입과 operand trace를 남겨 later export/re-edit 기준을 보존
- Figma import뿐 아니라 에디터 내 boolean 생성 경로도 같은 semantic trace를 유지

수정 파일:
- `src/advanced/doc/scene.ts`
- `src/lib/figma.ts`
- `src/lib/figmaToNull.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`
- `tests/scene-clone.test.ts`

추가 파일:
- `tests/scene-clone.test.ts`

원본 경로 유지 여부:
- [x] 기존 boolean 결과 path 렌더 경로 유지
- [x] metadata만 추가 저장

검증 방법:
- `npx vitest run tests/scene-clone.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`
- `npx vitest run tests/scene-clone.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

수동 롤백 절차:
1. `src/advanced/doc/scene.ts`에서 `BooleanSemanticOp`, `BooleanOperandSnapshot`, `BooleanMeta`, `shape.booleanMeta`를 제거한다.
2. `src/lib/figma.ts`에서 `booleanOperation` 필드를 제거한다.
3. `src/lib/figmaToNull.ts`에서 boolean semantic 변환 helper와 `shape.booleanMeta` 할당을 제거한다.
4. `src/advanced/ui/AdvancedEditorView.tsx`에서 에디터 boolean 생성 시 `booleanMeta` 저장을 제거한다.
5. `tests/figmaToNull.test.ts`, `tests/figmaFileToNull.test.ts`, `tests/scene-clone.test.ts`의 관련 테스트를 제거하거나 이전 상태로 되돌린다.

롤백 후 확인 절차:
1. `scene.ts`와 `figmaToNull.ts`에서 boolean metadata 코드가 제거되었는지 확인
2. 관련 테스트가 정리되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

### C-0018. derived vectorNetwork 모델 추가 및 path 생성 경로 동기화

목적:
- `pathData`/`segments`를 유지한 채 `shape.vectorNetwork`를 병행 저장해서 이후 Figma급 벡터 편집 모델 확장의 발판을 만든다.
- import, path 편집, path 생성 유틸 경로에서 vectorNetwork가 빠지지 않게 동기화한다.

수정 파일:
- `src/advanced/doc/scene.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/lib/figmaToNull.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`
- `tests/scene-clone.test.ts`

추가 파일:
- `src/advanced/geom/vectorNetwork.ts`
- `tests/vector-network.test.ts`

원본 경로 유지 여부:
- [x] 기존 `pathData`/`segments` 렌더 경로 유지
- [x] 기존 UI 흐름 유지
- [x] vectorNetwork는 파생 데이터로만 추가

검증 방법:
- `npx vitest run tests/vector-network.test.ts tests/scene-clone.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`
- `npx vitest run tests/vector-network.test.ts tests/scene-clone.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

수동 롤백 절차:
1. `src/advanced/doc/scene.ts`에서 `VectorNetwork*` 타입, `shape.vectorNetwork`, 관련 clone 로직을 제거한다.
2. `src/advanced/geom/vectorNetwork.ts`를 삭제한다.
3. `src/lib/figmaToNull.ts`에서 `withDerivedVectorNetwork` import와 할당을 제거하고 기존 `shape.pathData`/`shape.segments` 저장으로 되돌린다.
4. `src/advanced/ui/AdvancedEditorView.tsx`에서 `withDerivedVectorNetwork` import와 path 생성/편집 지점의 wrapper 호출을 제거한다.
5. `tests/vector-network.test.ts`를 삭제한다.
6. `tests/figmaToNull.test.ts`, `tests/figmaFileToNull.test.ts`, `tests/scene-clone.test.ts`의 vectorNetwork 관련 기대값을 제거하거나 이전 상태로 되돌린다.

롤백 후 확인 절차:
1. `scene.ts`, `figmaToNull.ts`, `AdvancedEditorView.tsx`에서 `vectorNetwork` 참조가 제거되었는지 확인
2. `src/advanced/geom/vectorNetwork.ts`와 `tests/vector-network.test.ts`가 제거되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/scene-clone.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

### C-0019. vectorNetwork-only path fallback 복원

목적:
- `shape.pathData`가 비어도 `shape.vectorNetwork`만으로 path를 복원해서 에디터와 런타임이 같은 벡터를 읽게 한다.
- 이후 `vectorNetwork` 중심 편집 모델로 넘어가도 기존 path 소비 코드가 바로 깨지지 않게 만든다.

수정 파일:
- `src/advanced/geom/vectorNetwork.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/advanced/runtime/renderer.tsx`
- `tests/vector-network.test.ts`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 `pathData` 우선 경로 유지
- [x] `segments` 우선 경로 유지
- [x] `vectorNetwork`는 마지막 fallback으로만 연결

검증 방법:
- `npx vitest run tests/vector-network.test.ts`
- `npx vitest run tests/vector-network.test.ts tests/scene-clone.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

수동 롤백 절차:
1. `src/advanced/geom/vectorNetwork.ts`에서 `pathDataFromVectorNetwork`, `primaryPathDataFromShape`를 제거한다.
2. `src/advanced/ui/AdvancedEditorView.tsx`에서 `primaryPathDataFromShape` import와 호출을 제거하고 기존 `shape.pathData`/`segments[0]` 참조로 되돌린다.
3. `src/advanced/runtime/renderer.tsx`에서 `primaryPathDataFromShape` import와 호출을 제거하고 기존 `shape.pathData` 참조로 되돌린다.
4. `tests/vector-network.test.ts`의 vectorNetwork-only path 복원 테스트를 제거하거나 이전 상태로 되돌린다.

롤백 후 확인 절차:
1. `AdvancedEditorView.tsx`와 `renderer.tsx`에서 `primaryPathDataFromShape` 참조가 제거되었는지 확인
2. `vectorNetwork.ts`에 fallback helper가 제거되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/vector-network.test.ts`

### C-0020. boolean operand 로컬 기하 trace 보존

목적:
- boolean 결과 path에 operand별 local path, frame, fills를 같이 남겨 later re-edit/export 기준을 강화한다.
- 에디터 boolean 생성과 Figma import boolean 변환이 같은 수준의 trace 밀도를 갖게 맞춘다.

수정 파일:
- `src/advanced/doc/scene.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/lib/figmaToNull.ts`
- `tests/scene-clone.test.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`

추가 파일:
- `src/advanced/geom/booleanTrace.ts`
- `tests/boolean-trace.test.ts`

원본 경로 유지 여부:
- [x] 기존 boolean result path 렌더 경로 유지
- [x] 기존 UI 흐름 유지
- [x] operand trace만 확장

검증 방법:
- `npx vitest run tests/boolean-trace.test.ts tests/scene-clone.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`
- `npx vitest run tests/boolean-trace.test.ts tests/vector-network.test.ts tests/scene-clone.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts tests/prototypePlayback.test.ts tests/stressDoc.test.ts`

수동 롤백 절차:
1. `src/advanced/doc/scene.ts`에서 `BooleanOperandSnapshot`의 `pathData`, `frame`, `fills` 필드를 제거하고 clone 로직을 이전 상태로 되돌린다.
2. `src/advanced/geom/booleanTrace.ts`를 삭제한다.
3. `src/advanced/ui/AdvancedEditorView.tsx`에서 `buildBooleanOperandSnapshotFromNode` import와 호출을 제거하고 기존 `sourceId/name/type`만 저장하도록 되돌린다.
4. `src/lib/figmaToNull.ts`에서 boolean operand snapshot helper를 제거하고 기존 `sourceId/name/type`만 저장하도록 되돌린다.
5. `tests/boolean-trace.test.ts`를 삭제한다.
6. `tests/scene-clone.test.ts`, `tests/figmaToNull.test.ts`, `tests/figmaFileToNull.test.ts`의 operand geometry 관련 기대값을 제거하거나 이전 상태로 되돌린다.

롤백 후 확인 절차:
1. `scene.ts`, `figmaToNull.ts`, `AdvancedEditorView.tsx`에서 operand geometry trace 코드가 제거되었는지 확인
2. `src/advanced/geom/booleanTrace.ts`와 `tests/boolean-trace.test.ts`가 제거되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/scene-clone.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

### C-0021. 에디터 path 미리보기의 vectorNetwork fallback 연결

목적:
- 에디터 내부 path 렌더가 `shape.pathData`만 보지 않고 `primaryPathDataFromShape`를 통해 `vectorNetwork-only` shape도 미리보기 가능하게 만든다.

수정 파일:
- `src/advanced/ui/AdvancedEditorView.tsx`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 pathData 우선 경로 유지
- [x] `vectorNetwork`는 fallback으로만 사용

검증 방법:
- `npx vitest run tests/vector-network.test.ts tests/boolean-trace.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

수동 롤백 절차:
1. `src/advanced/ui/AdvancedEditorView.tsx`의 path 렌더 경로에서 `primaryPathDataFromShape(node.shape)` 호출을 제거하고 기존 `node.shape?.pathData` 참조로 되돌린다.

롤백 후 확인 절차:
1. `AdvancedEditorView.tsx`의 path 렌더 경로가 다시 `shape.pathData`만 참조하는지 확인
2. 아래 테스트 실행
   - `npx vitest run tests/vector-network.test.ts tests/boolean-trace.test.ts`

### C-0022. path edit source 분리와 세그먼트 반영 경로 고정

목적:
- path 편집이 `pathData`, `segments`, `vectorNetwork` 중 어디서 열린 편집인지 추적해서 같은 저장 경로로 되돌려 쓴다.
- `segments`가 있는 shape를 편집해도 `pathData`만 바뀌고 렌더는 그대로인 상태를 막는다.

수정 파일:
- `src/advanced/ui/AdvancedEditorView.tsx`

추가 파일:
- `src/advanced/geom/pathEditShape.ts`
- `tests/path-edit-shape.test.ts`

원본 경로 유지 여부:
- [x] 기존 path edit UI 유지
- [x] 기존 path anchor/handle 드래그 흐름 유지
- [x] 저장 반영 경로만 source-aware하게 변경

검증 방법:
- `npx vitest run tests/path-edit-shape.test.ts tests/vector-network.test.ts tests/boolean-trace.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts`

수동 롤백 절차:
1. `src/advanced/geom/pathEditShape.ts`를 삭제한다.
2. `src/advanced/ui/AdvancedEditorView.tsx`에서 `EditablePathSource`, `resolveEditablePathSource`, `applyEditedPathToShape` import와 호출을 제거한다.
3. `pathEditState`에서 `source` 필드를 제거한다.
4. `commitPathEdit`를 이전 `withDerivedVectorNetwork({ ...node.shape, pathData: ... })` 방식으로 되돌린다.
5. path edit 진입 시 `resolveEditablePathSource` 대신 기존 `primaryPathDataFromShape` 기반 진입으로 되돌린다.
6. `tests/path-edit-shape.test.ts`를 삭제한다.

롤백 후 확인 절차:
1. `AdvancedEditorView.tsx`에서 `pathEditState.source`, `resolveEditablePathSource`, `applyEditedPathToShape` 참조가 제거되었는지 확인
2. `src/advanced/geom/pathEditShape.ts`와 `tests/path-edit-shape.test.ts`가 제거되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/path-edit-shape.test.ts tests/vector-network.test.ts`

### C-0023. multi-segment path edit의 클릭 위치 기반 source 선택

목적:
- 세그먼트가 여러 개인 path를 편집기로 열 때 첫 세그먼트로 고정하지 않고 클릭 위치와 가장 가까운 세그먼트를 선택한다.
- multi-segment 벡터 편집 진입을 Figma식 기대에 더 가깝게 만든다.

수정 파일:
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/advanced/geom/pathEditShape.ts`
- `tests/path-edit-shape.test.ts`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 path tool UI 유지
- [x] 기존 anchor/handle 드래그 흐름 유지
- [x] 편집 진입 시 source 선택 규칙만 강화

검증 방법:
- `npx vitest run tests/path-edit-shape.test.ts tests/vector-network.test.ts tests/boolean-trace.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts`

수동 롤백 절차:
1. `src/advanced/geom/pathEditShape.ts`에서 `resolveEditablePathSourceAtPoint`와 내부 거리 계산 helper를 제거한다.
2. `src/advanced/ui/AdvancedEditorView.tsx`에서 `resolveEditablePathSourceAtPoint` 호출을 제거하고 이전 `resolveEditablePathSource` 기반 진입으로 되돌린다.
3. `tests/path-edit-shape.test.ts`의 nearest segment 선택 테스트를 제거한다.

롤백 후 확인 절차:
1. `AdvancedEditorView.tsx`에서 path edit 진입 시 point-aware source 선택 코드가 제거되었는지 확인
2. `pathEditShape.test.ts`의 관련 테스트가 제거되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/path-edit-shape.test.ts tests/vector-network.test.ts`

### C-0024. vectorNetwork-only multi-path 편집의 materialize 경로 추가

목적:
- `vectorNetwork`만 가진 multi-path shape를 편집할 때 한 path만 수정해도 나머지 path를 잃지 않게 `segments`로 materialize해서 저장한다.
- pathData 하나로 납작하게 덮어쓰지 않고 multi-path 구조를 유지한 채 편집 반영 경로를 만든다.

수정 파일:
- `src/advanced/geom/vectorNetwork.ts`
- `src/advanced/geom/pathEditShape.ts`
- `tests/path-edit-shape.test.ts`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] single-path pathData 저장 경로 유지
- [x] 기존 segment 저장 경로 유지
- [x] vectorNetwork-only multi-path에서만 materialize 경로 추가

검증 방법:
- `npx vitest run tests/path-edit-shape.test.ts tests/vector-network.test.ts tests/boolean-trace.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts`

수동 롤백 절차:
1. `src/advanced/geom/vectorNetwork.ts`에서 `pathDataFromVectorPathId`, `segmentsFromVectorNetwork`를 제거한다.
2. `src/advanced/geom/pathEditShape.ts`에서 `vectorPath` source와 materialize branch를 제거한다.
3. `tests/path-edit-shape.test.ts`의 vectorNetwork-only multi-path materialize 테스트를 제거한다.

롤백 후 확인 절차:
1. `vectorNetwork.ts`와 `pathEditShape.ts`에서 vector path materialize 관련 코드가 제거되었는지 확인
2. `tests/path-edit-shape.test.ts`의 관련 테스트가 제거되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/path-edit-shape.test.ts tests/vector-network.test.ts`

### C-0025. vectorNetwork-only single-path fill trace 보존

목적:
- `vectorNetwork`만 가진 단일 path를 편집할 때 path-level fills를 잃지 않게 single-segment materialize 경로로 보존한다.

수정 파일:
- `src/advanced/geom/pathEditShape.ts`
- `tests/path-edit-shape.test.ts`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 single-path 편집 흐름 유지
- [x] fill trace 보존을 위해 저장 형식만 강화

검증 방법:
- `npx vitest run tests/path-edit-shape.test.ts tests/vector-network.test.ts tests/boolean-trace.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

수동 롤백 절차:
1. `src/advanced/geom/pathEditShape.ts`에서 single `vectorPath` source도 materialize하는 분기를 제거하고 이전 fallback으로 되돌린다.
2. `tests/path-edit-shape.test.ts`의 single-path fill 보존 테스트를 제거한다.

롤백 후 확인 절차:
1. `pathEditShape.ts`에서 single vector path materialize 코드가 제거되었는지 확인
2. `tests/path-edit-shape.test.ts`의 관련 테스트가 제거되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/path-edit-shape.test.ts tests/vector-network.test.ts`

### C-0026. path edit 세션 코어 모듈 분리

목적:
- path 편집의 hit test, 새 점 추가, anchor/handle drag, 기존 path 열기, overlay preview 직렬화를 `AdvancedEditorView.tsx`에서 분리한다.
- 이후 anchor/edge/handle 모델 고도화 작업을 UI 파일 밖에서 빠르게 진행할 수 있게 기반을 만든다.

수정 파일:
- `src/advanced/ui/AdvancedEditorView.tsx`

추가 파일:
- `src/advanced/geom/pathEditSession.ts`
- `tests/path-edit-session.test.ts`

원본 경로 유지 여부:
- [x] 기존 path tool UI 유지
- [x] 기존 단축키/포인터 흐름 유지
- [x] 세션 계산 로직만 별도 모듈로 이동

검증 방법:
- `npx vitest run tests/path-edit-session.test.ts tests/path-edit-shape.test.ts tests/vector-network.test.ts tests/boolean-trace.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts`

수동 롤백 절차:
1. `src/advanced/geom/pathEditSession.ts`를 삭제한다.
2. `src/advanced/ui/AdvancedEditorView.tsx`에서 `pathEditSession` import를 제거한다.
3. path edit 관련 hit test, drag 계산, add-anchor, open-path, preview path 직렬화 로직을 기존 인라인 구현으로 되돌린다.
4. `tests/path-edit-session.test.ts`를 삭제한다.

롤백 후 확인 절차:
1. `AdvancedEditorView.tsx`에서 `pathEditSession` import와 호출이 제거되었는지 확인
2. `src/advanced/geom/pathEditSession.ts`와 `tests/path-edit-session.test.ts`가 제거되었는지 확인
3. 아래 테스트 실행
   - `npx vitest run tests/path-edit-session.test.ts tests/path-edit-shape.test.ts`

### C-0028. vectorNetwork-only commit 유지 + closed endpoint 정규화

목적:
- vectorNetwork-only shape를 편집한 뒤에도 `segments`로 내려앉지 않고 `vectorNetwork`를 source로 유지한다.
- closed path에서 `... L start Z` 형태가 들어와도 duplicate endpoint를 한 번만 보존해 pathData가 불필요하게 늘어나는 문제를 막는다.

수정 파일:
- `src/advanced/geom/pathData.ts`
- `src/advanced/geom/vectorNetwork.ts`
- `src/advanced/geom/pathEditShape.ts`
- `tests/path-edit-shape.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 segment 기반 shape commit 경로 유지
- [x] 기존 vector path fill trace 유지
- [x] vectorNetwork-only 경로에서만 direct vector commit 강화

검증 방법:
- `npx vitest run tests/path-edit-shape.test.ts tests/vector-network.test.ts tests/path-edit-session.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/boolean-trace.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts`

수동 롤백 순서:
1. `src/advanced/geom/pathData.ts`의 closed path duplicate endpoint 정규화 코드를 제거한다.
2. `src/advanced/geom/vectorNetwork.ts`에서 `mergeVectorNetworks` export를 제거한다.
3. `src/advanced/geom/pathEditShape.ts`에서 vectorNetwork direct-commit branch를 제거하고 기존 materialize/segments 경로로 되돌린다.
4. `tests/path-edit-shape.test.ts`의 vectorNetwork-only 기대값을 이전 기준으로 되돌린다.

롤백 후 확인 순서:
1. `pathEditShape.ts`에서 vectorNetwork-only shape edit 후 `segments`를 다시 만드는지 확인
2. `pathData.ts`에서 closed path duplicate endpoint 정규화가 사라졌는지 확인
3. 아래 테스트 재실행
   - `npx vitest run tests/path-edit-shape.test.ts tests/vector-network.test.ts`

### C-0029. path edit selection / keyboard 편집 경로 추가

목적:
- path edit 상태에 selected anchor를 도입해 단순 preview가 아니라 실제 편집 세션으로 끌어올린다.
- Delete/Backspace, Tab, Arrow, O 키로 anchor 삭제/순환/이동/open-close를 처리한다.
- overlay에서 현재 anchor를 명확히 강조해 편집 포커스를 잃지 않게 만든다.

수정 파일:
- `src/advanced/geom/pathEditSession.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/path-edit-session.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 pointer 기반 path edit 진입 유지
- [x] 기존 commit/add/insert 경로 유지
- [x] path edit active 상태에서만 keyboard branch 추가

검증 방법:
- `npx vitest run tests/path-edit-session.test.ts tests/path-edit-shape.test.ts tests/vector-network.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts`

수동 롤백 순서:
1. `src/advanced/geom/pathEditSession.ts`에서 `selectedAnchorIndex`와 selection/delete/nudge/toggle helper를 제거한다.
2. `src/advanced/ui/AdvancedEditorView.tsx`에서 path edit keyboard branch와 selected anchor highlight를 제거한다.
3. `tests/path-edit-session.test.ts`의 selection/delete/nudge/toggle 관련 테스트를 제거한다.
4. `docs/에디터_Figma_통합_실행계획.md`의 해당 체크 항목을 되돌린다.

롤백 후 확인 순서:
1. path edit 상태에서 Delete/Tab/Arrow/O 키가 더 이상 별도 처리되지 않는지 확인
2. overlay에서 selected anchor 강조가 사라졌는지 확인
3. 아래 테스트 재실행
   - `npx vitest run tests/path-edit-session.test.ts tests/path-edit-shape.test.ts`

### C-0030. smooth/corner semantics 정렬 + S/C 토글

목적:
- `isSmooth` 의미를 Figma 기준으로 맞춰 smooth point에서만 opposite handle이 연동되게 만든다.
- cubic path를 열 때 collinear handle을 가진 점은 자동으로 smooth로 추론한다.
- path edit 중 `S/C` 키로 selected anchor를 smooth/corner로 전환할 수 있게 한다.

수정 파일:
- `src/advanced/geom/pathData.ts`
- `src/advanced/geom/pathEditSession.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/path-edit-session.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 path insert / commit / vectorNetwork 경로 유지
- [x] 기존 key 기반 save/tool 전환 유지
- [x] path edit active 상태에서만 `S/C` branch 추가

검증 방법:
- `npx vitest run tests/path-edit-session.test.ts tests/path-edit-shape.test.ts tests/vector-network.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/boolean-trace.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts`

수동 롤백 순서:
1. `src/advanced/geom/pathData.ts`의 smooth inference 코드를 제거한다.
2. `src/advanced/geom/pathEditSession.ts`에서 smooth/corner helper와 drag mirror 조건 변경을 되돌린다.
3. `src/advanced/ui/AdvancedEditorView.tsx`에서 `S/C` keyboard branch와 shortcut 문구를 제거한다.
4. `tests/path-edit-session.test.ts`의 smooth inference/corner/smooth toggle 관련 테스트를 제거한다.
5. `docs/에디터_Figma_통합_실행계획.md`의 해당 체크 항목을 되돌린다.

롤백 후 확인 순서:
1. smooth point와 corner point가 다시 같은 handle drag 동작을 하는지 확인
2. `S/C` 키가 path edit 중 더 이상 별도 처리되지 않는지 확인
3. 아래 테스트 재실행
   - `npx vitest run tests/path-edit-session.test.ts tests/vector-network.test.ts`

### C-0031. open path prepend/append 방향 확장

목적:
- open path에서 새 점을 추가할 때 항상 뒤에만 붙지 않고, selected endpoint에 따라 앞/뒤 양방향으로 확장되게 만든다.
- start endpoint가 선택된 상태에서는 prepend 경로로 새 segment가 붙도록 만들어 Figma pen 흐름에 가깝게 맞춘다.

수정 파일:
- `src/advanced/geom/pathEditSession.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/path-edit-session.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 end-side append 경로 유지
- [x] closed path / segment insert / commit 경로 유지
- [x] open path + selected start endpoint일 때만 prepend 분기 추가

검증 방법:
- `npx vitest run tests/path-edit-session.test.ts tests/path-edit-shape.test.ts tests/vector-network.test.ts`

수동 롤백 순서:
1. `src/advanced/geom/pathEditSession.ts`에서 `addStart.attach`와 prepend branch를 제거한다.
2. `src/advanced/ui/AdvancedEditorView.tsx`에서 `selectedAnchorIndex === 0 ? \"start\" : \"end\"` 분기를 제거한다.
3. `tests/path-edit-session.test.ts`의 prepend add 테스트를 제거한다.
4. `docs/에디터_Figma_통합_실행계획.md`의 해당 체크 항목을 되돌린다.

롤백 후 확인 순서:
1. open path에서 start endpoint를 선택해도 새 점이 다시 끝쪽에만 붙는지 확인
2. `pathEditSession.ts`에서 `attach: \"start\"` 경로가 사라졌는지 확인
3. 아래 테스트 재실행
   - `npx vitest run tests/path-edit-session.test.ts tests/vector-network.test.ts`

### C-0027. path edge hit / point insert / cubic split 연결

목적:
- path tool이 anchor/handle만이 아니라 path edge 자체를 집어서 새 anchor를 넣을 수 있게 만든다.
- line segment와 cubic segment 모두에서 point insert가 가능해야 하고, cubic은 split 이후 handle continuity를 잃지 않아야 한다.
- 삽입 직후 바로 drag로 이어져 Figma식 편집 흐름에 더 가깝게 만든다.

수정 파일:
- `src/advanced/geom/pathEditSession.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/path-edit-session.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 anchor/handle hit 경로 유지
- [x] 기존 path add / open / commit 경로 유지
- [x] edge hit 시에만 insert + drag 분기 추가

검증 방법:
- `npx vitest run tests/path-edit-session.test.ts tests/path-edit-shape.test.ts tests/vector-network.test.ts tests/boolean-trace.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts`

수동 롤백 순서:
1. `src/advanced/geom/pathEditSession.ts`에서 `hitPathSegment`, `insertPathAnchorAtHit`, cubic split helper를 제거한다.
2. `src/advanced/ui/AdvancedEditorView.tsx`에서 path tool의 `segmentHit` 분기를 제거한다.
3. `tests/path-edit-session.test.ts`에서 edge hit / line insert / cubic split 테스트를 제거한다.
4. `docs/에디터_Figma_통합_실행계획.md`의 해당 체크 항목을 되돌린다.

롤백 후 확인 순서:
1. `AdvancedEditorView.tsx`에서 path tool 분기에 `hitPathSegment` 호출이 사라졌는지 확인
2. `pathEditSession.ts`에서 segment insert helper가 사라졌는지 확인
3. 아래 테스트 재실행
   - `npx vitest run tests/path-edit-session.test.ts tests/path-edit-shape.test.ts`

### C-0032. Figma component set / component / instance import 연결

목적:
- Figma `COMPONENT_SET / COMPONENT / INSTANCE`를 NULL의 `component / variants / instanceOf / variantId` 모델에 직접 연결한다.
- standalone component는 default variant root로, component set은 variant roots 묶음으로 보존한다.
- instance는 내부 component container와 selected variant를 함께 가리키게 해서 이후 variant 전환과 roundtrip 기반을 만든다.
- imported instance subtree에도 기본 `sourceId` 링크를 부여해서 이후 override/sync 품질의 기반을 만든다.
- Figma `componentPropertyReferences`를 NULL `propertyDefinitions`로 옮겨 imported instance 속성 패널의 기초를 만든다.

수정 파일:
- `src/lib/figma.ts`
- `src/lib/figmaToNull.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_매핑_표.md`
- `docs/에디터_Figma_import_export_공통_제약표.md`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 frame / section / vector / boolean import 경로 유지
- [x] 기존 image fallback 경로 유지
- [x] component 전용 분기만 `figmaToNull.ts` 내부에 추가

검증 방법:
- `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/vector-network.test.ts tests/path-edit-session.test.ts tests/path-edit-shape.test.ts tests/boolean-trace.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts`

수동 롤백 순서:
1. `src/lib/figma.ts`에서 component 관련 확장 필드를 제거한다.
2. `src/lib/figmaToNull.ts`에서 `buildImportContext`, `collectComponentContentRoot`, `collectImportedComponentNode`와 `collectNodes`의 component 분기를 제거한다.
3. `src/lib/figmaToNull.ts`의 `convertNode`를 기존 `componentId -> toNullId(componentId)` 단순 매핑으로 되돌린다.
4. `tests/figmaToNull.test.ts`, `tests/figmaFileToNull.test.ts`의 component set / standalone component import 테스트를 제거한다.
5. `docs/에디터_Figma_통합_실행계획.md`, `docs/에디터_Figma_매핑_표.md`, `docs/에디터_Figma_import_export_공통_제약표.md`의 해당 체크와 상태를 되돌린다.

롤백 후 확인 순서:
1. component set import 시 `figma_2_0` 같은 component container가 더 이상 생기지 않는지 확인
2. instance import 시 `variantId`가 더 이상 채워지지 않는지 확인
3. 아래 테스트 재실행
   - `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

### C-0033. imported component property value / instance swap override 보강

목적:
- imported instance의 `componentProperties` 값을 실제 NULL instance subtree 상태에 반영한다.
- text/boolean/instance-swap property를 `sourceId` 기반으로 연결해서 imported instance 패널과 실제 상태가 맞도록 만든다.
- `NodeOverrides`에 `instanceOf / variantId / instanceLibraryId`를 넣어 instance swap 차이가 override/reset/push 경로에 남도록 보강한다.
- editor의 instance swap/reset 경로도 variant-aware로 맞춰서 component children 전체를 잘못 복제하던 흐름을 줄인다.

수정 파일:
- `src/advanced/doc/scene.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/lib/figmaToNull.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`
- `tests/scene-clone.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_매핑_표.md`
- `docs/에디터_Figma_import_export_공통_제약표.md`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 text/image/video override 경로 유지
- [x] 기존 component/variant import 경로 유지
- [x] instance swap/property 전용 보강만 추가

검증 방법:
- `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/scene-clone.test.ts tests/vector-network.test.ts tests/path-edit-session.test.ts tests/path-edit-shape.test.ts tests/boolean-trace.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts`
- `npx eslint src/lib/figmaToNull.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/scene-clone.test.ts`

수동 롤백 순서:
1. `src/advanced/doc/scene.ts`의 `NodeOverrides.instanceOf / instanceLibraryId / variantId` 확장을 제거한다.
2. `src/advanced/ui/AdvancedEditorView.tsx`에서 `replaceInstanceComponentInDraft`, variant-aware swap/reset 보강, property instance swap preserveSourceId 분기를 제거한다.
3. `src/lib/figmaToNull.ts`에서 `instancePropertyValues` context, imported property value apply, swapped instance relink helper를 제거한다.
4. `tests/figmaToNull.test.ts`, `tests/figmaFileToNull.test.ts`, `tests/scene-clone.test.ts`의 관련 기대값과 테스트를 제거한다.
5. 계획/매핑/제약 문서의 해당 체크와 상태를 되돌린다.

롤백 후 확인 순서:
1. imported instance의 text/boolean/instance-swap 값이 더 이상 `overrides`에 반영되지 않는지 확인
2. nested instance property source가 swap 후에도 보존되지 않는 이전 상태로 돌아갔는지 확인
3. 아래 테스트 재실행
   - `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/scene-clone.test.ts`

### C-0034. variant axis/value 구조 보존과 clone 경로 보강

목적:
- Figma `variantProperties`를 `variants[].props`로 보존해서 variant 축/값 정보를 문자열 이름 외에도 구조 데이터로 남긴다.
- `cloneDoc`와 editor 내부 `cloneNodeData`가 `variants`와 `propertyDefinitions`를 깊게 복제하도록 보강해서 이후 variant/property 편집이 원본을 오염시키지 않게 만든다.

수정 파일:
- `src/advanced/doc/scene.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/lib/figmaToNull.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`
- `tests/scene-clone.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_매핑_표.md`

추가 파일:
- 없음

원본 경로 유지 여부:
- [x] 기존 variant name 경로 유지
- [x] `variants[].props`만 추가 보존
- [x] clone 경로 보강만 추가

검증 방법:
- `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/scene-clone.test.ts tests/vector-network.test.ts tests/path-edit-session.test.ts tests/path-edit-shape.test.ts tests/boolean-trace.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts`
- `npx eslint src/advanced/doc/scene.ts src/lib/figmaToNull.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/scene-clone.test.ts`

수동 롤백 순서:
1. `src/advanced/doc/scene.ts`의 `ComponentVariant.props`와 `variants/propertyDefinitions` deep clone 보강을 제거한다.
2. `src/advanced/ui/AdvancedEditorView.tsx`의 `cloneNodeData` deep clone 보강을 제거한다.
3. `src/lib/figmaToNull.ts`에서 `variantProps` 저장과 `variants[].props` 주입을 제거한다.
4. 관련 테스트 기대값과 clone 테스트를 제거한다.
5. 계획/매핑 문서의 해당 체크를 되돌린다.

롤백 후 확인 순서:
1. component set import 결과에서 `variants[].props`가 사라졌는지 확인
2. clone 후 variant/propertyDefinitions 수정이 원본에도 전파되는 이전 상태로 돌아갔는지 확인
3. 아래 테스트 재실행
   - `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/scene-clone.test.ts`

### C-0035. variant axis 편집 UI / instance axis 선택 / swap props 매칭

목적:
- `variants[].props`를 문서 모델에만 두지 않고 editor UI에서 실제로 편집할 수 있게 만든다.
- component panel에서 variant axis 추가/삭제와 variant별 axis 값 편집을 지원한다.
- instance panel에서 axis/value 기반 variant 선택을 제공하고, raw `variantId` 선택은 fallback으로 유지한다.
- component swap과 property instance swap 시 현재 axis/value 조합에 가장 가까운 variant를 고르도록 맞춰 Figma식 variant 흐름에 더 가깝게 만든다.
- variant 추가/복제 시에도 기존 axis/value props를 잃지 않게 보강한다.

수정 파일:
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/advanced/ui/componentVariants.ts`
- `tests/component-variants.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_매핑_표.md`
- `docs/에디터_Figma_import_export_공통_제약표.md`

추가 파일:
- `src/advanced/ui/componentVariants.ts`
- `tests/component-variants.test.ts`

원본 경로 유지 여부:
- [x] 기존 raw `variantId` 드롭다운 선택 경로 유지
- [x] 기존 instance/component swap 경로 유지
- [x] 새 axis/value 로직은 helper와 보조 UI로 병행 추가

검증 방법:
- `npx eslint src/advanced/ui/componentVariants.ts tests/component-variants.test.ts`
- `npx eslint src/advanced/ui/AdvancedEditorView.tsx --quiet`
- `npx vitest run tests/component-variants.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/scene-clone.test.ts tests/vector-network.test.ts tests/path-edit-session.test.ts tests/path-edit-shape.test.ts tests/boolean-trace.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts`

수동 롤백 순서:
1. `src/advanced/ui/AdvancedEditorView.tsx`에서 `componentVariants` import와 `selectedComponentVariantAxes`, `instanceVariantAxes`, `selectedInstanceVariantProps`, `resolveVariantIdForComponent`, `setInstanceVariantAxis` 보강을 제거한다.
2. component panel의 variant axis 추가/삭제 UI와 variant별 axis 값 input을 제거한다.
3. instance panel의 axis/value selector와 swap 시 `variantId` 매칭 옵션 주입을 제거하고, 기존 raw variant dropdown / swap 호출만 남긴다.
4. `addComponentVariant`, `duplicateComponentVariant`의 `props` 보존 보강을 제거한다.
5. `src/advanced/ui/componentVariants.ts`와 `tests/component-variants.test.ts`를 제거한다.
6. 계획/매핑/공통 제약 문서의 해당 체크와 설명을 되돌린다.

롤백 후 확인 순서:
1. component panel에서 variant axis UI가 사라졌는지 확인
2. instance panel에서 axis/value selector가 사라지고 raw variant dropdown만 남았는지 확인
3. component swap과 property instance swap이 다시 `variantId` 매칭 없이 기본 경로로만 동작하는지 확인
4. variant 복제 후 `props`가 복사되지 않는 이전 상태로 돌아갔는지 확인
5. 아래 테스트 재실행
   - `npx vitest run tests/component-variants.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

### C-0036. auto-layout inspector 확대 + constraints matrix preset

목적:
- layout panel에서 auto-layout의 `dir / align / gap / gapMode / wrap / padding / includeStrokeInBounds`를 직접 조작할 수 있게 만든다.
- constraints를 단순 3x3 버튼에서 horizontal/vertical mode matrix로 올리고, `scaleX / scaleY`까지 UI에서 제어 가능하게 만든다.
- 제약 프리셋 계산을 helper로 분리해 이후 회귀 없이 재사용할 수 있게 고정한다.

수정 파일:
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/advanced/ui/constraintPresets.ts`
- `tests/constraint-presets.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_매핑_표.md`

추가 파일:
- `src/advanced/ui/constraintPresets.ts`
- `tests/constraint-presets.test.ts`

원본 경로 유지 여부:
- [x] 기존 `applyConstraintPreset`, `updateConstraintFlag`, `clearConstraints` 경로 유지
- [x] 기존 layout section과 raw checkbox 경로 유지
- [x] auto-layout / constraints 계산 자체는 건드리지 않고 inspector 입력 경로만 확장

검증 방법:
- `npx eslint src/advanced/ui/constraintPresets.ts tests/constraint-presets.test.ts`
- `npx eslint src/advanced/ui/AdvancedEditorView.tsx --quiet`
- `npx vitest run tests/constraint-presets.test.ts tests/component-variants.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/scene-clone.test.ts tests/vector-network.test.ts tests/path-edit-session.test.ts tests/path-edit-shape.test.ts tests/boolean-trace.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts`

수동 롤백 순서:
1. `src/advanced/ui/AdvancedEditorView.tsx`에서 `constraintPresets` import와 `horizontalConstraintMode`, `verticalConstraintMode`, `constraintPresetLabel`, `updateAutoLayout`, `updateAutoLayoutPadding`, `setConstraintModes` 보강을 제거한다.
2. layout panel의 auto-layout 상세 제어 block과 constraints matrix UI를 제거하고, 이전의 gap mode 선택과 3x3 preset 버튼만 남긴다.
3. checkbox 목록에서 `scaleX`, `scaleY` 항목을 제거한다.
4. `src/advanced/ui/constraintPresets.ts`와 `tests/constraint-presets.test.ts`를 제거한다.
5. 계획/매핑 문서의 해당 체크와 상태를 되돌린다.

롤백 후 확인 순서:
1. layout panel에서 auto-layout 상세 제어가 사라지고 최소 토글/gap mode 상태로 돌아갔는지 확인
2. constraints section이 다시 3x3 preset 버튼 중심으로 돌아갔는지 확인
3. `scaleX`, `scaleY`를 UI에서 더 이상 직접 토글할 수 없는지 확인
4. 아래 테스트 재실행
   - `npx vitest run tests/constraint-presets.test.ts tests/editor-resize.test.ts`

### C-0037. auto-layout justify / wrap spacing / Figma import fidelity 보강

목적:
- auto-layout inspector에서 `justify`, `wrapGap`, `wrapAlign`까지 직접 조작하게 해 Figma의 main-axis / wrapped line 제어에 더 가깝게 만든다.
- auto-layout engine이 `justify`와 wrapped line spacing/alignment를 실제로 반영하도록 맞춘다.
- Figma import에서 `layoutSizingHorizontal/Vertical`, min/max, `primaryAxisAlignItems`, `counterAxisSpacing`, `strokesIncludedInLayout`를 NULL 모델로 더 정확히 가져오게 만든다.
- `figmaNodesToNullDoc`뿐 아니라 `figmaFileToNullDoc` 경로까지 같은 fidelity를 회귀 테스트로 고정한다.

수정 파일:
- `src/advanced/doc/scene.ts`
- `src/advanced/ui/AdvancedEditor.constants.ts`
- `src/advanced/layout/engine.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/lib/figma.ts`
- `src/lib/figmaToNull.ts`
- `tests/layout.test.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_매핑_표.md`
- `docs/에디터_Figma_import_export_공통_제약표.md`

원본 경로 유지 여부:
- [x] 기존 auto-layout inspector block 유지
- [x] 기존 `updateAutoLayout` 진입점 유지
- [x] 기존 `figmaNodesToNullDoc` / `figmaFileToNullDoc` 경로 유지
- [x] 기존 layout engine entry 유지

검증 방법:
- `npx eslint src/advanced/layout/engine.ts src/lib/figma.ts src/lib/figmaToNull.ts tests/layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`
- `npx eslint src/advanced/ui/AdvancedEditorView.tsx --quiet`
- `npx vitest run tests/layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/constraint-presets.test.ts tests/component-variants.test.ts tests/scene-clone.test.ts tests/vector-network.test.ts tests/path-edit-session.test.ts tests/path-edit-shape.test.ts tests/boolean-trace.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts`

수동 롤백 순서:
1. `src/advanced/doc/scene.ts`와 `src/advanced/ui/AdvancedEditor.constants.ts`에서 `justify`, `wrapGap`, `wrapAlign` 필드 추가를 제거한다.
2. `src/advanced/layout/engine.ts`에서 auto-layout `justify`/wrapped line spacing 계산 보강을 제거하고 이전 gap 기반 경로로 되돌린다.
3. `src/advanced/ui/AdvancedEditorView.tsx`에서 `justify`, `wrapGap`, `wrapAlign` UI와 gapMode/justify 동기화, auto-layout child 안내 문구를 제거한다.
4. `src/lib/figma.ts`와 `src/lib/figmaToNull.ts`에서 auto-layout sizing/import 확장 필드와 대응 로직을 제거한다.
5. `tests/layout.test.ts`, `tests/figmaToNull.test.ts`, `tests/figmaFileToNull.test.ts`의 신규 회귀 케이스를 제거한다.
6. 계획/매핑/공통 제약 문서의 해당 체크와 설명을 되돌린다.

롤백 후 확인 순서:
1. layout panel에서 `justify`, `wrapGap`, `wrapAlign` 제어가 사라졌는지 확인
2. Figma auto-layout import 결과에서 `justify`, `wrapGap`, `includeStrokeInBounds`, min/max sizing이 빠졌는지 확인
3. 아래 테스트 재실행
   - `npx vitest run tests/layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

### C-0038. Figma text auto-resize / line-height ratio import 보강

목적:
- Figma text import가 `wrap: true / autoSize: false`로 고정되던 상태를 벗어나 `textAutoResize`에 맞는 text box 동작으로 더 가깝게 맞춘다.
- `lineHeightPx`만 보던 경로를 `lineHeightPercentFontSize` / `lineHeightPercent`까지 읽도록 올려 text line-height fidelity를 높인다.
- file import 경로까지 동일한 텍스트 fidelity를 회귀 테스트로 고정한다.

수정 파일:
- `src/lib/figma.ts`
- `src/lib/figmaToNull.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_매핑_표.md`
- `docs/에디터_Figma_import_export_공통_제약표.md`

원본 경로 유지 여부:
- [x] 기존 text import 진입점 유지
- [x] 기존 `convertTextStyle` 경로 유지
- [x] 기존 `figmaNodesToNullDoc` / `figmaFileToNullDoc` 경로 유지

검증 방법:
- `npx eslint src/lib/figma.ts src/lib/figmaToNull.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`
- `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

수동 롤백 순서:
1. `src/lib/figma.ts`에서 `textAutoResize`, `lineHeightPercentFontSize`, `lineHeightUnit` 필드를 제거한다.
2. `src/lib/figmaToNull.ts`에서 `convertTextBoxBehavior` helper와 line-height ratio 보강을 제거한다.
3. text node import를 다시 `wrap: true`, `autoSize: false` 고정 경로로 되돌린다.
4. `tests/figmaToNull.test.ts`, `tests/figmaFileToNull.test.ts`의 텍스트 auto-resize 회귀 케이스를 제거한다.
5. 계획/매핑/공통 제약 문서의 해당 체크와 상태를 되돌린다.

롤백 후 확인 순서:
1. imported text node가 다시 항상 `wrap: true`, `autoSize: false`로 들어오는지 확인
2. `lineHeightPercentFontSize` / `lineHeightPercent` 입력이 1.4 fallback으로 돌아가는지 확인
3. 아래 테스트 재실행
   - `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

### C-0039. auto-layout clamp / wrap hug 엔진 보정 + parent auto-layout child sizing import

목적:
- auto-layout에서 fixed/fill item이 min/max clamp된 실제 크기로 다음 아이템을 밀어내게 만들어 겹침을 막는다.
- wrapped auto-layout container가 hug sizing일 때 줄 수와 `wrapGap`를 반영해 실제 높이/너비를 다시 계산하게 만든다.
- Figma import에서 child가 `layoutSizingHorizontal/Vertical` 없이 `layoutGrow/layoutAlign`만 가진 경우도 parent auto-layout 방향을 기준으로 `fill` sizing을 복원한다.

수정 파일:
- `src/advanced/layout/engine.ts`
- `src/lib/figmaToNull.ts`
- `tests/layout.test.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_매핑_표.md`
- `docs/에디터_Figma_import_export_공통_제약표.md`

원본 경로 유지 여부:
- [x] 기존 `layoutDoc -> layoutNode -> applyAutoLayout/applyAutoLayoutHug` 진입 유지
- [x] 기존 `figmaNodesToNullDoc` / `figmaFileToNullDoc` 진입 유지
- [x] 기존 explicit `layoutSizingHorizontal/Vertical` import 우선순위 유지

검증 방법:
- `npx eslint src/advanced/layout/engine.ts src/lib/figmaToNull.ts tests/layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`
- `npx vitest run tests/layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/constraint-presets.test.ts tests/component-variants.test.ts tests/scene-clone.test.ts tests/vector-network.test.ts tests/path-edit-session.test.ts tests/path-edit-shape.test.ts tests/boolean-trace.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts`

수동 롤백 순서:
1. `src/advanced/layout/engine.ts`에서 auto-layout helper(`clampBy`, line builder, hug 측정 보강)를 제거하고 이전 inline 계산으로 되돌린다.
2. fixed/fill item의 actual clamped size로 `mainOffset`을 누적하던 경로를 제거한다.
3. wrapped auto-layout의 hug sizing 계산 보강을 제거하고 `layout.wrap`에서 바로 빠져나가던 이전 상태로 되돌린다.
4. `src/lib/figmaToNull.ts`에서 `convertLayoutSizing`의 parent auto-layout fallback 로직과 parent Figma node 전달 경로를 제거한다.
5. `tests/layout.test.ts`, `tests/figmaToNull.test.ts`, `tests/figmaFileToNull.test.ts`의 신규 회귀 케이스를 제거한다.
6. 계획/매핑/공통 제약 문서의 해당 체크와 설명을 되돌린다.

롤백 후 확인 순서:
1. fixed/fill item clamp 시 뒤 아이템이 다시 겹치는 이전 상태로 돌아갔는지 확인
2. wrapped auto-layout container의 hug height/width가 다시 갱신되지 않는지 확인
3. Figma child node의 `layoutGrow/layoutAlign`만으로는 `fill` sizing이 복원되지 않는지 확인
4. 아래 테스트 재실행
   - `npx vitest run tests/layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

### C-0040. text justify / baseline / hug sizing 보정

목적:
- Figma `JUSTIFIED` text alignment를 NULL `justify` 정렬로 가져오고 editor/runtime에서 같은 방식으로 렌더한다.
- text baseline 정렬을 box 비율 추정이 아니라 text metric 기반으로 올려 auto-layout baseline fidelity를 높인다.
- editor/runtime/auto-size가 공통 text layout helper를 사용하게 해 반복 공백 줄바꿈과 hug sizing 반응을 맞춘다.
- Figma `WIDTH_AND_HEIGHT/HEIGHT` textAutoResize를 `layoutSizing hug` 의미까지 추적해 text box 동작을 더 가깝게 맞춘다.

수정 파일:
- `src/advanced/geom/textLayout.ts`
- `src/advanced/layout/engine.ts`
- `src/advanced/runtime/renderer.tsx`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/lib/figmaToNull.ts`
- `tests/text-layout.test.ts`
- `tests/layout.test.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_매핑_표.md`
- `docs/에디터_Figma_import_export_공통_제약표.md`

원본 경로 유지 여부:
- [x] 기존 text render 진입점 유지
- [x] 기존 auto-layout / Figma import 진입점 유지
- [x] 기존 UI 구조 유지

검증 방법:
- `npx eslint src/advanced/geom/textLayout.ts src/advanced/layout/engine.ts src/advanced/runtime/renderer.tsx src/advanced/ui/AdvancedEditorView.tsx src/lib/figmaToNull.ts tests/text-layout.test.ts tests/layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`
- `npx vitest run tests/text-layout.test.ts tests/layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

수동 롤백 순서:
1. `src/advanced/geom/textLayout.ts`를 제거한다.
2. `src/advanced/runtime/renderer.tsx`와 `src/advanced/ui/AdvancedEditorView.tsx`를 기존 inline text measure/wrap 경로로 되돌린다.
3. `src/advanced/layout/engine.ts`의 baseline offset 계산을 기존 box ratio 방식으로 되돌린다.
4. `src/advanced/ui/AdvancedEditorView.tsx`의 text hug sizing 재계산 경로를 제거한다.
5. `src/lib/figmaToNull.ts`의 `textAutoResize -> layoutSizing hug` 추적을 제거한다.
6. `tests/text-layout.test.ts`와 이번 배치에서 추가한 figma/layout 기대값을 제거한다.
7. 계획/매핑/공통 제약 문서의 이번 체크와 설명을 되돌린다.

롤백 후 확인 순서:
1. justified text가 다시 일반 SVG text 경로로만 렌더되는지 확인
2. auto-layout baseline이 다시 box ratio 방식으로 정렬되는지 확인
3. wrapped text에서 반복 공백이 다시 collapse되는지 확인
4. imported Figma `HEIGHT/WIDTH_AND_HEIGHT` text가 더 이상 `layoutSizing hug`로 추적되지 않는지 확인
5. 아래 테스트를 다시 실행
   - `npx vitest run tests/text-layout.test.ts tests/layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

### C-0041. nested overflow viewport 축 보정 + frame/section/component parity 고정

목적:
- auto-layout scroll container가 scroll 축에서 `hug` sizing 때문에 내용 크기까지 커져 overflow가 사라지는 문제를 막는다.
- vertical/horizontal overflow가 있는 container는 scroll 축을 viewport로 유지하고 cross-axis만 hug 되도록 맞춘다.
- frame / section / component가 같은 auto-layout 수학을 쓰는지 회귀 테스트로 고정한다.

수정 파일:
- `src/advanced/layout/engine.ts`
- `tests/layout.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_매핑_표.md`

원본 경로 유지 여부:
- [x] 기존 `layoutDoc -> layoutNode -> applyAutoLayout/applyAutoLayoutHug` 진입 유지
- [x] UI 구조 변경 없음
- [x] 기존 overflow model(`overflowScrolling`) 유지

검증 방법:
- `npx eslint src/advanced/layout/engine.ts tests/layout.test.ts`
- `npx vitest run tests/layout.test.ts`

수동 롤백 순서:
1. `src/advanced/layout/engine.ts`에서 `suppressHugForOverflowAxis` helper를 제거한다.
2. `applyAutoLayoutHug`의 width/height hug 판정을 다시 `layoutSizing === "hug"` 단순 조건으로 되돌린다.
3. `tests/layout.test.ts`의 vertical overflow viewport, horizontal overflow viewport, frame/section/component parity 케이스를 제거한다.
4. 계획/매핑 문서의 이번 체크와 설명을 되돌린다.

롤백 후 확인 순서:
1. vertical overflow auto-layout container가 다시 height hug로 내용 높이만큼 늘어나는지 확인
2. horizontal overflow auto-layout container가 다시 width hug로 내용 너비만큼 늘어나는지 확인
3. 아래 테스트를 다시 실행
   - `npx vitest run tests/layout.test.ts`

### C-0042. Figma shared style metadata import 기초

목적:
- Figma shared fill/stroke/text style ID를 NULL `styles` token과 node ref(`fillStyleId`, `strokeStyleId`, `styleRef`)로 가져온다.
- figma file import 경로에서 top-level style metadata 이름을 재사용해 Dev/inspect가 style 이름을 바로 보여줄 수 있게 만든다.

수정 파일:
- `src/lib/figma.ts`
- `src/lib/figmaToNull.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_매핑_표.md`
- `docs/에디터_Figma_import_export_공통_제약표.md`

원본 경로 유지 여부:
- [x] 기존 `figmaNodesToNullDoc` / `figmaFileToNullDoc` 진입 유지
- [x] 기존 node style model 유지
- [x] 기존 UI 구조 변경 없음

검증 방법:
- `npx eslint src/lib/figma.ts src/lib/figmaToNull.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`
- `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

수동 롤백 순서:
1. `src/lib/figma.ts`에서 `FigmaStyleMeta`, `FigmaNode.styles`, `FigmaFileResponse.styles` 필드를 제거한다.
2. `src/lib/figmaToNull.ts`의 imported style token helper와 context `styleTokens/styleMeta`를 제거한다.
3. `convertNode`에서 fill/stroke/effect/text style ref를 등록하는 경로를 제거한다.
4. `figmaNodesToNullDoc`의 `styles` 채움과 `figmaFileToNullDoc`의 `figmaStyles` 전달을 제거한다.
5. `tests/figmaToNull.test.ts`, `tests/figmaFileToNull.test.ts`의 shared style import 케이스를 제거한다.
6. 계획/매핑/공통 제약 문서의 이번 체크와 설명을 되돌린다.

롤백 후 확인 순서:
1. imported node의 `fillStyleId`, `strokeStyleId`, `styleRef`가 다시 비어 있는지 확인
2. imported doc의 `styles` 배열이 다시 비어 있는지 확인
3. 아래 테스트를 다시 실행
   - `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

### C-0043. Figma local variables / modes / fill binding import 기초

목적:
- Figma `/files/:file_key/variables/local`의 local variable collection / mode / value를 NULL `variables`, `variableModes`, `variableMode`로 가져온다.
- color variable alias를 실제 색 값으로 flatten해서 import하고, node fill binding을 NULL `fillRef`로 연결한다.
- `figmaFileToNullDoc`가 node/file import 경로 어디서든 변수 endpoint를 병렬로 가져오되, 실패해도 기존 import는 계속 진행하게 만든다.

수정 파일:
- `src/lib/figma.ts`
- `src/lib/figmaToNull.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_매핑_표.md`
- `docs/에디터_Figma_import_export_공통_제약표.md`

원본 경로 유지 여부:
- [x] 기존 `figmaNodesToNullDoc` / `figmaFileToNullDoc` 진입 유지
- [x] 기존 style import / image fallback / component import 경로 유지
- [x] UI 구조 변경 없음

검증 방법:
- `npx eslint src/lib/figma.ts src/lib/figmaToNull.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`
- `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`
- `npx vitest run tests/text-layout.test.ts tests/layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/vector-network.test.ts tests/path-edit-session.test.ts tests/path-edit-shape.test.ts tests/boolean-trace.test.ts tests/component-variants.test.ts tests/constraint-presets.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts tests/scene-clone.test.ts`
- `npx next build`

수동 롤백 순서:
1. `src/lib/figma.ts`에서 variable alias / local variables 타입과 `getLocalVariables`를 제거한다.
2. `src/lib/figmaToNull.ts`에서 imported variable helper, variable context, fill binding 경로를 제거한다.
3. `figmaNodesToNullDoc`의 `variables`, `variableModes`, `variableMode`를 기존 기본값으로 되돌린다.
4. `figmaFileToNullDoc`의 `getLocalVariables` 병렬 로드와 option 전달을 제거한다.
5. `tests/figmaToNull.test.ts`, `tests/figmaFileToNull.test.ts`에서 local variable / fill binding 케이스와 fetch stub을 제거한다.
6. 계획/매핑/공통 제약 문서에서 이번 체크와 설명을 되돌린다.

롤백 후 확인 순서:
1. imported doc의 `variables`가 다시 비어 있고 `variableModes`가 기본값만 가지는지 확인
2. imported node의 `style.fillRef`가 다시 비어 있는지 확인
3. 원래 테스트를 다시 실행
   - `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`

### C-0044. textCase-aware measurement + advanced text style import + auto-layout child constraint rule

목적:
- text measurement/wrap이 실제 렌더와 같은 `textCase` transform을 기준으로 동작하게 고정한다.
- Figma text import에서 `fontFeatureSettings`, `fontVariationSettings`를 보존한다.
- auto-layout 자식은 constraints 편집이 비활성화되고 sizing 규칙이 우선이라는 점을 guard + UI 안내로 명시한다.

수정 파일:
- `src/advanced/geom/textLayout.ts`
- `src/lib/figma.ts`
- `src/lib/figmaToNull.ts`
- `src/advanced/ui/constraintPresets.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/text-layout.test.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`
- `tests/constraint-presets.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_매핑_표.md`
- `docs/에디터_Figma_롤백_가이드.md`

검증 방법:
- `npx eslint src/advanced/geom/textLayout.ts src/lib/figma.ts src/lib/figmaToNull.ts src/advanced/ui/constraintPresets.ts src/advanced/ui/AdvancedEditorView.tsx tests/text-layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/constraint-presets.test.ts --quiet`
- `npx vitest run tests/text-layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/constraint-presets.test.ts`
- `npx vitest run tests/text-layout.test.ts tests/layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/vector-network.test.ts tests/path-edit-session.test.ts tests/path-edit-shape.test.ts tests/boolean-trace.test.ts tests/component-variants.test.ts tests/constraint-presets.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts tests/scene-clone.test.ts`
- `npx next build`

수동 롤백 순서:
1. `src/advanced/geom/textLayout.ts`에서 textCase-aware 측정 경로를 제거한다.
2. `src/lib/figma.ts`, `src/lib/figmaToNull.ts`에서 `fontFeatureSettings`, `fontVariationSettings` import 경로를 제거한다.
3. `src/advanced/ui/constraintPresets.ts`, `src/advanced/ui/AdvancedEditorView.tsx`에서 auto-layout child constraints 비활성 규칙과 안내 문구를 제거한다.
4. 관련 테스트와 계획 문서 체크를 되돌린다.

롤백 후 확인:
1. 줄바꿈이 다시 raw text 기준으로만 계산되는지 확인한다.
2. imported text style에서 advanced font settings가 비워지는지 확인한다.
3. auto-layout 자식에서 constraints 편집 guard와 안내가 사라졌는지 확인한다.
4. 위 검증 명령을 다시 실행한다.

### C-0045. stroke variable binding + effect style token import + text metrics/kerning 보정

목적:
- Figma color variable binding을 fill뿐 아니라 stroke까지 `strokeRef`로 가져온다.
- Figma shared effect style metadata를 NULL `effectStyleId` / effect token으로 고정한다.
- text metric이 canvas ascent/descent를 우선 사용하도록 보정하고 editor/runtime에서 kerning을 기본 활성화한다.

수정 파일:
- `src/advanced/doc/scene.ts`
- `src/lib/figma.ts`
- `src/lib/figmaToNull.ts`
- `src/advanced/geom/textLayout.ts`
- `src/advanced/runtime/renderer.tsx`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/text-layout.test.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_매핑_표.md`
- `docs/에디터_Figma_import_export_공통_제약표.md`
- `docs/에디터_Figma_롤백_가이드.md`

검증 방법:
- `npx eslint src/advanced/doc/scene.ts src/lib/figma.ts src/lib/figmaToNull.ts src/advanced/geom/textLayout.ts src/advanced/runtime/renderer.tsx src/advanced/ui/AdvancedEditorView.tsx tests/text-layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts --quiet`
- `npx vitest run tests/text-layout.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/layout.test.ts tests/constraint-presets.test.ts tests/component-variants.test.ts tests/vector-network.test.ts tests/path-edit-session.test.ts tests/path-edit-shape.test.ts tests/boolean-trace.test.ts tests/editor-drag.test.ts tests/editor-resize.test.ts tests/scene-clone.test.ts`
- `npx next build`

수동 롤백 순서:
1. `src/advanced/doc/scene.ts`에서 `strokeRef` 필드를 제거한다.
2. `src/lib/figma.ts`, `src/lib/figmaToNull.ts`에서 stroke variable binding / effect style import 경로를 제거한다.
3. `src/advanced/runtime/renderer.tsx`, `src/advanced/ui/AdvancedEditorView.tsx`에서 `strokeRef` 해석과 kerning/style 반영을 제거한다.
4. `src/advanced/geom/textLayout.ts`에서 canvas ascent/descent 보정 경로를 제거한다.
5. 관련 테스트와 문서 체크를 되돌린다.

롤백 후 확인:
1. imported node에 `style.strokeRef`가 더 이상 채워지지 않는지 확인한다.
2. imported effect style이 `effectStyleId` / effect token으로 남지 않는지 확인한다.
3. text baseline 측정이 다시 fallback ratio만 사용하는지 확인한다.
4. editor/runtime text style에서 kerning 기본 적용이 빠졌는지 확인한다.
5. 위 검증 명령을 다시 실행한다.

## 5. 앞으로의 기록 규칙

다음 변경부터는 반드시 아래를 같이 갱신한다.

- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_롤백_가이드.md`

즉:
- 작업을 시작하면 계획서 체크 상태를 갱신한다.
- 작업이 끝나면 롤백 문서에 변경 단위를 추가한다.
- 둘 중 하나라도 빠지면 완료로 간주하지 않는다.
### C-0046. component property 정규화 + variant matrix 진단/auto-fill

목적:
- component property 이름 충돌을 정규화하고 kind 호환성 guard를 추가한다.
- variant matrix의 누락/중복 조합을 진단하고 missing variant를 자동 생성할 수 있게 만든다.

수정 파일:
- `src/advanced/ui/componentVariants.ts`
- `src/advanced/ui/componentProperties.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/component-variants.test.ts`
- `tests/component-properties.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_롤백_가이드.md`

검증 방법:
- `npx eslint src/advanced/ui/AdvancedEditorView.tsx src/advanced/ui/componentVariants.ts src/advanced/ui/componentProperties.ts tests/component-variants.test.ts tests/component-properties.test.ts --quiet`
- `npx vitest run tests/component-variants.test.ts tests/component-properties.test.ts`

수동 롤백 순서:
1. `src/advanced/ui/componentProperties.ts`를 제거하고 import/use 지점을 되돌린다.
2. `src/advanced/ui/componentVariants.ts`에서 matrix 진단 / fill helper를 제거한다.
3. `src/advanced/ui/AdvancedEditorView.tsx`에서 component property normalize button, variant diagnostics, missing variant auto-fill 경로를 제거한다.
4. 관련 테스트와 계획 문서 체크를 되돌린다.

롤백 후 확인:
1. component property 이름 자동 정규화가 더 이상 실행되지 않는지 확인한다.
2. variant panel에서 missing/duplicate 진단과 auto-fill 버튼이 사라졌는지 확인한다.
3. `npx vitest run tests/component-variants.test.ts tests/component-properties.test.ts`를 다시 실행한다.

### C-0047. dev inspect/codegen + export naming/batch manifest

목적:
- dev inspect에 quick spec, React style, JSX, Tailwind codegen을 추가한다.
- export naming을 범위/페이지/선택 기준으로 deterministic하게 만들고 batch manifest를 내보낼 수 있게 한다.

수정 파일:
- `src/advanced/ui/devCodegen.ts`
- `src/advanced/ui/exportPipeline.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/dev-codegen.test.ts`
- `tests/export-pipeline.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_롤백_가이드.md`

검증 방법:
- `npx eslint src/advanced/ui/AdvancedEditorView.tsx src/advanced/ui/devCodegen.ts src/advanced/ui/exportPipeline.ts tests/dev-codegen.test.ts tests/export-pipeline.test.ts --quiet`
- `npx vitest run tests/dev-codegen.test.ts tests/export-pipeline.test.ts`
- `npx next build`

수동 롤백 순서:
1. `src/advanced/ui/devCodegen.ts`, `src/advanced/ui/exportPipeline.ts`를 제거하고 import/use 지점을 되돌린다.
2. `src/advanced/ui/AdvancedEditorView.tsx`에서 quick spec / codegen textarea, manifest export 버튼, scoped export naming 경로를 제거한다.
3. 관련 테스트와 계획 문서 체크를 되돌린다.

롤백 후 확인:
1. dev panel에서 quick spec / React style / JSX / Tailwind codegen 블록이 사라졌는지 확인한다.
2. export 버튼이 기존 이름 규칙으로 돌아갔는지 확인한다.
3. `npx vitest run tests/dev-codegen.test.ts tests/export-pipeline.test.ts`와 `npx next build`를 다시 실행한다.
### C-0048. token roundtrip helper 연결

목적:
- token export/import를 단순 ID merge에서 semantic key 기반 roundtrip으로 올린다.
- style/variable/mode import 시 node ref를 보존하거나 정리하는 기준을 고정한다.

수정 파일:
- `src/advanced/ui/tokenRoundtrip.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/token-roundtrip.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_매핑_표.md`
- `docs/에디터_Figma_import_export_공통_제약표.md`
- `docs/에디터_Figma_롤백_가이드.md`

검증 방법:
- `npx eslint src/advanced/ui/tokenRoundtrip.ts src/advanced/ui/AdvancedEditorView.tsx tests/token-roundtrip.test.ts --quiet`
- `npx vitest run tests/token-roundtrip.test.ts`

수동 롤백 순서:
1. `src/advanced/ui/AdvancedEditorView.tsx`에서 token export/import 경로를 기존 직접 merge/replace 구현으로 되돌린다.
2. `src/advanced/ui/tokenRoundtrip.ts` import/use를 제거한다.
3. `tests/token-roundtrip.test.ts`를 제거한다.
4. 계획/매핑/제약 문서 체크를 되돌린다.

롤백 후 확인:
1. token import가 다시 ID 기준 merge/replace만 수행하는지 확인한다.
2. `npx vitest run tests/token-roundtrip.test.ts`가 제거되거나 더 이상 요구되지 않는지 확인한다.

### C-0049. representative fixture + parity harness + 검증 기준 문서

목적:
- 고위험 에디터 작업에 공통으로 쓰는 representative fixture와 parity harness를 고정한다.
- roundtrip / shadow module / quality gate 기준을 별도 문서로 분리한다.

수정 파일:
- `tests/figma-fixtures.ts`
- `tests/doc-parity.ts`
- `tests/doc-parity.test.ts`
- `docs/에디터_Figma_검증_기준.md`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_롤백_가이드.md`

검증 방법:
- `npx eslint tests/figma-fixtures.ts tests/doc-parity.ts tests/doc-parity.test.ts --quiet`
- `npx vitest run tests/doc-parity.test.ts`

수동 롤백 순서:
1. `tests/figma-fixtures.ts`, `tests/doc-parity.ts`, `tests/doc-parity.test.ts`를 제거한다.
2. `docs/에디터_Figma_검증_기준.md`를 제거한다.
3. 계획 문서의 fixture/parity/기준 관련 체크를 되돌린다.

롤백 후 확인:
1. representative fixture와 parity harness가 더 이상 테스트에서 참조되지 않는지 확인한다.
2. `npx vitest run tests/doc-parity.test.ts`가 제거되거나 더 이상 요구되지 않는지 확인한다.
### C-0050. prototype flow helper + overlay presentation + smart animate matching

목적:
- prototype 편집기를 interaction summary, diagnostics, duplicate 흐름으로 정리한다.
- overlay action의 position/size/dim을 실제 런타임에 반영한다.
- smart transition을 매칭 기반 전환으로 올리고 flow diagnostics를 추가한다.

수정 파일:
- `src/advanced/prototype/prototypeFlow.ts`
- `src/advanced/prototype/prototypeMotion.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/advanced/runtime/player.tsx`
- `tests/prototype-flow.test.ts`
- `tests/prototype-motion.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_매핑_표.md`
- `docs/에디터_Figma_import_export_공통_제약표.md`
- `docs/에디터_Figma_롤백_가이드.md`

검증 방법:
- `npx eslint src/advanced/prototype/prototypeFlow.ts src/advanced/prototype/prototypeMotion.ts src/advanced/ui/AdvancedEditorView.tsx src/advanced/runtime/player.tsx tests/prototype-flow.test.ts tests/prototype-motion.test.ts --quiet`
- `npx vitest run tests/prototype-flow.test.ts tests/prototype-motion.test.ts tests/prototypePlayback.test.ts`
- `npx next build`

수동 롤백 순서:
1. `src/advanced/ui/AdvancedEditorView.tsx`에서 prototype summary/diagnostic/duplicate/overlay control UI를 제거한다.
2. `src/advanced/runtime/player.tsx`에서 overlay presentation, overlay entry stack, smart matching transition 경로를 제거한다.
3. `src/advanced/prototype/prototypeFlow.ts`, `src/advanced/prototype/prototypeMotion.ts` import/use를 제거한다.
4. `tests/prototype-flow.test.ts`, `tests/prototype-motion.test.ts`를 제거한다.
5. 계획/매핑/제약 문서 체크를 되돌린다.

롤백 후 확인:
1. prototype panel이 기존 단순 interaction 편집 상태로 돌아갔는지 확인한다.
2. overlay가 다시 전체 화면 단일 dim/fade 수준으로 동작하는지 확인한다.
3. smart transition이 다시 매칭 없는 fade 수준으로 돌아가는지 확인한다.
### C-0051. smart guide distance + rotation precision + text wrap + rendered fixture regression

목적:
- drag/dev guide가 같은 distance guide 계산을 쓰도록 고정한다.
- geometry rotation input을 0.1도 단위 normalize 규칙으로 올린다.
- text wrap에 punctuation-aware / CJK guard를 넣는다.
- representative fixture renderer snapshot regression을 추가한다.

수정 파일:
- `src/advanced/ui/AdvancedEditor.drag.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/advanced/ui/rotationMath.ts`
- `src/advanced/geom/textLayout.ts`
- `src/advanced/runtime/renderer.tsx`
- `tests/editor-drag.test.ts`
- `tests/rotation-math.test.ts`
- `tests/text-layout.test.ts`
- `tests/runtime-renderer-fixtures.test.tsx`
- `tests/__snapshots__/runtime-renderer-fixtures.test.tsx.snap`
- `docs/에디터_Figma_검증_기준.md`
- `docs/에디터_Figma_매핑_표.md`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_text_on_path_설계.md`
- `docs/에디터_Figma_롤백_가이드.md`

검증 방법:
- `npx eslint src/advanced/ui/AdvancedEditor.drag.ts src/advanced/ui/AdvancedEditorView.tsx src/advanced/ui/rotationMath.ts src/advanced/geom/textLayout.ts src/advanced/runtime/renderer.tsx tests/editor-drag.test.ts tests/rotation-math.test.ts tests/text-layout.test.ts tests/runtime-renderer-fixtures.test.tsx tests/runtime-renderer.test.tsx --quiet`
- `npx vitest run tests/editor-drag.test.ts tests/rotation-math.test.ts tests/text-layout.test.ts tests/runtime-renderer-fixtures.test.tsx tests/runtime-renderer.test.tsx tests/layout.test.ts`
- `npx next build`

수동 롤백 순서:
1. `src/advanced/ui/rotationMath.ts` import/use를 제거하고 geometry rotation input을 기존 정수 입력으로 되돌린다.
2. `src/advanced/ui/AdvancedEditor.drag.ts`의 distance guide 계산과 `src/advanced/ui/AdvancedEditorView.tsx`의 activeSmartGuides/rendered guide overlay를 제거한다.
3. `src/advanced/geom/textLayout.ts`의 punctuation-aware wrap 로직을 제거해 기존 token wrap으로 되돌린다.
4. `src/advanced/runtime/renderer.tsx`의 `pickStroke(..., variableRuntime)` 전달만 제거해 이전 상태로 되돌린다.
5. `tests/runtime-renderer-fixtures.test.tsx`, `tests/__snapshots__/runtime-renderer-fixtures.test.tsx.snap`, `tests/rotation-math.test.ts`를 제거한다.
6. 계획/검증/매핑/text-on-path 문서 체크를 되돌린다.

롤백 후 확인:
1. drag 중 distance label과 resize size badge가 더 이상 렌더되지 않는지 확인한다.
2. geometry rotation input이 다시 정수 단위로만 반응하는지 확인한다.
3. `tests/runtime-renderer.test.tsx`가 기존 상태로만 유지되는지 확인한다.
### C-0052. vector edit model + figma import fidelity 분리 + figma import roundtrip

목적:
- pathData 중심 편집 흐름을 `vectorNetwork` 기준 편집 모델로 한 단계 올린다.
- boolean operand snapshot이 editable vector state를 잃지 않도록 고정한다.
- Figma import에서 editable 구간과 image fallback 구간을 별도 helper로 분리한다.
- imported Figma 문서가 NULL 내부 serialize roundtrip에서 구조를 잃지 않는지 테스트로 고정한다.

수정 파일:
- `src/advanced/geom/vectorEditModel.ts`
- `src/advanced/geom/pathEditShape.ts`
- `src/advanced/geom/booleanTrace.ts`
- `src/lib/figmaImportFidelity.ts`
- `src/lib/figmaToNull.ts`
- `tests/vector-edit-model.test.ts`
- `tests/figma-import-fidelity.test.ts`
- `tests/boolean-trace.test.ts`
- `tests/scene-clone.test.ts`
- `tests/figmaToNull.test.ts`
- `tests/figmaFileToNull.test.ts`
- `tests/figma-roundtrip.test.ts`
- `docs/에디터_Figma_검증_기준.md`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_롤백_가이드.md`

검증 방법:
- `npx eslint src/lib/figmaImportFidelity.ts src/lib/figmaToNull.ts src/advanced/geom/booleanTrace.ts src/advanced/geom/pathEditShape.ts src/advanced/geom/vectorEditModel.ts tests/vector-edit-model.test.ts tests/figma-import-fidelity.test.ts tests/boolean-trace.test.ts tests/scene-clone.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/figma-roundtrip.test.ts --quiet`
- `npx vitest run tests/vector-edit-model.test.ts tests/figma-import-fidelity.test.ts tests/boolean-trace.test.ts tests/scene-clone.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/vector-network.test.ts tests/path-edit-shape.test.ts tests/figma-roundtrip.test.ts`

수동 롤백 순서:
1. `src/lib/figmaToNull.ts`에서 `figmaImportFidelity` import/use를 제거하고 기존 local fallback helper로 되돌린다.
2. `src/advanced/geom/vectorEditModel.ts` import/use를 제거하고 `pathEditShape.ts`를 기존 `pathData/segments` 중심 commit 경로로 되돌린다.
3. `src/advanced/geom/booleanTrace.ts`의 vector network translate 보강을 제거한다.
4. `tests/vector-edit-model.test.ts`, `tests/figma-import-fidelity.test.ts`, `tests/figma-roundtrip.test.ts`를 제거한다.
5. 계획/검증 문서의 관련 체크를 되돌린다.

롤백 후 확인:
1. simple vector/boolean/mask import가 기존처럼 동작하는지 확인한다.
2. `vectorNetwork-only` path edit가 기존 경로로만 반영되는지 확인한다.
3. `npx vitest run tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts`가 다시 통과하는지 확인한다.

### C-0053. library / renderer / multiplayer 설계 문서 고정

목적:
- 남아 있던 `library publish/consume/update`, `renderer 전환`, `CRDT multiplayer` 설계 항목을 실행 문서로 고정한다.
- 이후 구현이 현재 UI/모델과 충돌하지 않도록 기준을 먼저 세운다.

수정 파일:
- `docs/에디터_Figma_library_publish_consume_update_설계.md`
- `docs/에디터_Figma_renderer_전환_설계.md`
- `docs/에디터_Figma_multiplayer_CRDT_설계.md`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_롤백_가이드.md`

검증 방법:
- 문서 기준 검토
- `docs/에디터_Figma_통합_실행계획.md` 체크 상태 확인

수동 롤백 순서:
1. 위 3개 설계 문서를 제거한다.
2. 통합 계획 문서에서 renderer/library/multiplayer 관련 체크를 되돌린다.

롤백 후 확인:
1. 통합 계획 문서에 설계 완료 체크가 풀렸는지 확인한다.
2. 이후 phase 기준이 다시 미정 상태로 돌아갔는지 확인한다.

### C-0054. NULL -> Figma exporter + export route + roundtrip evidence

목적:
- `NULL -> Figma` export를 실제 코드로 추가한다.
- 현재 페이지 버전에서 export payload를 바로 받을 수 있는 API route를 추가한다.
- representative fixture 기준 `NULL -> Figma -> NULL` roundtrip 검증을 고정한다.
- 마지막 계획 체크 2개를 코드/테스트/문서 기준으로 닫는다.

수정 파일:
- `src/lib/nullToFigma.ts`
- `src/lib/figma.ts`
- `src/app/api/pages/[pageId]/figma/export/route.ts`
- `tests/nullToFigma.test.ts`
- `docs/에디터_Figma_통합_실행계획.md`
- `docs/에디터_Figma_매핑_표.md`
- `docs/에디터_Figma_import_export_공통_제약표.md`
- `docs/에디터_Figma_검증_기준.md`
- `docs/에디터_Figma_달성_근거.md`
- `docs/에디터_Figma_롤백_가이드.md`

검증 방법:
- `npx eslint src/lib/nullToFigma.ts src/lib/figma.ts src/app/api/pages/[pageId]/figma/export/route.ts tests/nullToFigma.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/figma-roundtrip.test.ts --quiet`
- `npx vitest run tests/nullToFigma.test.ts tests/figmaToNull.test.ts tests/figmaFileToNull.test.ts tests/figma-roundtrip.test.ts tests/vector-edit-model.test.ts tests/figma-import-fidelity.test.ts tests/boolean-trace.test.ts tests/scene-clone.test.ts tests/vector-network.test.ts tests/path-edit-shape.test.ts tests/doc-parity.test.ts`
- `npx next build`

수동 롤백 순서:
1. `src/app/api/pages/[pageId]/figma/export/route.ts`를 제거한다.
2. `src/lib/nullToFigma.ts`를 제거하고 exporter import/use를 제거한다.
3. `src/lib/figma.ts`에서 exporter 때문에 추가한 `pointCount`, `arcData` 필드를 제거한다.
4. `tests/nullToFigma.test.ts`를 제거한다.
5. `docs/에디터_Figma_달성_근거.md`를 제거한다.
6. 계획/매핑/공통 제약/검증 기준 문서의 export/evidence 관련 변경을 되돌린다.

롤백 후 확인:
1. `/api/pages/[pageId]/figma/export` route가 빌드 결과에서 사라졌는지 확인한다.
2. `tests/nullToFigma.test.ts`를 제거한 상태에서 기존 Figma import 회귀가 다시 통과하는지 확인한다.
3. 통합 계획 문서 진행도가 `238 / 240` 상태로 돌아가고 마지막 두 체크가 풀렸는지 확인한다.
### C-0055. Phase A 구현 준비 문서 고정

목적:
- `Phase A. Figma Design Core 완성 배치`를 다음 구현 턴부터 바로 시작할 수 있게 범위, 파일, 검증, 롤백 단위를 고정한다.

수정 파일:
- `docs/에디터_Figma_후속_대형_작업_계획.md`
- `docs/에디터_Figma_롤백_가이드.md`

추가 파일:
- `docs/에디터_Figma_PhaseA_구현_준비.md`

원본 경로 유지 여부:
- [x] 기존 후속 계획 문서는 유지
- [x] 준비 문서는 별도 추가

검증 방법:
- `docs/에디터_Figma_후속_대형_작업_계획.md`에서 준비 문서 링크 확인
- `docs/에디터_Figma_PhaseA_구현_준비.md` 섹션 존재 확인

수동 롤백 절차:
1. `docs/에디터_Figma_PhaseA_구현_준비.md`를 삭제한다.
2. `docs/에디터_Figma_후속_대형_작업_계획.md`에서 준비 문서 링크를 제거한다.
3. 이 항목 `C-0055`를 롤백 가이드에서 제거한다.

롤백 후 확인:
1. 후속 계획 문서가 다시 상위 계획 문서만 남는지 확인한다.
2. Phase A 착수 링크가 더 이상 존재하지 않는지 확인한다.

### C-0056. 모든 범위 10점 고정 판정 기준 문서 추가

목적:
- `모든 범위가 Figma와 동일 이상`이라고 주장할 수 있는 최종 판정 기준을 고정한다.
- 점수 인플레이션을 막고, 실제 검증을 통과한 경우에만 10점을 기록하게 만든다.

수정 파일:
- `docs/에디터_Figma_후속_대형_작업_계획.md`
- `docs/에디터_Figma_PhaseA_구현_준비.md`
- `docs/에디터_Figma_롤백_가이드.md`

추가 파일:
- `docs/에디터_Figma_10점_고정_판정_기준.md`

원본 경로 유지 여부:
- [x] 기존 계획/준비 문서는 유지
- [x] 새 판정 기준 문서는 별도 추가

검증 방법:
- `docs/에디터_Figma_10점_고정_판정_기준.md` 존재 확인
- 후속 계획 문서와 Phase A 준비 문서에서 새 기준 문서 링크 확인

수동 롤백 절차:
1. `docs/에디터_Figma_10점_고정_판정_기준.md`를 삭제한다.
2. `docs/에디터_Figma_후속_대형_작업_계획.md`에서 새 기준 문서 링크를 제거한다.
3. `docs/에디터_Figma_PhaseA_구현_준비.md`에서 새 기준 문서 링크와 관련 문장을 제거한다.
4. 이 항목 `C-0056`을 롤백 가이드에서 제거한다.

롤백 후 확인:
1. 후속 계획 문서와 Phase A 준비 문서가 다시 자체 목표만 남는지 확인한다.
2. 10점 고정 문서 링크가 더 이상 존재하지 않는지 확인한다.

### C-0057. Text Engine 1차 배치: rich text range + text-on-path + Figma text override roundtrip

목적:
- 텍스트 문서 모델에 rich text range와 text-on-path를 추가한다.
- renderer/editor에 rich text와 text-on-path 로컬 렌더 경로를 추가한다.
- Figma `styleOverrideTable` / `characterStyleOverrides` import-export 기초를 연결한다.

수정 파일:
- `src/advanced/doc/scene.ts`
- `src/advanced/geom/textLayout.ts`
- `src/advanced/runtime/renderer.tsx`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/lib/figma.ts`
- `src/lib/figmaToNull.ts`
- `src/lib/nullToFigma.ts`
- `tests/scene-clone.test.ts`
- `tests/figmaToNull.test.ts`
- `tests/nullToFigma.test.ts`
- `tests/doc-parity.ts`
- `docs/에디터_Figma_PhaseA_구현_준비.md`
- `docs/에디터_Figma_롤백_가이드.md`

추가 파일:
- `src/advanced/geom/richTextModel.ts`
- `src/advanced/geom/textPathLayout.ts`
- `tests/rich-text-model.test.ts`

검증 방법:
- `npx eslint src/advanced/doc/scene.ts src/advanced/geom/textLayout.ts src/advanced/geom/richTextModel.ts src/advanced/geom/textPathLayout.ts src/advanced/runtime/renderer.tsx src/advanced/ui/AdvancedEditorView.tsx src/lib/figma.ts src/lib/figmaToNull.ts src/lib/nullToFigma.ts tests/rich-text-model.test.ts tests/scene-clone.test.ts tests/figmaToNull.test.ts tests/nullToFigma.test.ts tests/doc-parity.ts --quiet`
- `npx vitest run tests/rich-text-model.test.ts tests/scene-clone.test.ts tests/figmaToNull.test.ts tests/nullToFigma.test.ts tests/text-layout.test.ts`
- `npx next build`

수동 롤백 절차:
1. `src/advanced/geom/richTextModel.ts`, `src/advanced/geom/textPathLayout.ts`, `tests/rich-text-model.test.ts`를 제거한다.
2. `scene.ts`에서 `NodeText.ranges`, `NodeText.textPath`와 clone 경로를 제거한다.
3. `renderer.tsx`, `AdvancedEditorView.tsx`에서 rich text / textPath 렌더 분기를 제거하고 기존 plain text 경로만 남긴다.
4. `figma.ts`, `figmaToNull.ts`, `nullToFigma.ts`에서 text override 관련 필드를 제거한다.
5. 관련 테스트 변경을 되돌린다.

롤백 후 확인:
1. 일반 text 렌더가 기존처럼 동작하는지 확인한다.
2. `tests/figmaToNull.test.ts`, `tests/nullToFigma.test.ts`, `tests/text-layout.test.ts`가 다시 통과하는지 확인한다.
3. Phase A 준비 문서의 `A-1 Text Engine 1차 배치 완료` 문구를 제거한다.

### C-0058. Text Engine 2차 배치: inspector model + rich range UI + text-on-path UI

변경 목적:
- rich text range와 text-on-path를 렌더 전용이 아니라 실제 편집기 UI에서 조작 가능하게 만든다.
- range/path 변경이 hug/auto-size 측정 경로에 반영되도록 보강한다.
- direct text edit가 rich range를 깨뜨리지 않도록 정규화 경로를 고정한다.

수정 파일:
- `src/advanced/ui/textInspectorModel.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/advanced/geom/textPathLayout.ts`
- `tests/text-inspector-model.test.ts`
- `docs/에디터_Figma_PhaseA_구현_준비.md`
- `docs/에디터_Figma_롤백_가이드.md`

검증 방법:
- `npx eslint src/advanced/ui/AdvancedEditorView.tsx src/advanced/ui/textInspectorModel.ts src/advanced/geom/textPathLayout.ts tests/text-inspector-model.test.ts --quiet`
- `npx vitest run tests/text-inspector-model.test.ts tests/rich-text-model.test.ts tests/text-layout.test.ts tests/scene-clone.test.ts tests/figmaToNull.test.ts tests/nullToFigma.test.ts`
- `npx next build`

수동 롤백 순서:
1. `src/advanced/ui/textInspectorModel.ts`와 `tests/text-inspector-model.test.ts`를 제거한다.
2. `AdvancedEditorView.tsx`에서 `textInspectorModel` import, rich range inspector UI, text-on-path inspector UI, `setNodeTextValue` 기반 경로를 제거한다.
3. `cloneText`를 기존 단순 shallow clone으로 되돌리고, `textChanged`에서 `ranges`, `textPath` 감지를 제거한다.
4. `fitTextNodeToContent`와 `updateNode`의 text measurement style을 기존 `resolveTextStyle(...) ?? node.text?.style ?? DEFAULT_TEXT_STYLE` 경로로 되돌린다.
5. `textPathLayout.ts`에서 `clampTextPathStartOffsetValue` export를 제거하고 기존 `normalizeTextPathStartOffset`만 남긴다.
6. Phase A 준비 문서의 `A-1 Text Engine 2차 배치 완료` 문구와 `tests/text-inspector-model.test.ts` 검증 항목을 제거한다.

롤백 후 확인:
1. 텍스트 inspector가 기존 입력/스타일 편집만 유지하는지 확인한다.
2. `tests/rich-text-model.test.ts`, `tests/text-layout.test.ts`, `tests/figmaToNull.test.ts`, `tests/nullToFigma.test.ts`가 다시 통과하는지 확인한다.
3. `next build`가 다시 통과하는지 확인한다.

### C-0059. Text Engine 3차 배치: rich range style expansion + progress checklist visualization

변경 목적:
- rich text range 편집 범위를 family / line-height / letter-spacing / strike까지 확장한다.
- range style reset 경로를 추가해 span override를 빠르게 초기화할 수 있게 만든다.
- Phase A 준비 문서를 체크박스 기반 진행표로 바꿔 현재 완료 범위를 바로 볼 수 있게 만든다.

수정 파일:
- `src/advanced/ui/textInspectorModel.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/text-inspector-model.test.ts`
- `docs/에디터_Figma_PhaseA_구현_준비.md`
- `docs/에디터_Figma_롤백_가이드.md`

검증 방법:
- `npx eslint src/advanced/ui/AdvancedEditorView.tsx src/advanced/ui/textInspectorModel.ts tests/text-inspector-model.test.ts --quiet`
- `npx vitest run tests/text-inspector-model.test.ts tests/rich-text-model.test.ts tests/text-layout.test.ts tests/scene-clone.test.ts tests/figmaToNull.test.ts tests/nullToFigma.test.ts`
- `npx next build`

수동 롤백 순서:
1. `textInspectorModel.ts`에서 `clearTextRangeStyling`을 제거한다.
2. `AdvancedEditorView.tsx`의 rich range inspector에서 family / line-height / letter-spacing / strike / reset style UI를 제거한다.
3. `tests/text-inspector-model.test.ts`의 reset style 검증을 제거한다.
4. Phase A 준비 문서의 체크박스 진행표와 `A-1 Text Engine 3차 배치 완료` 문구를 제거한다.

롤백 후 확인:
1. rich range inspector가 2차 배치 상태로 돌아왔는지 확인한다.
2. `tests/text-inspector-model.test.ts`가 다시 통과하는지 확인한다.
3. `next build`가 다시 통과하는지 확인한다.

### C-0063. Auto Layout / Constraints: Ignore Auto Layout

### C-0064. Auto Layout / Constraints: Grid Flow + Layout Guide Priority

- 상세 롤백 문서: [에디터_Figma_롤백_부록_C-0064.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_롤백_부록_C-0064.md)

- 상세 롤백 문서: [에디터_Figma_롤백_부록_C-0063.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_롤백_부록_C-0063.md)
