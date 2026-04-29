import type {
  NodeServiceBinding,
  PrototypeAction,
  ServiceActionBinding,
  ServiceFieldBinding,
} from "../doc/scene";

export type RuntimeFieldMeta = {
  label: string;
  key: string;
  valueHint?: string;
  valueType?: ServiceFieldBinding["valueType"];
  required?: boolean;
  fallbackValue?: string | number | boolean | Record<string, unknown> | unknown[] | null;
};

export type RuntimeGlobalStateValue =
  | string
  | number
  | boolean
  | Record<string, unknown>
  | unknown[]
  | null;

type ServiceAction = Extract<PrototypeAction, { type: "service" }>;
type SubmitFields = Record<string, string | number | boolean | Record<string, unknown> | unknown[] | null>;

export type ServiceActionRequestDescriptor = {
  endpoint: string;
  method: "POST" | "PUT";
  body?: Record<string, unknown>;
  successMessage: string;
};

function cloneJsonValue<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeFieldKey(raw: string) {
  const lower = raw.trim().toLowerCase();
  if (lower === "parentid") return "parentId";
  if (lower === "commentid") return "commentId";
  if (lower === "nextpageid") return "nextPageId";
  if (lower === "columnid") return "column_id";
  return lower;
}

function getTargetLeafKey(target: string) {
  const segments = target
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments[segments.length - 1] ?? target;
}

function setNestedValue(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) return;
  let current: Record<string, unknown> = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index]!;
    const next = current[key];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]!] = value;
}

function pickFieldValue(
  fields: SubmitFields,
  fieldKey: string | undefined,
  fallbackTarget: string,
) {
  const rawKey = (fieldKey ?? getTargetLeafKey(fallbackTarget)).trim();
  if (rawKey in fields) return fields[rawKey];
  const key = normalizeFieldKey(rawKey);
  if (key in fields) return fields[key];
  const normalizedMatch = Object.entries(fields).find(([candidate]) => normalizeFieldKey(candidate) === key);
  return normalizedMatch?.[1];
}

function resolveBindingValue(
  binding: ServiceActionBinding,
  fields: SubmitFields,
  variables: Record<string, string | number | boolean>,
  globalState: Record<string, RuntimeGlobalStateValue>,
) {
  if (binding.source === "literal") return cloneJsonValue(binding.value);
  if (binding.source === "field") return cloneJsonValue(pickFieldValue(fields, binding.fieldKey, binding.target));
  if (binding.source === "variable") return cloneJsonValue(binding.variableId ? variables[binding.variableId] : undefined);
  if (binding.source === "globalState") {
    return cloneJsonValue(binding.globalStateKey ? globalState[binding.globalStateKey] : undefined);
  }
  return undefined;
}

function applyBindings(
  body: Record<string, unknown>,
  bindings: ServiceActionBinding[] | undefined,
  fields: SubmitFields,
  variables: Record<string, string | number | boolean>,
  globalState: Record<string, RuntimeGlobalStateValue>,
) {
  const missing: string[] = [];
  bindings?.forEach((binding) => {
    const value = resolveBindingValue(binding, fields, variables, globalState);
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "");
    if (empty) {
      if (binding.required) missing.push(binding.target);
      return;
    }
    setNestedValue(body, binding.target, value);
  });
  return missing;
}

function deriveReservationEventType(to: string | undefined) {
  const normalized = String(to ?? "").trim().toLowerCase();
  if (normalized === "confirmed" || normalized === "confirm") return "reservation.confirm";
  if (normalized === "completed" || normalized === "complete") return "reservation.complete";
  if (normalized === "no_show" || normalized === "noshow") return "reservation.no_show";
  if (normalized === "canceled" || normalized === "cancelled" || normalized === "cancel") return "reservation.cancel";
  return "reservation.confirm";
}

function deriveDocumentStatus(to: string | undefined) {
  const normalized = String(to ?? "").trim().toLowerCase();
  if (normalized === "rejected" || normalized === "reject") return "rejected";
  return "approved";
}

