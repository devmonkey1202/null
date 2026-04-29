import type {
  NodeServiceBinding,
  PrototypeAction,
  PrototypeInteraction,
  ServiceActionKind,
  ServiceDataSourceKind,
  ServiceFieldBinding,
  ServiceStateMachineKind,
  ServiceStateTransitionBinding,
} from "../doc/scene";

export const SERVICE_ACTION_OPTIONS: Array<{ value: ServiceActionKind; label: string }> = [
  { value: "auth.login", label: "Auth login" },
  { value: "auth.register", label: "Auth register" },
  { value: "auth.logout", label: "Auth logout" },
  { value: "operations.release.record", label: "Operations release record" },
  { value: "operations.runbook.generate", label: "Operations runbook generate" },
  { value: "todo.create", label: "Todo create" },
  { value: "note.save", label: "Note save" },
  { value: "kanban.column.create", label: "Kanban column create" },
  { value: "kanban.card.create", label: "Kanban card create" },
  { value: "reservation.create", label: "Reservation create" },
  { value: "reservation.transition", label: "Reservation transition" },
  { value: "ticket.create", label: "Ticket create" },
  { value: "ticket.reply", label: "Ticket reply" },
  { value: "crm.lead.move", label: "CRM lead move" },
  { value: "document.submit", label: "Document submit" },
  { value: "document.decide", label: "Document decide" },
  { value: "billing.checkout", label: "Billing checkout" },
  { value: "billing.invoice.pay", label: "Invoice pay" },
  { value: "policy.evaluate", label: "Policy evaluate" },
];

export const SERVICE_DATA_SOURCE_OPTIONS: Array<{ value: ServiceDataSourceKind; label: string }> = [
  { value: "auth.session", label: "Auth session" },
  { value: "notifications.feed", label: "Notifications feed" },
  { value: "chat.messages", label: "Chat messages" },
  { value: "todo.list", label: "Todo list" },
  { value: "note.current", label: "Current note" },
  { value: "kanban.columns", label: "Kanban columns" },
  { value: "reservations.list", label: "Reservations list" },
  { value: "tickets.list", label: "Tickets list" },
  { value: "crm.leads", label: "CRM leads" },
  { value: "documents.list", label: "Documents list" },
  { value: "billing.invoices", label: "Billing invoices" },
  { value: "policy.rules", label: "Policy rules" },
  { value: "operations.releases", label: "Operations releases" },
];

export const SERVICE_STATE_MACHINE_OPTIONS: Array<{ value: ServiceStateMachineKind; label: string }> = [
  { value: "reservation", label: "Reservation" },
  { value: "ticket", label: "Ticket" },
  { value: "crmLead", label: "CRM lead" },
  { value: "document", label: "Document" },
  { value: "billingInvoice", label: "Billing invoice" },
];

export const SERVICE_FIELD_VALUE_TYPE_OPTIONS: Array<{
  value: NonNullable<ServiceFieldBinding["valueType"]>;
  label: string;
}> = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "json", label: "JSON" },
  { value: "email", label: "Email" },
  { value: "password", label: "Password" },
  { value: "message", label: "Message" },
  { value: "id", label: "Record ID" },
];

export function createDefaultServiceBinding(): NodeServiceBinding {
  return {};
}

export function getDefaultServiceDataSource(action?: ServiceActionKind): NodeServiceBinding["dataSource"] {
  switch (action) {
    case "auth.login":
    case "auth.register":
    case "auth.logout":
      return { source: "auth.session", limit: 1 };
    case "operations.release.record":
    case "operations.runbook.generate":
      return { source: "operations.releases", limit: 10, orderBy: "created_at", orderDir: "desc" };
    case "todo.create":
      return { source: "todo.list", limit: 20, orderBy: "created_at", orderDir: "desc" };
    case "note.save":
      return { source: "note.current", limit: 1 };
    case "kanban.column.create":
    case "kanban.card.create":
      return { source: "kanban.columns", limit: 10, orderBy: "created_at", orderDir: "asc" };
    case "reservation.create":
    case "reservation.transition":
      return { source: "reservations.list", limit: 10, orderBy: "created_at", orderDir: "desc" };
    case "ticket.create":
    case "ticket.reply":
      return { source: "tickets.list", limit: 10, orderBy: "updated_at", orderDir: "desc" };
    case "crm.lead.move":
      return { source: "crm.leads", limit: 10, orderBy: "updated_at", orderDir: "desc" };
    case "document.submit":
    case "document.decide":
      return { source: "documents.list", limit: 10, orderBy: "updated_at", orderDir: "desc" };
    case "billing.checkout":
    case "billing.invoice.pay":
      return { source: "billing.invoices", limit: 10, orderBy: "created_at", orderDir: "desc" };
    case "policy.evaluate":
      return { source: "policy.rules", limit: 10, orderBy: "updated_at", orderDir: "desc" };
    default:
      return { source: "auth.session", limit: 1 };
  }
}

export function getDefaultStateTransition(action?: ServiceActionKind): ServiceStateTransitionBinding | undefined {
  switch (action) {
    case "reservation.transition":
      return { machine: "reservation", to: "confirmed", recordIdField: "reservationId", statusField: "status" };
    case "ticket.reply":
      return { machine: "ticket", to: "answered", recordIdField: "ticketId", statusField: "status" };
    case "crm.lead.move":
      return { machine: "crmLead", to: "qualified", recordIdField: "leadId", statusField: "status" };
    case "document.submit":
      return { machine: "document", to: "submitted", recordIdField: "documentId", statusField: "status" };
    case "document.decide":
      return { machine: "document", to: "approved", recordIdField: "documentId", statusField: "status" };
    case "billing.invoice.pay":
      return { machine: "billingInvoice", to: "paid", recordIdField: "invoiceId", statusField: "status" };
    default:
      return undefined;
  }
}

export function createDefaultServiceAction(action: ServiceActionKind): Extract<PrototypeAction, { type: "service" }> {
  return {
    type: "service",
    action,
    bindings: [],
    dataSource: getDefaultServiceDataSource(action),
    stateTransition: getDefaultStateTransition(action),
  };
}

export function findPrimaryServiceInteraction(
  interactions: PrototypeInteraction[] | undefined,
): PrototypeInteraction | null {
  return interactions?.find((interaction) => interaction.action.type === "service" && interaction.trigger === "click") ?? null;
}

export function describeServiceBindingIssues(
  binding: NodeServiceBinding | undefined,
  action?: ServiceActionKind,
): string[] {
  const issues: string[] = [];
  if (binding?.field && !binding.field.key.trim()) {
    issues.push("필드 바인딩 key가 비어 있습니다.");
  }
  if (binding?.stateTransition) {
    if (!binding.stateTransition.to.trim()) {
      issues.push("상태 전이 목표값이 비어 있습니다.");
    }
    if (!binding.stateTransition.recordIdField?.trim()) {
      issues.push("상태 전이 recordIdField가 필요합니다.");
    }
  }
  if (
    action &&
    (action === "reservation.transition" || action === "crm.lead.move" || action === "document.decide")
    && !binding?.stateTransition
  ) {
    issues.push("이 서비스 액션은 상태 전이 바인딩이 필요합니다.");
  }
  return issues;
}
