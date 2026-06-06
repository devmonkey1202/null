use core_error::CoreError;
use kernel_doc::{
    validate_scene_doc, AutoLayoutAlign, AutoLayoutDirection, ComponentNodeData, EditorCommand,
    EditorRect, EditorSnapshot, EditorViewport, FramePatch, GuideAxis, HorizontalConstraint,
    InstanceNodeData, SceneDoc, SceneGuide, SceneNode, SceneNodeKind, SelectionSetMode,
    ShapePathData, ShapeStylePatch, TextSizingMode, TextStylePatch, TransformHandleKind,
    ValidationReport, VerticalConstraint,
};
use std::time::{SystemTime, UNIX_EPOCH};
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HitTestMode {
    Topmost,
    All,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HitTestResult {
    pub page_id: String,
    pub node_ids: Vec<String>,
    pub top_node_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TransformHandle {
    pub kind: TransformHandleKind,
    pub x: f32,
    pub y: f32,
    pub cursor: &'static str,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SnapGuide {
    pub axis: GuideAxis,
    pub position: f32,
    pub span_start: f32,
    pub span_end: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MoveSnapPreview {
    pub delta_x: f32,
    pub delta_y: f32,
    pub guides: Vec<SnapGuide>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ResizeSnapPreview {
    pub bounds: Option<EditorRect>,
    pub delta_x: f32,
    pub delta_y: f32,
    pub guides: Vec<SnapGuide>,
}

#[derive(Debug, Clone)]
pub struct EditorState {
    pub version: u64,
    pub doc: SceneDoc,
    pub selection: Vec<String>,
    pub viewport: EditorViewport,
}

#[derive(Debug, Clone)]
pub struct EditorApplyResult {
    pub snapshot: EditorSnapshot,
    pub validation: ValidationReport,
    pub applied_commands: Vec<String>,
    pub dirty_node_ids: Vec<String>,
}

impl EditorState {
    pub fn new(mut doc: SceneDoc) -> Self {
        normalize_document(&mut doc);
        Self {
            version: 1,
            doc,
            selection: Vec::new(),
            viewport: EditorViewport::default(),
        }
    }

    pub fn snapshot(&self) -> EditorSnapshot {
        EditorSnapshot {
            version: self.version,
            doc: self.doc.clone(),
            selection: self.selection.clone(),
            viewport: self.viewport.clone(),
        }
    }

    pub fn validation(&self) -> ValidationReport {
        validate_scene_doc(&self.doc)
    }
}

pub fn dispatch_commands(
    state: &mut EditorState,
    commands: Vec<EditorCommand>,
) -> Result<EditorApplyResult, CoreError> {
    let mut applied_commands = Vec::with_capacity(commands.len());
    let mut dirty_node_ids = Vec::new();

    for command in commands {
        match command {
            EditorCommand::SelectNodes { node_ids } => {
                state.selection = node_ids
                    .into_iter()
                    .filter(|node_id| node_exists(&state.doc, node_id))
                    .collect();
                applied_commands.push("select_nodes".to_string());
            }
            EditorCommand::SelectInRect {
                page_id,
                rect,
                mode,
            } => {
                state.selection =
                    select_in_rect(&state.doc, &state.selection, &page_id, &rect, mode)?;
                applied_commands.push("select_in_rect".to_string());
            }
            EditorCommand::SetViewport { viewport } => {
                state.viewport = viewport;
                applied_commands.push("set_viewport".to_string());
            }
            EditorCommand::RenameNode { node_id, name } => {
                let node = find_node_mut(&mut state.doc, &node_id)?;
                node.name = name;
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("rename_node".to_string());
                dirty_node_ids.push(node_id);
            }
            EditorCommand::SetTextContent { node_id, content } => {
                {
                    let node = find_node_mut(&mut state.doc, &node_id)?;
                    ensure_text_node(node)?;
                    if let Some(text) = &mut node.text {
                        text.content = content;
                    }
                }
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("set_text_content".to_string());
                dirty_node_ids.push(node_id);
            }
            EditorCommand::SetTextStyle { node_id, style } => {
                {
                    let node = find_node_mut(&mut state.doc, &node_id)?;
                    ensure_text_node(node)?;
                    if let Some(text) = &mut node.text {
                        apply_text_style_patch(text, style);
                    }
                }
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("set_text_style".to_string());
                dirty_node_ids.push(node_id);
            }
            EditorCommand::SetTextSizing { node_id, sizing } => {
                {
                    let node = find_node_mut(&mut state.doc, &node_id)?;
                    ensure_text_node(node)?;
                    if let Some(text) = &mut node.text {
                        text.sizing = sizing;
                    }
                }
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("set_text_sizing".to_string());
                dirty_node_ids.push(node_id);
            }
            EditorCommand::SetShapePrimitive { node_id, primitive } => {
                {
                    let node = find_node_mut(&mut state.doc, &node_id)?;
                    ensure_shape_node(node)?;
                    if let Some(shape) = &mut node.shape {
                        shape.primitive = primitive;
                    }
                }
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("set_shape_primitive".to_string());
                dirty_node_ids.push(node_id);
            }
            EditorCommand::SetShapeStyle { node_id, style } => {
                {
                    let node = find_node_mut(&mut state.doc, &node_id)?;
                    ensure_shape_node(node)?;
                    if let Some(shape) = &mut node.shape {
                        apply_shape_style_patch(shape, style);
                    }
                }
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("set_shape_style".to_string());
                dirty_node_ids.push(node_id);
            }
            EditorCommand::SetShapePath { node_id, path } => {
                {
                    let node = find_node_mut(&mut state.doc, &node_id)?;
                    ensure_shape_node(node)?;
                    if let Some(shape) = &mut node.shape {
                        apply_shape_path(shape, path);
                    }
                }
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("set_shape_path".to_string());
                dirty_node_ids.push(node_id);
            }
            EditorCommand::PromoteToComponent {
                node_id,
                component_key,
            } => {
                promote_to_component(&mut state.doc, &node_id, component_key)?;
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("promote_to_component".to_string());
                dirty_node_ids.push(node_id);
            }
            EditorCommand::SetComponentKey {
                node_id,
                component_key,
            } => {
                sync_component_key(&mut state.doc, &node_id, &component_key)?;
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("set_component_key".to_string());
                dirty_node_ids.push(node_id);
            }
            EditorCommand::CreateInstanceFromComponent {
                page_id,
                source_node_id,
                offset_x,
                offset_y,
            } => {
                let created_ids = create_instance_from_component(
                    &mut state.doc,
                    &page_id,
                    &source_node_id,
                    offset_x.unwrap_or(48.0),
                    offset_y.unwrap_or(48.0),
                )?;
                state.selection = created_ids
                    .first()
                    .cloned()
                    .into_iter()
                    .collect();
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("create_instance_from_component".to_string());
                dirty_node_ids.extend(created_ids);
            }
            EditorCommand::RefreshInstance { node_id } => {
                let refreshed_ids = refresh_instance_from_source(&mut state.doc, &node_id)?;
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("refresh_instance".to_string());
                dirty_node_ids.extend(refreshed_ids);
            }
            EditorCommand::DetachInstance { node_id } => {
                detach_instance(&mut state.doc, &node_id)?;
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("detach_instance".to_string());
                dirty_node_ids.push(node_id);
            }
            EditorCommand::SetNodeAutoLayout { node_id, layout } => {
                {
                    let node = find_node_mut(&mut state.doc, &node_id)?;
                    node.layout = layout;
                }
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("set_node_auto_layout".to_string());
                dirty_node_ids.push(node_id);
            }
            EditorCommand::SetNodeConstraints {
                node_id,
                constraints,
            } => {
                {
                    let node = find_node_mut(&mut state.doc, &node_id)?;
                    node.constraints = Some(constraints);
                }
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("set_node_constraints".to_string());
                dirty_node_ids.push(node_id);
            }
            EditorCommand::MoveSelection { delta_x, delta_y } => {
                let moved = move_selection(&mut state.doc, &state.selection, delta_x, delta_y)?;
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("move_selection".to_string());
                dirty_node_ids.extend(moved);
            }
            EditorCommand::MoveNode { node_id, frame } => {
                let previous = query_node(&state.doc, &node_id)
                    .map(|node| node.frame.clone())
                    .ok_or_else(|| {
                        CoreError::new(
                            "scene.node.not_found",
                            format!("Node '{}' was not found.", node_id),
                        )
                    })?;
                let next = {
                    let node = find_node_mut(&mut state.doc, &node_id)?;
                    apply_frame_patch(&mut node.frame, frame);
                    normalize_text_frame(node);
                    node.frame.clone()
                };
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("move_node".to_string());
                dirty_node_ids.push(node_id.clone());
                if frame_size_changed(&previous, &next) {
                    apply_child_constraints(
                        &mut state.doc,
                        &node_id,
                        &previous,
                        &next,
                        &HashSet::new(),
                        &mut dirty_node_ids,
                    )?;
                }
                normalize_document(&mut state.doc);
            }
            EditorCommand::RotateSelection { delta_deg } => {
                let rotated = rotate_selection(&mut state.doc, &state.selection, delta_deg)?;
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("rotate_selection".to_string());
                dirty_node_ids.extend(rotated);
            }
            EditorCommand::ResizeSelection {
                handle,
                delta_x,
                delta_y,
                lock_aspect,
            } => {
                let resized = resize_selection(
                    &mut state.doc,
                    &state.selection,
                    handle,
                    delta_x,
                    delta_y,
                    lock_aspect,
                )?;
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("resize_selection".to_string());
                dirty_node_ids.extend(resized);
            }
            EditorCommand::AddGuide { page_id, guide } => {
                add_guide(&mut state.doc, &page_id, guide.clone())?;
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("add_guide".to_string());
                dirty_node_ids.push(guide.id);
            }
            EditorCommand::MoveGuide {
                page_id,
                guide_id,
                position,
            } => {
                move_guide(&mut state.doc, &page_id, &guide_id, position)?;
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("move_guide".to_string());
                dirty_node_ids.push(guide_id);
            }
            EditorCommand::DeleteGuide { page_id, guide_id } => {
                delete_guide(&mut state.doc, &page_id, &guide_id)?;
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("delete_guide".to_string());
                dirty_node_ids.push(guide_id);
            }
            EditorCommand::CreateNode { page_id, node } => {
                let dirty_node_id = node.id.clone();
                let dirty_parent_id = node.parent_id.clone();
                create_node(&mut state.doc, &page_id, node)?;
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("create_node".to_string());
                dirty_node_ids.push(dirty_node_id);
                if let Some(parent_id) = dirty_parent_id {
                    dirty_node_ids.push(parent_id);
                }
            }
            EditorCommand::DeleteNode { node_id } => {
                let deleted = delete_node(&mut state.doc, &node_id)?;
                state.selection.retain(|selected| selected != &node_id);
                normalize_document(&mut state.doc);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("delete_node".to_string());
                dirty_node_ids.extend(deleted);
            }
            EditorCommand::Undo => {
                return Err(CoreError::new(
                    "history.undo.session_required",
                    "Undo commands must be handled by the editor session layer.",
                ));
            }
            EditorCommand::Redo => {
                return Err(CoreError::new(
                    "history.redo.session_required",
                    "Redo commands must be handled by the editor session layer.",
                ));
            }
        }
    }

    Ok(EditorApplyResult {
        snapshot: state.snapshot(),
        validation: state.validation(),
        applied_commands,
        dirty_node_ids: dedupe_ids(dirty_node_ids),
    })
}

pub fn query_node<'a>(doc: &'a SceneDoc, node_id: &str) -> Option<&'a SceneNode> {
    doc.pages
        .iter()
        .flat_map(|page| page.nodes.iter())
        .find(|node| node.id == node_id)
}

pub fn hit_test(
    doc: &SceneDoc,
    page_id: &str,
    x: f32,
    y: f32,
    mode: HitTestMode,
) -> Result<HitTestResult, CoreError> {
    let page = doc
        .pages
        .iter()
        .find(|page| page.id == page_id)
        .ok_or_else(|| {
            CoreError::new(
                "scene.page.not_found",
                format!("Page '{}' was not found.", page_id),
            )
        })?;

    let mut hits = Vec::new();
    for node in page.nodes.iter().rev() {
        if point_inside_rect(&node.frame, x, y) {
            hits.push(node.id.clone());
            if matches!(mode, HitTestMode::Topmost) {
                break;
            }
        }
    }

    Ok(HitTestResult {
        page_id: page.id.clone(),
        top_node_id: hits.first().cloned(),
        node_ids: hits,
    })
}

pub fn selection_bounds(doc: &SceneDoc, selection: &[String]) -> Option<EditorRect> {
    let nodes: Vec<&SceneNode> = selection
        .iter()
        .filter_map(|node_id| query_node(doc, node_id))
        .collect();

    if nodes.is_empty() {
        return None;
    }

    let left = nodes
        .iter()
        .map(|node| node.frame.x)
        .fold(f32::INFINITY, f32::min);
    let top = nodes
        .iter()
        .map(|node| node.frame.y)
        .fold(f32::INFINITY, f32::min);
    let right = nodes
        .iter()
        .map(|node| node.frame.x + node.frame.w)
        .fold(f32::NEG_INFINITY, f32::max);
    let bottom = nodes
        .iter()
        .map(|node| node.frame.y + node.frame.h)
        .fold(f32::NEG_INFINITY, f32::max);

    Some(EditorRect {
        x: left,
        y: top,
        w: right - left,
        h: bottom - top,
        rotation: 0.0,
    })
}

pub fn selection_handles(bounds: &EditorRect) -> Vec<TransformHandle> {
    let left = bounds.x;
    let center_x = bounds.x + bounds.w / 2.0;
    let right = bounds.x + bounds.w;
    let top = bounds.y;
    let center_y = bounds.y + bounds.h / 2.0;
    let bottom = bounds.y + bounds.h;
    let rotate_offset = 28.0;

    vec![
        TransformHandle {
            kind: TransformHandleKind::Nw,
            x: left,
            y: top,
            cursor: "nwse-resize",
        },
        TransformHandle {
            kind: TransformHandleKind::N,
            x: center_x,
            y: top,
            cursor: "ns-resize",
        },
        TransformHandle {
            kind: TransformHandleKind::Ne,
            x: right,
            y: top,
            cursor: "nesw-resize",
        },
        TransformHandle {
            kind: TransformHandleKind::E,
            x: right,
            y: center_y,
            cursor: "ew-resize",
        },
        TransformHandle {
            kind: TransformHandleKind::Se,
            x: right,
            y: bottom,
            cursor: "nwse-resize",
        },
        TransformHandle {
            kind: TransformHandleKind::S,
            x: center_x,
            y: bottom,
            cursor: "ns-resize",
        },
        TransformHandle {
            kind: TransformHandleKind::Sw,
            x: left,
            y: bottom,
            cursor: "nesw-resize",
        },
        TransformHandle {
            kind: TransformHandleKind::W,
            x: left,
            y: center_y,
            cursor: "ew-resize",
        },
        TransformHandle {
            kind: TransformHandleKind::Rotate,
            x: center_x,
            y: top - rotate_offset,
            cursor: "grab",
        },
    ]
}

pub fn move_snap_preview(
    doc: &SceneDoc,
    selection: &[String],
    delta_x: f32,
    delta_y: f32,
    threshold: f32,
) -> MoveSnapPreview {
    let Some(bounds) = selection_bounds(doc, selection) else {
        return MoveSnapPreview {
            delta_x,
            delta_y,
            guides: Vec::new(),
        };
    };

    let Some(page) = selection_page(doc, selection) else {
        return MoveSnapPreview {
            delta_x,
            delta_y,
            guides: Vec::new(),
        };
    };

    let target_rects = page
        .nodes
        .iter()
        .filter(|node| !selection.iter().any(|selected| selected == &node.id))
        .map(|node| node.frame.clone())
        .collect::<Vec<_>>();

    compute_move_snap(
        &bounds,
        delta_x,
        delta_y,
        target_rects.as_slice(),
        page.guides.as_slice(),
        threshold,
    )
}

pub fn resize_snap_preview(
    doc: &SceneDoc,
    selection: &[String],
    handle: TransformHandleKind,
    delta_x: f32,
    delta_y: f32,
    lock_aspect: bool,
    threshold: f32,
) -> ResizeSnapPreview {
    let Some(bounds) = selection_bounds(doc, selection) else {
        return ResizeSnapPreview {
            bounds: None,
            delta_x: 0.0,
            delta_y: 0.0,
            guides: Vec::new(),
        };
    };

    if matches!(handle, TransformHandleKind::Rotate) {
        return ResizeSnapPreview {
            bounds: Some(bounds),
            delta_x: 0.0,
            delta_y: 0.0,
            guides: Vec::new(),
        };
    }

    let preview_bounds = resize_bounds(&bounds, handle.clone(), delta_x, delta_y, lock_aspect);

    let Some(page) = selection_page(doc, selection) else {
        let snapped = resize_delta_from_bounds(&bounds, &preview_bounds, handle);
        return ResizeSnapPreview {
            bounds: Some(preview_bounds),
            delta_x: snapped.0,
            delta_y: snapped.1,
            guides: Vec::new(),
        };
    };

    let target_rects = page
        .nodes
        .iter()
        .filter(|node| !selection.iter().any(|selected| selected == &node.id))
        .map(|node| node.frame.clone())
        .collect::<Vec<_>>();

    compute_resize_snap(
        &bounds,
        &preview_bounds,
        handle,
        target_rects.as_slice(),
        page.guides.as_slice(),
        threshold,
    )
}

pub fn resize_selection(
    doc: &mut SceneDoc,
    selection: &[String],
    handle: TransformHandleKind,
    delta_x: f32,
    delta_y: f32,
    lock_aspect: bool,
) -> Result<Vec<String>, CoreError> {
    let bounds = selection_bounds(doc, selection).ok_or_else(|| {
        CoreError::new(
            "scene.selection.empty",
            "Cannot resize because the current selection is empty.",
        )
    })?;

    if matches!(handle, TransformHandleKind::Rotate) {
        return Err(CoreError::new(
            "scene.transform.rotate.unimplemented",
            "Rotate transform is not implemented yet.",
        ));
    }

    let next_bounds = resize_bounds(&bounds, handle, delta_x, delta_y, lock_aspect);
    let scale_x = next_bounds.w / bounds.w.max(1.0);
    let scale_y = next_bounds.h / bounds.h.max(1.0);

    let selected_set: HashSet<String> = selection.iter().cloned().collect();
    let mut resized_ids = Vec::new();
    for node_id in selection {
        let (previous, next) = {
            let node = find_node_mut(doc, node_id)?;
            let previous = node.frame.clone();
            let left_offset = node.frame.x - bounds.x;
            let top_offset = node.frame.y - bounds.y;
            let right_offset = (node.frame.x + node.frame.w) - bounds.x;
            let bottom_offset = (node.frame.y + node.frame.h) - bounds.y;

            let next_left = next_bounds.x + left_offset * scale_x;
            let next_top = next_bounds.y + top_offset * scale_y;
            let next_right = next_bounds.x + right_offset * scale_x;
            let next_bottom = next_bounds.y + bottom_offset * scale_y;

            node.frame.x = next_left;
            node.frame.y = next_top;
            node.frame.w = (next_right - next_left).max(1.0);
            node.frame.h = (next_bottom - next_top).max(1.0);
            normalize_text_frame(node);
            (previous, node.frame.clone())
        };

        resized_ids.push(node_id.clone());
        apply_child_constraints(doc, node_id, &previous, &next, &selected_set, &mut resized_ids)?;
    }

    Ok(dedupe_ids(resized_ids))
}

pub fn move_selection(
    doc: &mut SceneDoc,
    selection: &[String],
    delta_x: f32,
    delta_y: f32,
) -> Result<Vec<String>, CoreError> {
    if selection.is_empty() {
        return Err(CoreError::new(
            "scene.selection.empty",
            "Cannot move because the current selection is empty.",
        ));
    }

    let mut moved_ids = Vec::new();
    for node_id in selection {
        let node = find_node_mut(doc, node_id)?;
        node.frame.x += delta_x;
        node.frame.y += delta_y;
        moved_ids.push(node_id.clone());
    }

    Ok(moved_ids)
}

pub fn rotate_selection(
    doc: &mut SceneDoc,
    selection: &[String],
    delta_deg: f32,
) -> Result<Vec<String>, CoreError> {
    let bounds = selection_bounds(doc, selection).ok_or_else(|| {
        CoreError::new(
            "scene.selection.empty",
            "Cannot rotate because the current selection is empty.",
        )
    })?;

    let center_x = bounds.x + bounds.w / 2.0;
    let center_y = bounds.y + bounds.h / 2.0;
    let angle = delta_deg.to_radians();
    let cos_theta = angle.cos();
    let sin_theta = angle.sin();

    let mut rotated_ids = Vec::new();
    for node_id in selection {
        let node = find_node_mut(doc, node_id)?;
        let node_center_x = node.frame.x + node.frame.w / 2.0;
        let node_center_y = node.frame.y + node.frame.h / 2.0;
        let local_x = node_center_x - center_x;
        let local_y = node_center_y - center_y;

        let rotated_x = (local_x * cos_theta) - (local_y * sin_theta);
        let rotated_y = (local_x * sin_theta) + (local_y * cos_theta);

        node.frame.x = center_x + rotated_x - node.frame.w / 2.0;
        node.frame.y = center_y + rotated_y - node.frame.h / 2.0;
        node.frame.rotation = normalize_degrees(node.frame.rotation + delta_deg);
        rotated_ids.push(node_id.clone());
    }

    Ok(rotated_ids)
}

fn touch_doc(doc: &mut SceneDoc) {
    doc.meta.updated_at = "editor-kernel-updated".to_string();
}

fn node_exists(doc: &SceneDoc, node_id: &str) -> bool {
    query_node(doc, node_id).is_some()
}

fn find_node_mut<'a>(doc: &'a mut SceneDoc, node_id: &str) -> Result<&'a mut SceneNode, CoreError> {
    for page in &mut doc.pages {
        for node in &mut page.nodes {
            if node.id == node_id {
                return Ok(node);
            }
        }
    }

    Err(CoreError::new(
        "scene.node.not_found",
        format!("Node '{}' was not found.", node_id),
    ))
}