function buildDomainBody(action: ServiceAction, fields: SubmitFields) {
  const body: Record<string, unknown> = { ...fields };
  if (action.action === "reservation.create") {
    body.action = "reservations.create";
  } else if (action.action === "reservation.transition") {
    body.action = "reservations.transition";
    body.reservationId ??=
      fields[action.stateTransition?.recordIdField ?? "reservationId"] ??
      fields.recordId ??
      fields.id;
    body.eventType ??= deriveReservationEventType(action.stateTransition?.to);
  } else if (action.action === "ticket.create") {
    body.action = "tickets.create";
  } else if (action.action === "ticket.reply") {
    body.action = "tickets.message.add";
  } else if (action.action === "crm.lead.move") {
    body.action = "crm.lead.move";
    body.leadId ??=
      fields[action.stateTransition?.recordIdField ?? "leadId"] ??
      fields.recordId ??
      fields.id;
    body.stageId ??= fields.stageId ?? action.stateTransition?.to;
    body.status ??= action.stateTransition?.to ?? fields.status ?? "qualified";
  } else if (action.action === "document.submit") {
    body.action = "documents.submit";
    body.documentId ??=
      fields[action.stateTransition?.recordIdField ?? "documentId"] ??
      fields.recordId ??
      fields.id;
  } else if (action.action === "document.decide") {
    body.action = "documents.decide";
    body.documentId ??=
      fields[action.stateTransition?.recordIdField ?? "documentId"] ??
      fields.recordId ??
      fields.id;
    body.status ??= deriveDocumentStatus(action.stateTransition?.to);
  } else {
    return null;
  }
  return body;
}

function buildBillingBody(action: ServiceAction, fields: SubmitFields) {
  const body: Record<string, unknown> = { ...fields };
  if (action.action === "billing.checkout") {
    body.action = "charge.create";
    return body;
  }
  if (action.action === "billing.invoice.pay") {
    body.action = "invoice.pay";
    return body;
  }
  return null;
}

function buildPolicyBody(action: ServiceAction, fields: SubmitFields) {
  if (action.action !== "policy.evaluate") return null;
  return {
    action: "evaluate",
    ...fields,
  };
}

function buildOperationsBody(action: ServiceAction, fields: SubmitFields) {
  const body: Record<string, unknown> = { ...fields };
  if (action.action === "operations.release.record") {
    body.action = "release.record";
    body.environmentKey ??= "prod";
    body.deployed ??= true;
    return body;
  }
  if (action.action === "operations.runbook.generate") {
    body.action = "runbook.generate";
    return body;
  }
  return null;
}

function buildPageAssetBody(action: ServiceAction, fields: SubmitFields) {
  if (action.action === "todo.create") {
    return {
      title: fields.title,
      sort_order: fields.sort_order,
    };
  }
  if (action.action === "note.save") {
    return {
      content: fields.content,
    };
  }
  if (action.action === "kanban.column.create") {
    return {
      title: fields.title,
      sort_order: fields.sort_order,
    };
  }
  if (action.action === "kanban.card.create") {
    return {
      column_id: fields.column_id ?? fields.columnId,
      title: fields.title,
      body: fields.body,
      sort_order: fields.sort_order,
    };
  }
  return null;
}

function buildAuthBody(action: ServiceAction, fields: SubmitFields) {
  if (action.action === "auth.logout") return {};
  const body: Record<string, unknown> = {};
  if (fields.email !== undefined) body.email = fields.email;
  if (fields.password !== undefined) body.password = fields.password;
  if (fields.display_name !== undefined) body.display_name = fields.display_name;
  if (fields.otp !== undefined) body.otp = fields.otp;
  if (fields.otp_backup !== undefined) body.otp_backup = fields.otp_backup;
  return body;
}

