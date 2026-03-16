# 에디터 Figma 롤백 부록 C-0075

기준 날짜: `2026-03-14`

## 대상 단계

- `Phase C / C-3 Direct .fig Compatibility` 1차

## 이번 배치에서 바뀐 것

1. `src/lib/figmaSharedMetadata.ts`
   - `sharedPluginData.NULL.meta` 기반 metadata export / import helper 추가

2. `src/lib/nullToFigma.ts`
   - node-level shared metadata export 연결

3. `src/lib/figmaToNull.ts`
   - shared metadata import 연결

4. `src/lib/figmaBundle.ts`
   - direct bundle scaffold
   - gzip bundle read / write
   - roundtrip diff
   - compatibility report

5. API
   - `src/app/api/pages/[pageId]/figma/export/route.ts`
     - `?format=bundle` 지원
   - `src/app/api/pages/[pageId]/figma/import/route.ts`
     - `bundleBase64` / `bundle` direct import 지원

6. 테스트
   - `tests/figma-bundle.test.ts`
   - `tests/nullToFigma.test.ts`
   - `tests/figmaToNull.test.ts`
   - `tests/figma-roundtrip.test.ts`

7. 보조 수정
   - `src/lib/prototypeFigmaInterop.ts`
     - `AFTER_TIMEOUT` import 시 `delayMs` 복원 보강

## 롤백 방법

### 1. bundle scaffold만 되돌리기

아래 파일만 이전 상태로 복구한다.

- `src/lib/figmaBundle.ts`
- `src/app/api/pages/[pageId]/figma/export/route.ts`
- `src/app/api/pages/[pageId]/figma/import/route.ts`
- `tests/figma-bundle.test.ts`

### 2. shared metadata만 되돌리기

아래 파일만 이전 상태로 복구한다.

- `src/lib/figmaSharedMetadata.ts`
- `src/lib/nullToFigma.ts`
- `src/lib/figmaToNull.ts`

### 3. 이번 배치를 통째로 되돌리기

아래 파일을 모두 이전 상태로 복구한다.

- `src/lib/figmaSharedMetadata.ts`
- `src/lib/figmaBundle.ts`
- `src/lib/nullToFigma.ts`
- `src/lib/figmaToNull.ts`
- `src/lib/prototypeFigmaInterop.ts`
- `src/app/api/pages/[pageId]/figma/export/route.ts`
- `src/app/api/pages/[pageId]/figma/import/route.ts`
- `tests/figma-bundle.test.ts`
- `docs/에디터_Figma_PhaseC_진행표.md`
- `docs/에디터_Figma_PhaseC_구현_준비.md`

## 롤백 후 확인 명령

```powershell
npx eslint src/lib/figmaSharedMetadata.ts src/lib/figmaBundle.ts src/lib/figmaToNull.ts src/lib/nullToFigma.ts src/lib/prototypeFigmaInterop.ts src/app/api/pages/[pageId]/figma/export/route.ts src/app/api/pages/[pageId]/figma/import/route.ts tests/figma-bundle.test.ts --quiet
npx tsc --noEmit --pretty false
npx vitest run tests/figma-bundle.test.ts tests/nullToFigma.test.ts tests/figmaToNull.test.ts tests/figma-roundtrip.test.ts
npx next build
```
