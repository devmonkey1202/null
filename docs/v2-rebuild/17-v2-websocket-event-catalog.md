# 17. v2 WebSocket Event Catalog

이 문서는 v2 **에디터 협업 중심** 실시간 계층의 이벤트 계약을 잠급니다.

## 1. 원칙

- WebSocket은 primary realtime transport
- 이벤트 이름은 명시적 카탈로그 사용
- payload는 schema 검증 필수
- durable 이벤트는 replay 가능
- presence는 ephemeral
- 현재 phase의 중심은 **editor collaboration**

## 2. endpoint

- control plane: `/api/v2/control/realtime/ws`
- runtime extension endpoint는 추후 필요 시 별도 추가

## 3. handshake

1. server -> `sys.hello`
2. client -> `sys.auth`
3. server -> `sys.ready` 또는 `sys.error`
4. client -> `sub.add`

## 4. 공통 envelope

```json
{
  "id": "evt_x",
  "type": "doc.op_applied",
  "channel": "editor.doc.doc_123",
  "ts": "2026-05-26T10:30:00.000Z",
  "seq": 1042,
  "scope": {
    "plane": "control",
    "projectId": "proj_x",
    "environmentId": "env_prod"
  },
  "actor": {
    "kind": "platform_user",
    "id": "usr_x"
  },
  "correlationId": "req_x",
  "payload": {}
}
```

## 5. 시스템 이벤트

### `sys.hello`

```json
{
  "type": "sys.hello",
  "payload": {
    "connectionId": "conn_x",
    "serverTime": "2026-05-26T10:30:00.000Z",
    "protocolVersion": 1
  }
}
```

### `sys.auth`

```json
{
  "type": "sys.auth",
  "payload": {
    "token": "signed_ws_token",
    "resumeCursor": {
      "channel": "editor.doc.doc_1",
      "seq": 302
    }
  }
}
```

### `sys.ready`

```json
{
  "type": "sys.ready",
  "payload": {
    "sessionKind": "editor",
    "sessionId": "sess_x",
    "userId": "usr_x",
    "heartbeatSec": 25
  }
}
```

## 6. subscription

### `sub.add`

```json
{
  "type": "sub.add",
  "payload": {
    "channels": [
      "editor.doc.doc_1",
      "editor.presence.doc_1"
    ]
  }
}
```

### `sub.ok`

```json
{
  "type": "sub.ok",
  "payload": {
    "accepted": ["editor.doc.doc_1"],
    "rejected": []
  }
}
```

## 7. 채널 namespace

- `control.workspace.{workspaceId}`
- `control.project.{projectId}`
- `editor.doc.{documentId}`
- `editor.presence.{documentId}`
- `publish.document.{documentId}`

## 8. 에디터 협업 이벤트 카탈로그

- `doc.op_applied`
- `doc.snapshot`
- `doc.version_created`
- `doc.validation_updated`
- `doc.presence_joined`
- `doc.presence_updated`
- `doc.presence_left`
- `doc.comment_created`
- `doc.comment_resolved`
- `doc.publish_started`
- `doc.publish_completed`
- `doc.publish_failed`

### `doc.op_applied`

```json
{
  "type": "doc.op_applied",
  "payload": {
    "documentId": "doc_x",
    "version": 42,
    "opId": "op_x",
    "opKind": "update_node",
    "targetNodeId": "node_button_1",
    "createdAt": "2026-05-26T10:30:00.000Z"
  }
}
```

### `doc.presence_updated`

```json
{
  "type": "doc.presence_updated",
  "payload": {
    "documentId": "doc_x",
    "platformUserId": "usr_b",
    "selection": ["node_1", "node_2"],
    "viewport": { "x": 120, "y": 80, "zoom": 1.25 },
    "createdAt": "2026-05-26T10:30:02.000Z"
  }
}
```

## 9. 최소 확장 이벤트

에디터 산출물 parity 검증용 최소 이벤트:

- `preview.invalidated`
- `publish.snapshot_ready`
- `publish.snapshot_failed`

## 10. ack / replay / ordering

- ordering은 channel 단위 `seq`
- 다른 channel 간 전역 ordering 보장 안 함
- durable 이벤트만 replay
- presence는 reconnect 시 snapshot 재구성
- client는 `(channel, seq)` 기준 dedupe 필수

### `ack.event`

```json
{
  "type": "ack.event",
  "payload": {
    "channel": "editor.doc.doc_x",
    "seq": 1042
  }
}
```

## 11. client command 이벤트

### `cmd.doc_op`

```json
{
  "type": "cmd.doc_op",
  "payload": {
    "clientEventId": "ce_x",
    "documentId": "doc_x",
    "opKind": "update_node",
    "opPayload": {
      "nodeId": "node_button_1",
      "changes": {
        "frame": { "x": 100, "y": 80, "w": 120, "h": 40, "rotation": 0 }
      }
    }
  }
}
```

### `cmd.presence_set`

```json
{
  "type": "cmd.presence_set",
  "payload": {
    "documentId": "doc_x",
    "selection": ["node_button_1"],
    "viewport": { "x": 120, "y": 80, "zoom": 1.25 }
  }
}
```

### `cmd.comment_create`

```json
{
  "type": "cmd.comment_create",
  "payload": {
    "documentId": "doc_x",
    "nodeId": "node_button_1",
    "body": "padding 값을 다시 확인해주세요."
  }
}
```

## 12. 에러 코드

- `AUTH_INVALID`
- `AUTH_EXPIRED`
- `SUBSCRIBE_FORBIDDEN`
- `CHANNEL_NOT_FOUND`
- `DOC_OP_INVALID`
- `PUBLISH_CONFLICT`
- `RATE_LIMITED`
- `SEQUENCE_GAP`
- `SERVER_UNAVAILABLE`

## 13. 보안 규칙

- document permission 없는 editor channel 구독 금지
- 다른 문서 채널 무단 구독 금지
- payload size 상한 적용

## 14. observability

각 이벤트 로그 필수 항목:

- connection id
- session kind/id
- project/environment
- channel
- event type
- seq
- latency
- error code

메트릭:

- active connections
- per-channel fanout rate
- replay count
- dropped events
- ack lag
- doc op e2e latency

## 15. 테스트 기준

- auth handshake
- subscribe reject
- document op order
- reconnect replay
- duplicate command dedupe
- presence expiry cleanup
- comment delivery
- publish snapshot event delivery

## 16. 최종 결론

v2 실시간은 **에디터 협업을 중심으로 한 명시적 이벤트 프로토콜**로 구현해야 합니다.
