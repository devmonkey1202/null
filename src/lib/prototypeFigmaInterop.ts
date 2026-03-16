import type { PrototypeAction, PrototypeInteraction, PrototypeTransition } from "@/advanced/doc/scene";
import type {
  FigmaFlowStartingPoint,
  FigmaInteraction,
  FigmaNode,
  FigmaPrototypeAction,
  FigmaPrototypeEasing,
  FigmaPrototypeTransition,
  FigmaPrototypeTrigger,
} from "./figma";

const NULL_SHARED_NAMESPACE = "NULL";
const NULL_PROTOTYPE_SHARED_KEY = "prototype";

type PrototypeExportResolver = {
  resolvePageStartNodeId: (pageId: string | undefined) => string | undefined;
  resolvePageName: (pageId: string | undefined) => string | undefined;
  resolveNodeFigmaId: (nodeId: string | undefined) => string | undefined;
  resolveVariantFigmaId: (variantId: string | undefined) => string | undefined;
};

type PrototypeImportResolver = {
  resolvePageIdFromDestination: (figmaNodeId: string | undefined) => string | undefined;
  resolvePageIdByName: (pageName: string | undefined) => string | undefined;
  resolveNodeIdFromFigma: (figmaNodeId: string | undefined) => string | undefined;
};

type PrototypeSharedMetadataAction = PrototypeAction & {
  resolvedTargetPageNodeId?: string;
  targetPageName?: string;
  resolvedTargetNodeId?: string;
  resolvedVariantNodeId?: string;
};

type PrototypeSharedMetadata = {
  version: 1;
  interactions: Array<{
    id: string;
    trigger: PrototypeInteraction["trigger"];
    action: PrototypeSharedMetadataAction;
    scrollTriggerConfig?: PrototypeInteraction["scrollTriggerConfig"];
    hoverDelayMs?: number;
  }>;
};

type DelayCapableAction = Extract<PrototypeAction, { delayMs?: number }>;

function supportsDelay(action: PrototypeAction): action is DelayCapableAction {
  switch (action.type) {
    case "navigate":
    case "back":
    case "overlay":
    case "closeOverlay":
    case "url":
    case "submit":
    case "scrollTo":
    case "setVariant":
    case "apiCall":
    case "nativeCall":
    case "appAuth":
      return true;
    default:
      return false;
  }
}

function cloneTransition(transition: PrototypeTransition | undefined): PrototypeTransition | undefined {
  return transition ? { ...transition } : undefined;
}

function toFigmaEasingType(value: string | undefined) {
  if (value === "ease-in") return "EASE_IN";
  if (value === "ease-out") return "EASE_OUT";
  if (value === "linear") return "LINEAR";
  return "EASE_IN_AND_OUT";
}

function fromFigmaEasingType(value: string | undefined) {
  if (value === "EASE_IN") return "ease-in";
  if (value === "EASE_OUT") return "ease-out";
  if (value === "LINEAR") return "linear";
  return "ease";
}

function exportTransition(transition: PrototypeTransition | undefined): FigmaPrototypeTransition | null {
  if (!transition) return null;
  const easing: FigmaPrototypeEasing = { type: toFigmaEasingType(transition.easing) };
  const duration = transition.duration ?? 300;
  if (transition.type === "smart") {
    return { type: "SMART_ANIMATE", duration, easing };
  }
  if (transition.type === "fade") {
    return { type: "DISSOLVE", duration, easing };
  }
  if (transition.type === "slide-left") {
    return { type: "SLIDE_IN", direction: "LEFT", duration, easing };
  }
  if (transition.type === "slide-right") {
    return { type: "SLIDE_IN", direction: "RIGHT", duration, easing };
  }
  return { type: "DISSOLVE", duration: transition.type === "instant" ? 0 : duration, easing };
}

