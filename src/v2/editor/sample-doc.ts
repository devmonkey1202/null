import { V2_EDITOR_SCHEMA_VERSION, type SceneDoc } from "@/v2/editor/contracts";

const now = new Date().toISOString();

export const sampleSceneDoc: SceneDoc = {
  schemaVersion: V2_EDITOR_SCHEMA_VERSION,
  documentId: "v2-editor-scaffold",
  title: "NULL v2 Editor Scaffold",
  pages: [
    {
      id: "page-home",
      name: "Canvas",
      rootId: "root-frame",
      guides: [],
      nodes: [
        {
          id: "root-frame",
          kind: "frame",
          name: "Root Frame",
          parentId: null,
          children: ["hero-frame", "sidebar-frame"],
          frame: { x: 0, y: 0, w: 1440, h: 960, rotation: 0 },
        },
        {
          id: "hero-frame",
          kind: "frame",
          name: "Hero Surface",
          parentId: "root-frame",
          children: ["hero-title", "hero-body"],
          frame: { x: 280, y: 120, w: 760, h: 320, rotation: 0 },
          constraints: { horizontal: "scale", vertical: "min" },
        },
        {
          id: "hero-title",
          kind: "text",
          name: "Title",
          parentId: "hero-frame",
          frame: { x: 320, y: 160, w: 540, h: 72, rotation: 0 },
          constraints: { horizontal: "stretch", vertical: "min" },
          text: {
            content: "Design faster. Ship clearer.",
            fontFamily: "Inter",
            fontSize: 42,
            fontWeight: 700,
            lineHeight: 52,
            letterSpacing: -0.6,
            align: "left",
            color: "#0f172a",
          },
        },
        {
          id: "hero-body",
          kind: "text",
          name: "Description",
          parentId: "hero-frame",
          frame: { x: 320, y: 248, w: 520, h: 88, rotation: 0 },
          constraints: { horizontal: "stretch", vertical: "min" },
          text: {
            content:
              "NULL v2 editor rebuild is moving to a Rust/WASM kernel with faster selection, cleaner layout decisions, and tighter runtime handoff.",
            fontFamily: "Inter",
            fontSize: 18,
            fontWeight: 500,
            lineHeight: 30,
            letterSpacing: 0,
            align: "left",
            color: "#475569",
          },
        },
        {
          id: "sidebar-frame",
          kind: "frame",
          name: "Inspector Demo",
          parentId: "root-frame",
          children: [],
          frame: { x: 1080, y: 120, w: 220, h: 520, rotation: 0 },
          constraints: { horizontal: "max", vertical: "stretch" },
        },
      ],
    },
  ],
  meta: {
    createdAt: now,
    updatedAt: now,
  },
};
