# 18. v2 AI Patch Schema

이 문서는 **에디터 문서를 구조적으로 수정하는** AI patch 형식을 구현 가능한 수준으로 잠급니다.

## 1. 원칙

- AI 출력은 항상 `AIPatch`
- patch는 preview / dry-run / rollback 가능
- schema validation 실패 patch는 적용 금지
- high-risk patch는 자동 적용 금지
- patch scope는 명시적이어야 함
- patch에는 모델 provenance가 포함돼야 함

## 2. top-level schema

```json
{
  "$schema": "https://null.dev/schemas/v2/ai-patch.schema.json",
  "patchId": "patch_x",
  "intent": "선택한 카드 레이아웃을 8px grid 기준으로 정리",
  "mode": "modify",
  "summary": "선택 영역의 간격과 정렬을 토큰 기준으로 정리",
  "risk": "medium",
  "scope": {
    "kind": "selection",
    "pageIds": ["page_home"],
    "nodeIds": ["node_card_1", "node_card_2"]
  },
  "provenance": {
    "patchSource": "ai",
    "modelId": "null-ai-b01",
    "modelFamily": "null-self-hosted",
    "modelVersion": "2026.05.29",
    "plannerVersion": "planner.v1",
    "generatorVersion": "generator.v1",
    "criticVersion": "critic.v1",
    "trainingLineage": "dataset-2026q2-b1"
  },
  "sceneOps": [],
  "runtimeOps": [],
  "serviceOps": [],
  "testOps": [],
  "notes": [],
  "evalScore": 0.94,
  "requiresApproval": true
}
```

## 3. 필드 정의

- `patchId`
- `intent`
- `mode`: `generate | continue | modify | debug | polish`
- `summary`
- `risk`: `low | medium | high`
- `scope`
- `provenance`
- `sceneOps`
- `runtimeOps`
- `serviceOps`
- `testOps`
- `notes`
- `evalScore`
- `requiresApproval`

## 4. provenance 규칙

`provenance`는 필수입니다.

필드:

- `patchSource`: `ai | human | hybrid`
- `modelId`
- `modelFamily`
- `modelVersion`
- `plannerVersion`
- `generatorVersion`
- `criticVersion`
- `trainingLineage`

이유:

- B -> C 전환 시 patch 이력 재사용
- 모델 교체 후 회귀 추적
- 승인/거절 데이터의 학습 가능성 확보

## 5. risk 규칙

- `low`: cosmetic/layout/token/text
- `medium`: layout/structure/runtime parity hook 변경
- `high`: destructive delete, publish/auth 변경, 광범위 refactor

`high`는 무조건 수동 승인.

## 6. scope schema

```json
{
  "type": "object",
  "required": ["kind"],
  "properties": {
    "kind": {
      "enum": ["selection", "page", "document"]
    },
    "pageIds": {
      "type": "array",
      "items": { "type": "string" }
    },
    "nodeIds": {
      "type": "array",
      "items": { "type": "string" }
    },
    "routeKeys": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "additionalProperties": false
}
```

## 7. sceneOps

허용 종류:

- `add_node`
- `update_node`
- `delete_node`
- `reorder_children`
- `create_component`
- `create_variant_group`
- `set_token_binding`
- `set_variable_binding`
- `set_layout_mode`
- `set_component_override`

### `add_node`

```json
{
  "kind": "add_node",
  "parentId": "node_parent",
  "index": 3,
  "node": {
    "id": "node_x",
    "kind": "frame",
    "name": "Aligned Card",
    "frame": { "x": 0, "y": 0, "w": 320, "h": 88, "rotation": 0 }
  }
}
```

## 8. runtimeOps

허용 종류:

- `add_route`
- `update_route`
- `add_state`
- `update_state`
- `add_action`
- `update_action`
- `link_action`
- `set_service_binding`

### `add_action`

```json
{
  "kind": "add_action",
  "action": {
    "id": "act_open_preview",
    "key": "preview.open",
    "trigger": "click",
    "actionKind": "navigate",
    "input": {
      "targetRoute": "preview.current_page"
    }
  }
}
```

주의:

- op type `kind`와 action 종류 `actionKind`는 분리

## 9. serviceOps

허용 종류:

- `bind_publish_snapshot`
- `bind_collaboration_room`
- `bind_storage_policy`
- `bind_auth_provider`
- `create_editor_server_action`