function importTransition(transition: FigmaPrototypeTransition | null | undefined): PrototypeTransition | undefined {
  if (!transition) return undefined;
  if (transition.type === "SMART_ANIMATE") {
    return {
      type: "smart",
      duration: transition.duration,
      easing: fromFigmaEasingType(transition.easing?.type),
    };
  }
  if (transition.type === "DISSOLVE") {
    return {
      type: transition.duration === 0 ? "instant" : "fade",
      duration: transition.duration,
      easing: fromFigmaEasingType(transition.easing?.type),
    };
  }
  if ("direction" in transition) {
    return {
      type: transition.direction === "RIGHT" ? "slide-right" : "slide-left",
      duration: transition.duration,
      easing: fromFigmaEasingType(transition.easing?.type),
    };
  }
  return undefined;
}

function exportTrigger(interaction: PrototypeInteraction): FigmaPrototypeTrigger | null {
  switch (interaction.trigger) {
    case "click":
      return { type: "ON_CLICK" };
    case "hover":
    case "whileHover":
      return { type: "ON_HOVER" };
    case "onPress":
      return { type: "ON_PRESS" };
    case "onDragStart":
    case "onDragEnd":
      return { type: "ON_DRAG" };
    case "load":
      return { type: "AFTER_TIMEOUT", timeout: supportsDelay(interaction.action) ? interaction.action.delayMs ?? 0 : 0 };
    default:
      return null;
  }
}

function importTrigger(trigger: FigmaPrototypeTrigger | null | undefined, action: PrototypeAction): PrototypeInteraction["trigger"] | null {
  if (!trigger) return null;
  switch (trigger.type) {
    case "ON_CLICK":
      return "click";
    case "ON_HOVER":
    case "MOUSE_ENTER":
      return "hover";
    case "ON_PRESS":
      return "onPress";
    case "ON_DRAG":
      return "onDragStart";
    case "AFTER_TIMEOUT":
      if (supportsDelay(action)) action.delayMs = trigger.timeout;
      return "load";
    default:
      return null;
  }
}

function exportAction(action: PrototypeAction, resolver: PrototypeExportResolver): FigmaPrototypeAction | null {
  switch (action.type) {
    case "navigate":
      return {
        type: "NODE",
        destinationId: resolver.resolvePageStartNodeId(action.targetPageId) ?? null,
        navigation: "NAVIGATE",
        transition: exportTransition(action.transition),
      };
    case "overlay":
      return {
        type: "NODE",
        destinationId: resolver.resolvePageStartNodeId(action.targetPageId) ?? null,
        navigation: "OVERLAY",
        transition: exportTransition(action.transition),
      };
    case "back":
      return { type: "BACK" };
    case "closeOverlay":
      return { type: "CLOSE" };
    case "url":
      return { type: "URL", url: action.url };
    case "scrollTo":
      return {
        type: "NODE",
        destinationId: resolver.resolveNodeFigmaId(action.targetNodeId) ?? null,
        navigation: "SCROLL_TO",
        transition: exportTransition(action.transition),
      };
    case "setVariant":
      return {
        type: "NODE",
        destinationId: resolver.resolveVariantFigmaId(action.variantId) ?? resolver.resolveNodeFigmaId(action.targetNodeId) ?? null,
        navigation: "CHANGE_TO",
        transition: null,
      };
    default:
      return null;
  }
}

function enrichActionMetadata(action: PrototypeAction, resolver: PrototypeExportResolver): PrototypeSharedMetadataAction {
  const nextAction = { ...action } as PrototypeSharedMetadataAction;
  if ("targetPageId" in action) {
    nextAction.resolvedTargetPageNodeId = resolver.resolvePageStartNodeId(action.targetPageId);
    nextAction.targetPageName = resolver.resolvePageName(action.targetPageId);
  }
  if ("targetNodeId" in action) {
    nextAction.resolvedTargetNodeId = resolver.resolveNodeFigmaId(action.targetNodeId);
  }
  if ("variantId" in action) {
    nextAction.resolvedVariantNodeId = resolver.resolveVariantFigmaId(action.variantId);
  }
  return nextAction;
}

