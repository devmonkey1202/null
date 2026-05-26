use core_error::CoreError;
use kernel_doc::{
    validate_scene_doc, EditorCommand, EditorRect, EditorSnapshot, EditorViewport, FramePatch,
    SceneDoc, SceneNode, ValidationReport,
};
use std::collections::HashSet;

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

    for command in commands {
        match command {
            EditorCommand::SelectNodes { node_ids } => {
                state.selection = node_ids
                    .into_iter()
                    .filter(|node_id| node_exists(&state.doc, node_id))
                    .collect();
                applied_commands.push("select_nodes".to_string());
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
            }
            EditorCommand::MoveNode { node_id, frame } => {
                let node = find_node_mut(&mut state.doc, &node_id)?;
                apply_frame_patch(&mut node.frame, frame);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("move_node".to_string());
            }
            EditorCommand::CreateNode { page_id, node } => {
                create_node(&mut state.doc, &page_id, node)?;
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("create_node".to_string());
            }
            EditorCommand::DeleteNode { node_id } => {
                delete_node(&mut state.doc, &node_id)?;
                state.selection.retain(|selected| selected != &node_id);
                state.version += 1;
                touch_doc(&mut state.doc);
                applied_commands.push("delete_node".to_string());
            }
        }
    }

    Ok(EditorApplyResult {
        snapshot: state.snapshot(),
        validation: state.validation(),
        applied_commands,
    })
}

pub fn query_node<'a>(doc: &'a SceneDoc, node_id: &str) -> Option<&'a SceneNode> {
    doc.pages
        .iter()
        .flat_map(|page| page.nodes.iter())
        .find(|node| node.id == node_id)
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

fn delete_node(doc: &mut SceneDoc, node_id: &str) -> Result<(), CoreError> {
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
        return Ok(());
    }

    Err(CoreError::new(
        "scene.node.not_found",
        format!("Node '{}' was not found.", node_id),
    ))
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

#[cfg(test)]
mod tests {
    use super::*;
    use kernel_doc::{SceneDocMeta, SceneNodeKind, ScenePage};

    fn sample_doc() -> SceneDoc {
        SceneDoc {
            schema_version: 2,
            document_id: "doc-1".to_string(),
            title: "Sample".to_string(),
            pages: vec![ScenePage {
                id: "page-1".to_string(),
                name: "Canvas".to_string(),
                root_id: "root".to_string(),
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
}