fn create_node(doc: &mut SceneDoc, page_id: &str, node: SceneNode) -> Result<(), CoreError> {
    if node_exists(doc, &node.id) {
        return Err(CoreError::new(
            "scene.node.duplicate_id",
            format!("Node '{}' already exists.", node.id),
        ));
    }

    let page = doc
        .pages
        .iter_mut()
        .find(|page| page.id == page_id)
        .ok_or_else(|| {
            CoreError::new(
                "scene.page.not_found",
                format!("Page '{}' was not found.", page_id),
            )
        })?;

    if let Some(parent_id) = &node.parent_id {
        let parent = page
            .nodes
            .iter_mut()
            .find(|candidate| candidate.id == *parent_id)
            .ok_or_else(|| {
                CoreError::new(
                    "scene.node.parent_missing",
                    format!("Parent '{}' was not found.", parent_id),
                )
            })?;

        let children = parent.children.get_or_insert_with(Vec::new);
        children.push(node.id.clone());
    }

    page.nodes.push(node);
    Ok(())
}

fn delete_node(doc: &mut SceneDoc, node_id: &str) -> Result<Vec<String>, CoreError> {
    for page in &mut doc.pages {
        if page.root_id == node_id {
            return Err(CoreError::new(
                "scene.page.root_delete_forbidden",
                "Cannot delete the root node of a page.",
            ));
        }

        if !page.nodes.iter().any(|node| node.id == node_id) {
            continue;
        }

        let to_delete = collect_subtree_ids(page.nodes.as_slice(), node_id)?;
        let delete_set: HashSet<&str> = to_delete.iter().map(String::as_str).collect();

        for node in &mut page.nodes {
            if let Some(children) = &mut node.children {
                children.retain(|child| !delete_set.contains(child.as_str()));
            }
        }

        page.nodes.retain(|node| !delete_set.contains(node.id.as_str()));
        return Ok(to_delete);
    }

    Err(CoreError::new(
        "scene.node.not_found",
        format!("Node '{}' was not found.", node_id),
    ))
}

