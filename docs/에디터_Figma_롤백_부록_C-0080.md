# 에디터 Figma 롤백 부록 C-0080
기준 날짜: `2026-03-15`

## 범위

이번 부록은 아래 변경을 다룹니다.

- env 기반 direct `.fig` CLI adapter auto-registration
- CLI adapter fixture 및 회귀 테스트

## 수정 파일

- `src/lib/directFigBinary.ts`
- `tests/fixtures/direct-fig-adapter.mjs`
- `tests/figma-bundle.test.ts`
- `docs/에디터_Figma_PhaseC_진행표.md`
- `docs/에디터_Figma_PhaseC_구현_준비.md`
- `docs/에디터_Figma_PhaseC_10점_고정_근거.md`

## 롤백 방법

1. 위 파일을 이번 변경 직전 상태로 되돌립니다.
2. 아래 검증을 다시 실행합니다.

```bash
npx eslint src/lib/directFigBinary.ts tests/fixtures/direct-fig-adapter.mjs tests/figma-bundle.test.ts --quiet
npx tsc --noEmit --pretty false
npx vitest run tests/figma-bundle.test.ts tests/nullToFigma.test.ts tests/figmaToNull.test.ts tests/figma-roundtrip.test.ts
npx next build
```

## 기대 롤백 결과

- env 기반 direct `.fig` CLI adapter auto-registration이 제거됩니다.
- direct `.fig` 경로는 수동 registry 기반만 남습니다.
