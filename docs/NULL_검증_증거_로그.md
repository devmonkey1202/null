# NULL 검증 증거 로그

> **마지막 갱신**: 2026-03-10. 교차 검증 반영.

## 실행 로그

### RUN-2026-03-10-01 (최신)
- **한글 깨짐**: 완료
- **Build**: 통과
- **Test**: 통과

### RUN-2026-03-08-01 LINT (과거)
- 실행 시각: 2026-03-08 10:01:36
- 명령: `npm run lint`
- 결과: 실패
- 요약:
  - `src/advanced/runtime/player.tsx` 파싱 오류(UTF-8 손상, Unterminated string literal)
  - `src/advanced/runtime/widget-sandbox.tsx` purity 규칙 위반(Date.now/Math.random)
  - `src/components/work-view.tsx` purity 규칙 위반(Date.now)
  - 기타 경고 다수

### RUN-2026-03-08-02 TEST (과거)
- 실행 시각: 2026-03-08 10:00:38
- 명령: `npm test`
- 결과: 실패
- 요약:
  - 53개 파일 중 4개 실패, 165 테스트 중 5개 실패
  - `tests/locale-utils.test.ts`가 `player.tsx` UTF-8 손상으로 변환 실패
  - `plugin-manifest`, `plugin-permissions` 테스트가 `prisma.pageSetting.findUnique` mock 부재로 실패
  - `plugin-store` 테스트에서 기대값 불일치

### RUN-2026-03-08-03 BUILD (과거)
- 실행 시각: 2026-03-08 10:01:36
- 명령: `npm run build`
- 결과: 실패
- 요약:
  - `src/advanced/runtime/player.tsx` UTF-8 손상으로 Turbopack 파싱 실패
  - `src/app/editor/page.tsx`에서 `next/dynamic` + `ssr: false` 사용 오류
