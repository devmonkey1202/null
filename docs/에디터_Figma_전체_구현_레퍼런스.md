# 에디터 Figma 전체 구현 레퍼런스
기준 날짜: `2026-03-16`

## 목적
이 문서는 `Figma와 겹치는 전체 기능 범위`를 구현하기 위한 마스터 레퍼런스입니다.

이 문서에 담는 것:
- 왜 현재 NULL이 핵심 기준으로 `8점대`인지
- `10점`으로 가기 위해 남은 핵심 기능이 무엇인지
- 자잘한 편의 기능과 생태계 기능까지 포함한 전체 구현 대상
- `html.to.design` 류의 웹 / HTML / 코드 import 기능
- 각 기능의 현재 상태와 구현 대상 여부

주의:
- `direct .fig` 바이너리 자체는 별도 보류 문서로 관리합니다.
- 이 문서는 `시장 규모`나 `실사용자 수`가 아니라 `제품 기능` 기준입니다.

관련 문서:
- [에디터_Figma_마이크로기능_전수표.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_마이크로기능_전수표.md)
- [에디터_Figma_직접_호환_보류_정리.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_직접_호환_보류_정리.md)
- [에디터_Figma_10점_고정_판정_기준.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_10점_고정_판정_기준.md)

## 1. 왜 현재 8점대인가

현재 NULL은 이미 `큰 엔진이 없는 상태`가 아닙니다.
핵심 축은 대부분 존재하고 실제 코드/테스트/UI 흐름도 있습니다.

그런데 아직 `10점`이 아닌 이유는 아래처럼 `마지막 디테일 층`이 남아 있기 때문입니다.

### 1.1 텍스트 디테일이 아직 완전히 닫히지 않음

- `text-on-path`는 있지만 세밀한 핸들 편집은 아직 부족합니다.
- OpenType 세부 기능 패널은 없습니다.
- rich text span 편집 UX도 더 정교해질 여지가 있습니다.

### 1.2 변수 / 스타일 바인딩이 전영역 1:1은 아님

- `fill / stroke` 바인딩은 강합니다.
- 하지만 `effect / text / gradient stop binding`은 아직 부분적입니다.

### 1.3 프로토타입은 주 기능은 되지만 전수 parity는 아님

- overlay
- flow start
- smart animate
- export / roundtrip

이 축은 이미 강합니다.
하지만 아래는 아직 더 필요합니다.

- `scroll trigger`
- `hover trigger`
- `drag trigger`
- `interactive component`의 더 넓은 parity

### 1.4 Dev Mode가 외부 생태계 수준으로는 아직 닫히지 않음

현재 있는 것:
- inspect
- spec payload
- ready-for-dev
- annotation
- compare changes
- codegen

아직 없는 것:
- Code Connect급 외부 코드베이스 연결
- MCP server parity

### 1.5 협업 / 리뷰는 강하지만 마지막 마감도가 남음

현재 있는 것:
- operation 기반 문서 sync
- late join recovery
- branch compare
- review metadata
- merge / conflict 경로

아직 남은 것:
- 리뷰 권한의 더 세밀한 정책화
- 조직 정책 / 감사 / 승인 흐름의 완전 마감

### 1.6 웹 / 외부 콘텐츠 import 계열이 아직 없음

예:
- 웹사이트 URL -> 편집 가능한 프레임
- HTML/CSS 코드 -> 편집 가능한 프레임
- private page / local page capture
- `.mhtml / .html / .zip` 기반 웹문서 import

## 2. 10점으로 가려면 무엇을 더 해야 하는가

핵심만 압축하면 아래 6개입니다.

### 2.1 텍스트 마감

- [ ] text-on-path 세밀 핸들 편집
- [ ] OpenType 세부 패널
- [ ] rich span 편집 UX 추가 정교화

### 2.2 변수 / 스타일의 완전 바인딩

- [ ] effect binding
- [ ] text binding
- [ ] gradient stop binding

### 2.3 프로토타입 parity 확대

- [ ] scroll trigger
- [ ] hover trigger
- [ ] drag trigger
- [ ] interactive component parity

### 2.4 Dev Mode 외부 연동

- [ ] Code Connect급 외부 연결
- [ ] MCP server parity

### 2.5 협업 / 워크플로 마감

- [ ] 리뷰 권한 세분화
- [ ] 조직 정책 / 권한 / 감사 연결
- [ ] plugin/widget approval 마감

### 2.6 외부 콘텐츠 import

- [ ] URL -> editable frame
- [ ] HTML/CSS -> editable frame
- [ ] local webpage / archive -> editable frame

## 3. 전체 구현 대상

상태 규칙:
- `완료`
- `부분`
- `미구현`
- `보류`

### 3.1 코어 디자인 엔진

