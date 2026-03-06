# NULL Plugin SDK (초안)

이 문서는 **플러그인 개발/배포/호환성 정책**을 위한 최소 지침과 예제를 포함합니다.

## 1) 플러그인 매니페스트
```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "Align + Export helper",
  "version": "1.0.0",
  "minAppVersion": "0.1.0",
  "permissions": ["editor", "export", "ui"],
  "actions": [
    { "id": "align-left", "label": "Align Left", "type": "align" },
    { "id": "export-png", "label": "Export PNG", "type": "exportSelectionPng" }
  ]
}
```

## 2) 권한 모델
- `editor`: 정렬/분배 등 에디터 조작
- `export`: PNG/SVG/Token 내보내기
- `ui`: 그리드/성능/감사 UI 토글
- `network`: 외부 URL 열기

> 매니페스트의 `permissions`에 포함되지 않은 액션은 **설치 시 자동 제거**됩니다.

## 3) 버전/호환성 정책
- `minAppVersion`, `maxAppVersion` 범위를 벗어나면 **설치가 거부**됩니다.
- 버전은 `x.y.z` 형식(semver)만 허용됩니다.

## 4) 런타임 UI 주입 (커스텀 렌더러)
```ts
import { registerRuntimePlugin } from "@/advanced/runtime/plugins";

registerRuntimePlugin({
  widgetRenderers: {
    widget_node: ({ node }) => {
      return <div style={{ padding: 8 }}>Widget: {node.id}</div>;
    },
  },
});
```

## 5) 플러그인 스토어 설치
```
POST /api/app/{pageId}/plugins/store
{
  "storeId": "store-align-kit"
}
```
