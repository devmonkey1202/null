# 에디터 Figma B/C 최종 완결 계약
기준 날짜: `2026-03-14`

## 목적

이 문서는 `Phase B`, `Phase C`가 단순 후속 작업이 아니라,
**이 두 단계를 끝내면 에디터 전체에서 Figma와 겹치는 기능 범위에 대해 추가 작업이 더 남지 않도록** 고정하는 계약 문서다.

중요:

- 이 문서는 `좋아 보이면 완료`를 허용하지 않는다.
- 이 문서는 `Phase B/C 완료 = 최종 완료`를 강제한다.
- 이 문서는 `시장 규모`를 비교 대상에서 제외한다.
- 이 문서는 `제품 기능`, `커뮤니티 기능`, `협업 기능`, `호환성`, `검증 가능성`을 비교 대상에 포함한다.

## 비교 기준

비교 기준은 `2026-03-14` 시점의 Figma 공식 제품 기능이다.

포함 범위:

- Figma Design에서 직접 겹치는 기능
- Dev Mode
- component / variant / property / library
- variables / collections / modes
- prototype / flow / overlay / smart animate
- plugin / widget / internal resources / approval workflow
- branch / review / merge / compare
- import / export / `.fig` 호환
- renderer / large document / long-session 안정성

제외 범위:

- 시장 점유율
- 사용자 수
- 실제 커뮤니티 규모
- 매출 / 유통량 / 외부 생태계 크기

## 핵심 선언

아래 명제는 앞으로 문서와 구현에서 동시에 참이어야 한다.

1. `Phase A`는 single-player design core를 다루는 단계다.
2. `Phase B`, `Phase C`는 **그 외 모든 Figma-overlapping editor 기능**을 닫는 최종 단계다.
3. 따라서 `Phase B`, `Phase C`가 완료되었는데도 남은 Figma-overlapping 기능이 있다면, 그 완료 선언은 무효다.
4. `추가 작업이 남는다`는 말이 가능한 상태에서는 `Phase B 완료`, `Phase C 완료`, `전체 10점 고정`을 선언할 수 없다.

## 최종 완료의 의미

`최종 완료`는 아래를 동시에 뜻한다.

- Figma와 겹치는 에디터 기능 범위에서 알려진 기능 갭이 0이다.
- 알려진 구조적 fallback이 0이다.
- 별도 `Phase D`, `차후 작업`, `나중에` 목록이 없다.
- 남은 일은 오직 유지보수, 버그 수정, Figma의 미래 변경 추적뿐이다.

즉 `B/C 완료 후 추가 작업 없음`은 아래 의미다.

- 현재 알고 있는 전체 에디터 범위를 기준으로 더 만들 기능이 없다.
- `있으면 좋은 것`도 Figma-overlapping 기능이라면 이미 B/C 안에 들어가 있어야 한다.
- 구현 이후 새로 발견된 누락 기능은 즉시 B 또는 C를 다시 미완료 상태로 되돌린다.

## B/C가 반드시 포함해야 하는 잔여 범위

### Phase B

Phase B는 아래를 전부 포함해야 한다.

1. library publish / consume / update
2. component / variant / property sync와 review
3. Dev Mode compare / inspect / handoff / code-linked workflow
4. ready-for-dev / annotation / measurement / codegen parity
5. branch / compare / review / merge 흐름
6. plugin catalog의 검색 / 상세 / 승인 / 저장 / 배포 흐름
7. widget store의 listing / install / update / share / approval 흐름
8. plugin + widget + library + internal templates를 아우르는 resource hub

### Phase C

Phase C는 아래를 전부 포함해야 한다.

1. renderer 전환 경로와 대문서 기준 확정
2. CRDT multiplayer와 merge / conflict resolution
3. direct `.fig` compatibility 심화
4. import/export roundtrip 손실 최소화
5. `ignoreBuildErrors` 제거
6. 전체 typecheck / build / test 복구
7. 장시간 세션 / 대문서 / 멀티세션 스트레스 검증

## 완료 금지 조건

아래 중 하나라도 남아 있으면 B/C 완료를 선언할 수 없다.

- Figma 공식 기능 중 겹치는 기능인데 아직 구현되지 않음
- 구현은 되었지만 import/export/roundtrip 중 하나가 무너짐
- editor/runtime/handoff 중 하나에서만 되고 나머지 경로가 비어 있음
- 내부 문서에 `추가로 해야 함`, `후속 작업`, `추후`, `나중에`, `별도 phase`가 남아 있음
- representative fixture가 빠져 있음
- known fallback이 아직 일반 경로에 남아 있음
- `build`는 되지만 `typecheck`가 깨져 있음

## 판정 규칙

최종적으로 아래가 모두 참일 때만
`Figma와 동일 수준 또는 그 이상`, `추가 작업 없음`, `전체 10점 고정`
을 동시에 말할 수 있다.

1. [에디터_Figma_10점_고정_판정_기준.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_10점_고정_판정_기준.md)의 전 항목이 충족된다.
2. [에디터_Figma_PhaseB_구현_준비.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_PhaseB_구현_준비.md)의 전 항목이 체크된다.
3. [에디터_Figma_PhaseC_구현_준비.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_PhaseC_구현_준비.md)의 전 항목이 체크된다.
4. 이 문서에 적은 `완료 금지 조건`에 해당하는 항목이 하나도 없다.

## 참고한 Figma 공식 자료

- Auto layout: https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout
- Guides + constraints: https://help.figma.com/hc/en-us/articles/360039957934-Combine-layout-guides-and-constraints
- Variables: https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes
- Component properties: https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties
- Dev Mode: https://help.figma.com/hc/en-us/articles/15023124644247-Guide-to-Dev-Mode
- Compare changes: https://help.figma.com/hc/en-us/articles/15023193382935-Compare-changes-in-Dev-Mode
- Code Connect: https://developers.figma.com/docs/code-connect/
- MCP server: https://developers.figma.com/docs/figma-mcp-server/
- Branching: https://help.figma.com/hc/en-us/articles/360063144053-Create-branches-and-merge-changes
- Branch review: https://help.figma.com/hc/en-us/articles/5691414603543-Request-a-branch-review
- Library publish: https://help.figma.com/hc/en-us/articles/360025508373-Publish-a-library
- Library updates: https://help.figma.com/hc/en-us/articles/360039234193-Review-and-accept-library-updates
- Resources: https://help.figma.com/hc/en-us/articles/31668820539287-Find-and-use-templates-and-resources-from-your-team-or-organization
- Plugin / widget org approval: https://help.figma.com/hc/en-us/articles/4404228724759-Manage-plugins-and-widgets-in-an-organization
- Plugin / widget request approval: https://help.figma.com/hc/en-us/articles/17882120337815-Request-approval-to-use-a-widget-or-plugin
- Widget publishing: https://help.figma.com/hc/en-us/articles/4410337103639-Publish-widgets-to-the-Figma-Community