fn promote_to_component(
    doc: &mut SceneDoc,
    node_id: &str,
    component_key: Option<String>,
) -> Result<(), CoreError> {
    let node = find_node_mut(doc, node_id)?;
    match node.kind {
        SceneNodeKind::Frame | SceneNodeKind::Group | SceneNodeKind::Component => {}
        _ => {
            return Err(CoreError::new(
                "scene.component.invalid_target",
                format!("Node '{}' cannot be promoted to a component.", node_id),
            ))
        }
    }

    let next_key = component_key.unwrap_or_else(|| format!("component-{}", node.id));
    node.kind = SceneNodeKind::Component;
    node.component = Some(ComponentNodeData {
        component_key: next_key,
    });
    node.instance = None;
    Ok(())
}

fn sync_component_key(doc: &mut SceneDoc, node_id: &str, component_key: &str) -> Result<(), CoreError> {
    let next_key = component_key.trim();
    if next_key.is_empty() {
        return Err(CoreError::new(
            "scene.component.key_invalid",
            "Component key cannot be empty.",
        ));
    }

    {
        let node = find_node_mut(doc, node_id)?;
        if !matches!(node.kind, SceneNodeKind::Component) {
            return Err(CoreError::new(
                "scene.component.key_invalid_target",
                format!("Node '{}' is not a component.", node_id),
            ));
        }
        if let Some(component) = &mut node.component {
            component.component_key = next_key.to_string();
        }
    }

    for page in &mut doc.pages {
        for node in &mut page.nodes {
            if let Some(instance) = &mut node.instance {
                if instance.source_component_id == node_id {
                    instance.source_component_key = next_key.to_string();
                }
            }
        }
    }

    Ok(())
}

fn create_instance_from_component(
    doc: &mut SceneDoc,
    page_id: &str,
    source_node_id: &str,
    offset_x: f32,
    offset_y: f32,
) -> Result<Vec<String>, CoreError> {
    let source_page_index = doc
        .pages
        .iter()
        .position(|page| page.nodes.iter().any(|node| node.id == source_node_id))
        .ok_or_else(|| {
            CoreError::new(
                "scene.component.source_missing",
                format!("Component '{}' was not found.", source_node_id),
            )
        })?;

    let source_page_nodes = doc.pages[source_page_index].nodes.clone();
    let source_root = source_page_nodes
        .iter()
        .find(|node| node.id == source_node_id)
        .ok_or_else(|| {
            CoreError::new(
                "scene.component.source_missing",
                format!("Component '{}' was not found.", source_node_id),
            )
        })?;

    if !matches!(source_root.kind, SceneNodeKind::Component) {
        return Err(CoreError::new(
            "scene.component.source_invalid",
            format!("Node '{}' is not a component.", source_node_id),
        ));
    }

    let component_key = source_root
        .component
        .as_ref()
        .map(|component| component.component_key.clone())
        .unwrap_or_else(|| format!("component-{}", source_root.id));

    let subtree_ids = collect_subtree_ids(source_page_nodes.as_slice(), source_node_id)?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();

    let id_map = subtree_ids
        .iter()
        .enumerate()
        .map(|(index, old_id)| {
            (
                old_id.clone(),
                format!("instance-{}-{}-{}", source_node_id, nonce, index),
            )
        })
        .collect::<std::collections::HashMap<_, _>>();

    let target_page = doc.pages.iter_mut().find(|page| page.id == page_id).ok_or_else(|| {
        CoreError::new(
            "scene.page.not_found",
            format!("Page '{}' was not found.", page_id),
        )
    })?;

    let fallback_parent_id = Some(target_page.root_id.clone());
    let target_parent_id = source_root
        .parent_id
        .as_ref()
        .filter(|parent_id| target_page.nodes.iter().any(|node| node.id == **parent_id))
        .cloned()
        .or(fallback_parent_id);

    let mut created_nodes = Vec::with_capacity(subtree_ids.len());
    for old_id in &subtree_ids {
        let original = source_page_nodes
            .iter()
            .find(|node| node.id == *old_id)
            .ok_or_else(|| {
                CoreError::new(
                    "scene.node.not_found",
                    format!("Node '{}' was not found.", old_id),
                )
            })?;

        let mut clone = original.clone();
        clone.id = id_map
            .get(old_id)
            .cloned()
            .ok_or_else(|| CoreError::new("scene.component.clone_failed", "Missing id map entry."))?;
        clone.parent_id = if old_id == source_node_id {
            target_parent_id.clone()
        } else {
            original
                .parent_id
                .as_ref()
                .and_then(|parent_id| id_map.get(parent_id).cloned())
        };
        clone.children = original.children.as_ref().map(|children| {
            children
                .iter()
                .filter_map(|child_id| id_map.get(child_id).cloned())
                .collect::<Vec<_>>()
        });
        clone.frame.x += offset_x;
        clone.frame.y += offset_y;

        if old_id == source_node_id {
            clone.kind = SceneNodeKind::Instance;
            clone.component = None;
            clone.instance = Some(InstanceNodeData {
                source_component_id: source_root.id.clone(),
                source_component_key: component_key.clone(),
            });
        }

        created_nodes.push(clone);
    }

    let created_root_id = created_nodes
        .first()
        .map(|node| node.id.clone())
        .ok_or_else(|| CoreError::new("scene.component.clone_empty", "No instance nodes were created."))?;

    if let Some(parent_id) = &target_parent_id {
        let parent = target_page
            .nodes
            .iter_mut()
            .find(|node| node.id == *parent_id)
            .ok_or_else(|| {
                CoreError::new(
                    "scene.node.parent_missing",
                    format!("Parent '{}' was not found.", parent_id),
                )
            })?;
        let children = parent.children.get_or_insert_with(Vec::new);
        children.push(created_root_id.clone());
    }

    for node in &created_nodes {
        if target_page.nodes.iter().any(|existing| existing.id == node.id) {
            return Err(CoreError::new(
                "scene.node.duplicate_id",
                format!("Node '{}' already exists.", node.id),
            ));
        }
    }

    target_page.nodes.extend(created_nodes.iter().cloned());

    Ok(created_nodes.into_iter().map(|node| node.id).collect())
}

