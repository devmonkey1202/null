# 에디터 Figma 웹 Import 실행표
기준 날짜: `2026-03-16`

## 범위
- `WEB-001` 공개 URL -> editable frame import
- `WEB-003` viewport 선택 import
- `WEB-011` imported URL 재열기 / 재가져오기

## 현재 상태
- 완료: `3 / 3`
- 현재 배치: `WEB-001 / WEB-003 / WEB-011`
- 다음 배치 후보:
  - `WEB-010` HTML/CSS 직접 입력
  - `WEB-007` `.html/.htm`
  - `WEB-008` `.zip`
  - `WEB-009` `.mhtml/.mht`

## 체크리스트
- [x] 공개 URL을 받아 서버에서 HTML을 가져온다
- [x] 로컬/사설 네트워크 주소를 차단한다
- [x] 제목/설명/본문/링크/버튼/이미지를 편집 가능한 노드로 변환한다
- [x] viewport preset을 선택할 수 있다
- [x] 가져온 문서에 마지막 URL/viewport 메타데이터를 남긴다
- [x] 에디터 메뉴에서 웹 import 모달을 열 수 있다
- [x] 페이지가 없어도 새 작품 생성 후 바로 import할 수 있다
- [x] 마지막 URL 다시 가져오기를 실행할 수 있다
- [x] `vitest` 회귀 테스트를 추가했다
- [x] `tsc --noEmit`을 통과했다
- [x] `next build`를 통과했다

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

## 검증 명령
```bash
npx eslint src/lib/webImportShared.ts src/lib/webToNull.ts src/app/api/pages/[pageId]/web/import/route.ts src/advanced/doc/scene.ts src/lib/collab.ts src/advanced/ui/AdvancedEditorView.tsx tests/webToNull.test.ts --quiet
npx tsc --noEmit --pretty false
npx vitest run tests/webToNull.test.ts tests/figmaToNull.test.ts tests/nullToFigma.test.ts tests/collab-bridge.test.ts
npx next build
```
