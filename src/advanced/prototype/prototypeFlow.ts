import type { Doc, Node, PrototypeAction, PrototypeInteraction, PrototypeTrigger } from "../doc/scene";
import { deriveSmartAnimatePlan } from "./prototypeMotion";

export type PrototypeFlowDiagnostic = {
  severity: "info" | "warn";
  message: string;
};

export type PrototypeFlowItem = {
  id: string;
  nodeId: string;
  nodeName: string;
  trigger: PrototypeTrigger;
  actionLabel: string;
  diagnostics: PrototypeFlowDiagnostic[];
  delayMs: number;
  durationMs: number;
  totalMs: number;
};

export type PrototypeFlowPage = {
  pageId: string;
  pageName: string;
  items: PrototypeFlowItem[];
  maxMs: number;
  issueCount: number;
};

function flattenIds(doc: Doc, rootId: string) {
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.shift()!;
    out.push(id);
    const node = doc.nodes[id];
    if (!node) continue;
    stack.unshift(...node.children);
  }
  return out;
}

function getPageNameMap(doc: Doc) {
  return Object.fromEntries(doc.pages.map((page) => [page.id, page.name]));
}

function getNodeLabel(node?: Node | null) {
  if (!node) return "";
  return node.name?.trim() || node.type;
}

function getTransitionDuration(action: PrototypeAction) {
  if (!("transition" in action) || !action.transition || action.transition.type === "instant") return 0;
  return typeof action.transition.duration === "number" ? action.transition.duration : 300;
}

export function summarizePrototypeAction(doc: Doc, pageId: string, action: PrototypeAction) {
  const pageNameById = getPageNameMap(doc);
  if (action.type === "navigate") return `navigate -> ${pageNameById[action.targetPageId] ?? action.targetPageId}`;
  if (action.type === "overlay") return `overlay -> ${pageNameById[action.targetPageId] ?? action.targetPageId}`;
  if (action.type === "back") return "back";
  if (action.type === "closeOverlay") return "close overlay";
  if (action.type === "url") return action.url?.trim() ? `open url -> ${action.url.trim()}` : "open url";
  if (action.type === "submit") return action.url?.trim() ? `submit -> ${action.url.trim()}` : "submit";
  if (action.type === "setVariable") {
    const variable = doc.variables.find((item) => item.id === action.variableId);
    return `set variable -> ${variable?.name ?? action.variableId}`;
  }
  if (action.type === "setGlobalState") return `set state -> ${action.key}`;
  if (action.type === "scrollTo") {
    const node = doc.nodes[action.targetNodeId];
    return `scroll to -> ${getNodeLabel(node) || action.targetNodeId}`;
  }
  if (action.type === "setVariant") return `set variant -> ${action.variantId}`;
  if (action.type === "apiCall") return action.url?.trim() ? `api call -> ${action.method ?? "GET"} ${action.url.trim()}` : "api call";
  if (action.type === "nativeCall") return action.name?.trim() ? `native -> ${action.name.trim()}` : "native call";
  if (action.type === "appAuth") return `auth -> ${action.action}`;
  if (action.type === "service") return `service -> ${action.action}`;
  return (action as { type: string }).type;
}

