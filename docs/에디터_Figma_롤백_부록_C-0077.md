# 에디터 Figma 롤백 부록 C-0077
기준 날짜: `2026-03-14`

## 범위

이번 부록은 아래 변경을 다룹니다.

- direct fig package zip import / export 추가
- package base64 export / import 경로 추가
- import API의 `figFile` / `packageFile` 입력 허용

## 수정 파일

- `src/lib/figmaBundle.ts`
- `src/app/api/pages/[pageId]/figma/import/route.ts`
- `src/app/api/pages/[pageId]/figma/export/route.ts`
- `tests/figma-bundle.test.ts`
- `docs/에디터_Figma_PhaseC_진행표.md`
- `docs/에디터_Figma_PhaseC_구현_준비.md`
- `docs/에디터_Figma_PhaseC_10점_고정_근거.md`

## 롤백 방법

1. 위 파일을 이번 변경 직전 상태로 되돌립니다.
2. 아래 검증을 다시 실행합니다.

```bash
npx eslint src/lib/figmaBundle.ts src/app/api/pages/[pageId]/figma/import/route.ts src/app/api/pages/[pageId]/figma/export/route.ts tests/figma-bundle.test.ts --quiet
npx tsc --noEmit --pretty false
npx vitest run tests/figma-bundle.test.ts tests/nullToFigma.test.ts tests/figmaToNull.test.ts tests/figma-roundtrip.test.ts
npx next build
```

## 기대 롤백 결과

- direct import는 다시 bundle / raw JSON source 중심으로 돌아갑니다.
- package zip / package base64 경로는 사라집니다.
- `figFile` / `packageFile` 입력 허용도 제거됩니다.
