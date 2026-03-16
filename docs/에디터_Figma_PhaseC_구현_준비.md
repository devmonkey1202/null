# 에디터 Figma Phase C 구현 준비
기준 날짜: `2026-03-14`

## 상태

- Phase C 진행도: `19 / 20`
- 현재 상태:
  - `Phase A 완료`
  - `Phase B 완료`
  - `Phase C 진행 중`
- 현재 완료:
  - `ignoreBuildErrors 제거`
  - `tsc --noEmit 통과`
  - `scene graph render / interaction 분리`
  - `canvas prototype stage 삽입`
  - `selection / edit overlay 분리`
  - `5k renderer benchmark fixture`
  - `renderer parity / fallback 규칙`
  - `operation 기반 transport`
  - `late join recovery sync`
  - `presence / document edit room 분리`
  - `local-wins rebroadcast conflict path`
  - `multiplayer long-session soak`
  - `sharedPluginData.NULL.meta 기반 metadata 보존`
  - `direct figma bundle import / export scaffold`
  - `raw Figma REST source sniffing`
  - `direct fig package zip import / export`
  - `figFile` / `packageFile` / `package-base64` API 경로
  - `direct .fig` binary adapter hook / writer route scaffold
  - env 기반 direct `.fig` CLI adapter 실행 경로
  - `roundtrip diff fixture / compatibility report`
  - `최종 10점 고정 근거 문서 갱신`

## 범위

이번 Phase C에서 반드시 끝내야 하는 것:

1. renderer 전환 경로와 대문서 기준
2. CRDT multiplayer와 merge / conflict 흐름
3. direct `.fig` 호환 심화
4. 타입 게이트 / soak / hardening

이번 Phase C에서 새로 벌리지 않는 것:

- plugin / widget / library 기능 자체 확장
- Dev Mode 신규 기능 확장
- single-player 편집기 코어 재작업

위 항목은 `Phase A / B`에서 이미 닫은 범위로 봅니다.

## 우선 순서

1. `C-4 Type Gate / Soak / Hardening`
2. `C-1 Renderer / Scale Baseline`
3. `C-2 CRDT Multiplayer`
4. `C-3 Direct .fig Compatibility`

현재는 `C-3`의 마지막 남은 항목인 `direct .fig parser / writer 기반`만 남았습니다.

## 체크리스트

### C-1. Renderer / Scale Baseline

- [x] scene graph render / interaction 분리
- [x] canvas / WebGL 경로 1차 삽입
- [x] selection / edit overlay 분리
- [x] 5k node benchmark fixture
- [x] renderer parity / fallback 규칙

대상 파일:

- `src/advanced/runtime/renderer.tsx`
- `src/advanced/runtime/sceneGraph.ts`
- `src/advanced/runtime/runtimeInteractions.ts`
- `src/advanced/runtime/RuntimeSvgStage.tsx`
- `src/advanced/runtime/RuntimeCanvasPrototypeStage.tsx`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `src/advanced/ui/AdvancedEditorCanvasOverlay.tsx`

### C-2. CRDT Multiplayer

- [x] operation 모델 정리
- [x] CRDT 문서 동기화 bridge
- [x] presence와 document edit 분리
- [x] merge / conflict resolution 경로
- [x] multiplayer 부하 / soak 테스트

대상 파일:

- `src/lib/collab.ts`
- `src/server/socket.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/collab-bridge.test.ts`
- `tests/collab-soak.test.ts`

### C-3. Direct `.fig` Compatibility

- [ ] direct `.fig` parser / writer 기반
- [x] component / style / variable / prototype fidelity 강화
- [x] pluginData / shared metadata 보존
- [x] roundtrip diff fixture
- [x] compatibility 오류 리포트

현재 추가 완료:

- raw Figma REST source descriptor
- bundle / gzip / base64-gzip 판별
- package zip / package base64 판별
- `figFile` / `packageFile` multipart direct import
- binary adapter hook을 통한 direct `.fig` parse / write 연결점
- env 기반 CLI adapter auto-registration
- unsupported binary `.fig` 입력 차단
- direct import API 응답에 compatibility / fidelity / source descriptor 연결

대상 파일:

- `src/lib/figmaSharedMetadata.ts`
- `src/lib/figmaBundle.ts`
- `src/lib/figma.ts`
- `src/lib/figmaToNull.ts`
- `src/lib/nullToFigma.ts`
- `src/lib/prototypeFigmaInterop.ts`
- `src/app/api/pages/[pageId]/figma/export/route.ts`
- `src/app/api/pages/[pageId]/figma/import/route.ts`
- `tests/figma-bundle.test.ts`

### C-4. Type Gate / Soak / Hardening

- [x] `ignoreBuildErrors` 의존 제거
- [x] `tsc --noEmit` 전체 통과
- [x] 대문서 / 장시간 세션 soak
- [x] 메모리 / 충돌 / 복구 검증
- [x] 최종 10점 고정 근거 문서 갱신

대상 파일:

- `next.config.ts`
- `tsconfig.json`
- `tests/`
- `docs/에디터_Figma_10점_고정_판정_기준.md`
- `docs/에디터_Figma_PhaseC_10점_고정_근거.md`

## 이번 단계 실제 수정 파일

- `src/lib/figmaBundle.ts`
- `src/app/api/pages/[pageId]/figma/import/route.ts`
- `src/app/api/pages/[pageId]/figma/export/route.ts`
- `tests/figma-bundle.test.ts`
- `docs/에디터_Figma_PhaseC_진행표.md`
- `docs/에디터_Figma_PhaseC_구현_준비.md`
- `docs/에디터_Figma_10점_고정_판정_기준.md`
- `docs/에디터_Figma_PhaseC_10점_고정_근거.md`

## 검증

- `npx eslint src/lib/figmaBundle.ts src/app/api/pages/[pageId]/figma/import/route.ts src/app/api/pages/[pageId]/figma/export/route.ts tests/figma-bundle.test.ts --quiet`
- `npx tsc --noEmit --pretty false`
- `npx vitest run tests/figma-bundle.test.ts tests/nullToFigma.test.ts tests/figmaToNull.test.ts tests/figma-roundtrip.test.ts`
- `npx next build`

## 완료 판정

아래를 모두 만족해야 `Phase C 완료`입니다.

- renderer / multiplayer / direct `.fig` / type gate까지 known gap이 없음
- `next build`가 실제 타입 검사까지 포함해 통과함
- `tsc --noEmit`가 전체 통과함
- 별도 추가 phase 없이 `Phase C 완료 = 추가 작업 없음`이 성립함

현재 남은 유일한 blocker는 `direct .fig parser / writer 기반`입니다.
