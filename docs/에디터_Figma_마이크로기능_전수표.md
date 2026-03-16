# 에디터 Figma 마이크로기능 전수표
기준 날짜: `2026-03-15`

## 목적
이 문서는 Figma와 겹치는 수많은 자잘한 기능들을 한 번에 추적하기 위한 전수표입니다.

이 문서에는 다음을 같이 적습니다.
- 현재 상태
- 구현 여부
- 부분 구현 여부
- 나중에 붙일 외부 플러그인 / importer 후보

## 상태 규칙

- `완료`: 현재 코드와 UI 기준으로 존재하며, 이 저장소 안에서 실제로 쓰는 흐름이 있음
- `부분`: 일부 구현됐지만 아직 Figma와 1:1로 닫혔다고 보긴 어려움
- `미구현`: 현재 저장소에 없음
- `보류`: 구현 방향은 있으나 지금은 일부러 닫지 않음

## 기준 메모

- 이 문서는 `직접 .fig 바이너리`를 제외한 나머지 마이크로 기능을 전수 추적하는 문서입니다.
- `직접 .fig`는 별도 문서로 보류합니다:
  - [에디터_Figma_직접_호환_보류_정리.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_직접_호환_보류_정리.md)
- `html.to.design` 류 기능은 현재 Figma 코어라기보다 `커뮤니티 플러그인 / Figma Make 연동 생태계`에 가까운 축으로 분류합니다.

관련 공식 자료:
- https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout
- https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes
- https://help.figma.com/hc/en-us/articles/15023124644247-Guide-to-Dev-Mode
- https://help.figma.com/hc/en-us/articles/360063144053-Create-branches-and-merge-changes
- https://help.figma.com/hc/en-us/articles/4410047809431-Use-widgets-in-files
- https://help.figma.com/hc/en-us/articles/4410337103639-Publish-widgets-to-the-Figma-Community
- https://help.figma.com/hc/en-us/articles/4404228724759-Manage-plugins-and-widgets-in-an-organization
- https://www.figma.com/blog/bringing-figma-make-to-the-canvas/
- https://www.html.to.design/

마스터 레퍼런스:
- [에디터_Figma_전체_구현_레퍼런스.md](C:/Users/주원/Desktop/null/docs/에디터_Figma_전체_구현_레퍼런스.md)

## 1. 웹 / 외부 콘텐츠 가져오기

| ID | 기능 | 상태 | 메모 |
|---|---|---|---|
| MF-001 | Figma REST file JSON import | 완료 | 현재 구현됨 |
| MF-002 | direct bundle import | 완료 | 현재 구현됨 |
| MF-003 | fig package zip import | 완료 | 현재 구현됨 |
| MF-004 | 웹사이트 URL -> 편집 가능한 프레임 import | 완료 | 공개 URL + viewport + 재가져오기 기준 구현 완료 |
| MF-005 | HTML snippet -> 편집 가능한 프레임 import | 미구현 | 별도 importer 필요 |
| MF-006 | 라이브 HTML / 프로토타입 -> 디자인 캔버스로 되가져오기 | 미구현 | 현재 없음 |
| MF-007 | 스크린샷 -> 편집 가능한 레이어 분해 import | 미구현 | 현재 없음 |
| MF-008 | 외부 URL import를 플러그인에서 호출하는 경로 | 미구현 | 플러그인 확장 후보 |

## 2. 캔버스 / 보기 / 패널

| ID | 기능 | 상태 | 메모 |
|---|---|---|---|
| MF-009 | 페이지 / 레이어 / 자산 패널 | 완료 | 현재 UI에 있음 |
| MF-010 | 레이어 검색 | 완료 | 현재 UI에 있음 |
| MF-011 | 트리 / 필터 전환 | 완료 | 현재 UI에 있음 |
| MF-012 | 모두 접기 / 모두 펼치기 | 완료 | 현재 UI에 있음 |
| MF-013 | 줌 인 / 줌 아웃 / 100% | 완료 | 현재 UI에 있음 |
| MF-014 | 미리보기 모드 | 완료 | 현재 UI에 있음 |
| MF-015 | 라이브 모드 | 완료 | 현재 UI에 있음 |
| MF-016 | 캔버스 미니맵 | 미구현 | 현재 없음 |
| MF-017 | 캔버스 룰러 | 부분 | 가이드 기능은 있으나 룰러 UI는 별도 점검 필요 |
| MF-018 | 캔버스 배경 grid / guide 시각화 | 완료 | 현재 있음 |

## 3. 선택 / 정렬 / 스냅 / 가이드

