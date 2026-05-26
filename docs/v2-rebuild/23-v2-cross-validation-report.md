# 23. v2 Cross-Validation Report

이 문서는 **에디터 완성 우선** 기준으로 v2 문서 묶음 전체를 교차검증한 결과를 기록합니다.

## 1. 검증 목적

- 문서 간 모순 제거
- 구현 시작 시 흔들릴 경계 확인
- 마크다운/명칭/API/경로/계약 일치 여부 확인
- 문서 전체가 **장기 범위는 넓게 인정하되 현재 구현은 Editor-first** 원칙으로 정렬됐는지 확인

## 2. 핵심 결론

현재 문서 세트는 아래 두 층을 분리하는 방향으로 정렬돼 있습니다.

### A. 장기 방향

- 장기적으로 앱 플랫폼 전체 / 서비스 빌더 전체 / 백엔드 도메인 전체로 확장 가능해야 함

### B. 현재 구현 우선순위

- 현재 구현 1순위는 상용 수준 에디터 완성
- Runtime / Service / AI는 에디터 산출물 확장을 위한 최소 연결 계약

즉, 문서 세트는 **범위 축소 문서**가 아니라 **우선순위 재정렬 문서**로 읽어야 합니다.

## 3. 수행한 검증

### 3.1 링크 무결성

- 모든 markdown 상대 링크 점검
- 결과: broken link `0`

### 3.2 명칭 일치

검증 대상:

- `schemaVersion` vs `schema_version`
- `Control Plane / Editor Data Plane`
- `AIPatch` top-level fields
- route namespace
- Editor-first vs platform-first 표현 충돌

결과:

- v2 문서 묶음은 `schemaVersion`으로 통일
- 개념 모델은 `Control Plane / Editor Data Plane`으로 고정
- `AIPatch`의 canonical source는 [18-v2-ai-patch-schema.md](./18-v2-ai-patch-schema.md)
- 현재 구현 우선순위 문서는 editor-first, 장기 방향 문서는 broad-scope를 허용하는 구조로 정리

### 3.3 범위 일관성

현재 깊게 잠긴 범위:

- Editor Kernel contracts
- Editor service support boundary
- Editor persistence / Prisma / migration
- Editor collaboration WebSocket protocol
- AI patch schema
- Rust crate public API
- Builder UX / Canvas UX / Inspector UX
- render / text / vector stack
- ops topology / runbook

## 4. 이번 정렬로 확정된 것

이제 문서 기준으로 아래는 명확합니다.

- v2의 현재 구현 1순위는 에디터
- Runtime / Service / AI는 삭제 대상이 아니라 최소 연결 계층
- 장기 범위는 더 넓지만, 현재 상세 명세 깊이는 에디터가 가장 깊어야 함
- v1은 유지하고 v2는 병행 재구축
- 외부 미완성 노출 없이 Internal QA / Staging Validation 후 전환

## 5. 현재 문서 묶음에서 잠긴 것

이제 문서 기준으로 잠긴 축은 아래와 같습니다.

- 아키텍처 분리 원칙
- 에디터 우선 제품 정의
- 문서 모델 방향
- Editor Kernel 계약
- Editor service support boundary
- 작업 이벤트 프로토콜
- AI patch 형식
- Rust crate 경계
- Builder / Canvas / Inspector / Keyboard UX 기준
- 성능 / SLO 기준
- 품질 게이트
- 운영 / switchback 기준

## 6. 아직 문서가 아니라 코드로만 검증될 것

아래는 문서가 아니라 구현 단계에서 검증됩니다.

- Rust workspace 실체
- Prisma schema 파일
- migration SQL
- validator / parser / runtime code
- benchmark 실측
- staging 운영 검증

즉, 문서는 강하지만 제품이 완성된 것은 아닙니다.

## 7. 현재 남아 있는 진짜 리스크

- 현재 Git 브랜치가 아직 `main`
- 문서가 아직 GitHub에 커밋되지 않음
- v1 조사 흔적 파일이 워킹트리에 남아 있음
- text / vector / render 하부 구현 선택은 코드 단계에서 다시 검증 필요

## 8. 실행 판단

문서 기준 판단:

- v2 스캐폴드 생성: 가능
- Rust workspace 착수: 가능
- SceneDoc / EditorCommand / EditorSnapshot 타입화: 가능
- Editor collaboration protocol 구현: 가능
- AI validator 구현: 가능

## 9. 최종 결론

문서 묶음은 이제 단순한 비전 문서가 아닙니다.  
동시에 “플랫폼 전체를 지금 바로 다 만든다”는 문서도 아닙니다.

가장 정확한 표현은 이겁니다.

> NULL v2 문서 세트는  
> **장기적으로 더 넓은 플랫폼으로 확장 가능한 구조를 인정하면서도,  
> 현재 구현의 1순위를 상용 수준 에디터 완성으로 고정한 재구축 착수 문서**다.