fn refresh_instance_from_source(doc: &mut SceneDoc, node_id: &str) -> Result<Vec<String>, CoreError> {
    let (instance_page_id, source_component_id, source_component_key, instance_parent_id, instance_frame) = {
        let instance_page = doc
            .pages
            .iter()
            .find(|page| page.nodes.iter().any(|node| node.id == node_id))
            .ok_or_else(|| {
                CoreError::new(
                    "scene.instance.not_found",
                    format!("Instance '{}' was not found.", node_id),
                )
            })?;
        let instance_root = instance_page
            .nodes
            .iter()
            .find(|node| node.id == node_id)
            .ok_or_else(|| CoreError::new("scene.instance.not_found", "Instance root was not found."))?;
        if !matches!(instance_root.kind, SceneNodeKind::Instance) {
            return Err(CoreError::new(
                "scene.instance.invalid_target",
                format!("Node '{}' is not an instance.", node_id),
            ));
        }
        let instance = instance_root.instance.as_ref().ok_or_else(|| {
            CoreError::new(
                "scene.instance.metadata_missing",
                format!("Instance '{}' is missing source metadata.", node_id),
            )
        })?;
        (
            instance_page.id.clone(),
            instance.source_component_id.clone(),
            instance.source_component_key.clone(),
            instance_root.parent_id.clone(),
            instance_root.frame.clone(),
        )
    };

    let source_page = doc
        .pages
        .iter()
        .find(|page| page.nodes.iter().any(|node| node.id == source_component_id))
        .ok_or_else(|| {
            CoreError::new(
                "scene.component.source_missing",
                format!("Component '{}' was not found.", source_component_id),
            )
        })?
        .clone();
    let source_root = source_page
        .nodes
        .iter()
        .find(|node| node.id == source_component_id)
        .ok_or_else(|| CoreError::new("scene.component.source_missing", "Component source was not found."))?;
    if !matches!(source_root.kind, SceneNodeKind::Component) {
        return Err(CoreError::new(
            "scene.component.source_invalid",
            format!("Node '{}' is not a component.", source_component_id),
        ));
    }

    let dx = instance_frame.x - source_root.frame.x;
    let dy = instance_frame.y - source_root.frame.y;
    let subtree_ids = collect_subtree_ids(source_page.nodes.as_slice(), &source_component_id)?;
    let old_instance_subtree_ids = {
        let instance_page = doc
            .pages
            .iter()
            .find(|page| page.id == instance_page_id)
            .ok_or_else(|| CoreError::new("scene.page.not_found", "Instance page was not found."))?;
        collect_subtree_ids(instance_page.nodes.as_slice(), node_id)?
    };
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let id_map = subtree_ids
        .iter()
        .enumerate()
        .map(|(index, old_id)| {
            let next_id = if old_id == &source_component_id {
                node_id.to_string()
            } else {
                format!("instance-{}-refresh-{}-{}", source_component_id, nonce, index)
            };
            (old_id.clone(), next_id)
        })
        .collect::<std::collections::HashMap<_, _>>();

    let target_page = doc
        .pages
        .iter_mut()
        .find(|page| page.id == instance_page_id)
        .ok_or_else(|| CoreError::new("scene.page.not_found", "Instance page was not found."))?;
    let remove_set: HashSet<&str> = old_instance_subtree_ids
        .iter()
        .filter(|old_id| old_id.as_str() != node_id)
        .map(String::as_str)
        .collect();
    target_page
        .nodes
        .retain(|node| !remove_set.contains(node.id.as_str()));

    let mut refreshed_nodes = Vec::new();
    for old_id in &subtree_ids {
        let original = source_page
            .nodes
            .iter()
            .find(|node| node.id == *old_id)
            .ok_or_else(|| CoreError::new("scene.node.not_found", "Source subtree node was not found."))?;
        let mut clone = original.clone();
        clone.id = id_map
            .get(old_id)
            .cloned()
            .ok_or_else(|| CoreError::new("scene.component.clone_failed", "Missing refresh id map entry."))?;
        clone.parent_id = if old_id == &source_component_id {
            instance_parent_id.clone()
        } else {
            original
                .parent_id
                .as_ref()
                .and_then(|parent_id| id_map.get(parent_id).cloned())
        };
        clone.children = original.children.as_ref().map(|children| {
            children
                .iter()
                .filter_map(|child_id| id_map.get(child_id).cloned())
                .collect::<Vec<_>>()
        });
        clone.frame.x += dx;
        clone.frame.y += dy;

        if old_id == &source_component_id {
            clone.kind = SceneNodeKind::Instance;
            clone.component = None;
            clone.instance = Some(InstanceNodeData {
                source_component_id: source_component_id.clone(),
                source_component_key: source_component_key.clone(),
            });
        }

        refreshed_nodes.push(clone);
    }

    for refreshed in refreshed_nodes {
        if let Some(existing) = target_page.nodes.iter_mut().find(|node| node.id == refreshed.id) {
            *existing = refreshed;
        } else {
            target_page.nodes.push(refreshed);
        }
    }

    Ok(dedupe_ids(
        old_instance_subtree_ids
            .into_iter()
            .chain(target_page.nodes.iter().filter(|node| node.id == node_id || node.id.contains(&format!("instance-{}-refresh-", source_component_id))).map(|node| node.id.clone()))
            .collect(),
    ))
}

fn detach_instance(doc: &mut SceneDoc, node_id: &str) -> Result<(), CoreError> {
    let node = find_node_mut(doc, node_id)?;
    if !matches!(node.kind, SceneNodeKind::Instance) {
        return Err(CoreError::new(
            "scene.instance.invalid_target",
            format!("Node '{}' is not an instance.", node_id),
        ));
    }

    node.kind = SceneNodeKind::Frame;
    node.instance = None;
    Ok(())
}

fn add_guide(doc: &mut SceneDoc, page_id: &str, guide: SceneGuide) -> Result<(), CoreError> {
    let page = doc.pages.iter_mut().find(|page| page.id == page_id).ok_or_else(|| {
        CoreError::new(
            "scene.page.not_found",
            format!("Page '{}' was not found.", page_id),
        )
    })?;

    if page.guides.iter().any(|existing| existing.id == guide.id) {
        return Err(CoreError::new(
            "scene.guide.duplicate_id",
            format!("Guide '{}' already exists.", guide.id),
        ));
    }

    page.guides.push(guide);
    Ok(())
}

fn ensure_text_node(node: &SceneNode) -> Result<(), CoreError> {
    if matches!(node.kind, kernel_doc::SceneNodeKind::Text) {
        Ok(())
    } else {
        Err(CoreError::new(
            "scene.text.invalid_target",
            format!("Node '{}' is not a text node.", node.id),
        ))
    }
}

fn ensure_shape_node(node: &SceneNode) -> Result<(), CoreError> {
    if matches!(node.kind, kernel_doc::SceneNodeKind::Shape) {
        Ok(())
    } else {
        Err(CoreError::new(
            "scene.shape.invalid_target",
            format!("Node '{}' is not a shape node.", node.id),
        ))
    }
}

fn apply_text_style_patch(text: &mut kernel_doc::TextNodeData, style: TextStylePatch) {
    if let Some(font_family) = style.font_family {
        text.font_family = font_family;
    }
    if let Some(font_size) = style.font_size {
        text.font_size = font_size.max(1.0);
    }
    if let Some(font_weight) = style.font_weight {
        text.font_weight = font_weight;
    }
    if let Some(line_height) = style.line_height {
        text.line_height = line_height.max(1.0);
    }
    if let Some(letter_spacing) = style.letter_spacing {
        text.letter_spacing = letter_spacing;
    }
    if let Some(align) = style.align {
        text.align = align;
    }
    if let Some(color) = style.color {
        text.color = color;
    }
}

fn apply_shape_style_patch(shape: &mut kernel_doc::ShapeNodeData, style: ShapeStylePatch) {
    if let Some(fill) = style.fill {
        shape.fill = fill;
    }
    if let Some(stroke_color) = style.stroke_color {
        shape.stroke_color = stroke_color;
    }
    if let Some(stroke_width) = style.stroke_width {
        shape.stroke_width = stroke_width.max(0.0);
    }
    if let Some(corner_radius) = style.corner_radius {
        shape.corner_radius = corner_radius.max(0.0);
    }
    if let Some(opacity) = style.opacity {
        shape.opacity = opacity.clamp(0.0, 1.0);
    }
}

fn apply_shape_path(shape: &mut kernel_doc::ShapeNodeData, path: ShapePathData) {
    shape.primitive = kernel_doc::ShapePrimitive::Path;
    shape.path = Some(path);
}

fn normalize_text_frame(node: &mut SceneNode) {
    if !matches!(node.kind, kernel_doc::SceneNodeKind::Text) {
        return;
    }

    let Some(text) = &node.text else {
        return;
    };

    if !matches!(text.sizing, TextSizingMode::AutoHeight) {
        return;
    }

    node.frame.h = estimate_text_auto_height(node.frame.w, text);
}

fn normalize_auto_height_nodes(doc: &mut SceneDoc) {
    for page in &mut doc.pages {
        for node in &mut page.nodes {
            normalize_text_frame(node);
        }
    }
}

fn normalize_document(doc: &mut SceneDoc) {
    normalize_auto_height_nodes(doc);
    normalize_auto_layout_nodes(doc);
}

fn normalize_auto_layout_nodes(doc: &mut SceneDoc) {
    for page in &mut doc.pages {
        let roots = page
            .nodes
            .iter()
            .filter(|node| node.parent_id.is_none())
            .map(|node| node.id.clone())
            .collect::<Vec<_>>();

        for root_id in roots {
            apply_auto_layout_recursive(page, &root_id);
        }
    }
}

fn apply_auto_layout_recursive(page: &mut kernel_doc::ScenePage, parent_id: &str) {
    let Some(parent_index) = page.nodes.iter().position(|node| node.id == parent_id) else {
        return;
    };

    let child_ids = ordered_child_ids(page, parent_index);
    let layout = page.nodes[parent_index].layout.clone();
    let parent_frame = page.nodes[parent_index].frame.clone();

    if let Some(layout) = layout {
        let index_map = page
            .nodes
            .iter()
            .enumerate()
            .map(|(index, node)| (node.id.clone(), index))
            .collect::<std::collections::HashMap<_, _>>();

        let mut primary_cursor = match layout.direction {
            AutoLayoutDirection::Horizontal => parent_frame.x + layout.padding_x,
            AutoLayoutDirection::Vertical => parent_frame.y + layout.padding_y,
        };

        let cross_start = match layout.direction {
            AutoLayoutDirection::Horizontal => parent_frame.y + layout.padding_y,
            AutoLayoutDirection::Vertical => parent_frame.x + layout.padding_x,
        };

        let cross_size = match layout.direction {
            AutoLayoutDirection::Horizontal => (parent_frame.h - layout.padding_y * 2.0).max(1.0),
            AutoLayoutDirection::Vertical => (parent_frame.w - layout.padding_x * 2.0).max(1.0),
        };

        for child_id in &child_ids {
            let Some(child_index) = index_map.get(child_id).copied() else {
                continue;
            };

            let child = &mut page.nodes[child_index];
            match layout.direction {
                AutoLayoutDirection::Horizontal => {
                    child.frame.x = primary_cursor;
                    match layout.align {
                        AutoLayoutAlign::Start => {
                            child.frame.y = cross_start;
                        }
                        AutoLayoutAlign::Center => {
                            child.frame.y = cross_start + (cross_size - child.frame.h) / 2.0;
                        }
                        AutoLayoutAlign::End => {
                            child.frame.y = cross_start + cross_size - child.frame.h;
                        }
                        AutoLayoutAlign::Stretch => {
                            child.frame.y = cross_start;
                            child.frame.h = cross_size.max(1.0);
                        }
                    }
                    normalize_text_frame(child);
                    primary_cursor += child.frame.w + layout.gap;
                }
                AutoLayoutDirection::Vertical => {
                    child.frame.y = primary_cursor;
                    match layout.align {
                        AutoLayoutAlign::Start => {
                            child.frame.x = cross_start;
                        }
                        AutoLayoutAlign::Center => {
                            child.frame.x = cross_start + (cross_size - child.frame.w) / 2.0;
                        }
                        AutoLayoutAlign::End => {
                            child.frame.x = cross_start + cross_size - child.frame.w;
                        }
                        AutoLayoutAlign::Stretch => {
                            child.frame.x = cross_start;
                            child.frame.w = cross_size.max(1.0);
                        }
                    }
                    normalize_text_frame(child);
                    primary_cursor += child.frame.h + layout.gap;
                }
            }
        }
    }

    for child_id in child_ids {
        apply_auto_layout_recursive(page, &child_id);
    }
}

fn ordered_child_ids(page: &kernel_doc::ScenePage, parent_index: usize) -> Vec<String> {
    if let Some(children) = &page.nodes[parent_index].children {
        return children.clone();
    }

    let parent_id = page.nodes[parent_index].id.as_str();
    page.nodes
        .iter()
        .filter(|node| node.parent_id.as_deref() == Some(parent_id))
        .map(|node| node.id.clone())
        .collect()
}

