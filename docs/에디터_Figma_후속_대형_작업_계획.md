# 에디터 Figma 후속 대형 작업 계획

이 문서는 현재 체크리스트 `240 / 240` 완료 이후,
실제 제품을 더 Figma에 가깝게 만들기 위해 남은 큰 덩어리를
`최소 분할` 기준으로 다시 자른 문서다.

원칙은 두 가지다.

1. 분할 수는 최소로 잡는다.
2. 한 덩어리는 실제로 끝까지 밀 수 있을 만큼만 묶는다.

결론부터 적으면:

- `2덩어리`는 너무 크고 위험하다.
- `3덩어리`가 현재 기준 최소이자 현실적인 분할이다.

## 1. 실제 Figma 기준으로 더 있는 것

이번 비교는 `2026-03-13` 기준 Figma 공식 문서와 공식 제품 페이지 기준이다.

확인한 공식 근거:

- Developer platform / plugin / widget / community:
  - https://developers.figma.com/
- Auto layout:
  - https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout
- Layout guides + constraints:
  - https://help.figma.com/hc/en-us/articles/360039957934-Combine-layout-guides-and-constraints
- Variables / collections / modes:
  - https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes
- Component properties:
  - https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties
- Dev Mode:
  - https://www.figma.com/dev-mode/
- Widgets:
  - https://help.figma.com/hc/en-us/articles/4410047809431-Use-widgets-in-files
  - https://help.figma.com/hc/en-us/articles/4410337103639-Publish-widgets-to-the-Figma-Community
- Branching:
  - https://help.figma.com/hc/en-us/articles/360063144053-Guide-to-branching
- Internal resources / plugins / widgets:
  - https://help.figma.com/hc/en-us/articles/31668820539287-Find-and-use-templates-and-resources-from-your-team-or-organization
  - https://help.figma.com/hc/en-us/articles/4404228724759-Manage-plugins-and-widgets-in-an-organization

현재 NULL 대비 실제 Figma에 더 있는 핵심은 아래다.

- auto layout의 `grid flow`, `ignore auto layout`, layout guide와 constraints 우선순위
  - Figma는 `Ignore auto layout`을 별도 상태로 두고, 그 상태의 레이어에 constraints를 적용한다.
  - Figma는 `layout grid`를 `layout guide`로 재정의했고, auto layout의 grid와 다른 개념으로 다룬다.
- variables의 더 넓은 바인딩 범위
  - gradient stop
  - shadow effect
  - text/string/boolean 변수 활용
  - variable alias 체계의 더 넓은 적용
- component property / variant / component playground의 더 강한 handoff 체계
- Dev Mode의 `Code Connect`, compare changes, component playground, code-linked handoff
  - Ready for dev
  - Focus view
  - 측정값/어노테이션
  - 코드 스니펫
  - VS Code extension
  - Figma MCP server
- branch / review / merge / conflict 해소 흐름
- Figma Community 기반 plugin / widget 공개 배포, 조직 승인, 내부 리소스 배포
  - 팀/조직 Resource space
  - admin approval / request flow
  - saved plugins/widgets
  - listing / share URL
  - paid widgets / trial / pricing / licensing
- widget의 실제 배포/업데이트/권한/보안 공개 흐름
- richer text / typography / full prototype export
- direct `.fig` 수준 호환과 더 강한 roundtrip
- 대규모 실시간 협업을 위한 더 강한 merge 모델

중요:

Figma 공식 제품군은 이제 Figma Design만이 아니다.
공식 도움말에는 `Figma Design`, `Dev Mode`, `FigJam`, `Figma Slides`, `Figma Draw`, `Figma Sites`, `Figma Make`, `Figma Buzz`까지 보인다.

하지만 현재 프로젝트 목표는 우선 `Figma Design + Dev Mode + Community/Extensions` 축으로 보는 게 맞다.
제품군 전체를 한 번에 따라가는 것은 범위가 너무 커진다.

## 2. 현재 저장소에서 이미 있는 것

