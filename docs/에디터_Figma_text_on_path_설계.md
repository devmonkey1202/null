# 에디터 Figma text on path 설계

## 목적

`text on path`를 기존 text/path 모델을 깨지 않고 점진적으로 올린다.

- 기존 `Node.type = "text"`를 유지한다.
- path 소유권은 기존 `path` node에 둔다.
- editor/runtime/export가 같은 의미를 공유하게 한다.
- Figma API에 직접 대응되는 필드가 부족한 구간은 NULL 내부 semantic으로 먼저 고정한다.

## 범위

이번 단계는 구현 완료가 아니라 설계 고정이다.

- 문서 모델 초안
- editor interaction 초안
- renderer layout 초안
- import/export 제약 정의
- rollback 가능한 shadow module 경계 정의

## 문서 모델 초안

`scene.ts`에 아래 축을 추가하는 방향으로 간다.

```ts
type TextOnPathConfig = {
  pathNodeId: string;
  startOffset?: number;
  endOffset?: number;
  side?: "center" | "inside" | "outside";
  align?: "start" | "center" | "end";
  reverse?: boolean;
  spacingMode?: "font" | "fixed";
  baselineShift?: number;
};
```

적용 위치:

- `Node.type = "text"`의 `text` payload 안
- 기존 `wrap`, `autoSize`, `styleRef`와 공존

보존 원칙:

- path node를 복제/삭제할 때 `pathNodeId` 참조 정합성을 같이 갱신
- detach 시 일반 text box로 즉시 복귀 가능
- path 자체는 기존 `vectorNetwork/pathData` 경로를 그대로 사용

## Editor 상호작용

1. text node 선택 후 `Attach to Path`
2. 후보 path hover
3. attach 후 시작점/끝점 handle 노출
4. inspector에서 `offset`, `align`, `reverse`, `side`, `baseline shift` 제어
5. detach 시 일반 text box로 복귀

초기 편집 규칙:

- path 편집 모드와 text 편집 모드는 동시에 열지 않는다
- path 선택 상태가 바뀌어도 text on path preview는 유지한다
- path가 닫힌 경우 `start/end`는 순환 경로로 계산한다

## Renderer layout

shadow helper 후보:

- `src/advanced/geom/textOnPath.ts`

1차 helper 책임:

- path sampling
- total length 계산
- glyph advance 누적
- tangent/normal 계산
- glyph anchor position 계산

초기 렌더 전략:

- runtime/editor 모두 SVG `textPath`에 바로 의존하지 않는다
- 먼저 sampled glyph layout을 계산하는 공통 helper를 둔다
- SVG `textPath`는 export 또는 fallback 경로로만 검토한다

이유:

- editor selection/caret/handle 오버레이를 직접 제어해야 한다
- Figma급 편집기를 목표로 하면 glyph 배치 결과를 내부적으로 알아야 한다

## Import / Export 제약

현재 Figma 공식 API 기준으로 `text on path`를 완전 semantic하게 복원할 수 있는 안정된 node 필드는 제한적이다.

그래서 우선순위는 아래와 같다.

1. NULL 내부 semantic 고정
2. SVG/textPath 기반 export bridge 검토
3. Figma import는 가능한 범위만 bridge

정책:

- import에서 명확한 semantic이 없으면 일반 text + attached path metadata 추정은 하지 않는다
- export에서 semantic 보존이 어려우면 제약표에 명시하고 degrade 경로를 남긴다

## 테스트 계획

1차 구현 때 추가할 테스트:

- path sampling unit test
- open/closed path offset test
- reverse/align test
- detach/reattach parity test
- renderer fixture snapshot test

## 롤백 경계

이번 단계는 설계 문서만 추가한다.

이후 구현 단계에서도 rollback 단위는 아래처럼 유지한다.

- `textOnPath` helper module
- `scene.ts` 모델 확장
- `AdvancedEditorView.tsx` attach/detach UI
- `renderer.tsx` layout consumer

각 단계는 독립적으로 제거 가능해야 한다.