| ID | 기능 | 상태 | 메모 |
|---|---|---|---|
| MF-019 | 단일 / 다중 선택 | 완료 | 현재 구현됨 |
| MF-020 | 왼쪽 / 가운데 / 오른쪽 정렬 | 완료 | 현재 구현됨 |
| MF-021 | 위 / 중간 / 아래 정렬 | 완료 | 현재 구현됨 |
| MF-022 | 같은 너비 / 같은 높이 | 완료 | 현재 구현됨 |
| MF-023 | 가로 분배 / 세로 분배 | 완료 | 현재 구현됨 |
| MF-024 | 가로 뒤집기 / 세로 뒤집기 | 완료 | 현재 구현됨 |
| MF-025 | 스마트 스냅 | 완료 | 현재 구현됨 |
| MF-026 | 픽셀 스냅 | 완료 | 현재 구현됨 |
| MF-027 | 가이드 추가 / 삭제 / 전체 삭제 | 완료 | 현재 구현됨 |
| MF-028 | 거리 표시 / spacing guide | 완료 | 현재 구현됨 |
| MF-029 | 회전 정밀도 보정 | 완료 | 현재 구현됨 |
| MF-030 | 잠금 / 숨김 / 깊은 선택 처리 | 부분 | 세부 edge case 점검 여지 있음 |

## 4. 프레임 / 오토레이아웃 / 제약

| ID | 기능 | 상태 | 메모 |
|---|---|---|---|
| MF-031 | frame 생성 / 기본 편집 | 완료 | 현재 구현됨 |
| MF-032 | section 생성 / 기본 편집 | 완료 | 현재 구현됨 |
| MF-033 | auto layout direction / align / gap | 완료 | 현재 구현됨 |
| MF-034 | auto layout wrap | 완료 | 현재 구현됨 |
| MF-035 | auto layout grid flow | 완료 | 현재 구현됨 |
| MF-036 | hug / fill / fixed sizing | 완료 | 현재 구현됨 |
| MF-037 | min / max clamp | 완료 | 현재 구현됨 |
| MF-038 | baseline align | 완료 | 현재 구현됨 |
| MF-039 | nested overflow / hug 보정 | 완료 | 현재 구현됨 |
| MF-040 | ignore auto layout | 완료 | 현재 구현됨 |
| MF-041 | layout guide + constraints 우선순위 | 완료 | 현재 구현됨 |
| MF-042 | constraints 4x4 preset UI | 완료 | 현재 구현됨 |

## 5. 텍스트

| ID | 기능 | 상태 | 메모 |
|---|---|---|---|
| MF-043 | 텍스트 박스 생성 / 편집 | 완료 | 현재 구현됨 |
| MF-044 | rich text range / span model | 완료 | 현재 구현됨 |
| MF-045 | range별 글꼴 / 굵기 / 장식 편집 | 완료 | 현재 구현됨 |
| MF-046 | justify 정렬 | 완료 | 현재 구현됨 |
| MF-047 | paragraph spacing | 완료 | 현재 구현됨 |
| MF-048 | line-height / letter-spacing import-export | 완료 | 현재 구현됨 |
| MF-049 | text auto resize | 완료 | 현재 구현됨 |
| MF-050 | width/height auto resize parity | 완료 | 현재 구현됨 |
| MF-051 | kerning / baseline metric 보정 | 완료 | 현재 구현됨 |
| MF-052 | text-on-path 기본 기능 | 완료 | 현재 구현됨 |
| MF-053 | text-on-path 핸들 수준의 세밀 편집 | 부분 | 기본 preset과 layout은 있음 |
| MF-054 | OpenType 세부 기능 패널 | 미구현 | 현재 없음 |

## 6. 벡터 / 도형 / Boolean / Mask

| ID | 기능 | 상태 | 메모 |
|---|---|---|---|
| MF-055 | 사각형 / 다각형 / 별 / 기본 도형 | 완료 | 현재 구현됨 |
| MF-056 | 패스 편집 | 완료 | 현재 구현됨 |
| MF-057 | anchor 추가 / 삭제 | 완료 | 현재 구현됨 |
| MF-058 | smooth / corner 전환 | 완료 | 현재 구현됨 |
| MF-059 | vector network 저장 및 렌더 | 완료 | 현재 구현됨 |
| MF-060 | vector network 기반 path 복원 | 완료 | 현재 구현됨 |
| MF-061 | boolean semantic trace 보존 | 완료 | 현재 구현됨 |
| MF-062 | boolean roundtrip | 완료 | 현재 구현됨 |
| MF-063 | ordered mask chain | 완료 | 현재 구현됨 |
| MF-064 | multi-path semantic roundtrip | 완료 | 현재 구현됨 |
| MF-065 | blend / effect의 고급 edge case | 부분 | 일부만 검증됨 |
| MF-066 | 이미지 fill의 세밀한 crop / focal 편집 | 부분 | 일부 흐름만 존재 |

