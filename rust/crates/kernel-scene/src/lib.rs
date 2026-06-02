use core_error::CoreError;
use kernel_doc::{
    validate_scene_doc, EditorCommand, EditorRect, EditorSnapshot, EditorViewport, FramePatch,
    HorizontalConstraint, SceneDoc, SceneGuide, SceneNode, SelectionSetMode, TransformHandleKind,
    ValidationReport, VerticalConstraint,
};
use std::collections::HashSet;

#[cfg(test)]
use kernel_doc::GuideAxis;

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
    pub fn new(doc: SceneDoc) -> Self {
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
            EditorCommand::SetNodeConstraints {
                node_id,
                constraints,
            } => {
                let node = find_node_mut(&mut state.doc, &node_id)?;
                node.constraints = Some(constraints);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("set_node_constraints".to_string());
                dirty_node_ids.push(node_id);
            }
            EditorCommand::MoveSelection { delta_x, delta_y } => {
                let moved = move_selection(&mut state.doc, &state.selection, delta_x, delta_y)?;
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
            }
            EditorCommand::RotateSelection { delta_deg } => {
                let rotated = rotate_selection(&mut state.doc, &state.selection, delta_deg)?;
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
        HorizontalConstraint, SceneDocMeta, SceneNodeKind, ScenePage, VerticalConstraint,
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
        assert_eq!(node.frame.h, 25.0);
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
        assert!((node.frame.h - 20.0).abs() < 0.001);
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
}
