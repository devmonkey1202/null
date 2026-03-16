# 에디터 Figma 롤백 부록 C-0062
기준 날짜: `2026-03-13`
범위: `A-4 Variables / Styles` 완료 배치

## 포함 변경

- `scene.ts`
  - variable alias / mode alias 모델 추가
  - text valueRef / styleBindings 추가
  - text range fillRef / styleBindings 추가
  - gradient stop colorRef 추가
- `variableBindings.ts`
  - editor/runtime 공용 variable binding 해석 모듈 추가
- `textInspectorModel.ts`
  - text valueRef / style binding / range fillRef setter 추가
- `AdvancedEditorView.tsx`
  - text binding inspector UI 추가
  - gradient stop variable UI 추가
  - editor preview가 bound text / bound gradient stop를 반영하도록 보강
- `renderer.tsx`
  - runtime text / gradient stop binding 반영
- `figma.ts`
  - Figma text boundVariables / gradient stop boundVariables 타입 확장
- `figmaToNull.ts`
  - alias / mode alias import
  - text boundVariables import
  - gradient stop binding import
- `nullToFigma.ts`
  - alias / mode alias export
  - text boundVariables export
  - gradient stop binding export
- `tokenRoundtrip.ts`
  - text / gradient / alias ref 재바인딩 추가
- `tests/*`
  - variable binding helper / import / export / token roundtrip / parity 테스트 추가

## 롤백 순서

1. 아래 파일을 이번 배치 직전 상태로 되돌린다.
   - `src/advanced/doc/scene.ts`
   - `src/advanced/ui/textInspectorModel.ts`
   - `src/advanced/ui/AdvancedEditorView.tsx`
   - `src/advanced/runtime/renderer.tsx`
   - `src/lib/figma.ts`
   - `src/lib/figmaToNull.ts`
   - `src/lib/nullToFigma.ts`
   - `src/advanced/ui/tokenRoundtrip.ts`
   - `tests/figmaToNull.test.ts`
   - `tests/nullToFigma.test.ts`
   - `tests/token-roundtrip.test.ts`
   - `tests/doc-parity.ts`
2. 아래 신규 파일을 제거한다.
   - `src/advanced/geom/variableBindings.ts`
   - `tests/variable-bindings.test.ts`
3. 진행표를 직전 상태로 되돌린다.
   - `docs/에디터_Figma_PhaseA_진행표.md`

## 롤백 후 최소 검증

```bash
npx vitest run tests/variable-bindings.test.ts tests/figmaToNull.test.ts tests/nullToFigma.test.ts tests/token-roundtrip.test.ts
npx next build
```

주의:

- 첫 번째 명령은 신규 테스트 제거 전이면 실패해도 이상하지 않다.
- 최종 기준은 `next build`와 기존 A-1 회귀가 다시 통과하는지다.