fn estimate_text_auto_height(width: f32, text: &kernel_doc::TextNodeData) -> f32 {
    let available_width = width.max(text.font_size);
    let average_char_width = (text.font_size * 0.56 + text.letter_spacing.max(0.0)).max(1.0);
    let chars_per_line = ((available_width / average_char_width).floor() as usize).max(1);
    let mut lines = 0usize;

    for paragraph in text.content.split('\n') {
        let paragraph_length = paragraph.chars().count().max(1);
        lines += ((paragraph_length + chars_per_line - 1) / chars_per_line).max(1);
    }

    text.line_height * (lines.max(1) as f32)
}

fn move_guide(doc: &mut SceneDoc, page_id: &str, guide_id: &str, position: i32) -> Result<(), CoreError> {
    let page = doc.pages.iter_mut().find(|page| page.id == page_id).ok_or_else(|| {
        CoreError::new(
            "scene.page.not_found",
            format!("Page '{}' was not found.", page_id),
        )
    })?;

    let guide = page.guides.iter_mut().find(|guide| guide.id == guide_id).ok_or_else(|| {
        CoreError::new(
            "scene.guide.not_found",
            format!("Guide '{}' was not found.", guide_id),
        )
    })?;

    guide.position = position;
    Ok(())
}

fn delete_guide(doc: &mut SceneDoc, page_id: &str, guide_id: &str) -> Result<(), CoreError> {
    let page = doc.pages.iter_mut().find(|page| page.id == page_id).ok_or_else(|| {
        CoreError::new(
            "scene.page.not_found",
            format!("Page '{}' was not found.", page_id),
        )
    })?;

    let previous_len = page.guides.len();
    page.guides.retain(|guide| guide.id != guide_id);

    if page.guides.len() == previous_len {
        return Err(CoreError::new(
            "scene.guide.not_found",
            format!("Guide '{}' was not found.", guide_id),
        ));
    }

    Ok(())
}

fn apply_child_constraints(
    doc: &mut SceneDoc,
    parent_id: &str,
    old_parent: &EditorRect,
    new_parent: &EditorRect,
    selected_nodes: &HashSet<String>,
    dirty_ids: &mut Vec<String>,
) -> Result<(), CoreError> {
    if !frame_size_changed(old_parent, new_parent) {
        return Ok(());
    }

    let child_ids = collect_direct_child_ids(doc, parent_id);

    for child_id in child_ids {
        if selected_nodes.contains(&child_id) {
            continue;
        }

        let previous = query_node(doc, &child_id)
            .map(|node| node.frame.clone())
            .ok_or_else(|| {
                CoreError::new(
                    "scene.node.not_found",
                    format!("Node '{}' was not found.", child_id),
                )
            })?;

        let node = find_node_mut(doc, &child_id)?;
        let next = constrained_frame(
            old_parent,
            new_parent,
            &previous,
            node.constraints
                .as_ref()
                .map(|constraints| (&constraints.horizontal, &constraints.vertical)),
        );
        node.frame = next.clone();
        normalize_text_frame(node);
        dirty_ids.push(child_id.clone());
        apply_child_constraints(doc, &child_id, &previous, &next, selected_nodes, dirty_ids)?;
    }

    Ok(())
}

fn collect_direct_child_ids(doc: &SceneDoc, parent_id: &str) -> Vec<String> {
    doc.pages
        .iter()
        .flat_map(|page| page.nodes.iter())
        .filter(|node| node.parent_id.as_deref() == Some(parent_id))
        .map(|node| node.id.clone())
        .collect()
}

fn constrained_frame(
    old_parent: &EditorRect,
    new_parent: &EditorRect,
    child: &EditorRect,
    constraints: Option<(&HorizontalConstraint, &VerticalConstraint)>,
) -> EditorRect {
    let (horizontal, vertical) = constraints.unwrap_or((&HorizontalConstraint::Min, &VerticalConstraint::Min));
    let old_parent_right = old_parent.x + old_parent.w;
    let new_parent_right = new_parent.x + new_parent.w;
    let old_parent_bottom = old_parent.y + old_parent.h;
    let new_parent_bottom = new_parent.y + new_parent.h;

    let left_margin = child.x - old_parent.x;
    let right_margin = old_parent_right - (child.x + child.w);
    let top_margin = child.y - old_parent.y;
    let bottom_margin = old_parent_bottom - (child.y + child.h);

    let scale_x = new_parent.w / old_parent.w.max(1.0);
    let scale_y = new_parent.h / old_parent.h.max(1.0);

    let (x, w) = match horizontal {
        HorizontalConstraint::Min => (new_parent.x + left_margin, child.w),
        HorizontalConstraint::Max => (new_parent_right - right_margin - child.w, child.w),
        HorizontalConstraint::Stretch => (
            new_parent.x + left_margin,
            (new_parent.w - left_margin - right_margin).max(1.0),
        ),
        HorizontalConstraint::Scale => (
            new_parent.x + left_margin * scale_x,
            (child.w * scale_x).max(1.0),
        ),
    };

    let (y, h) = match vertical {
        VerticalConstraint::Min => (new_parent.y + top_margin, child.h),
        VerticalConstraint::Max => (new_parent_bottom - bottom_margin - child.h, child.h),
        VerticalConstraint::Stretch => (
            new_parent.y + top_margin,
            (new_parent.h - top_margin - bottom_margin).max(1.0),
        ),
        VerticalConstraint::Scale => (
            new_parent.y + top_margin * scale_y,
            (child.h * scale_y).max(1.0),
        ),
    };

    EditorRect {
        x,
        y,
        w,
        h,
        rotation: child.rotation,
    }
}

fn frame_size_changed(previous: &EditorRect, next: &EditorRect) -> bool {
    (previous.w - next.w).abs() > f32::EPSILON || (previous.h - next.h).abs() > f32::EPSILON
}

fn collect_subtree_ids(nodes: &[SceneNode], root_id: &str) -> Result<Vec<String>, CoreError> {
    let mut stack = vec![root_id.to_string()];
    let mut visited = HashSet::new();
    let mut ordered = Vec::new();

    while let Some(current_id) = stack.pop() {
        if !visited.insert(current_id.clone()) {
            continue;
        }

        let node = nodes
            .iter()
            .find(|node| node.id == current_id)
            .ok_or_else(|| {
                CoreError::new(
                    "scene.node.not_found",
                    format!("Node '{}' was not found.", current_id),
                )
            })?;

        if let Some(children) = &node.children {
            for child in children.iter().rev() {
                stack.push(child.clone());
            }
        }

        ordered.push(current_id);
    }

    Ok(ordered)
}

fn apply_frame_patch(frame: &mut EditorRect, patch: FramePatch) {
    if let Some(x) = patch.x {
        frame.x = x;
    }
    if let Some(y) = patch.y {
        frame.y = y;
    }
    if let Some(w) = patch.w {
        frame.w = w;
    }
    if let Some(h) = patch.h {
        frame.h = h;
    }
    if let Some(rotation) = patch.rotation {
        frame.rotation = rotation;
    }
}

fn resize_bounds(
    bounds: &EditorRect,
    handle: TransformHandleKind,
    delta_x: f32,
    delta_y: f32,
    lock_aspect: bool,
) -> EditorRect {
    let min_size = 1.0;
    let mut left = bounds.x;
    let mut top = bounds.y;
    let mut right = bounds.x + bounds.w;
    let mut bottom = bounds.y + bounds.h;

    match handle {
        TransformHandleKind::N => top += delta_y,
        TransformHandleKind::Ne => {
            top += delta_y;
            right += delta_x;
        }
        TransformHandleKind::E => right += delta_x,
        TransformHandleKind::Se => {
            right += delta_x;
            bottom += delta_y;
        }
        TransformHandleKind::S => bottom += delta_y,
        TransformHandleKind::Sw => {
            left += delta_x;
            bottom += delta_y;
        }
        TransformHandleKind::W => left += delta_x,
        TransformHandleKind::Nw => {
            left += delta_x;
            top += delta_y;
        }
        TransformHandleKind::Rotate => {}
    }

    if lock_aspect {
        let aspect = if bounds.h.abs() > f32::EPSILON {
            bounds.w / bounds.h
        } else {
            1.0
        };

        let current_w = (right - left).max(min_size);
        let current_h = (bottom - top).max(min_size);
        let width_driven_h = current_w / aspect.max(f32::EPSILON);
        let height_driven_w = current_h * aspect;

        if delta_x.abs() >= delta_y.abs() {
            match handle {
                TransformHandleKind::N | TransformHandleKind::S => {
                    let centered_w = current_h * aspect;
                    let center_x = bounds.x + bounds.w / 2.0;
                    left = center_x - centered_w / 2.0;
                    right = center_x + centered_w / 2.0;
                }
                TransformHandleKind::W | TransformHandleKind::E => {
                    let centered_h = current_w / aspect.max(f32::EPSILON);
                    let center_y = bounds.y + bounds.h / 2.0;
                    top = center_y - centered_h / 2.0;
                    bottom = center_y + centered_h / 2.0;
                }
                TransformHandleKind::Nw
                | TransformHandleKind::Ne
                | TransformHandleKind::Se
                | TransformHandleKind::Sw => {
                    let adjusted_h = width_driven_h.max(min_size);
                    match handle {
                        TransformHandleKind::Nw | TransformHandleKind::Ne => {
                            top = bottom - adjusted_h;
                        }
                        TransformHandleKind::Se | TransformHandleKind::Sw => {
                            bottom = top + adjusted_h;
                        }
                        _ => {}
                    }
                }
                TransformHandleKind::Rotate => {}
            }
        } else {
            match handle {
                TransformHandleKind::N | TransformHandleKind::S => {
                    let centered_w = current_h * aspect;
                    let center_x = bounds.x + bounds.w / 2.0;
                    left = center_x - centered_w / 2.0;
                    right = center_x + centered_w / 2.0;
                }
                TransformHandleKind::W | TransformHandleKind::E => {
                    let centered_h = current_w / aspect.max(f32::EPSILON);
                    let center_y = bounds.y + bounds.h / 2.0;
                    top = center_y - centered_h / 2.0;
                    bottom = center_y + centered_h / 2.0;
                }
                TransformHandleKind::Nw
                | TransformHandleKind::Ne
                | TransformHandleKind::Se
                | TransformHandleKind::Sw => {
                    let adjusted_w = height_driven_w.max(min_size);
                    match handle {
                        TransformHandleKind::Nw | TransformHandleKind::Sw => {
                            left = right - adjusted_w;
                        }
                        TransformHandleKind::Ne | TransformHandleKind::Se => {
                            right = left + adjusted_w;
                        }
                        _ => {}
                    }
                }
                TransformHandleKind::Rotate => {}
            }
        }
    }

    if right - left < min_size {
        match handle {
            TransformHandleKind::W | TransformHandleKind::Nw | TransformHandleKind::Sw => {
                left = right - min_size;
            }
            _ => {
                right = left + min_size;
            }
        }
    }

    if bottom - top < min_size {
        match handle {
            TransformHandleKind::N | TransformHandleKind::Nw | TransformHandleKind::Ne => {
                top = bottom - min_size;
            }
            _ => {
                bottom = top + min_size;
            }
        }
    }

    EditorRect {
        x: left,
        y: top,
        w: (right - left).max(min_size),
        h: (bottom - top).max(min_size),
        rotation: bounds.rotation,
    }
}

