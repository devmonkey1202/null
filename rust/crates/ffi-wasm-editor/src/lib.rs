use core_error::CoreError;
use kernel_doc::{parse_scene_doc, serialize_scene_doc, EditorCommand, ValidationReport};
use kernel_history::HistoryStore;
use kernel_scene::{dispatch_commands, query_node, EditorState};
use serde_json::json;
use std::cell::RefCell;

#[derive(Default)]
pub struct EditorBridgeHandle {
    state: RefCell<Option<EditorState>>,
    history: RefCell<HistoryStore>,
}

impl EditorBridgeHandle {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn load_document(&self, serialized_doc: &str) -> Result<String, CoreError> {
        if serialized_doc.is_empty() {
            return Err(CoreError::new("editor.load.empty", "serialized_doc is empty"));
        }

        let doc = parse_scene_doc(serialized_doc)?;
        let state = EditorState::new(doc);
        let snapshot = state.snapshot();
        self.history.borrow_mut().seed(snapshot.clone());
        *self.state.borrow_mut() = Some(state);

        serde_json::to_string(&snapshot)
            .map_err(|error| CoreError::new("editor.snapshot.serialize_failed", error.to_string()))
    }

    pub fn dispatch_editor_commands(&self, commands_json: &str) -> Result<String, CoreError> {
        if commands_json.is_empty() {
            return Err(CoreError::new("editor.command.empty", "commands_json is empty"));
        }

        let commands: Vec<EditorCommand> = serde_json::from_str(commands_json)
            .map_err(|error| CoreError::new("editor.command.parse_failed", error.to_string()))?;

        let mut state = self.state.borrow_mut();
        let editor_state = state
            .as_mut()
            .ok_or_else(|| CoreError::new("editor.state.missing", "No document has been loaded."))?;

        let mut history = self.history.borrow_mut();
        let mut scene_commands = Vec::new();
        let mut history_result = None;

        for command in commands {
            match command {
                EditorCommand::Undo => {
                    let snapshot = history.undo()?;
                    *editor_state = EditorState {
                        version: snapshot.version,
                        doc: snapshot.doc.clone(),
                        selection: snapshot.selection.clone(),
                        viewport: snapshot.viewport.clone(),
                    };

                    history_result = Some(json!({
                        "snapshot": snapshot,
                        "validation": editor_state.validation(),
                        "appliedCommands": ["undo"],
                        "dirtyNodeIds": [],
                    }));
                }
                EditorCommand::Redo => {
                    let snapshot = history.redo()?;
                    *editor_state = EditorState {
                        version: snapshot.version,
                        doc: snapshot.doc.clone(),
                        selection: snapshot.selection.clone(),
                        viewport: snapshot.viewport.clone(),
                    };

                    history_result = Some(json!({
                        "snapshot": snapshot,
                        "validation": editor_state.validation(),
                        "appliedCommands": ["redo"],
                        "dirtyNodeIds": [],
                    }));
                }
                other => scene_commands.push(other),
            }
        }

        if let Some(history_only) = history_result {
            if scene_commands.is_empty() {
                return serde_json::to_string(&history_only).map_err(|error| {
                    CoreError::new("editor.apply.serialize_failed", error.to_string())
                });
            }
        }

        let result = dispatch_commands(editor_state, scene_commands)?;
        if !result.applied_commands.is_empty() {
            history.push(result.snapshot.clone());
        }

        serde_json::to_string(&json!({
            "snapshot": result.snapshot,
            "validation": result.validation,
            "appliedCommands": result.applied_commands,
            "dirtyNodeIds": result.dirty_node_ids,
        }))
        .map_err(|error| CoreError::new("editor.apply.serialize_failed", error.to_string()))
    }

    pub fn query_node(&self, node_id: &str) -> Result<String, CoreError> {
        let state = self.state.borrow();
        let editor_state = state
            .as_ref()
            .ok_or_else(|| CoreError::new("editor.state.missing", "No document has been loaded."))?;

        let node = query_node(&editor_state.doc, node_id)
            .ok_or_else(|| CoreError::new("editor.node.not_found", format!("Node '{}' was not found.", node_id)))?;

        serde_json::to_string(node)
            .map_err(|error| CoreError::new("editor.node.serialize_failed", error.to_string()))
    }

    pub fn run_validation(&self) -> Result<String, CoreError> {
        let state = self.state.borrow();
        let editor_state = state
            .as_ref()
            .ok_or_else(|| CoreError::new("editor.state.missing", "No document has been loaded."))?;

        serialize_validation(editor_state.validation())
    }

    pub fn export_document(&self) -> Result<String, CoreError> {
        let state = self.state.borrow();
        let editor_state = state
            .as_ref()
            .ok_or_else(|| CoreError::new("editor.state.missing", "No document has been loaded."))?;

        serialize_scene_doc(&editor_state.doc)
    }
}

fn serialize_validation(report: ValidationReport) -> Result<String, CoreError> {
    serde_json::to_string(&report)
        .map_err(|error| CoreError::new("editor.validation.serialize_failed", error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use kernel_doc::{SceneDoc, SceneDocMeta, SceneNode, SceneNodeKind, ScenePage, SCHEMA_VERSION};

    fn sample_doc_json() -> String {
        let doc = SceneDoc {
            schema_version: SCHEMA_VERSION,
            document_id: "doc-bridge".to_string(),
            title: "Bridge".to_string(),
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
                        frame: kernel_doc::EditorRect {
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
                        frame: kernel_doc::EditorRect {
                            x: 10.0,
                            y: 12.0,
                            w: 50.0,
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
        };

        serde_json::to_string(&doc).expect("sample doc should serialize")
    }

    #[test]
    fn bridge_loads_document_and_dispatches_commands() {
        let bridge = EditorBridgeHandle::new();
        let snapshot_raw = bridge.load_document(&sample_doc_json()).expect("load doc");
        assert!(snapshot_raw.contains("\"documentId\":\"doc-bridge\""));

        let commands = serde_json::to_string(&vec![
            EditorCommand::SelectNodes {
                node_ids: vec!["title".to_string()],
            },
            EditorCommand::RenameNode {
                node_id: "title".to_string(),
                name: "Headline".to_string(),
            },
        ])
        .expect("commands should serialize");

        let result_raw = bridge
            .dispatch_editor_commands(&commands)
            .expect("dispatch should succeed");

        assert!(result_raw.contains("\"Headline\""));
        assert!(result_raw.contains("\"appliedCommands\":[\"select_nodes\",\"rename_node\"]"));
        assert!(result_raw.contains("\"dirtyNodeIds\":[\"title\"]"));
    }

    #[test]
    fn bridge_supports_undo_and_redo() {
        let bridge = EditorBridgeHandle::new();
        let _ = bridge.load_document(&sample_doc_json()).expect("load doc");

        let rename_commands = serde_json::to_string(&vec![EditorCommand::RenameNode {
            node_id: "title".to_string(),
            name: "Updated Hero".to_string(),
        }])
        .expect("rename commands should serialize");

        let renamed = bridge
            .dispatch_editor_commands(&rename_commands)
            .expect("rename should succeed");
        assert!(renamed.contains("\"Updated Hero\""));

        let undo = bridge
            .dispatch_editor_commands(r#"[{"kind":"undo"}]"#)
            .expect("undo should succeed");
        assert!(undo.contains("\"Title\""));

        let redo = bridge
            .dispatch_editor_commands(r#"[{"kind":"redo"}]"#)
            .expect("redo should succeed");
        assert!(redo.contains("\"Updated Hero\""));
    }
}