## 10. testOps

허용 종류:

- `add_flow_test`
- `add_visual_test`
- `add_contract_test`
- `add_regression_tag`

### `add_flow_test`

```json
{
  "kind": "add_flow_test",
  "spec": {
    "name": "selection layout patch keeps editor stable",
    "steps": [
      "select card nodes",
      "apply AI patch preview",
      "approve patch",
      "verify selection and layout remain stable"
    ]
  }
}
```

## 11. JSON Schema 초안

```json
{
  "$id": "https://null.dev/schemas/v2/ai-patch.schema.json",
  "type": "object",
  "required": [
    "patchId",
    "intent",
    "mode",
    "summary",
    "risk",
    "scope",
    "provenance",
    "sceneOps",
    "runtimeOps",
    "serviceOps",
    "testOps",
    "requiresApproval"
  ],
  "properties": {
    "patchId": { "type": "string", "minLength": 1 },
    "intent": { "type": "string", "minLength": 1 },
    "mode": {
      "enum": ["generate", "continue", "modify", "debug", "polish"]
    },
    "summary": { "type": "string", "minLength": 1 },
    "risk": { "enum": ["low", "medium", "high"] },
    "scope": { "$ref": "#/$defs/scope" },
    "provenance": { "$ref": "#/$defs/provenance" },
    "sceneOps": { "type": "array", "items": { "$ref": "#/$defs/op" } },
    "runtimeOps": { "type": "array", "items": { "$ref": "#/$defs/op" } },
    "serviceOps": { "type": "array", "items": { "$ref": "#/$defs/op" } },
    "testOps": { "type": "array", "items": { "$ref": "#/$defs/op" } },
    "notes": {
      "type": "array",
      "items": { "type": "string" }
    },
    "evalScore": { "type": "number", "minimum": 0, "maximum": 1 },
    "requiresApproval": { "type": "boolean" }
  },
  "$defs": {
    "scope": {
      "type": "object",
      "required": ["kind"],
      "properties": {
        "kind": { "enum": ["selection", "page", "document"] },
        "pageIds": { "type": "array", "items": { "type": "string" } },
        "nodeIds": { "type": "array", "items": { "type": "string" } },
        "routeKeys": { "type": "array", "items": { "type": "string" } }
      },
      "additionalProperties": false
    },
    "provenance": {
      "type": "object",
      "required": [
        "patchSource",
        "modelId",
        "modelFamily",
        "modelVersion",
        "plannerVersion",
        "generatorVersion",
        "criticVersion",
        "trainingLineage"
      ],
      "properties": {
        "patchSource": { "enum": ["ai", "human", "hybrid"] },
        "modelId": { "type": "string" },
        "modelFamily": { "type": "string" },
        "modelVersion": { "type": "string" },
        "plannerVersion": { "type": "string" },
        "generatorVersion": { "type": "string" },
        "criticVersion": { "type": "string" },
        "trainingLineage": { "type": "string" }
      },
      "additionalProperties": false
    },
    "op": {
      "type": "object",
      "required": ["kind"],
      "properties": {
        "kind": { "type": "string" }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```

## 12. validation pipeline

1. JSON schema valid
2. referenced node/page/route exists
3. no forbidden op for current scope
4. no cross-document mutation
5. permission boundary safe
6. destructive ops approval check
7. dry-run success
8. provenance complete

## 13. forbidden patch

- raw HTML blob 삽입
- scope 밖 node 강제 수정
- production credential 직접 쓰기
- 문서 경계 밖 publish/auth binding 변경
- destructive migration auto-apply
- provenance 없는 patch

## 14. rollback contract

모든 patch는 inverse patch 또는 snapshot rollback 경로가 필요합니다.

기록:

- pre-apply snapshot id
- patch id
- applied ops
- validation result
- actor
- timestamp
- provenance

## 15. 구현 우선순위

1. low-risk `sceneOps`
2. low/medium `runtimeOps`
3. limited `serviceOps`
4. high-risk patch approval flow

## 16. 최종 결론

v2 AI patch는 **에디터 문서를 수정하는 모든 변경**에 대해
schema, scope, risk, validation, rollback뿐 아니라
**model provenance와 training lineage까지 추적 가능한 실행 단위**여야 합니다.
