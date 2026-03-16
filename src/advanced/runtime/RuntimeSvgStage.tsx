"use client";

import React from "react";

import type { RuntimeSceneGraph } from "./sceneGraph";

type RuntimeSvgStageProps = {
  scene: RuntimeSceneGraph;
  svgRef?: React.Ref<SVGSVGElement>;
  defs?: React.ReactNode;
  children?: React.ReactNode;
};

export default function RuntimeSvgStage({ scene, svgRef, defs, children }: RuntimeSvgStageProps) {
  return (
    <svg
      ref={svgRef}
      width={scene.svgWidth}
      height={scene.svgHeight}
      viewBox={scene.viewBox}
      preserveAspectRatio="xMinYMin meet"
      style={{ display: "block" }}
      data-renderer-mode="svg"
    >
      {defs ? <defs>{defs}</defs> : null}
      {children}
    </svg>
  );
}
