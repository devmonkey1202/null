"use client";

import type { Node, PrototypeInteraction } from "../doc/scene";

export type RuntimeInteractionBundle = {
  clickInteraction?: PrototypeInteraction;
  hoverInteraction?: PrototypeInteraction;
  whileHoverInteraction?: PrototypeInteraction;
  onPressInteraction?: PrototypeInteraction;
  onDragStartInteraction?: PrototypeInteraction;
  onDragEndInteraction?: PrototypeInteraction;
  hasPointerInteraction: boolean;
};

export function buildRuntimeInteractionBundle(
  node: Node,
  interactive?: boolean,
  canInteract?: boolean,
): RuntimeInteractionBundle {
  const enabled = Boolean(interactive && canInteract);
  const interactions = enabled ? node.prototype?.interactions ?? [] : [];
  const clickInteraction = interactions.find((item) => item.trigger === "click");
  const hoverInteraction = interactions.find((item) => item.trigger === "hover");
  const whileHoverInteraction = interactions.find((item) => item.trigger === "whileHover");
  const onPressInteraction = interactions.find((item) => item.trigger === "onPress");
  const onDragStartInteraction = interactions.find((item) => item.trigger === "onDragStart");
  const onDragEndInteraction = interactions.find((item) => item.trigger === "onDragEnd");

  return {
    clickInteraction,
    hoverInteraction,
    whileHoverInteraction,
    onPressInteraction,
    onDragStartInteraction,
    onDragEndInteraction,
    hasPointerInteraction: Boolean(
      clickInteraction || hoverInteraction || whileHoverInteraction || onPressInteraction || onDragStartInteraction || onDragEndInteraction,
    ),
  };
}