export function diagnosePrototypeInteraction(
  doc: Doc,
  pageId: string,
  nodeId: string,
  interaction: PrototypeInteraction,
): PrototypeFlowDiagnostic[] {
  const issues: PrototypeFlowDiagnostic[] = [];
  const action = interaction.action;

  if (interaction.trigger === "scroll") {
    const containerId = interaction.scrollTriggerConfig?.nodeId;
    if (containerId && !doc.nodes[containerId]) {
      issues.push({ severity: "warn", message: "scroll trigger container missing" });
    }
  }

  if ("condition" in action && action.condition?.variableId && !doc.variables.some((item) => item.id === action.condition?.variableId)) {
    issues.push({ severity: "warn", message: "condition variable missing" });
  }

  if (action.type === "navigate" || action.type === "overlay") {
    const targetPage = doc.pages.find((page) => page.id === action.targetPageId);
    if (!targetPage) {
      issues.push({ severity: "warn", message: "target page missing" });
    } else if (action.type === "overlay" && action.targetPageId === pageId) {
      issues.push({ severity: "info", message: "overlay targets current page" });
    }
  }

  if (action.type === "scrollTo" && !doc.nodes[action.targetNodeId]) {
    issues.push({ severity: "warn", message: "scroll target missing" });
  }

  if (action.type === "setVariable" && !doc.variables.some((item) => item.id === action.variableId)) {
    issues.push({ severity: "warn", message: "target variable missing" });
  }

  if (action.type === "setVariant") {
    const targetNode = action.targetNodeId ? doc.nodes[action.targetNodeId] : doc.nodes[nodeId];
    const source = targetNode?.instanceOf ? doc.nodes[targetNode.instanceOf] : null;
    const variantExists = Boolean(source?.variants?.some((variant) => variant.id === action.variantId));
    if (!targetNode || targetNode.type !== "instance") {
      issues.push({ severity: "warn", message: "variant target instance missing" });
    } else if (!variantExists) {
      issues.push({ severity: "warn", message: "target variant missing" });
    }
  }

  if (action.type === "apiCall" && !action.url?.trim()) {
    issues.push({ severity: "warn", message: "api url missing" });
  }

  if (action.type === "nativeCall" && !action.name?.trim()) {
    issues.push({ severity: "warn", message: "native command missing" });
  }

  if (action.type === "submit" && !action.url?.trim()) {
    issues.push({ severity: "warn", message: "submit url missing" });
  }

  if (action.type === "url" && !action.url?.trim()) {
    issues.push({ severity: "warn", message: "url missing" });
  }

  if (action.type === "service") {
    if (!action.action?.trim()) {
      issues.push({ severity: "warn", message: "service action missing" });
    }
    if (
      (action.action === "reservation.transition" ||
        action.action === "crm.lead.move" ||
        action.action === "document.decide") &&
      !action.stateTransition?.to?.trim()
    ) {
      issues.push({ severity: "warn", message: "service target state missing" });
    }
  }

  if (
    "transition" in action &&
    action.transition?.type === "smart" &&
    (action.type === "navigate" || action.type === "overlay") &&
    doc.pages.some((page) => page.id === action.targetPageId)
  ) {
    const plan = deriveSmartAnimatePlan(doc, pageId, action.targetPageId);
    if (!plan || plan.matchCount === 0) {
      issues.push({ severity: "warn", message: "smart animate matches missing" });
    } else {
      issues.push({ severity: "info", message: `smart matches ${plan.matchCount}` });
    }
  }

  return issues;
}

export function buildPrototypeFlow(doc: Doc): PrototypeFlowPage[] {
  return doc.pages
    .map((page) => {
      const ids = flattenIds(doc, page.rootId);
      const items: PrototypeFlowItem[] = [];
      ids.forEach((id) => {
        const node = doc.nodes[id];
        if (!node?.prototype?.interactions?.length) return;
        node.prototype.interactions.forEach((interaction) => {
          const diagnostics = diagnosePrototypeInteraction(doc, page.id, node.id, interaction);
          const delayMs = "delayMs" in interaction.action && typeof interaction.action.delayMs === "number" ? interaction.action.delayMs : 0;
          const durationMs = getTransitionDuration(interaction.action);
          items.push({
            id: interaction.id,
            nodeId: node.id,
            nodeName: getNodeLabel(node),
            trigger: interaction.trigger,
            actionLabel: summarizePrototypeAction(doc, page.id, interaction.action),
            diagnostics,
            delayMs,
            durationMs,
            totalMs: Math.max(0, delayMs + durationMs),
          });
        });
      });
      const sorted = items.slice().sort((a, b) => a.totalMs - b.totalMs);
      return {
        pageId: page.id,
        pageName: page.name,
        items: sorted,
        maxMs: Math.max(200, sorted.reduce((acc, item) => Math.max(acc, item.totalMs), 0)),
        issueCount: sorted.reduce((acc, item) => acc + item.diagnostics.filter((issue) => issue.severity === "warn").length, 0),
      };
    })
    .filter((page) => page.items.length);
}