function parseSharedPrototypeData(fNode: FigmaNode): PrototypeSharedMetadata | null {
  const raw = fNode.sharedPluginData?.[NULL_SHARED_NAMESPACE]?.[NULL_PROTOTYPE_SHARED_KEY];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PrototypeSharedMetadata;
    if (parsed?.version !== 1 || !Array.isArray(parsed.interactions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function remapSharedAction(action: PrototypeSharedMetadataAction, resolver: PrototypeImportResolver): PrototypeAction | null {
  switch (action.type) {
    case "navigate":
    case "overlay": {
      const targetPageId =
        resolver.resolvePageIdFromDestination(action.resolvedTargetPageNodeId) ??
        resolver.resolvePageIdByName(action.targetPageName) ??
        action.targetPageId;
      return targetPageId ? { ...action, targetPageId, transition: cloneTransition(action.transition) } : null;
    }
    case "scrollTo": {
      const targetNodeId = resolver.resolveNodeIdFromFigma(action.resolvedTargetNodeId) ?? action.targetNodeId;
      return targetNodeId ? { ...action, targetNodeId, transition: cloneTransition(action.transition) } : null;
    }
    case "setVariant": {
      const targetNodeId =
        resolver.resolveNodeIdFromFigma(action.resolvedTargetNodeId) ??
        resolver.resolveNodeIdFromFigma(action.resolvedVariantNodeId) ??
        action.targetNodeId;
      return {
        ...action,
        targetNodeId,
      };
    }
    default:
      return { ...action, transition: "transition" in action ? cloneTransition(action.transition) : undefined } as PrototypeAction;
  }
}

function importSharedPrototypeData(fNode: FigmaNode, resolver: PrototypeImportResolver): PrototypeInteraction[] {
  const shared = parseSharedPrototypeData(fNode);
  if (!shared) return [];
  const interactions: PrototypeInteraction[] = [];
  for (const interaction of shared.interactions) {
    const action = remapSharedAction(interaction.action, resolver);
    if (!action) continue;
    interactions.push({
      id: interaction.id,
      trigger: interaction.trigger,
      action,
      scrollTriggerConfig: interaction.scrollTriggerConfig ? { ...interaction.scrollTriggerConfig } : undefined,
      hoverDelayMs: interaction.hoverDelayMs,
    });
  }
  return interactions;
}

function importOfficialAction(action: FigmaPrototypeAction, resolver: PrototypeImportResolver): PrototypeAction | null {
  switch (action.type) {
    case "BACK":
      return { type: "back" };
    case "CLOSE":
      return { type: "closeOverlay" };
    case "URL":
      return { type: "url", url: action.url };
    case "NODE": {
      if (action.navigation === "SCROLL_TO") {
        const targetNodeId = resolver.resolveNodeIdFromFigma(action.destinationId ?? undefined);
        return targetNodeId
          ? {
              type: "scrollTo",
              targetNodeId,
              transition: importTransition(action.transition),
            }
          : null;
      }
      if (action.navigation === "CHANGE_TO") {
        const targetNodeId = resolver.resolveNodeIdFromFigma(action.destinationId ?? undefined);
        return targetNodeId
          ? {
              type: "setVariant",
              variantId: targetNodeId,
              targetNodeId,
            }
          : null;
      }
      const targetPageId = resolver.resolvePageIdFromDestination(action.destinationId ?? undefined);
      if (!targetPageId) return null;
      if (action.navigation === "OVERLAY") {
        return {
          type: "overlay",
          targetPageId,
          transition: importTransition(action.transition),
        };
      }
      return {
        type: "navigate",
        targetPageId,
        transition: importTransition(action.transition),
      };
    }
    default:
      return null;
  }
}

export function buildFigmaNodePrototypeFields(
  node: { prototype?: { interactions: PrototypeInteraction[] } },
  resolver: PrototypeExportResolver,
): Pick<FigmaNode, "interactions" | "transitionNodeID" | "transitionDuration" | "transitionEasing" | "sharedPluginData"> {
  const interactions = node.prototype?.interactions ?? [];
  if (!interactions.length) return {};

  const exportedInteractions: FigmaInteraction[] = [];
  interactions.forEach((interaction) => {
    const trigger = exportTrigger(interaction);
    const action = exportAction(interaction.action, resolver);
    if (!trigger || !action) return;
    exportedInteractions.push({
      trigger,
      actions: [action],
    });
  });

  const sharedPayload: PrototypeSharedMetadata = {
    version: 1,
    interactions: interactions.map((interaction) => ({
      id: interaction.id,
      trigger: interaction.trigger,
      action: enrichActionMetadata(interaction.action, resolver),
      scrollTriggerConfig: interaction.scrollTriggerConfig ? { ...interaction.scrollTriggerConfig } : undefined,
      hoverDelayMs: interaction.hoverDelayMs,
    })),
  };

  const firstNodeAction = exportedInteractions
    .flatMap((interaction) => interaction.actions ?? [])
    .find((action): action is Extract<FigmaPrototypeAction, { type: "NODE" }> => action.type === "NODE");

  return {
    interactions: exportedInteractions.length ? exportedInteractions : undefined,
    transitionNodeID: firstNodeAction?.destinationId ?? undefined,
    transitionDuration: firstNodeAction?.transition?.duration,
    transitionEasing: firstNodeAction?.transition?.easing?.type,
    sharedPluginData: {
      [NULL_SHARED_NAMESPACE]: {
        [NULL_PROTOTYPE_SHARED_KEY]: JSON.stringify(sharedPayload),
      },
    },
  };
}

export function buildFigmaFlowStartingPoints(params: {
  pageId: string;
  pageName: string;
  prototypeStartPageId: string | undefined;
  resolvePageStartNodeId: (pageId: string | undefined) => string | undefined;
}): Pick<FigmaNode, "flowStartingPoints" | "prototypeStartNodeID" | "prototypeDevice"> {
  const isStartPage = params.prototypeStartPageId === params.pageId;
  const startNodeId = isStartPage ? params.resolvePageStartNodeId(params.pageId) : undefined;
  const flowStartingPoints: FigmaFlowStartingPoint[] | undefined =
    startNodeId
      ? [
          {
            nodeId: startNodeId,
            name: params.pageName,
          },
        ]
      : undefined;
  return {
    flowStartingPoints,
    prototypeStartNodeID: startNodeId ?? null,
    prototypeDevice: {
      type: "NONE",
      rotation: "NONE",
    },
  };
}

export function importFigmaNodePrototype(
  fNode: FigmaNode,
  nodeId: string,
  resolver: PrototypeImportResolver,
): PrototypeInteraction[] | undefined {
  const sharedInteractions = importSharedPrototypeData(fNode, resolver);
  if (sharedInteractions.length) return sharedInteractions;
  if (!fNode.interactions?.length) return undefined;

  const imported = fNode.interactions.flatMap((interaction, interactionIndex) => {
    const trigger = interaction.trigger;
    return (interaction.actions ?? [])
      .map((action, actionIndex) => {
        const nullAction = importOfficialAction(action, resolver);
        if (!nullAction) return null;
        const nullTrigger = importTrigger(trigger, nullAction);
        if (!nullTrigger) return null;
        return {
          id: `figma_proto_${nodeId}_${interactionIndex}_${actionIndex}`,
          trigger: nullTrigger,
          action: nullAction,
        } satisfies PrototypeInteraction;
      })
      .filter((item): item is PrototypeInteraction => Boolean(item));
  });

  return imported.length ? imported : undefined;
}

export function resolveImportedStartPageId(params: {
  pageSources: Array<{ kind: "canvas" | "node"; node: FigmaNode; name: string }>;
  importedPageIds: string[];
}): string | undefined {
  const match = params.pageSources.findIndex(
    (source) => source.node.flowStartingPoints?.length || source.node.prototypeStartNodeID,
  );
  if (match < 0) return params.importedPageIds[0];
  return params.importedPageIds[match] ?? params.importedPageIds[0];
}