### 2.1 Plugin store

현재 저장소에는 `plugin store`가 이미 있다.

근거 파일:

- `src/lib/plugin-store.ts`
- `src/lib/app-plugins.ts`
- `src/app/api/plugins/store/route.ts`
- `src/app/api/app/[pageId]/plugins/store/route.ts`
- `tests/plugin-store.test.ts`

현재 상태:

- 전역 catalog API 있음
- 페이지에 store plugin 설치 API 있음
- permission grant 구조 있음
- update policy 구조 있음
- curated catalog 있음

현재 catalog는 3개다.

- `Align Kit`
- `Export Pack`
- `Performance Toggle`

즉, `플러그인 마켓/스토어`는 이미 "기초 구현 완료" 상태다.
다만 현재 구현은 `curated internal store`에 가깝고, Figma Community 급 marketplace는 아니다.

부족한 점:

- 공개 listing
- 검색/카테고리/리뷰/설명 페이지
- 외부 제출/검수 흐름
- 조직 승인/보안 공개 UI
- 유료/무료/라이선스
- widget까지 통합된 리소스 허브
- Community URL/share flow
- 조직 단위 saved resources / request approval flow

### 2.2 Widget

현재 저장소에는 `widget node + widget sandbox`는 있다.

근거 파일:

- `src/advanced/runtime/widget-sandbox.tsx`
- `src/advanced/ui/AdvancedEditorCanvasNode.tsx`
- `src/advanced/ui/AdvancedEditor.nodes.ts`
- `src/advanced/ui/AdvancedEditorView.tsx`

현재 상태:

- editor에서 widget node 생성 가능
- HTML / URL 기반 widget 삽입 가능
- canvas/runtime에서 sandbox 실행 가능

하지만 `widget market/store`는 현재 없다.
즉, 실행 엔진은 있지만 배포/발견/승인/업데이트/라이선스/가격 정책 계층은 비어 있다.

즉:

- `widget runtime`은 있음
- `widget marketplace`는 없음

이 차이는 분명히 구분해야 한다.

## 3. 최소 분할 기준 후속 작업

현재 기준 최소 분할은 아래 3덩어리다.

### Phase A. Figma Design Core 완성 배치

목표:
- single-player design editor를 Figma Design에 더 가깝게 만든다.

묶는 범위:

- text engine 심화
  - richer typography
  - span/range style 모델
  - text property와 rich text 충돌 정리
  - text-on-path 실제 구현
- vector / boolean / mask 심화
  - editable semantic 유지 강화
  - vector network 편집 모델 고도화
- auto layout / layout guide / constraints 심화
  - grid flow
  - ignore auto layout
  - layout guide 우선순위
  - guide + constraints 상호작용
- variables / styles 확장
  - fill/stroke 외 effect/text/gradient stop 쪽 binding
  - alias roundtrip 강화
- prototype export / roundtrip 강화

이걸 한 덩어리로 보는 이유:

- 전부 문서 모델, 편집기, export/import, renderer가 같이 얽힌다.
- 따로 찢으면 중간 상태가 많아진다.
- 사용자가 체감하는 "Figma답다"는 거의 이 묶음에서 결정된다.

완료 조건:

- `NULL -> Figma -> NULL` roundtrip 범위 확대
- 대표 fixture 확대
- Figma Design 핵심 편집 경험에서 큰 격차 감소

### Phase B. Dev Mode + Design System + Resource Hub 배치

목표:
- Figma의 design-system / handoff / resource distribution 축을 따라간다.

묶는 범위:

- library publish / consume / update 실제 구현
- branch / version compare / review 근접 기능
- Dev Mode 심화
  - compare changes
  - component playground
  - code-linked handoff
  - codegen 안정화
- plugin store 고도화
  - catalog 검색/분류
  - listing detail
  - 승인/권한/보안 메타
- widget store 추가
  - plugin과 같은 리소스 허브로 통합

이걸 한 덩어리로 보는 이유:

- 전부 "팀 협업과 handoff" 계층이다.
- editor 코어와는 성격이 다르지만, Figma 전체 경험에서는 같은 묶음이다.
- 여기서부터는 단순 캔버스가 아니라 제품 플랫폼이 된다.

완료 조건:

- internal resource hub가 plugin + widget + library를 함께 다룸
- Dev Mode가 inspect 보조 수준을 넘어 실제 handoff 계층이 됨
- component/variant/property가 개발자 입장에서 더 직접적으로 연결됨

### Phase C. Scale / Infra / Direct Compatibility 배치

목표:
- Figma급 스케일과 구조를 맞춘다.

묶는 범위:

- renderer 전환
  - DOM/SVG 한계 구간 정리
  - canvas/WebGL 경로 본격화
- CRDT multiplayer
  - Yjs 계열 동시편집
  - merge / branch / conflict 정교화
- direct `.fig` 호환 심화
- 전체 타입 검증 복구
- 대문서 성능 검증

이걸 한 덩어리로 보는 이유:

- 전부 인프라 성격이다.
- 코어 기능보다 리스크가 크고, 설계가 먼저 흔들리면 앞 단계가 다 흔들린다.
- 이건 사실상 "Figma처럼 버티는가"를 결정하는 마지막 층이다.

완료 조건:

- 대문서/장시간 세션/동시편집에서 붕괴하지 않음
- build/test뿐 아니라 타입 게이트도 복구
- direct compatibility가 더 강해짐

## 4. 바로 다음에 들어가야 할 것

다음 시작점은 `Phase A`가 맞다.

실제 착수용 세부 준비 문서는 아래다.

- [에디터_Figma_PhaseA_구현_준비.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_PhaseA_구현_준비.md)
- [에디터_Figma_10점_고정_판정_기준.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_10점_고정_판정_기준.md)

그 안에서도 첫 시작은 이 순서가 가장 효율적이다.

1. text engine
2. auto layout grid / ignore auto layout / layout guide
3. vector semantic 편집 심화
4. variable binding 범위 확대
5. prototype export / roundtrip

이 순서가 맞는 이유:

- 지금 제일 부족한 체감 품질이 text와 layout이다.
- Figma 공식 문서 기준으로도 auto layout grid, ignore auto layout, layout guide/constraints 조합이 현재 핵심 차이점이다.
- vector는 이미 기반을 많이 깔아둔 상태라, text/layout을 먼저 올린 뒤 붙이는 편이 전체 효율이 높다.

## 5. 한 번에 가능한가

답:

- `전체 남은 것 전부를 한 번에`는 불가능에 가깝다.
- `위 3덩어리 중 1덩어리씩`은 가능하다.
- `2덩어리`로 줄이는 것도 가능은 하지만, editor core와 infra를 억지로 묶게 돼서 롤백/검증 비용이 급격히 커진다.

즉, 현실적인 최대 단위는:

- 한 번에 `Phase A`
- 그 다음 `Phase B`
- 마지막 `Phase C`

이보다 더 크게 묶으면 리스크가 너무 커진다.

## 6. 결론

현재 상태는 이렇다.

- 기존 체크리스트는 완료
- plugin store는 이미 있음
- widget runtime은 이미 있음
- widget marketplace는 아직 없음
- 실제 Figma 기준으로는 아직 `Design Core`, `Dev/Resource Hub`, `Scale/Infra` 3축이 남아 있음

따라서 다음 액션은 단순하다.

- `Phase A`를 바로 시작하면 된다.
- 그리고 이게 현재 기준 `최소 분할의 최대 덩어리`다.
- 실제 구현 순서와 수정 파일, shadow module, 검증 명령은 [에디터_Figma_PhaseA_구현_준비.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_PhaseA_구현_준비.md)에 고정한다.
- 최종적으로 `모든 범위 10점 고정`은 [에디터_Figma_10점_고정_판정_기준.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_10점_고정_판정_기준.md)의 조건을 모두 통과해야만 쓸 수 있다.
