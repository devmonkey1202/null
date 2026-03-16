# 에디터 Figma 롤백 부록 C-0081
기준 날짜: `2026-03-16`

## 변경 단위
- `WEB-001` 공개 URL import
- `WEB-003` viewport 선택 import
- `WEB-011` imported URL 재가져오기

## 수정 파일
- `src/lib/webImportShared.ts`
- `src/lib/webToNull.ts`
- `src/app/api/pages/[pageId]/web/import/route.ts`
- `src/advanced/doc/scene.ts`
- `src/lib/collab.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`
- `tests/webToNull.test.ts`
- `package.json`
- `package-lock.json`

## 롤백 절차
1. `src/lib/webImportShared.ts`
   - 파일 전체 삭제
2. `src/lib/webToNull.ts`
   - 파일 전체 삭제
3. `src/app/api/pages/[pageId]/web/import/route.ts`
   - 파일 전체 삭제
4. `src/advanced/doc/scene.ts`
   - `Doc.imports` 추가분 제거
   - `createDoc / cloneDoc / hydrateDoc`의 `imports` 처리 제거
5. `src/lib/collab.ts`
   - `imports: pickScalar(...)` 병합 줄 제거
6. `src/advanced/ui/AdvancedEditorView.tsx`
   - `webImport*` state 제거
   - `openWebImportModal`, `applyImportedDoc`, `runWebImport` 제거
   - overflow menu의 `웹에서 가져오기` 항목 제거
   - 웹 import 모달 블록 제거
   - `Escape` 처리의 `webImportOpen` 분기 제거
7. `tests/webToNull.test.ts`
   - 파일 전체 삭제
8. `package.json`, `package-lock.json`
   - `jsdom` runtime dependency 이동과 `@types/jsdom` 추가분 되돌리기

## 복구 후 재검증
```bash
npx tsc --noEmit --pretty false
npx next build
```
