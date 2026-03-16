# 에디터 Figma Phase C 10점 고정 근거
기준 날짜: `2026-03-14`

이 문서는 `Phase C` 기준으로 어떤 항목이 실제 검증까지 끝났는지, 무엇이 아직 전체 10점 고정 선언을 막고 있는지 정리한 근거 문서입니다.

## 1. 현재 결론

- `C-1 Renderer / Scale Baseline`: 완료
- `C-2 CRDT Multiplayer`: 완료
- `C-4 Type Gate / Soak / Hardening`: 완료
- `C-3 Direct .fig Compatibility`: 부분 완료

현재 남은 blocker:

- `direct .fig parser / writer 기반`

즉, `Phase C`는 현재 `19 / 20`이고, 전체 10점 고정 선언은 아직 금지됩니다.

## 2. 이번 기준에서 검증 완료된 것

### Renderer / Scale

- scene graph render / interaction 분리 완료
- canvas prototype stage와 fallback 규칙 검증 완료
- selection / edit overlay 분리 완료
- `5k` node benchmark fixture 통과

### Multiplayer

- operation 기반 transport 적용
- presence / document room 분리
- merge / local-wins recovery 경로 적용
- long-session soak 통과

### Type Gate / Hardening

- `ignoreBuildErrors` 제거
- `tsc --noEmit` 통과
- `next build`에서 실제 타입 검사 포함 통과
- 관련 회귀 테스트 통과

### Direct Compatibility에서 이미 닫힌 것

- component / style / variable / prototype fidelity 보강
- shared metadata 보존
- roundtrip diff fixture
- compatibility report
- raw Figma REST payload / file / bundle / gzip / base64-gzip source sniffing
- direct fig package zip / base64 import-export
- `figFile` / `packageFile` / `package-base64` direct source 경로
- direct `.fig` binary adapter hook / writer route scaffold
- env 기반 direct `.fig` CLI adapter 실행 경로
- unsupported binary `.fig` 입력에 대한 명시적 오류

## 3. 이번 단계 검증 명령

아래 검증이 통과했습니다.

```bash
npx eslint src/lib/figmaBundle.ts src/app/api/pages/[pageId]/figma/import/route.ts src/app/api/pages/[pageId]/figma/export/route.ts tests/figma-bundle.test.ts --quiet
npx tsc --noEmit --pretty false
npx vitest run tests/figma-bundle.test.ts tests/nullToFigma.test.ts tests/figmaToNull.test.ts tests/figma-roundtrip.test.ts
npx next build
```

## 4. 왜 아직 10점 고정이 아닌가

남은 이유는 하나입니다.

- 실제 `direct .fig parser / writer`가 아직 없습니다.

현재 구현은 아래를 지원합니다.

- NULL direct bundle
- NULL direct fig package zip
- Figma REST JSON payload / file source
- gzip / base64-gzip / zip / package-base64 source 판별
- `figFile` / `packageFile` multipart direct import
- binary adapter hook을 통한 direct `.fig` parse / write 연결점
- env 기반 CLI adapter auto-registration
- 호환성 / fidelity 리포트

하지만 이것만으로는 `직접 .fig 호환`을 닫을 수 없습니다.

## 5. 10점 고정으로 넘어가기 위한 마지막 조건

아래가 닫히면 `Phase C 완료`를 검토할 수 있습니다.

1. actual `direct .fig parser / writer` 경로 추가
2. representative `.fig` fixture import/export 검증
3. `Figma -> NULL -> Figma` direct file 경로 회귀 통과

그 전까지는 이 문서를 `완료 근거`가 아니라 `현재 검증 근거 + 남은 blocker 문서`로 사용합니다.