## 7. 컴포넌트 / Variants / 스타일 / 변수

| ID | 기능 | 상태 | 메모 |
|---|---|---|---|
| MF-067 | component 생성 | 완료 | 현재 구현됨 |
| MF-068 | component set / variants | 완료 | 현재 구현됨 |
| MF-069 | variant axis / value 편집 | 완료 | 현재 구현됨 |
| MF-070 | instance swap | 완료 | 현재 구현됨 |
| MF-071 | text / boolean / instance component properties | 완료 | 현재 구현됨 |
| MF-072 | component playground | 완료 | 현재 구현됨 |
| MF-073 | style library fill / stroke / text / effect 등록 | 완료 | 현재 구현됨 |
| MF-074 | design library publish / consume / update | 완료 | 현재 구현됨 |
| MF-075 | local variables / modes | 완료 | 현재 구현됨 |
| MF-076 | alias variable import | 완료 | 현재 구현됨 |
| MF-077 | fill / stroke variable binding | 완료 | 현재 구현됨 |
| MF-078 | effect / text / gradient stop binding | 부분 | 일부는 있으나 전부 1:1로 닫힌 상태는 아님 |

## 8. 프로토타입

| ID | 기능 | 상태 | 메모 |
|---|---|---|---|
| MF-079 | interaction 편집 | 완료 | 현재 구현됨 |
| MF-080 | overlay | 완료 | 현재 구현됨 |
| MF-081 | flow start page | 완료 | 현재 구현됨 |
| MF-082 | smart animate 매칭 기반 전환 | 완료 | 현재 구현됨 |
| MF-083 | after-timeout / delay 복원 | 완료 | 현재 구현됨 |
| MF-084 | runtime prototype playback | 완료 | 현재 구현됨 |
| MF-085 | prototype export | 완료 | 현재 구현됨 |
| MF-086 | prototype roundtrip | 완료 | 현재 구현됨 |
| MF-087 | scroll / hover / drag trigger 전수 parity | 부분 | 일부 trigger는 추가 검증 여지 있음 |
| MF-088 | 복합 interactive component parity | 부분 | 현재 일부만 닫힘 |

## 9. Dev Mode / handoff

| ID | 기능 | 상태 | 메모 |
|---|---|---|---|
| MF-089 | inspect payload | 완료 | 현재 구현됨 |
| MF-090 | spec payload | 완료 | 현재 구현됨 |
| MF-091 | ready-for-dev | 완료 | 현재 구현됨 |
| MF-092 | annotation | 완료 | 현재 구현됨 |
| MF-093 | compare changes | 완료 | 현재 구현됨 |
| MF-094 | code-linked handoff | 완료 | 현재 구현됨 |
| MF-095 | JSX / Tailwind / quick spec codegen | 완료 | 현재 구현됨 |
| MF-096 | export naming / manifest pipeline | 완료 | 현재 구현됨 |
| MF-097 | Code Connect급 외부 코드베이스 연동 | 미구현 | 현재 없음 |
| MF-098 | MCP server parity | 미구현 | 현재 없음 |

## 10. 협업 / 버전 / 브랜치

| ID | 기능 | 상태 | 메모 |
|---|---|---|---|
| MF-099 | presence | 완료 | 현재 구현됨 |
| MF-100 | operation 기반 문서 sync | 완료 | 현재 구현됨 |
| MF-101 | late join recovery | 완료 | 현재 구현됨 |
| MF-102 | bounded history / merge helper | 완료 | 현재 구현됨 |
| MF-103 | branch compare viewer | 완료 | 현재 구현됨 |
| MF-104 | branch review metadata | 완료 | 현재 구현됨 |
| MF-105 | merge / conflict resolution 경로 | 완료 | 현재 구현됨 |
| MF-106 | 장시간 협업 soak test | 완료 | 현재 구현됨 |
| MF-107 | 외부 Yjs/Automerge 같은 범용 CRDT 엔진 연동 | 부분 | 현재는 내부 operation bridge 중심 |
| MF-108 | 리뷰 승인 워크플로의 세부 권한 체계 | 부분 | 추가 세분화 여지 있음 |

## 11. 플러그인 / 위젯 / 리소스 허브