function getSuccessMessage(action: ServiceAction["action"]) {
  switch (action) {
    case "auth.login":
      return "Login completed.";
    case "auth.register":
      return "Registration completed.";
    case "auth.logout":
      return "Logout completed.";
    case "operations.release.record":
      return "Release recorded.";
    case "operations.runbook.generate":
      return "Runbook refreshed.";
    case "reservation.create":
      return "Reservation created.";
    case "reservation.transition":
      return "Reservation status updated.";
    case "ticket.create":
      return "Support ticket created.";
    case "ticket.reply":
      return "Support reply saved.";
    case "crm.lead.move":
      return "CRM lead moved.";
    case "document.submit":
      return "Document submitted.";
    case "document.decide":
      return "Document decision saved.";
    case "billing.checkout":
      return "Checkout requested.";
    case "billing.invoice.pay":
      return "Invoice payment completed.";
    case "todo.create":
      return "Todo item added.";
    case "note.save":
      return "Note saved.";
    case "kanban.column.create":
      return "Kanban column added.";
    case "kanban.card.create":
      return "Kanban card added.";
    case "policy.evaluate":
      return "Policy evaluation completed.";
    default:
      return "Service action completed.";
  }
}

export function resolveServiceFieldMeta(
  binding: NodeServiceBinding | undefined,
  label: string,
  fallback: { key: string; valueHint?: string } | null,
): RuntimeFieldMeta {
  const field = binding?.field;
  return {
    label,
    key: field?.key ?? fallback?.key ?? "",
    valueHint: fallback?.valueHint,
    valueType: field?.valueType,
    required: field?.required,
    fallbackValue: cloneJsonValue(field?.fallbackValue),
  };
}

export function buildServiceActionRequest(options: {
  pageId: string;
  action: ServiceAction;
  fields: SubmitFields;
  variables: Record<string, string | number | boolean>;
  globalState: Record<string, RuntimeGlobalStateValue>;
}): ServiceActionRequestDescriptor | { error: string } {
  const { pageId, action, fields, variables, globalState } = options;
  if (!pageId) return { error: "page_id_required" };

  if (action.action.startsWith("auth.")) {
    const body = buildAuthBody(action, fields);
    const endpoint =
      action.action === "auth.logout"
        ? `/api/app/${pageId}/auth/logout`
        : `/api/app/${pageId}/auth/${action.action === "auth.register" ? "register" : "login"}`;
    const missing = applyBindings(body, action.bindings, fields, variables, globalState);
    if (missing.length) return { error: `required_binding_missing:${missing.join(",")}` };
    return { endpoint, method: "POST", body, successMessage: getSuccessMessage(action.action) };
  }

  let endpoint = `/api/app/${pageId}/domains`;
  let method: "POST" | "PUT" = "POST";
  const body =
    buildDomainBody(action, fields) ??
    buildOperationsBody(action, fields) ??
    buildBillingBody(action, fields) ??
    buildPolicyBody(action, fields) ??
    buildPageAssetBody(action, fields);

  if (!body) {
    return { error: "unsupported_service_action" };
  }

  if (action.action.startsWith("billing.")) {
    endpoint = `/api/app/${pageId}/billing`;
  } else if (action.action.startsWith("operations.")) {
    endpoint = `/api/app/${pageId}/operations`;
  } else if (action.action.startsWith("policy.")) {
    endpoint = `/api/app/${pageId}/policy`;
  } else if (action.action === "todo.create") {
    endpoint = `/api/pages/${pageId}/todos`;
  } else if (action.action === "note.save") {
    endpoint = `/api/pages/${pageId}/note`;
    method = "PUT";
  } else if (action.action === "kanban.column.create") {
    endpoint = `/api/pages/${pageId}/kanban/columns`;
  } else if (action.action === "kanban.card.create") {
    endpoint = `/api/pages/${pageId}/kanban/cards`;
  }

  const missing = applyBindings(body, action.bindings, fields, variables, globalState);
  if (missing.length) return { error: `required_binding_missing:${missing.join(",")}` };

  return {
    endpoint,
    method,
    body,
    successMessage: getSuccessMessage(action.action),
  };
}