| 영역 | 상태 | 메모 |
|---|---|---|
| 캔버스 기본 편집 | 완료 | 선택/이동/리사이즈/정렬/분배 |
| 스냅 / 가이드 / 거리 표시 | 완료 | 실사용 가능 수준 |
| Auto Layout / Constraints / Grid flow | 완료 | 핵심 구조 닫힘 |
| Ignore auto layout | 완료 | 구현됨 |
| Text core | 완료 | rich text / paragraph / auto resize |
| Text micro polish | 부분 | OpenType, 정밀 text-on-path |
| Vector / Boolean / Mask core | 완료 | semantic roundtrip 포함 |
| Vector micro polish | 부분 | 일부 세밀 편집 / 이미지 fill 편집 |
| Components / Variants / Properties | 완료 | core 닫힘 |
| Variables / Styles / Modes core | 완료 | 상당수 닫힘 |
| Variables / Styles advanced binding | 부분 | effect/text/gradient stop |
| Prototype core | 완료 | 주요 경로 닫힘 |
| Prototype micro parity | 부분 | trigger 전수 parity 여지 |

### 3.2 Dev / handoff / collaboration

| 영역 | 상태 | 메모 |
|---|---|---|
| Inspect / spec payload | 완료 | 구현됨 |
| Ready-for-dev / annotation | 완료 | 구현됨 |
| Compare changes | 완료 | 구현됨 |
| Codegen | 완료 | JSX/Tailwind/quick spec |
| Code-linked handoff | 완료 | 구현됨 |
| Code Connect급 외부 연동 | 미구현 | 현재 없음 |
| MCP parity | 미구현 | 현재 없음 |
| Presence / operation sync | 완료 | 구현됨 |
| Branch compare / review / merge | 완료 | 구현됨 |
| Review permission hardening | 부분 | 추가 세분화 여지 |

### 3.3 Library / plugin / widget / resource

| 영역 | 상태 | 메모 |
|---|---|---|
| Design library publish / consume / update | 완료 | 구현됨 |
| Plugin store | 완료 | curated store |
| Plugin search / detail / install / update | 완료 | 구현됨 |
| Plugin approval / request / save | 부분 | 마감 필요 |
| Widget runtime | 완료 | 구현됨 |
| Widget store listing / install / update | 완료 | 구현됨 |
| Widget share / detail / approval | 부분 | 마감 필요 |
| Resource hub | 완료 | 구현됨 |
| Org policy / permission / audit | 부분 | 마감 필요 |
| Community-grade public web catalog | 미구현 | 현재 없음 |

### 3.4 Import / export / direct compatibility

| 영역 | 상태 | 메모 |
|---|---|---|
| Figma REST import | 완료 | 구현됨 |
| Figma REST export | 완료 | 구현됨 |
| direct bundle import/export | 완료 | 구현됨 |
| direct package import/export | 완료 | 구현됨 |
| compatibility/fidelity report | 완료 | 구현됨 |
| direct `.fig` binary adapter hook | 완료 | 구현됨 |
| env 기반 외부 CLI adapter | 완료 | 구현됨 |
| 실제 direct `.fig` binary parser/writer | 보류 | 별도 문서 관리 |

## 4. 웹 / HTML / 코드 import 기능

이 섹션은 사용자가 말한 `html to null editor`에 해당하는 기능군입니다.

핵심 개념:
- 단순 이미지 import가 아니라
- `웹 / HTML / 코드 -> 편집 가능한 레이어 / 프레임 / 텍스트 / 스타일 구조`로 가져오는 기능입니다.

### 4.1 꼭 넣어야 하는 기능

| ID | 기능 | 상태 |
|---|---|---|
| WEB-001 | 공개 URL -> editable frame import | 완료 |
| WEB-002 | 여러 URL bulk import | 미구현 |
| WEB-003 | viewport 선택 import | 완료 |
| WEB-004 | theme 선택 import | 미구현 |
| WEB-005 | private page capture import | 미구현 |
| WEB-006 | local page capture import | 미구현 |
| WEB-007 | `.html`, `.htm` import | 미구현 |
| WEB-008 | `.zip` 웹페이지 import | 미구현 |
| WEB-009 | `.mhtml`, `.mht` import | 미구현 |
| WEB-010 | HTML/CSS 직접 입력 -> editable frame | 미구현 |
| WEB-011 | imported URL 재열기 / 재가져오기 | 완료 |
| WEB-012 | 언어별 import | 미구현 |
| WEB-013 | query mode 빠른 import | 미구현 |

### 4.2 html.to.design에서 확인되는 실제 기능

공식 문서 기준으로 확인된 기능:
- URL import
- browser extension capture
- private / local page capture
- `.h2d` import
- `.html`, `.htm`, `.zip`, `.mhtml`, `.mht` import
- HTML/CSS code editor import
- multilingual import
- query mode import
- open URL / re-import shortcut
- MCP 연결

관련 자료:
- What it is: https://html.to.design/docs/what-is-html-to-design/
- Web import: https://html.to.design/docs/web-tab/
- Browser extension: https://html.to.design/docs/extension-tab/
- Local files: https://html.to.design/docs/file-tab/
- HTML/CSS code import: https://html.to.design/docs/import-own-code/
- Private page: https://html.to.design/docs/import-private-page
- Query mode: https://html.to.design/docs/import-via-query-mode
- Language import: https://html.to.design/docs/import-webpages-in-any-language
- MCP: https://html.to.design/docs/mcp-tab