| ID | 기능 | 상태 | 메모 |
|---|---|---|---|
| MF-109 | curated plugin store | 완료 | 현재 구현됨 |
| MF-110 | plugin search / category / detail | 완료 | 현재 구현됨 |
| MF-111 | plugin install / update | 완료 | 현재 구현됨 |
| MF-112 | plugin approval / request / save 흐름 | 부분 | 일부만 구현됨 |
| MF-113 | widget runtime | 완료 | 현재 구현됨 |
| MF-114 | widget store listing / install / update | 완료 | 현재 구현됨 |
| MF-115 | widget share / detail / approval 흐름 | 부분 | 일부만 구현됨 |
| MF-116 | resource hub 통합 탐색 | 완료 | 현재 구현됨 |
| MF-117 | 조직 정책 / 권한 / 감사 연결 | 부분 | 일부만 구현됨 |
| MF-118 | 커뮤니티 수준의 외부 웹 카탈로그 페이지 | 미구현 | 현재 없음 |

## 12. Import / Export / 호환

| ID | 기능 | 상태 | 메모 |
|---|---|---|---|
| MF-119 | NULL -> Figma REST payload export | 완료 | 현재 구현됨 |
| MF-120 | Figma REST payload -> NULL import | 완료 | 현재 구현됨 |
| MF-121 | style / variable / mode roundtrip | 완료 | 현재 구현됨 |
| MF-122 | vector / mask / prototype fidelity report | 완료 | 현재 구현됨 |
| MF-123 | direct bundle export | 완료 | 현재 구현됨 |
| MF-124 | direct bundle import | 완료 | 현재 구현됨 |
| MF-125 | direct fig package zip export / import | 완료 | 현재 구현됨 |
| MF-126 | direct `.fig` binary adapter hook | 완료 | 현재 구현됨 |
| MF-127 | env 기반 외부 CLI adapter | 완료 | 현재 구현됨 |
| MF-128 | 실제 direct `.fig` binary parser / writer | 보류 | 별도 문서 참조 |

## 13. 성능 / 하드닝

| ID | 기능 | 상태 | 메모 |
|---|---|---|---|
| MF-129 | `ignoreBuildErrors` 제거 | 완료 | 현재 구현됨 |
| MF-130 | `tsc --noEmit` 통과 | 완료 | 현재 구현됨 |
| MF-131 | `next build` 통과 | 완료 | 현재 구현됨 |
| MF-132 | representative fixture 회귀 | 완료 | 현재 구현됨 |
| MF-133 | renderer scene graph 분리 | 완료 | 현재 구현됨 |
| MF-134 | canvas prototype stage | 완료 | 현재 구현됨 |
| MF-135 | overlay 분리 | 완료 | 현재 구현됨 |
| MF-136 | 5k node benchmark fixture | 완료 | 현재 구현됨 |
| MF-137 | long-session soak | 완료 | 현재 구현됨 |
| MF-138 | 메모리 / 성능 telemetry의 별도 운영 대시보드 | 미구현 | 현재 없음 |

## 14. 우선순위가 높은 미구현 / 부분 항목

다음은 지금 당장 체감이 큰 남은 마이크로 기능입니다.

- [x] MF-004 웹사이트 URL -> 편집 가능한 프레임 import
- [ ] MF-005 HTML snippet -> 편집 가능한 프레임 import
- [ ] MF-006 라이브 HTML / 프로토타입 -> 디자인 캔버스로 되가져오기
- [ ] MF-018 캔버스 룰러 고정 확인
- [ ] MF-053 text-on-path 세밀 핸들 편집
- [ ] MF-054 OpenType 세부 기능 패널
- [ ] MF-078 effect / text / gradient stop binding 전수화
- [ ] MF-087 scroll / hover / drag trigger 전수 parity
- [ ] MF-098 MCP / Code Connect급 외부 handoff
- [ ] MF-112 plugin approval / request / save 흐름 마감
- [ ] MF-115 widget share / detail / approval 흐름 마감
- [ ] MF-117 조직 정책 / 권한 / 감사 연결 마감

## 15. 지금 당장의 결론

1. 현재 저장소는 큰 기능만 있는 상태가 아니라, 상당수의 자잘한 Figma 겹침 기능까지 이미 들어와 있습니다.
2. 다만 `웹사이트 -> 디자인 import` 같은 외부 콘텐츠 흡수 계열과, 커뮤니티 / 승인 / 세부 handoff 계열은 아직 빈칸이 있습니다.
3. direct `.fig`는 이 문서에서 닫지 않고 별도 보류 문서로 관리합니다.
