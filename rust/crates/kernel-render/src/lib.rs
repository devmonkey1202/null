use core_error::CoreError;
use kernel_doc::{
    EditorRect, SceneDoc, SceneNode, SceneNodeKind, ScenePage, ShapePathData, ShapePrimitive,
    TextNodeData, TextStylePatch,
};
use kernel_scene::{build_absolute_frame_map, text_layout_for_node_with_handle};
use kernel_text::{TextLayout, TextLayoutHandle, TextMeasurementMode};
use kernel_vector::{
    tessellate_path, TessellatedPath, VectorPath, VectorPathPoint, VectorPoint,
    VectorTessellationOptions,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

pub const RENDER_LIST_VERSION: u32 = 2;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RenderViewport {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    #[serde(default = "default_scale")]
    pub scale: f32,
    #[serde(default)]
    pub overscan: f32,
}

impl RenderViewport {
    pub fn new(x: f32, y: f32, width: f32, height: f32, scale: f32) -> Self {
        Self {
            x,
            y,
            width,
            height,
            scale,
            overscan: 0.0,
        }
    }

    pub fn with_overscan(mut self, overscan: f32) -> Self {
        self.overscan = overscan;
        self
    }

    fn validate(&self) -> Result<(), CoreError> {
        let finite = [
            self.x,
            self.y,
            self.width,
            self.height,
            self.scale,
            self.overscan,
        ]
        .into_iter()
        .all(f32::is_finite);
        if !finite {
            return Err(CoreError::new(
                "render.viewport.non_finite",
                "Render viewport values must be finite.",
            ));
        }
        if self.width <= 0.0 || self.height <= 0.0 || self.scale <= 0.0 {
            return Err(CoreError::new(
                "render.viewport.invalid_extent",
                "Render viewport width, height, and scale must be positive.",
            ));
        }
        if self.overscan < 0.0 {
            return Err(CoreError::new(
                "render.viewport.invalid_overscan",
                "Render viewport overscan cannot be negative.",
            ));
        }
        Ok(())
    }

    fn world_bounds(&self) -> RenderBounds {
        RenderBounds {
            x: self.x - self.overscan,
            y: self.y - self.overscan,
            width: self.width + self.overscan * 2.0,
            height: self.height + self.overscan * 2.0,
        }
    }
}

fn default_scale() -> f32 {
    1.0
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct RenderBounds {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RenderTransform {
    pub m11: f32,
    pub m12: f32,
    pub m21: f32,
    pub m22: f32,
    pub dx: f32,
    pub dy: f32,
}

impl Default for RenderTransform {
    fn default() -> Self {
        Self {
            m11: 1.0,
            m12: 0.0,
            m21: 0.0,
            m22: 1.0,
            dx: 0.0,
            dy: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RenderPaint {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke: Option<String>,
    pub stroke_width: f32,
    pub opacity: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RenderPathPoint {
    pub x: f32,
    pub y: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handle_in: Option<RenderPathHandle>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handle_out: Option<RenderPathHandle>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RenderPathHandle {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RenderGlyph {
    pub glyph_id: u32,
    pub cluster_start: usize,
    pub cluster_end: usize,
    pub x: f32,
    pub y: f32,
    pub advance_x: f32,
    pub offset_x: f32,
    pub offset_y: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RenderTextStyle {
    pub font_family: String,
    pub font_size: f32,
    pub font_weight: u16,
    pub italic: bool,
    pub color: String,
    pub underline: bool,
    pub line_through: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RenderPrimitive {
    Rect {
        width: f32,
        height: f32,
        corner_radius: f32,
        paint: RenderPaint,
    },
    Ellipse {
        width: f32,
        height: f32,
        paint: RenderPaint,
    },
    Line {
        x1: f32,
        y1: f32,
        x2: f32,
        y2: f32,
        paint: RenderPaint,
    },
    Path {
        points: Vec<RenderPathPoint>,
        closed: bool,
        paint: RenderPaint,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        geometry: Option<TessellatedPath>,
    },
    GlyphRun {
        style: RenderTextStyle,
        glyphs: Vec<RenderGlyph>,
        measurement_mode: String,
    },
    Placeholder {
        resource_kind: String,
        width: f32,
        height: f32,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RenderItem {
    pub command_id: String,
    pub node_id: String,
    pub z_index: usize,
    pub bounds: RenderBounds,
    pub transform: RenderTransform,
    pub fingerprint: String,
    pub primitive: RenderPrimitive,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RenderIssueSeverity {
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RenderIssue {
    pub node_id: String,
    pub code: String,
    pub message: String,
    pub severity: RenderIssueSeverity,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct RenderListStats {
    pub visited_nodes: usize,
    pub drawable_nodes: usize,
    pub visible_nodes: usize,
    pub culled_nodes: usize,
    pub command_count: usize,
    pub glyph_count: usize,
    pub text_run_count: usize,
    pub path_count: usize,
    pub vector_vertex_count: usize,
    pub vector_index_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RenderList {
    pub version: u32,
    pub page_id: String,
    pub revision: String,
    pub viewport: RenderViewport,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_bounds: Option<RenderBounds>,
    pub items: Vec<RenderItem>,
    pub issues: Vec<RenderIssue>,
    pub stats: RenderListStats,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RenderDiff {
    pub from_revision: String,
    pub to_revision: String,
    pub full_rebuild: bool,
    pub added: Vec<RenderItem>,
    pub updated: Vec<RenderItem>,
    pub removed: Vec<String>,
    pub unchanged: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RenderFrame {
    pub list: RenderList,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diff: Option<RenderDiff>,
}

#[derive(Debug, Clone, PartialEq)]
struct ResolvedTextStyle {
    font_family: String,
    font_size: f32,
    font_weight: u16,
    italic: bool,
    color: String,
    underline: bool,
    line_through: bool,
}

impl ResolvedTextStyle {
    fn from_text(text: &TextNodeData) -> Self {
        Self {
            font_family: text.font_family.clone(),
            font_size: text.font_size,
            font_weight: text.font_weight,
            italic: text.italic,
            color: text.color.clone(),
            underline: text.underline,
            line_through: text.line_through,
        }
    }

    fn apply_patch(&mut self, patch: &TextStylePatch) {
        if let Some(value) = &patch.font_family {
            self.font_family = value.clone();
        }
        if let Some(value) = patch.font_size {
            self.font_size = value;
        }
        if let Some(value) = patch.font_weight {
            self.font_weight = value;
        }
        if let Some(value) = patch.italic {
            self.italic = value;
        }
        if let Some(value) = &patch.color {
            self.color = value.clone();
        }
        if let Some(value) = patch.underline {
            self.underline = value;
        }
        if let Some(value) = patch.line_through {
            self.line_through = value;
        }
    }

    fn render_style(&self, resolved_family: &str) -> RenderTextStyle {
        RenderTextStyle {
            font_family: resolved_family.to_string(),
            font_size: self.font_size,
            font_weight: self.font_weight,
            italic: self.italic,
            color: self.color.clone(),
            underline: self.underline,
            line_through: self.line_through,
        }
    }
}

pub fn build_render_list(
    doc: &SceneDoc,
    page_id: &str,
    viewport: RenderViewport,
    text_handle: &mut TextLayoutHandle,
) -> Result<RenderList, CoreError> {
    viewport.validate()?;
    let page = doc
        .pages
        .iter()
        .find(|page| page.id == page_id)
        .ok_or_else(|| {
            CoreError::new(
                "render.page.not_found",
                format!("Page '{}' was not found.", page_id),
            )
        })?;

    let frame_map = build_absolute_frame_map(&page.nodes);
    let ordered_nodes = ordered_nodes(page);
    let viewport_bounds = viewport.world_bounds();
    let mut items = Vec::new();
    let mut issues = Vec::new();
    let mut stats = RenderListStats {
        visited_nodes: ordered_nodes.len(),
        ..RenderListStats::default()
    };
    let mut content_bounds = None;
    let mut z_index = 0usize;

    for node in ordered_nodes {
        let Some(frame) = frame_map.get(&node.id) else {
            issues.push(RenderIssue {
                node_id: node.id.clone(),
                code: "render.frame.missing".to_string(),
                message: "The node has no resolved absolute frame.".to_string(),
                severity: RenderIssueSeverity::Error,
            });
            continue;
        };

        if !is_drawable(node) {
            continue;
        }
        stats.drawable_nodes += 1;

        let stroke_padding = node
            .shape
            .as_ref()
            .map(|shape| shape.stroke_width.max(0.0) / 2.0)
            .unwrap_or(0.0);
        let node_bounds = inflate_bounds(axis_aligned_bounds(frame), stroke_padding);
        content_bounds = union_optional_bounds(content_bounds, node_bounds);
        if !bounds_intersect(node_bounds, viewport_bounds) {
            stats.culled_nodes += 1;
            continue;
        }
        stats.visible_nodes += 1;

        let transform = transform_for_frame(frame);
        match node.kind {
            SceneNodeKind::Shape => build_shape_item(
                node,
                frame,
                node_bounds,
                transform,
                (0.25 / viewport.scale).clamp(0.01, 1.0),
                &mut z_index,
                &mut items,
                &mut issues,
                &mut stats,
            ),
            SceneNodeKind::Text => build_text_items(
                doc,
                node,
                node_bounds,
                transform,
                text_handle,
                &mut z_index,
                &mut items,
                &mut issues,
                &mut stats,
            ),
            SceneNodeKind::Image | SceneNodeKind::Video => {
                let resource_kind = match node.kind {
                    SceneNodeKind::Image => "image",
                    SceneNodeKind::Video => "video",
                    _ => unreachable!(),
                };
                push_item(
                    &mut items,
                    &mut z_index,
                    format!("{}:placeholder", node.id),
                    node.id.clone(),
                    node_bounds,
                    transform,
                    RenderPrimitive::Placeholder {
                        resource_kind: resource_kind.to_string(),
                        width: frame.w.max(0.0),
                        height: frame.h.max(0.0),
                    },
                );
            }
            SceneNodeKind::Frame
            | SceneNodeKind::Component
            | SceneNodeKind::Instance
            | SceneNodeKind::Group => {}
        }
    }

    stats.command_count = items.len();
    let revision = render_list_revision(&items);
    Ok(RenderList {
        version: RENDER_LIST_VERSION,
        page_id: page.id.clone(),
        revision,
        viewport,
        content_bounds,
        items,
        issues,
        stats,
    })
}

pub fn diff_render_lists(previous: &RenderList, next: &RenderList) -> RenderDiff {
    let full_rebuild = previous.version != next.version || previous.page_id != next.page_id;
    if full_rebuild {
        return RenderDiff {
            from_revision: previous.revision.clone(),
            to_revision: next.revision.clone(),
            full_rebuild: true,
            added: next.items.clone(),
            updated: Vec::new(),
            removed: previous
                .items
                .iter()
                .map(|item| item.command_id.clone())
                .collect(),
            unchanged: Vec::new(),
        };
    }

    let previous_by_id = previous
        .items
        .iter()
        .map(|item| (item.command_id.as_str(), item))
        .collect::<HashMap<_, _>>();
    let next_ids = next
        .items
        .iter()
        .map(|item| item.command_id.as_str())
        .collect::<HashSet<_>>();
    let mut added = Vec::new();
    let mut updated = Vec::new();
    let mut unchanged = Vec::new();

    for item in &next.items {
        match previous_by_id.get(item.command_id.as_str()) {
            None => added.push(item.clone()),
            Some(previous_item) if previous_item.fingerprint != item.fingerprint => {
                updated.push(item.clone())
            }
            Some(_) => unchanged.push(item.command_id.clone()),
        }
    }

    let removed = previous
        .items
        .iter()
        .filter(|item| !next_ids.contains(item.command_id.as_str()))
        .map(|item| item.command_id.clone())
        .collect();

    RenderDiff {
        from_revision: previous.revision.clone(),
        to_revision: next.revision.clone(),
        full_rebuild: false,
        added,
        updated,
        removed,
        unchanged,
    }
}

fn is_drawable(node: &SceneNode) -> bool {
    matches!(
        node.kind,
        SceneNodeKind::Shape | SceneNodeKind::Text | SceneNodeKind::Image | SceneNodeKind::Video
    )
}

fn ordered_nodes(page: &ScenePage) -> Vec<&SceneNode> {
    let node_map = page
        .nodes
        .iter()
        .map(|node| (node.id.as_str(), node))
        .collect::<HashMap<_, _>>();
    let mut children_by_parent: HashMap<&str, Vec<&SceneNode>> = HashMap::new();
    for node in &page.nodes {
        if let Some(parent_id) = node.parent_id.as_deref() {
            children_by_parent.entry(parent_id).or_default().push(node);
        }
    }

    fn visit<'a>(
        node: &'a SceneNode,
        node_map: &HashMap<&str, &'a SceneNode>,
        children_by_parent: &HashMap<&str, Vec<&'a SceneNode>>,
        visited: &mut HashSet<String>,
        ordered: &mut Vec<&'a SceneNode>,
    ) {
        if !visited.insert(node.id.clone()) {
            return;
        }
        ordered.push(node);

        let mut explicit = HashSet::new();
        if let Some(child_ids) = &node.children {
            for child_id in child_ids {
                if let Some(child) = node_map.get(child_id.as_str()) {
                    explicit.insert(child.id.as_str());
                    visit(child, node_map, children_by_parent, visited, ordered);
                }
            }
        }
        if let Some(children) = children_by_parent.get(node.id.as_str()) {
            for child in children {
                if !explicit.contains(child.id.as_str()) {
                    visit(child, node_map, children_by_parent, visited, ordered);
                }
            }
        }
    }

    let mut visited = HashSet::new();
    let mut ordered = Vec::with_capacity(page.nodes.len());
    if let Some(root) = node_map.get(page.root_id.as_str()) {
        visit(
            root,
            &node_map,
            &children_by_parent,
            &mut visited,
            &mut ordered,
        );
    }
    for node in &page.nodes {
        if node.parent_id.is_none() {
            visit(
                node,
                &node_map,
                &children_by_parent,
                &mut visited,
                &mut ordered,
            );
        }
    }
    for node in &page.nodes {
        visit(
            node,
            &node_map,
            &children_by_parent,
            &mut visited,
            &mut ordered,
        );
    }
    ordered
}

#[allow(clippy::too_many_arguments)]
fn build_shape_item(
    node: &SceneNode,
    frame: &EditorRect,
    bounds: RenderBounds,
    transform: RenderTransform,
    vector_tolerance: f32,
    z_index: &mut usize,
    items: &mut Vec<RenderItem>,
    issues: &mut Vec<RenderIssue>,
    stats: &mut RenderListStats,
) {
    let Some(shape) = &node.shape else {
        issues.push(RenderIssue {
            node_id: node.id.clone(),
            code: "render.shape.data_missing".to_string(),
            message: "Shape node has no shape data.".to_string(),
            severity: RenderIssueSeverity::Error,
        });
        return;
    };
    let paint = RenderPaint {
        fill: (!matches!(shape.primitive, ShapePrimitive::Line)).then(|| shape.fill.clone()),
        stroke: (shape.stroke_width > 0.0).then(|| shape.stroke_color.clone()),
        stroke_width: shape.stroke_width.max(0.0),
        opacity: shape.opacity.clamp(0.0, 1.0),
    };

    let primitive = match shape.primitive {
        ShapePrimitive::Rect => RenderPrimitive::Rect {
            width: frame.w.max(0.0),
            height: frame.h.max(0.0),
            corner_radius: shape.corner_radius.max(0.0),
            paint,
        },
        ShapePrimitive::Ellipse => RenderPrimitive::Ellipse {
            width: frame.w.max(0.0),
            height: frame.h.max(0.0),
            paint,
        },
        ShapePrimitive::Line => RenderPrimitive::Line {
            x1: 0.0,
            y1: frame.h.max(0.0) / 2.0,
            x2: frame.w.max(0.0),
            y2: frame.h.max(0.0) / 2.0,
            paint,
        },
        ShapePrimitive::Path => {
            let Some(path) = &shape.path else {
                issues.push(RenderIssue {
                    node_id: node.id.clone(),
                    code: "render.path.data_missing".to_string(),
                    message: "Path shape has no path data.".to_string(),
                    severity: RenderIssueSeverity::Error,
                });
                return;
            };
            stats.path_count += 1;
            let geometry = if path.closed || shape.stroke_width > 0.0 {
                match tessellate_path(
                    &vector_path(path),
                    VectorTessellationOptions {
                        fill: path.closed,
                        stroke_width: shape.stroke_width.max(0.0),
                        tolerance: vector_tolerance,
                        ..VectorTessellationOptions::default()
                    },
                ) {
                    Ok(geometry) => {
                        stats.vector_vertex_count +=
                            geometry.stats.fill_vertex_count + geometry.stats.stroke_vertex_count;
                        stats.vector_index_count +=
                            geometry.stats.fill_index_count + geometry.stats.stroke_index_count;
                        Some(geometry)
                    }
                    Err(error) => {
                        issues.push(RenderIssue {
                            node_id: node.id.clone(),
                            code: error.code.to_string(),
                            message: error.message,
                            severity: RenderIssueSeverity::Error,
                        });
                        None
                    }
                }
            } else {
                None
            };
            RenderPrimitive::Path {
                points: render_path_points(path),
                closed: path.closed,
                paint: RenderPaint {
                    fill: path.closed.then(|| shape.fill.clone()),
                    ..paint
                },
                geometry,
            }
        }
    };

    push_item(
        items,
        z_index,
        format!("{}:shape", node.id),
        node.id.clone(),
        bounds,
        transform,
        primitive,
    );
}

#[allow(clippy::too_many_arguments)]
fn build_text_items(
    doc: &SceneDoc,
    node: &SceneNode,
    bounds: RenderBounds,
    transform: RenderTransform,
    text_handle: &mut TextLayoutHandle,
    z_index: &mut usize,
    items: &mut Vec<RenderItem>,
    issues: &mut Vec<RenderIssue>,
    stats: &mut RenderListStats,
) {
    let Some(text) = &node.text else {
        issues.push(RenderIssue {
            node_id: node.id.clone(),
            code: "render.text.data_missing".to_string(),
            message: "Text node has no text data.".to_string(),
            severity: RenderIssueSeverity::Error,
        });
        return;
    };
    let layout = match text_layout_for_node_with_handle(doc, &node.id, text_handle) {
        Ok(layout) => layout,
        Err(error) => {
            issues.push(RenderIssue {
                node_id: node.id.clone(),
                code: error.code.to_string(),
                message: error.message,
                severity: RenderIssueSeverity::Error,
            });
            return;
        }
    };

    if !matches!(layout.measurement_mode, TextMeasurementMode::Shaped) {
        issues.push(RenderIssue {
            node_id: node.id.clone(),
            code: "render.text.incomplete_shaping".to_string(),
            message: format!(
                "Text layout contains {} fallback grapheme(s); GPU glyph parity is not complete.",
                layout.fallback_grapheme_count
            ),
            severity: RenderIssueSeverity::Warning,
        });
    }

    let groups = group_text_glyphs(text, &layout);
    if groups.is_empty() && !text.content.is_empty() {
        issues.push(RenderIssue {
            node_id: node.id.clone(),
            code: "render.text.glyphs_missing".to_string(),
            message: "Text has no shaped glyphs available for the render list.".to_string(),
            severity: RenderIssueSeverity::Warning,
        });
    }
    let measurement_mode = measurement_mode_name(layout.measurement_mode).to_string();
    for (run_index, (style, glyphs)) in groups.into_iter().enumerate() {
        stats.glyph_count += glyphs.len();
        stats.text_run_count += 1;
        push_item(
            items,
            z_index,
            format!("{}:glyph_run:{}", node.id, run_index),
            node.id.clone(),
            bounds,
            transform,
            RenderPrimitive::GlyphRun {
                style,
                glyphs,
                measurement_mode: measurement_mode.clone(),
            },
        );
    }
}

fn group_text_glyphs(
    text: &TextNodeData,
    layout: &TextLayout,
) -> Vec<(RenderTextStyle, Vec<RenderGlyph>)> {
    let mut groups: Vec<(RenderTextStyle, Vec<RenderGlyph>)> = Vec::new();
    for glyph in &layout.glyphs {
        let resolved = resolve_text_style(text, glyph.cluster_start);
        let style = resolved.render_style(&glyph.font_family);
        let render_glyph = RenderGlyph {
            glyph_id: glyph.glyph_id,
            cluster_start: glyph.cluster_start,
            cluster_end: glyph.cluster_end,
            x: glyph.x,
            y: glyph.y,
            advance_x: glyph.advance_x,
            offset_x: glyph.offset_x,
            offset_y: glyph.offset_y,
        };
        if let Some((last_style, last_glyphs)) = groups.last_mut() {
            if *last_style == style {
                last_glyphs.push(render_glyph);
                continue;
            }
        }
        groups.push((style, vec![render_glyph]));
    }
    groups
}

fn resolve_text_style(text: &TextNodeData, offset: usize) -> ResolvedTextStyle {
    let mut style = ResolvedTextStyle::from_text(text);
    for range in &text.ranges {
        if range.start <= offset && offset < range.end {
            if let Some(patch) = &range.style {
                style.apply_patch(patch);
            }
        }
    }
    style
}

fn measurement_mode_name(mode: TextMeasurementMode) -> &'static str {
    match mode {
        TextMeasurementMode::Shaped => "shaped",
        TextMeasurementMode::Mixed => "mixed",
        TextMeasurementMode::DeterministicFallback => "deterministic_fallback",
    }
}

fn render_path_points(path: &ShapePathData) -> Vec<RenderPathPoint> {
    path.points
        .iter()
        .map(|point| RenderPathPoint {
            x: point.x,
            y: point.y,
            handle_in: point.handle_in.as_ref().map(|handle| RenderPathHandle {
                x: handle.x,
                y: handle.y,
            }),
            handle_out: point.handle_out.as_ref().map(|handle| RenderPathHandle {
                x: handle.x,
                y: handle.y,
            }),
        })
        .collect()
}

fn vector_path(path: &ShapePathData) -> VectorPath {
    VectorPath {
        points: path
            .points
            .iter()
            .map(|point| VectorPathPoint {
                x: point.x,
                y: point.y,
                handle_in: point.handle_in.as_ref().map(|handle| VectorPoint {
                    x: handle.x,
                    y: handle.y,
                }),
                handle_out: point.handle_out.as_ref().map(|handle| VectorPoint {
                    x: handle.x,
                    y: handle.y,
                }),
            })
            .collect(),
        closed: path.closed,
    }
}

fn push_item(
    items: &mut Vec<RenderItem>,
    z_index: &mut usize,
    command_id: String,
    node_id: String,
    bounds: RenderBounds,
    transform: RenderTransform,
    primitive: RenderPrimitive,
) {
    let mut item = RenderItem {
        command_id,
        node_id,
        z_index: *z_index,
        bounds,
        transform,
        fingerprint: String::new(),
        primitive,
    };
    item.fingerprint = render_item_fingerprint(&item);
    *z_index += 1;
    items.push(item);
}

fn render_item_fingerprint(item: &RenderItem) -> String {
    let mut stable = item.clone();
    stable.fingerprint.clear();
    let bytes = serde_json::to_vec(&stable).unwrap_or_default();
    format!("{:016x}", fnv1a64(&bytes))
}

fn render_list_revision(items: &[RenderItem]) -> String {
    let mut bytes = Vec::new();
    for item in items {
        bytes.extend_from_slice(item.command_id.as_bytes());
        bytes.push(0);
        bytes.extend_from_slice(item.fingerprint.as_bytes());
        bytes.push(0xff);
    }
    format!("{:016x}", fnv1a64(&bytes))
}

fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn transform_for_frame(frame: &EditorRect) -> RenderTransform {
    let radians = frame.rotation.to_radians();
    let cos = radians.cos();
    let sin = radians.sin();
    let half_width = frame.w / 2.0;
    let half_height = frame.h / 2.0;
    let center_x = frame.x + half_width;
    let center_y = frame.y + half_height;
    RenderTransform {
        m11: cos,
        m12: sin,
        m21: -sin,
        m22: cos,
        dx: center_x - cos * half_width + sin * half_height,
        dy: center_y - sin * half_width - cos * half_height,
    }
}

fn axis_aligned_bounds(frame: &EditorRect) -> RenderBounds {
    let transform = transform_for_frame(frame);
    let corners = [
        transform_point(transform, 0.0, 0.0),
        transform_point(transform, frame.w, 0.0),
        transform_point(transform, frame.w, frame.h),
        transform_point(transform, 0.0, frame.h),
    ];
    let min_x = corners
        .iter()
        .map(|point| point.0)
        .fold(f32::INFINITY, f32::min);
    let min_y = corners
        .iter()
        .map(|point| point.1)
        .fold(f32::INFINITY, f32::min);
    let max_x = corners
        .iter()
        .map(|point| point.0)
        .fold(f32::NEG_INFINITY, f32::max);
    let max_y = corners
        .iter()
        .map(|point| point.1)
        .fold(f32::NEG_INFINITY, f32::max);
    RenderBounds {
        x: min_x,
        y: min_y,
        width: (max_x - min_x).max(0.0),
        height: (max_y - min_y).max(0.0),
    }
}

fn transform_point(transform: RenderTransform, x: f32, y: f32) -> (f32, f32) {
    (
        transform.m11 * x + transform.m21 * y + transform.dx,
        transform.m12 * x + transform.m22 * y + transform.dy,
    )
}

fn inflate_bounds(bounds: RenderBounds, amount: f32) -> RenderBounds {
    RenderBounds {
        x: bounds.x - amount,
        y: bounds.y - amount,
        width: bounds.width + amount * 2.0,
        height: bounds.height + amount * 2.0,
    }
}

fn bounds_intersect(left: RenderBounds, right: RenderBounds) -> bool {
    left.x <= right.x + right.width
        && left.x + left.width >= right.x
        && left.y <= right.y + right.height
        && left.y + left.height >= right.y
}

fn union_optional_bounds(
    current: Option<RenderBounds>,
    next: RenderBounds,
) -> Option<RenderBounds> {
    Some(match current {
        None => next,
        Some(current) => {
            let x = current.x.min(next.x);
            let y = current.y.min(next.y);
            let right = (current.x + current.width).max(next.x + next.width);
            let bottom = (current.y + current.height).max(next.y + next.height);
            RenderBounds {
                x,
                y,
                width: right - x,
                height: bottom - y,
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use kernel_doc::{SceneDocMeta, ShapeNodeData, TextAlign, TextCase, TextRange, TextSizingMode};

    const INTER_FONT: &[u8] = include_bytes!("../../../../public/v2/fonts/InterVariable.ttf");

    fn frame(x: f32, y: f32, w: f32, h: f32, rotation: f32) -> EditorRect {
        EditorRect {
            x,
            y,
            w,
            h,
            rotation,
        }
    }

    fn sample_doc() -> SceneDoc {
        SceneDoc {
            schema_version: 2,
            document_id: "render-doc".to_string(),
            title: "Render".to_string(),
            pages: vec![ScenePage {
                id: "page-1".to_string(),
                name: "Page".to_string(),
                root_id: "root".to_string(),
                guides: vec![],
                nodes: vec![
                    SceneNode {
                        id: "root".to_string(),
                        kind: SceneNodeKind::Frame,
                        name: "Root".to_string(),
                        parent_id: None,
                        children: Some(vec![
                            "rect".to_string(),
                            "title".to_string(),
                            "path".to_string(),
                        ]),
                        frame: frame(100.0, 50.0, 600.0, 400.0, 0.0),
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
                        id: "rect".to_string(),
                        kind: SceneNodeKind::Shape,
                        name: "Rect".to_string(),
                        parent_id: Some("root".to_string()),
                        children: None,
                        frame: frame(20.0, 30.0, 120.0, 80.0, 0.0),
                        constraints: None,
                        layout: None,
                        layout_sizing: None,
                        text: None,
                        shape: Some(ShapeNodeData {
                            primitive: ShapePrimitive::Rect,
                            fill: "#2859ff".to_string(),
                            stroke_color: "#0f172a".to_string(),
                            stroke_width: 2.0,
                            corner_radius: 12.0,
                            opacity: 0.9,
                            path: None,
                        }),
                        component: None,
                        instance: None,
                        instance_source_node_id: None,
                    },
                    SceneNode {
                        id: "title".to_string(),
                        kind: SceneNodeKind::Text,
                        name: "Title".to_string(),
                        parent_id: Some("root".to_string()),
                        children: None,
                        frame: frame(24.0, 140.0, 240.0, 40.0, 0.0),
                        constraints: None,
                        layout: None,
                        layout_sizing: None,
                        text: Some(TextNodeData {
                            content: "Render list".to_string(),
                            font_family: "Inter".to_string(),
                            font_size: 24.0,
                            font_weight: 700,
                            line_height: 32.0,
                            letter_spacing: 0.0,
                            paragraph_spacing: 0.0,
                            align: TextAlign::Left,
                            color: "#0f172a".to_string(),
                            text_case: TextCase::None,
                            italic: false,
                            underline: false,
                            line_through: false,
                            sizing: TextSizingMode::Fixed,
                            ranges: vec![TextRange {
                                start: 0,
                                end: 6,
                                style: Some(TextStylePatch {
                                    color: Some("#2859ff".to_string()),
                                    ..TextStylePatch::default()
                                }),
                            }],
                        }),
                        shape: None,
                        component: None,
                        instance: None,
                        instance_source_node_id: None,
                    },
                    SceneNode {
                        id: "path".to_string(),
                        kind: SceneNodeKind::Shape,
                        name: "Path".to_string(),
                        parent_id: Some("root".to_string()),
                        children: None,
                        frame: frame(300.0, 30.0, 100.0, 100.0, 45.0),
                        constraints: None,
                        layout: None,
                        layout_sizing: None,
                        text: None,
                        shape: Some(ShapeNodeData {
                            primitive: ShapePrimitive::Path,
                            fill: "#dbeafe".to_string(),
                            stroke_color: "#2859ff".to_string(),
                            stroke_width: 4.0,
                            corner_radius: 0.0,
                            opacity: 1.0,
                            path: Some(ShapePathData {
                                points: vec![
                                    kernel_doc::ShapePathPoint {
                                        x: 0.0,
                                        y: 96.0,
                                        handle_in: None,
                                        handle_out: None,
                                    },
                                    kernel_doc::ShapePathPoint {
                                        x: 48.0,
                                        y: 12.0,
                                        handle_in: None,
                                        handle_out: Some(kernel_doc::ShapePathHandle {
                                            x: 72.0,
                                            y: 12.0,
                                        }),
                                    },
                                    kernel_doc::ShapePathPoint {
                                        x: 100.0,
                                        y: 88.0,
                                        handle_in: None,
                                        handle_out: None,
                                    },
                                ],
                                closed: true,
                            }),
                        }),
                        component: None,
                        instance: None,
                        instance_source_node_id: None,
                    },
                ],
            }],
            meta: SceneDocMeta {
                created_at: "2026-11-14T00:00:00.000Z".to_string(),
                updated_at: "2026-11-14T00:00:00.000Z".to_string(),
            },
        }
    }

    fn text_handle() -> TextLayoutHandle {
        let mut handle = TextLayoutHandle::default();
        handle
            .register_font("Inter", INTER_FONT.to_vec(), false)
            .expect("Inter font");
        handle
    }

    fn wide_viewport() -> RenderViewport {
        RenderViewport::new(0.0, 0.0, 2000.0, 1200.0, 1.0)
    }

    #[test]
    fn render_list_uses_absolute_frames_and_stable_scene_order() {
        let mut text = text_handle();
        let list = build_render_list(&sample_doc(), "page-1", wide_viewport(), &mut text)
            .expect("render list");

        assert_eq!(list.stats.visited_nodes, 4);
        assert_eq!(list.stats.drawable_nodes, 3);
        assert_eq!(list.items[0].command_id, "rect:shape");
        assert_eq!(list.items[0].bounds.x, 119.0);
        assert_eq!(list.items[0].bounds.y, 79.0);
        assert!(list
            .items
            .iter()
            .any(|item| item.command_id == "path:shape"));
        assert!(!list.revision.is_empty());
        assert_eq!(list.stats.command_count, list.items.len());
    }

    #[test]
    fn text_layout_becomes_styled_glyph_runs() {
        let mut text = text_handle();
        let list = build_render_list(&sample_doc(), "page-1", wide_viewport(), &mut text)
            .expect("render list");
        let text_items = list
            .items
            .iter()
            .filter(|item| item.node_id == "title")
            .collect::<Vec<_>>();

        assert_eq!(text_items.len(), 2);
        assert_eq!(list.stats.text_run_count, 2);
        assert!(list.stats.glyph_count > 0);
        let RenderPrimitive::GlyphRun { style, glyphs, .. } = &text_items[0].primitive else {
            panic!("expected glyph run");
        };
        assert_eq!(style.color, "#2859ff");
        assert_eq!(style.font_family, "Inter");
        assert!(!glyphs.is_empty());
        assert!(list.issues.is_empty());
    }

    #[test]
    fn path_commands_include_zoom_adaptive_tessellated_geometry() {
        let mut text = text_handle();
        let standard = build_render_list(&sample_doc(), "page-1", wide_viewport(), &mut text)
            .expect("standard render list");
        let path_item = standard
            .items
            .iter()
            .find(|item| item.node_id == "path")
            .expect("path item");
        let RenderPrimitive::Path {
            geometry: Some(geometry),
            ..
        } = &path_item.primitive
        else {
            panic!("expected tessellated path geometry");
        };

        assert_eq!(geometry.tolerance, 0.25);
        assert!(geometry.fill.is_some());
        assert!(geometry.stroke.is_some());
        assert_eq!(standard.stats.path_count, 1);
        assert_eq!(
            standard.stats.vector_vertex_count,
            geometry.stats.fill_vertex_count + geometry.stats.stroke_vertex_count
        );
        assert_eq!(
            standard.stats.vector_index_count,
            geometry.stats.fill_index_count + geometry.stats.stroke_index_count
        );

        let detailed = build_render_list(
            &sample_doc(),
            "page-1",
            RenderViewport::new(0.0, 0.0, 2000.0, 1200.0, 4.0),
            &mut text,
        )
        .expect("detailed render list");
        let detailed_path = detailed
            .items
            .iter()
            .find(|item| item.node_id == "path")
            .expect("detailed path");
        let RenderPrimitive::Path {
            geometry: Some(detailed_geometry),
            ..
        } = &detailed_path.primitive
        else {
            panic!("expected detailed geometry");
        };
        assert_eq!(detailed_geometry.tolerance, 0.0625);
        assert_ne!(geometry.fingerprint, detailed_geometry.fingerprint);
    }

    #[test]
    fn viewport_culls_offscreen_drawables_without_changing_content_bounds() {
        let mut text = text_handle();
        let list = build_render_list(
            &sample_doc(),
            "page-1",
            RenderViewport::new(110.0, 70.0, 160.0, 50.0, 1.0),
            &mut text,
        )
        .expect("render list");

        assert_eq!(list.stats.drawable_nodes, 3);
        assert_eq!(list.stats.culled_nodes, 2);
        assert!(list.content_bounds.expect("bounds").width > 300.0);
        assert!(list.items.iter().all(|item| item.node_id == "rect"));
    }

    #[test]
    fn overscan_keeps_nearby_nodes_in_the_render_list() {
        let mut text = text_handle();
        let viewport = RenderViewport::new(0.0, 0.0, 100.0, 100.0, 1.0).with_overscan(25.0);
        let list =
            build_render_list(&sample_doc(), "page-1", viewport, &mut text).expect("render list");
        assert!(list.items.iter().any(|item| item.node_id == "rect"));
    }

    #[test]
    fn rotated_bounds_and_transform_are_deterministic() {
        let frame = frame(10.0, 20.0, 100.0, 40.0, 90.0);
        let bounds = axis_aligned_bounds(&frame);
        let transform = transform_for_frame(&frame);

        assert!((bounds.x - 40.0).abs() < 0.001);
        assert!((bounds.y + 10.0).abs() < 0.001);
        assert!((bounds.width - 40.0).abs() < 0.001);
        assert!((bounds.height - 100.0).abs() < 0.001);
        let top_left = transform_point(transform, 0.0, 0.0);
        assert!((top_left.0 - 80.0).abs() < 0.001);
        assert!((top_left.1 + 10.0).abs() < 0.001);
    }

    #[test]
    fn malformed_shape_is_reported_without_aborting_the_page() {
        let mut doc = sample_doc();
        doc.pages[0].nodes[1].shape = None;
        let mut text = text_handle();
        let list =
            build_render_list(&doc, "page-1", wide_viewport(), &mut text).expect("render list");

        assert!(list
            .issues
            .iter()
            .any(|issue| issue.code == "render.shape.data_missing"));
        assert!(list.items.iter().any(|item| item.node_id == "title"));
    }

    #[test]
    fn invalid_viewport_and_missing_page_are_rejected() {
        let mut text = text_handle();
        let error = build_render_list(
            &sample_doc(),
            "page-1",
            RenderViewport::new(0.0, 0.0, 0.0, 100.0, 1.0),
            &mut text,
        )
        .expect_err("zero width rejected");
        assert_eq!(error.code, "render.viewport.invalid_extent");

        let error = build_render_list(&sample_doc(), "missing", wide_viewport(), &mut text)
            .expect_err("missing page rejected");
        assert_eq!(error.code, "render.page.not_found");
    }

    #[test]
    fn render_diff_reports_updated_removed_and_unchanged_commands() {
        let mut text = text_handle();
        let previous = build_render_list(&sample_doc(), "page-1", wide_viewport(), &mut text)
            .expect("previous");
        let mut changed_doc = sample_doc();
        changed_doc.pages[0].nodes[1]
            .shape
            .as_mut()
            .expect("shape")
            .fill = "#ff0000".to_string();
        changed_doc.pages[0].nodes.pop();
        let next =
            build_render_list(&changed_doc, "page-1", wide_viewport(), &mut text).expect("next");

        let diff = diff_render_lists(&previous, &next);
        assert!(!diff.full_rebuild);
        assert!(diff.updated.iter().any(|item| item.node_id == "rect"));
        assert!(diff.removed.iter().any(|id| id == "path:shape"));
        assert!(diff
            .unchanged
            .iter()
            .all(|id| id.starts_with("title:glyph_run:")));
    }

    #[test]
    fn render_diff_for_another_page_requests_a_full_rebuild() {
        let mut text = text_handle();
        let previous = build_render_list(&sample_doc(), "page-1", wide_viewport(), &mut text)
            .expect("previous");
        let mut next = previous.clone();
        next.page_id = "page-2".to_string();
        next.revision = "different".to_string();

        let diff = diff_render_lists(&previous, &next);
        assert!(diff.full_rebuild);
        assert_eq!(diff.added.len(), next.items.len());
        assert_eq!(diff.removed.len(), previous.items.len());
    }

    #[test]
    fn fingerprints_are_stable_for_identical_render_lists() {
        let mut first_handle = text_handle();
        let mut second_handle = text_handle();
        let first = build_render_list(&sample_doc(), "page-1", wide_viewport(), &mut first_handle)
            .expect("first");
        let second =
            build_render_list(&sample_doc(), "page-1", wide_viewport(), &mut second_handle)
                .expect("second");

        assert_eq!(first.revision, second.revision);
        assert_eq!(
            first
                .items
                .iter()
                .map(|item| &item.fingerprint)
                .collect::<Vec<_>>(),
            second
                .items
                .iter()
                .map(|item| &item.fingerprint)
                .collect::<Vec<_>>()
        );
    }
}