### 4.3 NULL에서 구현할 때의 권장 단계

#### 1단계
- [ ] 공개 URL import
- [ ] viewport 선택
- [ ] 재가져오기

#### 2단계
- [ ] HTML/CSS 직접 입력 import
- [ ] `.html`, `.zip`, `.mhtml` import

#### 3단계
- [ ] private page / extension capture
- [ ] 다국어 import
- [ ] bulk import

#### 4단계
- [ ] MCP / 외부 도구 연결

## 5. Figma 편의 기능 / 제품 마감 기능

아래는 코어 엔진 밖이지만, 제품 완성도를 크게 좌우하는 기능들입니다.

### 5.1 위젯 / 플러그인 생태계

- [x] curated plugin store
- [x] widget store 기초
- [ ] plugin approval / request / save 완전 마감
- [ ] widget detail / share / approval 완전 마감
- [ ] 라이선스 / 가격 / 무료체험 흐름
- [ ] creator profile / listing page

관련 자료:
- Widgets in files: https://help.figma.com/hc/en-us/articles/4410047809431-Use-widgets-in-files
- Publish widgets: https://help.figma.com/hc/en-us/articles/4410337103639-Publish-widgets-to-the-Figma-Community
- Org approval: https://help.figma.com/hc/en-us/articles/4404228724759-Manage-plugins-and-widgets-in-an-organization
- Review guidelines: https://help.figma.com/hc/en-us/articles/360039958914-Plugin-and-widget-review-guidelines
- Licensing: https://help.figma.com/hc/en-us/articles/360042296374-Figma-Community-copyright-and-licensing

### 5.2 디자인 시스템 / 컴포넌트 생태계

- [x] component / variant / property core
- [x] design library publish / consume / update
- [ ] component property 고급 edge case
- [ ] 더 깊은 library review / accept UX

관련 자료:
- Components: https://help.figma.com/hc/en-us/articles/360038662654-Guide-to-Components-in-Figma
- Component properties: https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties

### 5.3 Variables / modes / token ergonomics

- [x] local variables / modes
- [x] alias import
- [x] mode switching core
- [ ] effect/text/gradient stop 전수 binding
- [ ] object/page mode UX 미세 마감

관련 자료:
- Variables guide: https://help.figma.com/hc/en-us/articles/15339657135383-Guide-to-variables-in-Figma
- Modes: https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables

### 5.4 Dev Mode / compare / engineering workflow

- [x] inspect
- [x] compare changes
- [x] codegen
- [x] ready-for-dev
- [ ] Code Connect급 외부 연결
- [ ] MCP parity

관련 자료:
- Dev Mode: https://help.figma.com/hc/en-us/articles/15023124644247-Guide-to-Dev-Mode
- Compare changes: https://help.figma.com/hc/en-us/articles/15023193382935-Compare-changes-in-Dev-Mode
- Code Connect: https://developers.figma.com/docs/code-connect/
- MCP server: https://developers.figma.com/docs/figma-mcp-server/

### 5.5 브랜치 / 리뷰 / 머지

- [x] branch compare / merge 경로
- [x] review metadata
- [ ] 권한 세분화
- [ ] 리뷰 UI의 더 완전한 워크플로

관련 자료:
- Branching: https://help.figma.com/hc/en-us/articles/360063144053-Create-branches-and-merge-changes
- Branch review: https://help.figma.com/hc/en-us/articles/5691414603543-Request-a-branch-review

## 6. 구현 우선순위

전부 구현한다면, 실제 효율 순서는 아래가 맞습니다.

### 6.1 1차
- [x] WEB-001 공개 URL import
- [ ] WEB-010 HTML/CSS 직접 입력 import
- [ ] text-on-path 세밀 핸들 편집
- [ ] effect / text / gradient stop binding

### 6.2 2차
- [ ] prototype trigger parity
- [ ] OpenType 패널
- [ ] plugin/widget approval 마감
- [ ] org policy / audit 마감

### 6.3 3차
- [ ] Code Connect급 외부 handoff
- [ ] MCP parity
- [ ] bulk import / private page capture / language import

## 7. 가장 중요한 결론

1. 현재 NULL은 이미 `큰 엔진이 빠진 상태`가 아닙니다.
2. 지금 8점대인 이유는 `핵심 엔진 부재`가 아니라 `마지막 디테일 층`이 남아 있기 때문입니다.
3. 사용자가 말한 `html to null editor`류 기능은 실제로 구현 가치가 크고, Figma 확장 생태계와도 겹칩니다.
4. `direct .fig`를 제외해도 아직 구현할 편의 기능과 확장 기능은 꽤 남아 있습니다.
5. 하지만 이 남은 것들은 대부분 이미 있는 구조 위에 쌓는 작업입니다. 바닥부터 다시 만드는 성격은 아닙니다.
