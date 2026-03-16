# 에디터 Figma 직접 호환 보류 정리
기준 날짜: `2026-03-15`

관련 문서:
- [에디터_Figma_전체_구현_레퍼런스.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_전체_구현_레퍼런스.md)

## 목적
이 문서는 `direct .fig` 바이너리 호환을 지금 당장 끝내는 대신, 나중에 다시 정확하게 착수할 수 있도록 현재 상태와 남은 일을 고정해두는 보류 문서입니다.

중요:
- 이 문서는 `포기` 문서가 아닙니다.
- 이 문서는 `현재 구현된 것`, `아직 없는 것`, `다시 시작할 때 필요한 것`을 분리하는 문서입니다.
- 이 문서는 `direct .fig`만 다룹니다. REST JSON / bundle / package 경로는 별도 완료 상태로 취급합니다.

## 현재 상태

- [x] Figma REST file JSON import
- [x] Figma REST payload export
- [x] NULL direct bundle import / export
- [x] direct fig package zip import / export
- [x] gzip / base64-gzip / zip / package-base64 source sniffing
- [x] compatibility report / fidelity report
- [x] direct `.fig` binary adapter registry
- [x] env 기반 외부 CLI adapter 연결 경로
- [ ] 실제 `direct .fig` binary parser 구현체
- [ ] 실제 `direct .fig` binary writer 구현체
- [ ] 실제 `.fig` fixture 기반 roundtrip 회귀

현재 코드 기준 핵심 파일:
- [directFigBinary.ts](C:/Users/주원/Desktop/null/src/lib/directFigBinary.ts)
- [figmaBundle.ts](C:/Users/주원/Desktop/null/src/lib/figmaBundle.ts)
- [route.ts](C:/Users/주원/Desktop/null/src/app/api/pages/[pageId]/figma/import/route.ts)
- [route.ts](C:/Users/주원/Desktop/null/src/app/api/pages/[pageId]/figma/export/route.ts)
- [figma-bundle.test.ts](C:/Users/주원/Desktop/null/tests/figma-bundle.test.ts)

## 왜 지금 보류하는가

1. Figma 공식 공개 자료는 `파일 JSON 표현`과 `.fig` import 가능 여부는 설명하지만, `direct .fig` 바이너리 스펙은 공개하지 않습니다.
2. 그래서 마지막 1칸은 일반적인 앱 기능 작업처럼 바로 닫을 수 있는 범위가 아니라, `외부 adapter` 또는 `역공학`이 필요한 범위입니다.
3. 이 항목을 지금 억지로 끝냈다고 쓰면 거짓이 됩니다.

공식 자료:
- https://developers.figma.com/docs/rest-api/file-endpoints/
- https://help.figma.com/hc/en-us/articles/360041003114-Import-files-into-Figma
- https://help.figma.com/hc/en-us/articles/360040328553-Work-offline-with-Figma

공개 사례:
- https://www.npmjs.com/package/fig-kiwi

## 다시 시작할 때의 경로

### 경로 A. 외부 CLI adapter
가장 현실적인 빠른 경로입니다.

조건:
- 로컬에서 실행 가능한 parser / writer CLI가 있어야 함
- 입력으로 `.fig` 바이너리를 읽을 수 있어야 함
- 출력으로 최소한 `Figma REST payload` 또는 `NULL direct bundle` 수준의 구조를 만들 수 있어야 함

현재 이미 준비된 것:
- `NULL_DIRECT_FIG_ADAPTER_CMD`
- `NULL_DIRECT_FIG_ADAPTER_ARGS`
- reader / writer hook
- export route scaffold

장점:
- 현재 코드에 바로 꽂을 수 있음
- 비용 0원인 로컬 CLI도 가능
- 역공학 전량을 우리 저장소 안에서 바로 할 필요가 없음

단점:
- 외부 도구 품질에 의존
- 장기적으로는 adapter 의존성이 생김

### 경로 B. `.fig` 샘플 기반 역공학
장기적으로 가장 강한 경로입니다.

필수 전제:
- 서로 아주 조금씩만 다른 `.fig` 샘플이 많이 필요함
- 단일 샘플 1~2개로는 부족함

최소 샘플 세트:
- 빈 파일
- 프레임 1개만 있는 파일
- auto layout만 있는 파일
- rich text만 있는 파일
- vector / boolean / mask만 있는 파일
- component / variant / property만 있는 파일
- variables / styles만 있는 파일
- prototype interaction만 있는 파일
- 위 항목들이 섞인 복합 파일

장점:
- 외부 의존 없이 직접 구현 가능
- 완성되면 가장 강한 직접 호환 경로가 됨

단점:
- 가장 시간이 많이 듦
- 완전 roundtrip까지 가려면 반복 검증이 큼

## 다음 시도 전 체크리스트

- [ ] 실제 `.fig` 샘플 세트 확보
- [ ] 외부 CLI 후보가 있는지 먼저 확인
- [ ] adapter 방식으로 끝낼지, 역공학으로 갈지 결정
- [ ] representative `.fig` fixture 저장 위치 결정
- [ ] import / export 성공 기준과 실패 기준 고정

## 완료 선언 조건

아래가 모두 충족되어야 `direct .fig`를 완료로 올릴 수 있습니다.

- [ ] 실제 `.fig` 바이너리를 입력으로 받는다
- [ ] 실제 `.fig` 바이너리를 출력으로 만든다
- [ ] `.fig -> NULL -> .fig` 회귀가 representative fixture에서 통과한다
- [ ] `NULL -> .fig -> NULL` 회귀가 representative fixture에서 통과한다
- [ ] compatibility report에 `unsupported_fig_binary`가 남지 않는다
- [ ] adapter stub이 아니라 실제 구현체가 연결되어 있다

## 현재 결론

지금 direct 호환은 `준비 완료 + 실제 구현체만 미완료` 상태입니다.

따라서 지금의 정직한 표현은 이렇습니다.
- `REST / bundle / package 경로`: 구현됨
- `direct .fig binary`: 보류

이 문서를 기준으로, 나중에 다시 direct `.fig`에 착수하면 됩니다.