fn selection_page<'a>(doc: &'a SceneDoc, selection: &[String]) -> Option<&'a kernel_doc::ScenePage> {
    if let Some(first_selected) = selection.first() {
        return doc
            .pages
            .iter()
            .find(|page| page.nodes.iter().any(|node| node.id == *first_selected));
    }

    doc.pages.first()
}

fn rect_anchors(rect: &EditorRect) -> (f32, f32, f32, f32, f32, f32) {
    (
        rect.x,
        rect.x + rect.w / 2.0,
        rect.x + rect.w,
        rect.y,
        rect.y + rect.h / 2.0,
        rect.y + rect.h,
    )
}

fn compute_move_snap(
    selection_bounds: &EditorRect,
    delta_x: f32,
    delta_y: f32,
    target_rects: &[EditorRect],
    target_guides: &[SceneGuide],
    threshold: f32,
) -> MoveSnapPreview {
    let moved_bounds = EditorRect {
        x: selection_bounds.x + delta_x,
        y: selection_bounds.y + delta_y,
        w: selection_bounds.w,
        h: selection_bounds.h,
        rotation: selection_bounds.rotation,
    };
    let (moved_left, moved_center_x, moved_right, moved_top, moved_center_y, moved_bottom) =
        rect_anchors(&moved_bounds);

    let mut best_x: Option<(f32, f32, f32, f32)> = None;
    let mut best_y: Option<(f32, f32, f32, f32)> = None;

    for target in target_rects {
        let (left, center_x, right, top, center_y, bottom) = rect_anchors(target);
        for current_x in [moved_left, moved_center_x, moved_right] {
            for target_x in [left, center_x, right] {
                let adjust = target_x - current_x;
                if adjust.abs() <= threshold
                    && best_x
                        .map(|(existing, _, _, _)| adjust.abs() < existing.abs())
                        .unwrap_or(true)
                {
                    best_x = Some((
                        adjust,
                        target_x,
                        moved_top.min(top),
                        moved_bottom.max(bottom),
                    ));
                }
            }
        }

        for current_y in [moved_top, moved_center_y, moved_bottom] {
            for target_y in [top, center_y, bottom] {
                let adjust = target_y - current_y;
                if adjust.abs() <= threshold
                    && best_y
                        .map(|(existing, _, _, _)| adjust.abs() < existing.abs())
                        .unwrap_or(true)
                {
                    best_y = Some((
                        adjust,
                        target_y,
                        moved_left.min(left),
                        moved_right.max(right),
                    ));
                }
            }
        }
    }

    for guide in target_guides {
        match guide.axis {
            GuideAxis::X => {
                for current_x in [moved_left, moved_center_x, moved_right] {
                    let adjust = guide.position as f32 - current_x;
                    if adjust.abs() <= threshold
                        && best_x
                            .map(|(existing, _, _, _)| adjust.abs() < existing.abs())
                            .unwrap_or(true)
                    {
                        best_x = Some((adjust, guide.position as f32, moved_top, moved_bottom));
                    }
                }
            }
            GuideAxis::Y => {
                for current_y in [moved_top, moved_center_y, moved_bottom] {
                    let adjust = guide.position as f32 - current_y;
                    if adjust.abs() <= threshold
                        && best_y
                            .map(|(existing, _, _, _)| adjust.abs() < existing.abs())
                            .unwrap_or(true)
                    {
                        best_y = Some((adjust, guide.position as f32, moved_left, moved_right));
                    }
                }
            }
        }
    }

    let mut guides = Vec::new();
    if let Some((_, position, span_start, span_end)) = best_x {
        guides.push(SnapGuide {
            axis: GuideAxis::X,
            position,
            span_start,
            span_end,
        });
    }
    if let Some((_, position, span_start, span_end)) = best_y {
        guides.push(SnapGuide {
            axis: GuideAxis::Y,
            position,
            span_start,
            span_end,
        });
    }

    MoveSnapPreview {
        delta_x: delta_x + best_x.map(|(adjust, _, _, _)| adjust).unwrap_or(0.0),
        delta_y: delta_y + best_y.map(|(adjust, _, _, _)| adjust).unwrap_or(0.0),
        guides,
    }
}

fn compute_resize_snap(
    original_bounds: &EditorRect,
    preview_bounds: &EditorRect,
    handle: TransformHandleKind,
    target_rects: &[EditorRect],
    target_guides: &[SceneGuide],
    threshold: f32,
) -> ResizeSnapPreview {
    let (preview_left, _, preview_right, preview_top, _, preview_bottom) = rect_anchors(preview_bounds);

    let active_x_values: Vec<f32> = match handle {
        TransformHandleKind::E | TransformHandleKind::Ne | TransformHandleKind::Se => {
            vec![preview_right]
        }
        TransformHandleKind::W | TransformHandleKind::Nw | TransformHandleKind::Sw => {
            vec![preview_left]
        }
        _ => Vec::new(),
    };
    let active_y_values: Vec<f32> = match handle {
        TransformHandleKind::S | TransformHandleKind::Se | TransformHandleKind::Sw => {
            vec![preview_bottom]
        }
        TransformHandleKind::N | TransformHandleKind::Ne | TransformHandleKind::Nw => {
            vec![preview_top]
        }
        _ => Vec::new(),
    };

    let mut best_x: Option<(f32, f32, f32, f32)> = None;
    let mut best_y: Option<(f32, f32, f32, f32)> = None;

    for target in target_rects {
        let (left, center_x, right, top, center_y, bottom) = rect_anchors(target);
        for current_x in &active_x_values {
            for target_x in [left, center_x, right] {
                let adjust = target_x - *current_x;
                if adjust.abs() <= threshold
                    && best_x
                        .map(|(existing, _, _, _)| adjust.abs() < existing.abs())
                        .unwrap_or(true)
                {
                    best_x = Some((
                        adjust,
                        target_x,
                        preview_bounds.y.min(top),
                        (preview_bounds.y + preview_bounds.h).max(bottom),
                    ));
                }
            }
        }

        for current_y in &active_y_values {
            for target_y in [top, center_y, bottom] {
                let adjust = target_y - *current_y;
                if adjust.abs() <= threshold
                    && best_y
                        .map(|(existing, _, _, _)| adjust.abs() < existing.abs())
                        .unwrap_or(true)
                {
                    best_y = Some((
                        adjust,
                        target_y,
                        preview_bounds.x.min(left),
                        (preview_bounds.x + preview_bounds.w).max(right),
                    ));
                }
            }
        }
    }

    for guide in target_guides {
        match guide.axis {
            GuideAxis::X => {
                for current_x in &active_x_values {
                    let adjust = guide.position as f32 - *current_x;
                    if adjust.abs() <= threshold
                        && best_x
                            .map(|(existing, _, _, _)| adjust.abs() < existing.abs())
                            .unwrap_or(true)
                    {
                        best_x = Some((
                            adjust,
                            guide.position as f32,
                            preview_bounds.y,
                            preview_bounds.y + preview_bounds.h,
                        ));
                    }
                }
            }
            GuideAxis::Y => {
                for current_y in &active_y_values {
                    let adjust = guide.position as f32 - *current_y;
                    if adjust.abs() <= threshold
                        && best_y
                            .map(|(existing, _, _, _)| adjust.abs() < existing.abs())
                            .unwrap_or(true)
                    {
                        best_y = Some((
                            adjust,
                            guide.position as f32,
                            preview_bounds.x,
                            preview_bounds.x + preview_bounds.w,
                        ));
                    }
                }
            }
        }
    }

    let mut bounds = preview_bounds.clone();
    if let Some((adjust, _, _, _)) = best_x {
        match handle {
            TransformHandleKind::E | TransformHandleKind::Ne | TransformHandleKind::Se => {
                bounds.w += adjust;
            }
            TransformHandleKind::W | TransformHandleKind::Nw | TransformHandleKind::Sw => {
                bounds.x += adjust;
                bounds.w -= adjust;
            }
            _ => {}
        }
    }
    if let Some((adjust, _, _, _)) = best_y {
        match handle {
            TransformHandleKind::S | TransformHandleKind::Se | TransformHandleKind::Sw => {
                bounds.h += adjust;
            }
            TransformHandleKind::N | TransformHandleKind::Ne | TransformHandleKind::Nw => {
                bounds.y += adjust;
                bounds.h -= adjust;
            }
            _ => {}
        }
    }

    let mut guides = Vec::new();
    if let Some((_, position, span_start, span_end)) = best_x {
        guides.push(SnapGuide {
            axis: GuideAxis::X,
            position,
            span_start,
            span_end,
        });
    }
    if let Some((_, position, span_start, span_end)) = best_y {
        guides.push(SnapGuide {
            axis: GuideAxis::Y,
            position,
            span_start,
            span_end,
        });
    }

    let (delta_x, delta_y) = resize_delta_from_bounds(original_bounds, &bounds, handle);
    ResizeSnapPreview {
        bounds: Some(bounds),
        delta_x,
        delta_y,
        guides,
    }
}

fn resize_delta_from_bounds(
    original_bounds: &EditorRect,
    bounds: &EditorRect,
    handle: TransformHandleKind,
) -> (f32, f32) {
    match handle {
        TransformHandleKind::N => (0.0, bounds.y - original_bounds.y),
        TransformHandleKind::Ne => (
            bounds.x + bounds.w - (original_bounds.x + original_bounds.w),
            bounds.y - original_bounds.y,
        ),
        TransformHandleKind::E => (
            bounds.x + bounds.w - (original_bounds.x + original_bounds.w),
            0.0,
        ),
        TransformHandleKind::Se => (
            bounds.x + bounds.w - (original_bounds.x + original_bounds.w),
            bounds.y + bounds.h - (original_bounds.y + original_bounds.h),
        ),
        TransformHandleKind::S => (0.0, bounds.y + bounds.h - (original_bounds.y + original_bounds.h)),
        TransformHandleKind::Sw => (
            bounds.x - original_bounds.x,
            bounds.y + bounds.h - (original_bounds.y + original_bounds.h),
        ),
        TransformHandleKind::W => (bounds.x - original_bounds.x, 0.0),
        TransformHandleKind::Nw => (bounds.x - original_bounds.x, bounds.y - original_bounds.y),
        TransformHandleKind::Rotate => (0.0, 0.0),
    }
}

