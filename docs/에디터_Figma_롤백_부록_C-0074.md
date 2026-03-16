# 에디터 Figma 롤백 부록 C-0074

기준 날짜: `2026-03-14`

## 대상 단계

- `Phase C / C-2 CRDT Multiplayer`
- `Phase C / C-4 Type Gate / Soak / Hardening` 일부

## 이번 배치에서 바뀐 것

1. `src/lib/collab.ts`
   - editor operation 모델 추가
   - operation normalize / envelope / merge helper 추가
   - bounded history / recovery helper 추가

2. `src/server/socket.ts`
   - `presence`와 `doc` room 분리
   - `editor:op`, `editor:op:sync` 경로 추가
   - latest operation recovery sync 추가
   - bounded history 저장 및 room empty 시 cleanup 추가

3. `src/advanced/ui/AdvancedEditorView.tsx`
   - raw `editor:doc` sync를 operation bridge로 교체
   - remote op merge / local-wins rebroadcast 경로 추가
   - sync recovery 이벤트 처리 추가

4. 테스트
   - `tests/collab-bridge.test.ts`
   - `tests/collab-soak.test.ts`

5. 문서
   - `docs/에디터_Figma_PhaseC_진행표.md`
   - `docs/에디터_Figma_PhaseC_구현_준비.md`

## 롤백 방법

### 1. 협업 transport만 되돌리기

아래 파일만 이전 상태로 되돌리면 된다.

- `src/lib/collab.ts`
- `src/server/socket.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`

이 롤백은 `editor:op` 기반 경로를 제거하고 다시 raw `editor:doc` snapshot broadcast로 되돌린다.

### 2. 테스트와 문서만 되돌리기

아래 파일만 제거하거나 이전 상태로 복구하면 된다.

- `tests/collab-bridge.test.ts`
- `tests/collab-soak.test.ts`
- `docs/에디터_Figma_PhaseC_진행표.md`
- `docs/에디터_Figma_PhaseC_구현_준비.md`

### 3. 이번 배치를 통째로 되돌리기

아래 묶음을 모두 이전 상태로 복구한다.

- `src/lib/collab.ts`
- `src/server/socket.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/collab-bridge.test.ts`
- `tests/collab-soak.test.ts`
- `docs/에디터_Figma_PhaseC_진행표.md`
- `docs/에디터_Figma_PhaseC_구현_준비.md`

## 롤백 후 확인 명령

```powershell
npx eslint src/lib/collab.ts src/server/socket.ts src/advanced/ui/AdvancedEditorView.tsx tests/collab-bridge.test.ts tests/collab-soak.test.ts --quiet
npx tsc --noEmit --pretty false
npx vitest run tests/collab-bridge.test.ts tests/collab-soak.test.ts tests/runtime-scene-graph.test.ts tests/runtime-renderer-benchmark.test.tsx
npx next build
```
