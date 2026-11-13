use core_error::CoreError;
use core_id::StableId;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

pub const SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SceneDoc {
    pub schema_version: u32,
    pub document_id: String,
    pub title: String,
    pub pages: Vec<ScenePage>,
    pub meta: SceneDocMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SceneDocMeta {
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScenePage {
    pub id: String,
    pub name: String,
    pub root_id: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub guides: Vec<SceneGuide>,
    pub nodes: Vec<SceneNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SceneNodeKind {
    Frame,
    Text,
    Shape,
    Image,
    Video,
    Component,
    Instance,
    Group,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SceneNode {
    pub id: String,
    pub kind: SceneNodeKind,
    pub name: String,
    pub parent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<String>>,
    pub frame: EditorRect,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub constraints: Option<NodeConstraints>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout: Option<AutoLayoutData>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout_sizing: Option<LayoutSizingAxis>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<TextNodeData>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shape: Option<ShapeNodeData>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub component: Option<ComponentNodeData>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub instance: Option<InstanceNodeData>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub instance_source_node_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EditorRect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub rotation: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EditorViewport {
    pub zoom: f32,
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HorizontalConstraint {
    Min,
    Max,
    Stretch,
    Scale,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VerticalConstraint {
    Min,
    Max,
    Stretch,
    Scale,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NodeConstraints {
    pub horizontal: HorizontalConstraint,
    pub vertical: VerticalConstraint,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutoLayoutDirection {
    Horizontal,
    Vertical,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutoLayoutAlign {
    Start,
    Center,
    End,
    Stretch,
    Baseline,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AutoLayoutGapMode {
    #[default]
    Fixed,
    SpaceBetween,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutoLayoutJustify {
    Start,
    Center,
    End,
    SpaceBetween,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AutoLayoutWrapAlign {
    #[default]
    Start,
    Center,
    End,
    SpaceBetween,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LayoutSizing {
    Fixed,
    Fill,
    Hug,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct LayoutSizingAxis {
    #[serde(default)]
    pub width: Option<LayoutSizing>,
    #[serde(default)]
    pub height: Option<LayoutSizing>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_width: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_height: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_width: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_height: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AutoLayoutData {
    pub direction: AutoLayoutDirection,
    pub gap: f32,
    pub padding_x: f32,
    pub padding_y: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub padding_top: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub padding_right: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub padding_bottom: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub padding_left: Option<f32>,
    pub align: AutoLayoutAlign,
    pub justify: AutoLayoutJustify,
    #[serde(default)]
    pub gap_mode: AutoLayoutGapMode,
    #[serde(default)]
    pub wrap: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrap_gap: Option<f32>,
    #[serde(default)]
    pub wrap_align: AutoLayoutWrapAlign,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TextAlign {
    Left,
    Center,
    Right,
    Justify,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TextSizingMode {
    #[default]
    Fixed,
    AutoHeight,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TextCase {
    #[default]
    None,
    Upper,
    Lower,
    Capitalize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextNodeData {
    pub content: String,
    pub font_family: String,
    pub font_size: f32,
    pub font_weight: u16,
    pub line_height: f32,
    pub letter_spacing: f32,
    #[serde(default)]
    pub paragraph_spacing: f32,
    pub align: TextAlign,
    pub color: String,
    #[serde(default)]
    pub text_case: TextCase,
    #[serde(default)]
    pub italic: bool,
    #[serde(default)]
    pub underline: bool,
    #[serde(default)]
    pub line_through: bool,
    #[serde(default)]
    pub sizing: TextSizingMode,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ranges: Vec<TextRange>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct TextStylePatch {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_height: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub letter_spacing: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paragraph_spacing: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub align: Option<TextAlign>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_case: Option<TextCase>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub italic: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub underline: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_through: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct TextRange {
    /// Browser-compatible UTF-16 code-unit offset.
    pub start: usize,
    /// Browser-compatible UTF-16 code-unit offset.
    pub end: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<TextStylePatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ShapePrimitive {
    Rect,
    Ellipse,
    Line,
    Path,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ShapePathHandle {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShapePathPoint {
    pub x: f32,
    pub y: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handle_in: Option<ShapePathHandle>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handle_out: Option<ShapePathHandle>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShapePathData {
    pub points: Vec<ShapePathPoint>,
    pub closed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShapeNodeData {
    pub primitive: ShapePrimitive,
    pub fill: String,
    pub stroke_color: String,
    pub stroke_width: f32,
    pub corner_radius: f32,
    pub opacity: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<ShapePathData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ComponentNodeData {
    pub component_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InstanceNodeData {
    pub source_component_id: String,
    pub source_component_key: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub text_overrides: Vec<InstanceTextOverride>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub shape_overrides: Vec<InstanceShapeOverride>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InstanceOverrideKind {
    All,
    Text,
    Shape,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReorderNodePosition {
    Back,
    Backward,
    Forward,
    Front,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstanceTextOverride {
    pub source_node_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<TextStylePatch>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ranges: Vec<TextRange>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstanceShapeOverride {
    pub source_node_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<ShapeStylePatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ShapeStylePatch {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_width: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub corner_radius: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GuideAxis {
    X,
    Y,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SceneGuide {
    pub id: String,
    pub axis: GuideAxis,
    pub position: i32,
}

impl Default for EditorViewport {
    fn default() -> Self {
        Self {
            zoom: 1.0,
            x: 0.0,
            y: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SelectionSetMode {
    Replace,
    Add,
    Toggle,
}

impl Default for SelectionSetMode {
    fn default() -> Self {
        Self::Replace
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SelectionAlignment {
    Left,
    HorizontalCenter,
    Right,
    Top,
    VerticalCenter,
    Bottom,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DistributionAxis {
    Horizontal,
    Vertical,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum EditorCommand {
    SelectNodes {
        #[serde(rename = "nodeIds")]
        node_ids: Vec<String>,
    },
    SelectInRect {
        #[serde(rename = "pageId")]
        page_id: String,
        rect: EditorRect,
        #[serde(default)]
        mode: SelectionSetMode,
    },
    SetViewport { viewport: EditorViewport },
    RenameNode {
        #[serde(rename = "nodeId")]
        node_id: String,
        name: String,
    },
    SetTextContent {
        #[serde(rename = "nodeId")]
        node_id: String,
        content: String,
    },
    SetTextStyle {
        #[serde(rename = "nodeId")]
        node_id: String,
        style: TextStylePatch,
    },
    SetTextRanges {
        #[serde(rename = "nodeId")]
        node_id: String,
        ranges: Vec<TextRange>,
    },
    SetTextSizing {
        #[serde(rename = "nodeId")]
        node_id: String,
        sizing: TextSizingMode,
    },
    SetShapePrimitive {
        #[serde(rename = "nodeId")]
        node_id: String,
        primitive: ShapePrimitive,
    },
    SetShapeStyle {
        #[serde(rename = "nodeId")]
        node_id: String,
        style: ShapeStylePatch,
    },
    SetShapePath {
        #[serde(rename = "nodeId")]
        node_id: String,
        path: ShapePathData,
    },
    PromoteToComponent {
        #[serde(rename = "nodeId")]
        node_id: String,
        #[serde(default, rename = "componentKey", skip_serializing_if = "Option::is_none")]
        component_key: Option<String>,
    },
    SetComponentKey {
        #[serde(rename = "nodeId")]
        node_id: String,
        #[serde(rename = "componentKey")]
        component_key: String,
    },
    CreateInstanceFromComponent {
        #[serde(rename = "pageId")]
        page_id: String,
        #[serde(rename = "sourceNodeId")]
        source_node_id: String,
        #[serde(default, rename = "offsetX", skip_serializing_if = "Option::is_none")]
        offset_x: Option<f32>,
        #[serde(default, rename = "offsetY", skip_serializing_if = "Option::is_none")]
        offset_y: Option<f32>,
    },
    RefreshInstance {
        #[serde(rename = "nodeId")]
        node_id: String,
    },
    DetachInstance {
        #[serde(rename = "nodeId")]
        node_id: String,
    },
    ClearInstanceOverrides {
        #[serde(rename = "nodeId")]
        node_id: String,
        #[serde(default, rename = "overrideKind", skip_serializing_if = "Option::is_none")]
        override_kind: Option<InstanceOverrideKind>,
        #[serde(default, rename = "sourceNodeId", skip_serializing_if = "Option::is_none")]
        source_node_id: Option<String>,
    },
    GroupSelection,
    UngroupSelection,
    AlignSelection {
        alignment: SelectionAlignment,
    },
    DistributeSelection {
        axis: DistributionAxis,
    },
    ReorderNode {
        #[serde(rename = "nodeId")]
        node_id: String,
        position: ReorderNodePosition,
    },
    SetNodeAutoLayout {
        #[serde(rename = "nodeId")]
        node_id: String,
        layout: Option<AutoLayoutData>,
    },
    SetNodeLayoutSizing {
        #[serde(rename = "nodeId")]
        node_id: String,
        #[serde(rename = "layoutSizing")]
        layout_sizing: Option<LayoutSizingAxis>,
    },
    SetNodeConstraints {
        #[serde(rename = "nodeId")]
        node_id: String,
        constraints: NodeConstraints,
    },
    MoveSelection {
        #[serde(rename = "deltaX")]
        delta_x: f32,
        #[serde(rename = "deltaY")]
        delta_y: f32,
    },
    MoveNode {
        #[serde(rename = "nodeId")]
        node_id: String,
        frame: FramePatch,
    },
    RotateSelection {
        #[serde(rename = "deltaDeg")]
        delta_deg: f32,
    },
    ResizeSelection {
        handle: TransformHandleKind,
        #[serde(rename = "deltaX")]
        delta_x: f32,
        #[serde(rename = "deltaY")]
        delta_y: f32,
        #[serde(default, rename = "lockAspect")]
        lock_aspect: bool,
    },
    AddGuide {
        #[serde(rename = "pageId")]
        page_id: String,
        guide: SceneGuide,
    },
    MoveGuide {
        #[serde(rename = "pageId")]
        page_id: String,
        #[serde(rename = "guideId")]
        guide_id: String,
        position: i32,
    },
    DeleteGuide {
        #[serde(rename = "pageId")]
        page_id: String,
        #[serde(rename = "guideId")]
        guide_id: String,
    },
    CreateNode {
        #[serde(rename = "pageId")]
        page_id: String,
        node: SceneNode,
    },
    DeleteNode {
        #[serde(rename = "nodeId")]
        node_id: String,
    },
    DuplicateSelection {
        #[serde(default, rename = "offsetX", skip_serializing_if = "Option::is_none")]
        offset_x: Option<f32>,
        #[serde(default, rename = "offsetY", skip_serializing_if = "Option::is_none")]
        offset_y: Option<f32>,
    },
    Undo,
    Redo,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TransformHandleKind {
    N,
    Ne,
    E,
    Se,
    S,
    Sw,
    W,
    Nw,
    Rotate,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct FramePatch {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub w: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub h: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ValidationSeverity {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub id: String,
    pub severity: ValidationSeverity,
    pub code: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub document_id: String,
    pub generated_at: String,
    pub issues: Vec<ValidationIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EditorSnapshot {
    pub version: u64,
    pub doc: SceneDoc,
    pub selection: Vec<String>,
    pub viewport: EditorViewport,
}

pub fn parse_scene_doc(raw: &str) -> Result<SceneDoc, CoreError> {
    serde_json::from_str(raw)
        .map_err(|error| CoreError::new("scene_doc.parse_failed", error.to_string()))
}

pub fn serialize_scene_doc(doc: &SceneDoc) -> Result<String, CoreError> {
    serde_json::to_string(doc)
        .map_err(|error| CoreError::new("scene_doc.serialize_failed", error.to_string()))
}

pub fn validate_scene_doc(doc: &SceneDoc) -> ValidationReport {
    let mut issues = Vec::new();

    if doc.schema_version != SCHEMA_VERSION {
        issues.push(issue(
            "schema-version",
            ValidationSeverity::Error,
            "scene_doc.schema_version.invalid",
            format!(
                "Expected schema version {}, got {}.",
                SCHEMA_VERSION, doc.schema_version
            ),
            None,
        ));
    }

    if doc.title.trim().is_empty() {
        issues.push(issue(
            "document-title-empty",
            ValidationSeverity::Warning,
            "scene_doc.title.empty",
            "Document title is empty.",
            None,
        ));
    }

    if doc.pages.is_empty() {
        issues.push(issue(
            "document-pages-empty",
            ValidationSeverity::Error,
            "scene_doc.pages.empty",
            "Document must contain at least one page.",
            None,
        ));
    }

    let mut page_ids = HashSet::new();
    let mut node_ids = HashSet::new();

    for page in &doc.pages {
        if !page_ids.insert(page.id.clone()) {
            issues.push(issue(
                format!("page-duplicate-{}", page.id),
                ValidationSeverity::Error,
                "scene_page.id.duplicate",
                format!("Duplicate page id '{}'.", page.id),
                Some(page.id.clone()),
            ));
        }

        if page.nodes.is_empty() {
            issues.push(issue(
                format!("page-empty-{}", page.id),
                ValidationSeverity::Warning,
                "scene_page.nodes.empty",
                format!("Page '{}' has no nodes.", page.id),
                Some(page.id.clone()),
            ));
            continue;
        }

        let per_page: HashMap<&str, &SceneNode> =
            page.nodes.iter().map(|node| (node.id.as_str(), node)).collect();

        if !per_page.contains_key(page.root_id.as_str()) {
            issues.push(issue(
                format!("page-root-missing-{}", page.id),
                ValidationSeverity::Error,
                "scene_page.root.missing",
                format!("Root node '{}' is missing on page '{}'.", page.root_id, page.id),
                Some(page.id.clone()),
            ));
        }

        for node in &page.nodes {
            if !node_ids.insert(node.id.clone()) {
                issues.push(issue(
                    format!("node-duplicate-{}", node.id),
                    ValidationSeverity::Error,
                    "scene_node.id.duplicate",
                    format!("Duplicate node id '{}'.", node.id),
                    Some(node.id.clone()),
                ));
            }

            if node.name.trim().is_empty() {
                issues.push(issue(
                    format!("node-name-empty-{}", node.id),
                    ValidationSeverity::Warning,
                    "scene_node.name.empty",
                    "Node name is empty.",
                    Some(node.id.clone()),
                ));
            }

            if node.frame.w <= 0.0 || node.frame.h <= 0.0 {
                issues.push(issue(
                    format!("node-dimension-invalid-{}", node.id),
                    ValidationSeverity::Error,
                    "scene_node.frame.invalid_size",
                    "Node width and height must be greater than zero.",
                    Some(node.id.clone()),
                ));
            }

            if matches!(node.kind, SceneNodeKind::Text) {
                match &node.text {
                    Some(text) => {
                        if text.content.trim().is_empty() {
                            issues.push(issue(
                                format!("text-content-empty-{}", node.id),
                                ValidationSeverity::Warning,
                                "scene_text.content.empty",
                                "Text content is empty.",
                                Some(node.id.clone()),
                            ));
                        }

                        if text.font_size <= 0.0 || text.line_height <= 0.0 {
                            issues.push(issue(
                                format!("text-metrics-invalid-{}", node.id),
                                ValidationSeverity::Error,
                                "scene_text.metrics.invalid",
                                "Text font size and line height must be greater than zero.",
                                Some(node.id.clone()),
                            ));
                        }
                        if text.paragraph_spacing < 0.0 {
                            issues.push(issue(
                                format!("text-paragraph-spacing-invalid-{}", node.id),
                                ValidationSeverity::Error,
                                "scene_text.paragraph_spacing.invalid",
                                "Text paragraph spacing must be zero or greater.",
                                Some(node.id.clone()),
                            ));
                        }
                        let content_len = text.content.encode_utf16().count();
                        for (range_index, range) in text.ranges.iter().enumerate() {
                            if range.end <= range.start {
                                issues.push(issue(
                                    format!("text-range-empty-{}-{}", node.id, range_index),
                                    ValidationSeverity::Error,
                                    "scene_text.range.empty",
                                    "Text range end must be greater than start.",
                                    Some(node.id.clone()),
                                ));
                            }
                            if range.end > content_len {
                                issues.push(issue(
                                    format!("text-range-out-of-bounds-{}-{}", node.id, range_index),
                                    ValidationSeverity::Error,
                                    "scene_text.range.out_of_bounds",
                                    "Text range end exceeds content length.",
                                    Some(node.id.clone()),
                                ));
                            }
                            if let Some(style) = &range.style {
                                validate_text_style_patch(
                                    &mut issues,
                                    &node.id,
                                    style,
                                    Some(range_index),
                                );
                            }
                        }
                    }
                    None => {
                        issues.push(issue(
                            format!("text-data-missing-{}", node.id),
                            ValidationSeverity::Error,
                            "scene_text.data.missing",
                            "Text node is missing text data.",
                            Some(node.id.clone()),
                        ));
                    }
                }
            }

            if matches!(node.kind, SceneNodeKind::Component) {
                match &node.component {
                    Some(component) if !component.component_key.trim().is_empty() => {}
                    _ => {
                        issues.push(issue(
                            format!("component-data-missing-{}", node.id),
                            ValidationSeverity::Error,
                            "scene_component.data.missing",
                            "Component node is missing component metadata.",
                            Some(node.id.clone()),
                        ));
                    }
                }
            } else if node.component.is_some() {
                issues.push(issue(
                    format!("component-data-unexpected-{}", node.id),
                    ValidationSeverity::Error,
                    "scene_component.data.unexpected",
                    "Only component nodes may contain component metadata.",
                    Some(node.id.clone()),
                ));
            }

            if matches!(node.kind, SceneNodeKind::Instance) {
                match &node.instance {
                    Some(instance)
                        if !instance.source_component_id.trim().is_empty()
                            && !instance.source_component_key.trim().is_empty() =>
                    {
                        let source_node = per_page.get(instance.source_component_id.as_str());
                        if !matches!(
                            source_node.map(|candidate| &candidate.kind),
                            Some(SceneNodeKind::Component)
                        ) {
                            issues.push(issue(
                                format!("instance-source-invalid-{}", node.id),
                                ValidationSeverity::Error,
                                "scene_instance.source.invalid",
                                "Instance source component must exist on the same page.",
                                Some(node.id.clone()),
                            ));
                        }
                    }
                    _ => {
                        issues.push(issue(
                            format!("instance-data-missing-{}", node.id),
                            ValidationSeverity::Error,
                            "scene_instance.data.missing",
                            "Instance node is missing source metadata.",
                            Some(node.id.clone()),
                        ));
                    }
                }
            } else if node.instance.is_some() {
                issues.push(issue(
                    format!("instance-data-unexpected-{}", node.id),
                    ValidationSeverity::Error,
                    "scene_instance.data.unexpected",
                    "Only instance nodes may contain instance metadata.",
                    Some(node.id.clone()),
                ));
            }

            if let Some(parent_id) = &node.parent_id {
                if !per_page.contains_key(parent_id.as_str()) {
                    issues.push(issue(
                        format!("node-parent-missing-{}", node.id),
                        ValidationSeverity::Error,
                        "scene_node.parent.missing",
                        format!("Parent '{}' is missing.", parent_id),
                        Some(node.id.clone()),
                    ));
                }
            }

            if let Some(children) = &node.children {
                for child_id in children {
                    match per_page.get(child_id.as_str()) {
                        Some(child) => {
                            if child.parent_id.as_deref() != Some(node.id.as_str()) {
                                issues.push(issue(
                                    format!("node-child-parent-mismatch-{}-{}", node.id, child_id),
                                    ValidationSeverity::Error,
                                    "scene_node.child.parent_mismatch",
                                    format!(
                                        "Child '{}' does not point back to parent '{}'.",
                                        child_id, node.id
                                    ),
                                    Some(node.id.clone()),
                                ));
                            }
                        }
                        None => {
                            issues.push(issue(
                                format!("node-child-missing-{}-{}", node.id, child_id),
                                ValidationSeverity::Error,
                                "scene_node.child.missing",
                                format!("Child '{}' is missing.", child_id),
                                Some(node.id.clone()),
                            ));
                        }
                    }
                }
            }

            if matches!(node.kind, SceneNodeKind::Shape) {
                match &node.shape {
                    Some(shape) => {
                        if shape.stroke_width < 0.0 {
                            issues.push(issue(
                                format!("shape-stroke-width-invalid-{}", node.id),
                                ValidationSeverity::Error,
                                "scene_shape.stroke_width.invalid",
                                "Shape stroke width must be zero or greater.",
                                Some(node.id.clone()),
                            ));
                        }

                        if shape.corner_radius < 0.0 {
                            issues.push(issue(
                                format!("shape-corner-radius-invalid-{}", node.id),
                                ValidationSeverity::Error,
                                "scene_shape.corner_radius.invalid",
                                "Shape corner radius must be zero or greater.",
                                Some(node.id.clone()),
                            ));
                        }

                        if !(0.0..=1.0).contains(&shape.opacity) {
                            issues.push(issue(
                                format!("shape-opacity-invalid-{}", node.id),
                                ValidationSeverity::Error,
                                "scene_shape.opacity.invalid",
                                "Shape opacity must be between 0 and 1.",
                                Some(node.id.clone()),
                            ));
                        }

                        if matches!(shape.primitive, ShapePrimitive::Path) {
                            match &shape.path {
                                Some(path) => {
                                    if path.points.len() < 2 {
                                        issues.push(issue(
                                            format!("shape-path-points-invalid-{}", node.id),
                                            ValidationSeverity::Error,
                                            "scene_shape.path.points.invalid",
                                            "Path shape must contain at least two points.",
                                            Some(node.id.clone()),
                                        ));
                                    }

                                    if path.closed && path.points.len() < 3 {
                                        issues.push(issue(
                                            format!("shape-path-closed-invalid-{}", node.id),
                                            ValidationSeverity::Error,
                                            "scene_shape.path.closed.invalid",
                                            "Closed path shape must contain at least three points.",
                                            Some(node.id.clone()),
                                        ));
                                    }
                                }
                                None => {
                                    issues.push(issue(
                                        format!("shape-path-missing-{}", node.id),
                                        ValidationSeverity::Error,
                                        "scene_shape.path.missing",
                                        "Path shape is missing path data.",
                                        Some(node.id.clone()),
                                    ));
                                }
                            }
                        }
                    }
                    None => {
                        issues.push(issue(
                            format!("shape-data-missing-{}", node.id),
                            ValidationSeverity::Error,
                            "scene_shape.data.missing",
                            "Shape node is missing shape data.",
                            Some(node.id.clone()),
                        ));
                    }
                }
            }
        }
    }

    ValidationReport {
        document_id: doc.document_id.clone(),
        generated_at: doc.meta.updated_at.clone(),
        issues,
    }
}

fn validate_text_style_patch(
    issues: &mut Vec<ValidationIssue>,
    node_id: &str,
    style: &TextStylePatch,
    range_index: Option<usize>,
) {
    if matches!(style.font_size, Some(value) if value <= 0.0)
        || matches!(style.line_height, Some(value) if value <= 0.0)
    {
        issues.push(issue(
            match range_index {
                Some(index) => format!("text-range-metrics-invalid-{}-{}", node_id, index),
                None => format!("text-style-metrics-invalid-{}", node_id),
            },
            ValidationSeverity::Error,
            "scene_text.style.metrics.invalid",
            "Text style font size and line height must be greater than zero when provided.",
            Some(node_id.to_string()),
        ));
    }

    if matches!(style.paragraph_spacing, Some(value) if value < 0.0) {
        issues.push(issue(
            match range_index {
                Some(index) => format!("text-range-paragraph-spacing-invalid-{}-{}", node_id, index),
                None => format!("text-style-paragraph-spacing-invalid-{}", node_id),
            },
            ValidationSeverity::Error,
            "scene_text.style.paragraph_spacing.invalid",
            "Text style paragraph spacing must be zero or greater when provided.",
            Some(node_id.to_string()),
        ));
    }
}

pub fn document_stable_id(doc: &SceneDoc) -> StableId {
    StableId::new(doc.document_id.clone())
}

fn issue(
    id: impl Into<String>,
    severity: ValidationSeverity,
    code: impl Into<String>,
    message: impl Into<String>,
    target_id: Option<String>,
) -> ValidationIssue {
    ValidationIssue {
        id: id.into(),
        severity,
        code: code.into(),
        message: message.into(),
        target_id,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_doc() -> SceneDoc {
        SceneDoc {
            schema_version: SCHEMA_VERSION,
            document_id: "doc-1".to_string(),
            title: "Sample".to_string(),
            pages: vec![ScenePage {
                id: "page-1".to_string(),
                name: "Canvas".to_string(),
                root_id: "root".to_string(),
                guides: vec![],
                nodes: vec![
                    SceneNode {
                        id: "root".to_string(),
                        kind: SceneNodeKind::Frame,
                        name: "Root".to_string(),
                        parent_id: None,
                        children: Some(vec!["child".to_string()]),
                        frame: EditorRect {
                            x: 0.0,
                            y: 0.0,
                            w: 100.0,
                            h: 100.0,
                            rotation: 0.0,
                        },
                        constraints: None,
                        layout: None,
                        layout_sizing: None,
                        text: None,
                        shape: None,
                        component: None,
                        instance: None,
                        instance_source_node_id: None,
                    },
                    SceneNode {
                        id: "child".to_string(),
                        kind: SceneNodeKind::Text,
                        name: "Child".to_string(),
                        parent_id: Some("root".to_string()),
                        children: None,
                        frame: EditorRect {
                            x: 10.0,
                            y: 10.0,
                            w: 80.0,
                            h: 20.0,
                            rotation: 0.0,
                        },
                        constraints: Some(NodeConstraints {
                            horizontal: HorizontalConstraint::Stretch,
                            vertical: VerticalConstraint::Min,
                        }),
                        layout: None,
                        layout_sizing: None,
                        text: Some(TextNodeData {
                            content: "Hello world".to_string(),
                            font_family: "Inter".to_string(),
                            font_size: 18.0,
                            font_weight: 600,
                            line_height: 24.0,
                            letter_spacing: 0.0,
                            paragraph_spacing: 0.0,
                            align: TextAlign::Left,
                            color: "#0f172a".to_string(),
                            text_case: TextCase::None,
                            italic: false,
                            underline: false,
                            line_through: false,
                            sizing: TextSizingMode::AutoHeight,
                            ranges: vec![],
                        }),
                        shape: None,
                        component: None,
                        instance: None,
                        instance_source_node_id: None,
                    },
                ],
            }],
            meta: SceneDocMeta {
                created_at: "2026-05-27T00:00:00.000Z".to_string(),
                updated_at: "2026-05-27T00:00:00.000Z".to_string(),
            },
        }
    }

    #[test]
    fn serializes_and_parses_scene_doc() {
        let doc = sample_doc();
        let raw = serialize_scene_doc(&doc).expect("serialize");
        let parsed = parse_scene_doc(&raw).expect("parse");
        assert_eq!(parsed, doc);
    }

    #[test]
    fn validation_reports_missing_root_and_invalid_size() {
        let mut doc = sample_doc();
        doc.pages[0].root_id = "missing".to_string();
        doc.pages[0].nodes[1].frame.w = 0.0;

        let report = validate_scene_doc(&doc);

        assert!(
            report
                .issues
                .iter()
                .any(|issue| issue.code == "scene_page.root.missing")
        );
        assert!(
            report
                .issues
                .iter()
                .any(|issue| issue.code == "scene_node.frame.invalid_size")
        );
    }

    #[test]
    fn validation_reports_invalid_path_shape() {
        let mut doc = sample_doc();
        doc.pages[0].nodes.push(SceneNode {
            id: "path-1".to_string(),
            kind: SceneNodeKind::Shape,
            name: "Path".to_string(),
            parent_id: Some("root".to_string()),
            children: None,
            frame: EditorRect {
                x: 12.0,
                y: 12.0,
                w: 80.0,
                h: 60.0,
                rotation: 0.0,
            },
            constraints: None,
            layout: None,
            layout_sizing: None,
            text: None,
            shape: Some(ShapeNodeData {
                primitive: ShapePrimitive::Path,
                fill: "#93c5fd".to_string(),
                stroke_color: "#1d4ed8".to_string(),
                stroke_width: 2.0,
                corner_radius: 0.0,
                opacity: 1.0,
                path: Some(ShapePathData {
                    points: vec![ShapePathPoint {
                        x: 0.0,
                        y: 0.0,
                        handle_in: None,
                        handle_out: None,
                    }],
                    closed: false,
                }),
            }),
            component: None,
            instance: None,
            instance_source_node_id: None,
        });

        let report = validate_scene_doc(&doc);

        assert!(report
            .issues
            .iter()
            .any(|issue| issue.code == "scene_shape.path.points.invalid"));
    }
}