fn select_in_rect(
    doc: &SceneDoc,
    current_selection: &[String],
    page_id: &str,
    rect: &EditorRect,
    mode: SelectionSetMode,
) -> Result<Vec<String>, CoreError> {
    let page = doc
        .pages
        .iter()
        .find(|page| page.id == page_id)
        .ok_or_else(|| {
            CoreError::new(
                "scene.page.not_found",
                format!("Page '{}' was not found.", page_id),
            )
        })?;

    let hit_ids: Vec<String> = page
        .nodes
        .iter()
        .filter(|node| rects_intersect(&node.frame, rect))
        .map(|node| node.id.clone())
        .collect();

    let next = match mode {
        SelectionSetMode::Replace => hit_ids,
        SelectionSetMode::Add => dedupe_ids(
            current_selection
                .iter()
                .cloned()
                .chain(hit_ids)
                .collect(),
        ),
        SelectionSetMode::Toggle => {
            let hits: HashSet<&str> = hit_ids.iter().map(String::as_str).collect();
            let mut toggled: Vec<String> = current_selection
                .iter()
                .filter(|selected| !hits.contains(selected.as_str()))
                .cloned()
                .collect();

            for hit in hit_ids {
                if !current_selection.iter().any(|selected| selected == &hit) {
                    toggled.push(hit);
                }
            }

            toggled
        }
    };

    Ok(next)
}

fn point_inside_rect(frame: &EditorRect, x: f32, y: f32) -> bool {
    x >= frame.x && y >= frame.y && x <= frame.x + frame.w && y <= frame.y + frame.h
}

