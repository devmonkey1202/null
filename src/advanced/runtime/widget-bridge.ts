export type BridgeRequest = {
  id: string;
  type: "REQUEST";
  action: string;
  payload?: unknown;
};

export type BridgeResponse = {
  id: string;
  type: "RESPONSE";
  status: "ok" | "error";
  payload?: unknown;
  error?: { code: string; message?: string };
};

export type BridgeEvent = {
  type: "EVENT";
  event: string;
  payload?: unknown;
};

export type BridgeMessage = BridgeRequest | BridgeResponse | BridgeEvent;

export type BridgeActionResult = {
  status: "ok" | "error";
  payload?: unknown;
  error?: { code: string; message?: string };
};

export type BridgeActionHandler = (
  action: string,
  payload: unknown,
) => BridgeActionResult | Promise<BridgeActionResult>;

export const BRIDGE_READ_ACTIONS = [
  "get_doc_info",
  "get_node",
  "get_nodes",
  "get_selection",
  "get_variables",
  "get_page_nodes",
  "get_pages",
] as const;

export const BRIDGE_WRITE_ACTIONS = [
  "update_node",
  "create_node",
  "delete_node",
  "set_variable",
  "set_selection",
  "notify",
] as const;

export const ALL_BRIDGE_ACTIONS = [
  "ping",
  "get_page_id",
  ...BRIDGE_READ_ACTIONS,
  ...BRIDGE_WRITE_ACTIONS,
] as const;

function isObject(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === "object" && !Array.isArray(input);
}

export function parseBridgeRequest(message: unknown): BridgeRequest | null {
  if (!isObject(message)) return null;
  if (message.type !== "REQUEST") return null;
  if (typeof message.id !== "string" || typeof message.action !== "string") return null;
  return {
    id: message.id,
    type: "REQUEST",
    action: message.action,
    payload: message.payload,
  };
}

export function makeBridgeResponse(
  id: string,
  status: "ok" | "error",
  payload?: unknown,
  error?: { code: string; message?: string },
): BridgeResponse {
  return {
    id,
    type: "RESPONSE",
    status,
    payload,
    error,
  };
}
