import { cloneDoc, hydrateDoc, serializeDoc, type Doc } from "../src/advanced/doc/scene";

export function collectDocParitySnapshot(doc: Doc) {
  return {
    pages: doc.pages.map((page) => ({
      id: page.id,
      name: page.name,
      rootId: page.rootId,
      breakpoints: page.breakpoints?.map((breakpoint) => ({
        ...breakpoint,
      })),
      activeBreakpointId: page.activeBreakpointId ?? null,
    })),
    styles: doc.styles
      .map((style) => ({
        id: style.id,
        name: style.name,
        type: style.type,
        value: style.value,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    variables: doc.variables
      .map((variable) => ({
        id: variable.id,
        name: variable.name,
        type: variable.type,
        value: variable.value,
        modes: variable.modes ?? null,
        aliasOf: variable.aliasOf ?? null,
        modeAliases: variable.modeAliases ?? null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    variableModes: [...(doc.variableModes ?? [])],
    variableMode: doc.variableMode ?? null,
    components: Object.entries(doc.components)
      .map(([componentId, rootId]) => ({ componentId, rootId }))
      .sort((a, b) => a.componentId.localeCompare(b.componentId)),
    nodes: Object.values(doc.nodes)
      .map((node) => ({
        id: node.id,
        type: node.type,
        name: node.name,
        parentId: node.parentId,
        children: [...node.children],
        frame: { ...node.frame },
        layout: node.layout ? JSON.parse(JSON.stringify(node.layout)) : null,
        layoutGrid: node.layoutGrid ? JSON.parse(JSON.stringify(node.layoutGrid)) : null,
        layoutSizing: node.layoutSizing ? JSON.parse(JSON.stringify(node.layoutSizing)) : null,
        layoutPositioning: node.layoutPositioning ?? null,
        gridChild: node.gridChild ? { ...node.gridChild } : null,
        constraints: node.constraints ? { ...node.constraints } : null,
        clipContent: node.clipContent ?? null,
        overflowScrolling: node.overflowScrolling ?? null,
        componentId: node.componentId ?? null,
        instanceOf: node.instanceOf ?? null,
        variantId: node.variantId ?? null,
        sourceId: node.sourceId ?? null,
        styleRefs: {
          fillStyleId: node.style.fillStyleId ?? null,
          strokeStyleId: node.style.strokeStyleId ?? null,
          effectStyleId: node.style.effectStyleId ?? null,
          fillRef: node.style.fillRef ?? null,
          strokeRef: node.style.strokeRef ?? null,
        },
        text: node.text
          ? {
              value: node.text.value,
              valueRef: node.text.valueRef ?? null,
              styleRef: node.text.styleRef ?? null,
              styleBindings: node.text.styleBindings ? { ...node.text.styleBindings } : null,
              wrap: node.text.wrap ?? null,
              autoSize: node.text.autoSize ?? null,
              ranges:
                node.text.ranges?.map((range) => ({
                  start: range.start,
                  end: range.end,
                  style: range.style ? { ...range.style } : null,
                  fill: range.fill ?? null,
                  fillRef: range.fillRef ?? null,
                  styleBindings: range.styleBindings ? { ...range.styleBindings } : null,
                })) ?? null,
              textPath: node.text.textPath ? { ...node.text.textPath } : null,
            }
          : null,
        shape: node.shape
          ? {
              pathData: node.shape.pathData ?? null,
              segmentCount: node.shape.segments?.length ?? 0,
              booleanOp: node.shape.booleanMeta?.op ?? null,
              vectorVertices: node.shape.vectorNetwork?.vertices.length ?? 0,
              vectorSegments: node.shape.vectorNetwork?.segments.length ?? 0,
              vectorPaths: node.shape.vectorNetwork?.paths.length ?? 0,
            }
          : null,
        variants: node.variants?.map((variant) => ({
          id: variant.id,
          name: variant.name,
          rootId: variant.rootId,
          props: variant.props ? { ...variant.props } : null,
        })) ?? null,
        propertyDefinitions: node.propertyDefinitions ? { ...node.propertyDefinitions } : null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function roundtripDocThroughSerialize(doc: Doc) {
  return hydrateDoc(serializeDoc(cloneDoc(doc)));
}