fn rects_intersect(a: &EditorRect, b: &EditorRect) -> bool {
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

fn dedupe_ids(ids: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut ordered = Vec::new();

    for id in ids {
        if seen.insert(id.clone()) {
            ordered.push(id);
        }
    }

    ordered
}

fn normalize_degrees(value: f32) -> f32 {
    let normalized = value.rem_euclid(360.0);
    if normalized > 180.0 {
        normalized - 360.0
    } else {
        normalized
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use kernel_doc::{
        HorizontalConstraint, SceneDocMeta, SceneNodeKind, ScenePage, ShapeNodeData,
        ShapePrimitive, TextAlign, TextNodeData, VerticalConstraint,
    };

    fn sample_doc() -> SceneDoc {
        SceneDoc {
            schema_version: 2,
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
                        children: Some(vec!["title".to_string()]),
                        frame: EditorRect {
                            x: 0.0,
                            y: 0.0,
                            w: 100.0,
                            h: 100.0,
                            rotation: 0.0,
                        },
                        constraints: None,
                        layout: None,
                        text: None,
                        shape: None,
                        component: None,
                        instance: None,
                    },
                    SceneNode {
                        id: "title".to_string(),
                        kind: SceneNodeKind::Text,
                        name: "Title".to_string(),
                        parent_id: Some("root".to_string()),
                        children: None,
                        frame: EditorRect {
                            x: 10.0,
                            y: 10.0,
                            w: 40.0,
                            h: 20.0,
                            rotation: 0.0,
                        },
                        constraints: None,
                        layout: None,
                        text: Some(TextNodeData {
                            content: "Title".to_string(),
                            font_family: "Inter".to_string(),
                            font_size: 20.0,
                            font_weight: 700,
                            line_height: 24.0,
                            letter_spacing: 0.0,
                            align: TextAlign::Left,
                            color: "#0f172a".to_string(),
                            sizing: TextSizingMode::AutoHeight,
                        }),
                        shape: None,
                        component: None,
                        instance: None,
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
    fn rename_and_move_commands_update_snapshot() {
        let mut state = EditorState::new(sample_doc());
        let result = dispatch_commands(
            &mut state,
            vec![
                EditorCommand::RenameNode {
                    node_id: "title".to_string(),
                    name: "Hero Title".to_string(),
                },
                EditorCommand::MoveNode {
                    node_id: "title".to_string(),
                    frame: FramePatch {
                        x: Some(20.0),
                        ..FramePatch::default()
                    },
                },
            ],
        )
        .expect("dispatch should succeed");

        let node = query_node(&result.snapshot.doc, "title").expect("node exists");
        assert_eq!(node.name, "Hero Title");
        assert_eq!(node.frame.x, 20.0);
        assert_eq!(result.snapshot.version, 3);
        assert_eq!(result.dirty_node_ids, vec!["title".to_string()]);
    }

    #[test]
    fn delete_command_removes_subtree() {
        let mut doc = sample_doc();
        doc.pages[0].nodes.push(SceneNode {
            id: "leaf".to_string(),
            kind: SceneNodeKind::Shape,
            name: "Leaf".to_string(),
            parent_id: Some("title".to_string()),
            children: None,
            frame: EditorRect {
                x: 0.0,
                y: 0.0,
                w: 10.0,
                h: 10.0,
                rotation: 0.0,
            },
            constraints: None,
            layout: None,
            text: None,
            shape: Some(ShapeNodeData {
                primitive: ShapePrimitive::Rect,
                fill: "#2859ff".to_string(),
                stroke_color: "#1d4ed8".to_string(),
                stroke_width: 1.0,
                corner_radius: 0.0,
                opacity: 1.0,
                path: None,
            }),
            component: None,
            instance: None,
        });
        doc.pages[0].nodes[1].children = Some(vec!["leaf".to_string()]);

        let mut state = EditorState::new(doc);
        dispatch_commands(
            &mut state,
            vec![EditorCommand::DeleteNode {
                node_id: "title".to_string(),
            }],
        )
        .expect("delete should succeed");

        assert!(query_node(&state.doc, "title").is_none());
        assert!(query_node(&state.doc, "leaf").is_none());
    }

    #[test]
    fn hit_test_returns_topmost_node() {
        let mut doc = sample_doc();
        doc.pages[0].nodes.push(SceneNode {
            id: "overlay".to_string(),
            kind: SceneNodeKind::Shape,
            name: "Overlay".to_string(),
            parent_id: Some("root".to_string()),
            children: None,
            frame: EditorRect {
                x: 5.0,
                y: 5.0,
                w: 50.0,
                h: 40.0,
                rotation: 0.0,
            },
            constraints: None,
            layout: None,
            text: None,
            shape: Some(ShapeNodeData {
                primitive: ShapePrimitive::Rect,
                fill: "#2859ff".to_string(),
                stroke_color: "#1d4ed8".to_string(),
                stroke_width: 1.0,
                corner_radius: 0.0,
                opacity: 1.0,
                path: None,
            }),
            component: None,
            instance: None,
        });

        let result = hit_test(&doc, "page-1", 15.0, 15.0, HitTestMode::Topmost)
            .expect("hit test should succeed");

        assert_eq!(result.top_node_id.as_deref(), Some("overlay"));
        assert_eq!(result.node_ids, vec!["overlay".to_string()]);
    }

    #[test]
    fn selection_bounds_unions_selected_nodes() {
        let doc = sample_doc();
        let bounds = selection_bounds(&doc, &["root".to_string(), "title".to_string()])
            .expect("selection bounds should exist");

        assert_eq!(bounds.x, 0.0);
        assert_eq!(bounds.y, 0.0);
        assert_eq!(bounds.w, 100.0);
        assert_eq!(bounds.h, 100.0);
    }

    #[test]
    fn select_in_rect_replaces_selection() {
        let doc = sample_doc();
        let selected = select_in_rect(
            &doc,
            &[],
            "page-1",
            &EditorRect {
                x: 5.0,
                y: 5.0,
                w: 50.0,
                h: 40.0,
                rotation: 0.0,
            },
            SelectionSetMode::Replace,
        )
        .expect("select in rect should succeed");

        assert_eq!(selected, vec!["root".to_string(), "title".to_string()]);
    }

    #[test]
    fn selection_handles_include_rotate_handle() {
        let handles = selection_handles(&EditorRect {
            x: 10.0,
            y: 20.0,
            w: 40.0,
            h: 30.0,
            rotation: 0.0,
        });

        assert_eq!(handles.len(), 9);
        assert!(handles
            .iter()
            .any(|handle| handle.kind == TransformHandleKind::Rotate));
    }

    #[test]
    fn resize_selection_expands_selected_node() {
        let mut doc = sample_doc();
        let resized = resize_selection(
            &mut doc,
            &["title".to_string()],
            TransformHandleKind::Se,
            10.0,
            5.0,
            false,
        )
        .expect("resize should succeed");

        assert_eq!(resized, vec!["title".to_string()]);
        let node = query_node(&doc, "title").expect("node exists");
        assert_eq!(node.frame.w, 50.0);
        assert_eq!(node.frame.h, 48.0);
    }

    #[test]
    fn resizing_parent_applies_child_constraints() {
        let mut doc = sample_doc();
        doc.pages[0].nodes[1].constraints = Some(kernel_doc::NodeConstraints {
            horizontal: HorizontalConstraint::Stretch,
            vertical: VerticalConstraint::Max,
        });

        let resized = resize_selection(
            &mut doc,
            &["root".to_string()],
            TransformHandleKind::Se,
            20.0,
            30.0,
            false,
        )
        .expect("resize should succeed");

        assert!(resized.iter().any(|id| id == "root"));
        assert!(resized.iter().any(|id| id == "title"));
        let node = query_node(&doc, "title").expect("node exists");
        assert!((node.frame.x - 10.0).abs() < 0.001);
        assert!((node.frame.y - 40.0).abs() < 0.001);
        assert!((node.frame.w - 60.0).abs() < 0.001);
        assert!((node.frame.h - 24.0).abs() < 0.001);
    }

    #[test]
    fn move_selection_offsets_selected_nodes() {
        let mut doc = sample_doc();
        let moved = move_selection(&mut doc, &["title".to_string()], 8.0, -4.0)
            .expect("move selection should succeed");

        assert_eq!(moved, vec!["title".to_string()]);
        let node = query_node(&doc, "title").expect("node exists");
        assert_eq!(node.frame.x, 18.0);
        assert_eq!(node.frame.y, 6.0);
    }

    #[test]
    fn rotate_selection_updates_node_position_and_rotation() {
        let mut doc = sample_doc();
        let rotated = rotate_selection(&mut doc, &["title".to_string()], 90.0)
            .expect("rotate selection should succeed");

        assert_eq!(rotated, vec!["title".to_string()]);
        let node = query_node(&doc, "title").expect("node exists");
        assert_eq!(node.frame.rotation, 90.0);
        assert_eq!(node.frame.x, 10.0);
        assert_eq!(node.frame.y, 10.0);
    }

    #[test]
    fn guide_commands_update_page_guides() {
        let mut state = EditorState::new(sample_doc());
        dispatch_commands(
            &mut state,
            vec![EditorCommand::AddGuide {
                page_id: "page-1".to_string(),
                guide: SceneGuide {
                    id: "guide-1".to_string(),
                    axis: GuideAxis::X,
                    position: 120,
                },
            }],
        )
        .expect("add guide should succeed");

        assert_eq!(state.doc.pages[0].guides.len(), 1);
        assert_eq!(state.doc.pages[0].guides[0].position, 120);

        dispatch_commands(
            &mut state,
            vec![EditorCommand::MoveGuide {
                page_id: "page-1".to_string(),
                guide_id: "guide-1".to_string(),
                position: 200,
            }],
        )
        .expect("move guide should succeed");

        assert_eq!(state.doc.pages[0].guides[0].position, 200);

        dispatch_commands(
            &mut state,
            vec![EditorCommand::DeleteGuide {
                page_id: "page-1".to_string(),
                guide_id: "guide-1".to_string(),
            }],
        )
        .expect("delete guide should succeed");

        assert!(state.doc.pages[0].guides.is_empty());
    }

    #[test]
    fn set_node_constraints_updates_node() {
        let mut state = EditorState::new(sample_doc());

        dispatch_commands(
            &mut state,
            vec![EditorCommand::SetNodeConstraints {
                node_id: "title".to_string(),
                constraints: kernel_doc::NodeConstraints {
                    horizontal: HorizontalConstraint::Stretch,
                    vertical: VerticalConstraint::Scale,
                },
            }],
        )
        .expect("set constraints should succeed");

        let node = query_node(&state.doc, "title").expect("node exists");
        let constraints = node.constraints.as_ref().expect("constraints should exist");
        assert_eq!(constraints.horizontal, HorizontalConstraint::Stretch);
        assert_eq!(constraints.vertical, VerticalConstraint::Scale);
    }

    #[test]
    fn set_node_auto_layout_reflows_direct_children() {
        let mut doc = sample_doc();
        doc.pages[0].nodes[0].children = Some(vec!["title".to_string(), "body".to_string()]);
        doc.pages[0].nodes.push(SceneNode {
            id: "body".to_string(),
            kind: SceneNodeKind::Text,
            name: "Body".to_string(),
            parent_id: Some("root".to_string()),
            children: None,
            frame: EditorRect {
                x: 48.0,
                y: 48.0,
                w: 60.0,
                h: 20.0,
                rotation: 0.0,
            },
            constraints: None,
            layout: None,
            text: Some(TextNodeData {
                content: "Body copy".to_string(),
                font_family: "Inter".to_string(),
                font_size: 16.0,
                font_weight: 500,
                line_height: 22.0,
                letter_spacing: 0.0,
                align: TextAlign::Left,
                color: "#475569".to_string(),
                sizing: TextSizingMode::AutoHeight,
            }),
            shape: None,
            component: None,
            instance: None,
        });

        let mut state = EditorState::new(doc);
        dispatch_commands(
            &mut state,
            vec![EditorCommand::SetNodeAutoLayout {
                node_id: "root".to_string(),
                layout: Some(kernel_doc::AutoLayoutData {
                    direction: kernel_doc::AutoLayoutDirection::Vertical,
                    gap: 12.0,
                    padding_x: 16.0,
                    padding_y: 20.0,
                    align: kernel_doc::AutoLayoutAlign::Start,
                }),
            }],
        )
        .expect("set auto layout should succeed");

        let title = query_node(&state.doc, "title").expect("title exists");
        let body = query_node(&state.doc, "body").expect("body exists");
        assert_eq!(title.frame.x, 16.0);
        assert_eq!(title.frame.y, 20.0);
        assert_eq!(body.frame.x, 16.0);
        assert_eq!(body.frame.y, title.frame.y + title.frame.h + 12.0);
    }

    #[test]
    fn set_text_content_and_style_updates_text_node() {
        let mut state = EditorState::new(sample_doc());

        dispatch_commands(
            &mut state,
            vec![
                EditorCommand::SetTextContent {
                    node_id: "title".to_string(),
                    content: "Updated headline".to_string(),
                },
                EditorCommand::SetTextStyle {
                    node_id: "title".to_string(),
                    style: TextStylePatch {
                        font_size: Some(28.0),
                        line_height: Some(34.0),
                        color: Some("#2859ff".to_string()),
                        ..TextStylePatch::default()
                    },
                },
            ],
        )
        .expect("text commands should succeed");

        let node = query_node(&state.doc, "title").expect("node exists");
        let text = node.text.as_ref().expect("text data exists");
        assert_eq!(text.content, "Updated headline");
        assert_eq!(text.font_size, 28.0);
        assert_eq!(text.line_height, 34.0);
        assert_eq!(text.color, "#2859ff");
        assert!(node.frame.h >= 34.0);
    }

    #[test]
    fn auto_height_text_reflows_on_width_change() {
        let mut state = EditorState::new(sample_doc());

        dispatch_commands(
            &mut state,
            vec![EditorCommand::MoveNode {
                node_id: "title".to_string(),
                frame: FramePatch {
                    w: Some(20.0),
                    ..FramePatch::default()
                },
            }],
        )
        .expect("move node should succeed");

        let node = query_node(&state.doc, "title").expect("node exists");
        assert_eq!(node.frame.w, 20.0);
        assert!(node.frame.h > 24.0);
    }

    #[test]
    fn set_text_sizing_fixed_preserves_manual_height() {
        let mut state = EditorState::new(sample_doc());

        dispatch_commands(
            &mut state,
            vec![
                EditorCommand::SetTextSizing {
                    node_id: "title".to_string(),
                    sizing: TextSizingMode::Fixed,
                },
                EditorCommand::MoveNode {
                    node_id: "title".to_string(),
                    frame: FramePatch {
                        w: Some(20.0),
                        h: Some(20.0),
                        ..FramePatch::default()
                    },
                },
            ],
        )
        .expect("fixed sizing commands should succeed");

        let node = query_node(&state.doc, "title").expect("node exists");
        let text = node.text.as_ref().expect("text data exists");
        assert_eq!(text.sizing, TextSizingMode::Fixed);
        assert_eq!(node.frame.h, 20.0);
    }

    #[test]
    fn set_shape_path_updates_shape_node() {
        let mut doc = sample_doc();
        doc.pages[0].nodes.push(SceneNode {
            id: "path-demo".to_string(),
            kind: SceneNodeKind::Shape,
            name: "Path Demo".to_string(),
            parent_id: Some("root".to_string()),
            children: None,
            frame: EditorRect {
                x: 12.0,
                y: 12.0,
                w: 120.0,
                h: 80.0,
                rotation: 0.0,
            },
            constraints: None,
            layout: None,
            text: None,
            shape: Some(ShapeNodeData {
                primitive: ShapePrimitive::Rect,
                fill: "#93c5fd".to_string(),
                stroke_color: "#1d4ed8".to_string(),
                stroke_width: 2.0,
                corner_radius: 0.0,
                opacity: 1.0,
                path: None,
            }),
            component: None,
            instance: None,
        });

        let mut state = EditorState::new(doc);
        dispatch_commands(
            &mut state,
            vec![EditorCommand::SetShapePath {
                node_id: "path-demo".to_string(),
                path: kernel_doc::ShapePathData {
                    points: vec![
                        kernel_doc::ShapePathPoint {
                            x: 0.0,
                            y: 64.0,
                            handle_in: None,
                            handle_out: None,
                        },
                        kernel_doc::ShapePathPoint {
                            x: 40.0,
                            y: 8.0,
                            handle_in: None,
                            handle_out: None,
                        },
                        kernel_doc::ShapePathPoint {
                            x: 88.0,
                            y: 40.0,
                            handle_in: None,
                            handle_out: None,
                        },
                    ],
                    closed: true,
                },
            }],
        )
        .expect("set shape path should succeed");

        let node = query_node(&state.doc, "path-demo").expect("node exists");
        let shape = node.shape.as_ref().expect("shape data exists");
        assert_eq!(shape.primitive, ShapePrimitive::Path);
        assert_eq!(shape.path.as_ref().expect("path exists").points.len(), 3);
        assert!(state
            .validation()
            .issues
            .iter()
            .all(|issue| issue.code != "scene_shape.path.points.invalid"));
    }

    #[test]
    fn set_component_key_syncs_existing_instances() {
        let mut state = EditorState::new(sample_doc());

        dispatch_commands(
            &mut state,
            vec![EditorCommand::PromoteToComponent {
                node_id: "root".to_string(),
                component_key: Some("hero-card".to_string()),
            }],
        )
        .expect("promote should succeed");

        dispatch_commands(
            &mut state,
            vec![EditorCommand::CreateInstanceFromComponent {
                page_id: "page-1".to_string(),
                source_node_id: "root".to_string(),
                offset_x: Some(120.0),
                offset_y: Some(0.0),
            }],
        )
        .expect("instance create should succeed");

        let instance_id = state.selection.first().cloned().expect("instance selected");

        dispatch_commands(
            &mut state,
            vec![EditorCommand::SetComponentKey {
                node_id: "root".to_string(),
                component_key: "hero-card-v2".to_string(),
            }],
        )
        .expect("set component key should succeed");

        let instance_root = query_node(&state.doc, &instance_id).expect("instance exists");
        assert_eq!(
            instance_root
                .instance
                .as_ref()
                .map(|instance| instance.source_component_key.as_str()),
            Some("hero-card-v2")
        );
    }

    #[test]
    fn refresh_and_detach_instance_flow_updates_subtree() {
        let mut state = EditorState::new(sample_doc());

        dispatch_commands(
            &mut state,
            vec![
                EditorCommand::PromoteToComponent {
                    node_id: "root".to_string(),
                    component_key: Some("hero-card".to_string()),
                },
                EditorCommand::CreateInstanceFromComponent {
                    page_id: "page-1".to_string(),
                    source_node_id: "root".to_string(),
                    offset_x: Some(120.0),
                    offset_y: Some(0.0),
                },
            ],
        )
        .expect("component + instance should succeed");

        let instance_id = state.selection.first().cloned().expect("instance root selected");

        dispatch_commands(
            &mut state,
            vec![EditorCommand::SetTextContent {
                node_id: "title".to_string(),
                content: "Updated source".to_string(),
            }],
        )
        .expect("source text update should succeed");

        dispatch_commands(
            &mut state,
            vec![EditorCommand::RefreshInstance {
                node_id: instance_id.clone(),
            }],
        )
        .expect("refresh should succeed");

        let instance_root = query_node(&state.doc, &instance_id).expect("instance exists after refresh");
        let instance_child_id = instance_root
            .children
            .as_ref()
            .and_then(|children| children.first())
            .cloned()
            .expect("instance child exists");
        let instance_child = query_node(&state.doc, &instance_child_id).expect("instance child exists");
        assert_eq!(
            instance_child
                .text
                .as_ref()
                .map(|text| text.content.as_str()),
            Some("Updated source")
        );

        dispatch_commands(
            &mut state,
            vec![EditorCommand::DetachInstance {
                node_id: instance_id.clone(),
            }],
        )
        .expect("detach should succeed");

        let detached = query_node(&state.doc, &instance_id).expect("detached root exists");
        assert!(matches!(detached.kind, SceneNodeKind::Frame));
        assert!(detached.instance.is_none());
    }
}
