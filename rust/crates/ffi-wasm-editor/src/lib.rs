use core_error::CoreError;
use kernel_doc::{parse_scene_doc, serialize_scene_doc, EditorCommand, TransformHandleKind, ValidationReport};
use kernel_history::HistoryStore;
use kernel_scene::{
    dispatch_commands, hit_test, move_snap_preview, query_node, resize_snap_preview,
    selection_bounds, selection_handles, EditorState, HitTestMode,
};
use serde_json::json;
use std::cell::RefCell;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

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

    pub fn hit_test(&self, page_id: &str, x: f32, y: f32, mode: &str) -> Result<String, CoreError> {
        let state = self.state.borrow();
        let editor_state = state
            .as_ref()
            .ok_or_else(|| CoreError::new("editor.state.missing", "No document has been loaded."))?;

        let mode = match mode {
            "all" => HitTestMode::All,
            _ => HitTestMode::Topmost,
        };

        let result = hit_test(&editor_state.doc, page_id, x, y, mode)?;
        serde_json::to_string(&json!({
            "pageId": result.page_id,
            "nodeIds": result.node_ids,
            "topNodeId": result.top_node_id,
        }))
        .map_err(|error| CoreError::new("editor.hit_test.serialize_failed", error.to_string()))
    }

    pub fn selection_bounds(&self) -> Result<String, CoreError> {
        let state = self.state.borrow();
        let editor_state = state
            .as_ref()
            .ok_or_else(|| CoreError::new("editor.state.missing", "No document has been loaded."))?;

        serde_json::to_string(&selection_bounds(&editor_state.doc, &editor_state.selection))
            .map_err(|error| CoreError::new("editor.selection_bounds.serialize_failed", error.to_string()))
    }

    pub fn transform_handles(&self) -> Result<String, CoreError> {
        let state = self.state.borrow();
        let editor_state = state
            .as_ref()
            .ok_or_else(|| CoreError::new("editor.state.missing", "No document has been loaded."))?;

        let handles = selection_bounds(&editor_state.doc, &editor_state.selection)
            .map(|bounds| selection_handles(&bounds))
            .unwrap_or_default();

        serde_json::to_string(
            &handles
                .into_iter()
                .map(|handle| {
                    json!({
                        "kind": transform_handle_kind_name(handle.kind),
                        "x": handle.x,
                        "y": handle.y,
                        "cursor": handle.cursor,
                    })
                })
                .collect::<Vec<_>>(),
        )
        .map_err(|error| CoreError::new("editor.transform_handles.serialize_failed", error.to_string()))
    }

    pub fn move_snap(
        &self,
        delta_x: f32,
        delta_y: f32,
        threshold: Option<f32>,
    ) -> Result<String, CoreError> {
        let state = self.state.borrow();
        let editor_state = state
            .as_ref()
            .ok_or_else(|| CoreError::new("editor.state.missing", "No document has been loaded."))?;

        let preview = move_snap_preview(
            &editor_state.doc,
            &editor_state.selection,
            delta_x,
            delta_y,
            threshold.unwrap_or(8.0),
        );

        serde_json::to_string(&json!({
            "deltaX": preview.delta_x,
            "deltaY": preview.delta_y,
            "guides": preview.guides.into_iter().map(|guide| json!({
                "axis": match guide.axis {
                    kernel_doc::GuideAxis::X => "x",
                    kernel_doc::GuideAxis::Y => "y",
                },
                "position": guide.position,
                "spanStart": guide.span_start,
                "spanEnd": guide.span_end,
            })).collect::<Vec<_>>(),
        }))
        .map_err(|error| CoreError::new("editor.move_snap.serialize_failed", error.to_string()))
    }

    pub fn resize_snap(
        &self,
        handle: &str,
        delta_x: f32,
        delta_y: f32,
        lock_aspect: bool,
        threshold: Option<f32>,
    ) -> Result<String, CoreError> {
        let state = self.state.borrow();
        let editor_state = state
            .as_ref()
            .ok_or_else(|| CoreError::new("editor.state.missing", "No document has been loaded."))?;

        let handle = parse_transform_handle_kind(handle)?;
        let preview = resize_snap_preview(
            &editor_state.doc,
            &editor_state.selection,
            handle,
            delta_x,
            delta_y,
            lock_aspect,
            threshold.unwrap_or(8.0),
        );

        serde_json::to_string(&json!({
            "bounds": preview.bounds,
            "deltaX": preview.delta_x,
            "deltaY": preview.delta_y,
            "guides": preview.guides.into_iter().map(|guide| json!({
                "axis": match guide.axis {
                    kernel_doc::GuideAxis::X => "x",
                    kernel_doc::GuideAxis::Y => "y",
                },
                "position": guide.position,
                "spanStart": guide.span_start,
                "spanEnd": guide.span_end,
            })).collect::<Vec<_>>(),
        }))
        .map_err(|error| CoreError::new("editor.resize_snap.serialize_failed", error.to_string()))
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

fn transform_handle_kind_name(kind: TransformHandleKind) -> &'static str {
    match kind {
        TransformHandleKind::N => "n",
        TransformHandleKind::Ne => "ne",
        TransformHandleKind::E => "e",
        TransformHandleKind::Se => "se",
        TransformHandleKind::S => "s",
        TransformHandleKind::Sw => "sw",
        TransformHandleKind::W => "w",
        TransformHandleKind::Nw => "nw",
        TransformHandleKind::Rotate => "rotate",
    }
}

fn parse_transform_handle_kind(raw: &str) -> Result<TransformHandleKind, CoreError> {
    match raw {
        "n" => Ok(TransformHandleKind::N),
        "ne" => Ok(TransformHandleKind::Ne),
        "e" => Ok(TransformHandleKind::E),
        "se" => Ok(TransformHandleKind::Se),
        "s" => Ok(TransformHandleKind::S),
        "sw" => Ok(TransformHandleKind::Sw),
        "w" => Ok(TransformHandleKind::W),
        "nw" => Ok(TransformHandleKind::Nw),
        "rotate" => Ok(TransformHandleKind::Rotate),
        _ => Err(CoreError::new(
            "editor.transform_handle.invalid",
            format!("Unknown transform handle '{}'.", raw),
        )),
    }
}

#[cfg(target_arch = "wasm32")]
fn map_js_error(error: CoreError) -> JsValue {
    JsValue::from_str(&error.to_string())
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub struct WasmEditorBridgeHandle {
    inner: EditorBridgeHandle,
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
impl WasmEditorBridgeHandle {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmEditorBridgeHandle {
        WasmEditorBridgeHandle {
            inner: EditorBridgeHandle::new(),
        }
    }

    pub fn load_document(&self, serialized_doc: &str) -> Result<String, JsValue> {
        self.inner.load_document(serialized_doc).map_err(map_js_error)
    }

    pub fn dispatch_editor_commands(&self, commands_json: &str) -> Result<String, JsValue> {
        self.inner
            .dispatch_editor_commands(commands_json)
            .map_err(map_js_error)
    }

    pub fn query_node(&self, node_id: &str) -> Result<String, JsValue> {
        self.inner.query_node(node_id).map_err(map_js_error)
    }

    pub fn hit_test(&self, page_id: &str, x: f32, y: f32, mode: &str) -> Result<String, JsValue> {
        self.inner.hit_test(page_id, x, y, mode).map_err(map_js_error)
    }

    pub fn selection_bounds(&self) -> Result<String, JsValue> {
        self.inner.selection_bounds().map_err(map_js_error)
    }

    pub fn transform_handles(&self) -> Result<String, JsValue> {
        self.inner.transform_handles().map_err(map_js_error)
    }

    pub fn move_snap(&self, delta_x: f32, delta_y: f32, threshold: Option<f32>) -> Result<String, JsValue> {
        self.inner.move_snap(delta_x, delta_y, threshold).map_err(map_js_error)
    }

    pub fn resize_snap(
        &self,
        handle: &str,
        delta_x: f32,
        delta_y: f32,
        lock_aspect: bool,
        threshold: Option<f32>,
    ) -> Result<String, JsValue> {
        self.inner
            .resize_snap(handle, delta_x, delta_y, lock_aspect, threshold)
            .map_err(map_js_error)
    }

    pub fn run_validation(&self) -> Result<String, JsValue> {
        self.inner.run_validation().map_err(map_js_error)
    }

    pub fn export_document(&self) -> Result<String, JsValue> {
        self.inner.export_document().map_err(map_js_error)
    }
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
                guides: vec![],
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
                        constraints: None,
                        layout: None,
                        text: None,
                        shape: None,
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
                        constraints: None,
                        layout: None,
                        text: Some(kernel_doc::TextNodeData {
                            content: "Title".to_string(),
                            font_family: "Inter".to_string(),
                            font_size: 20.0,
                            font_weight: 700,
                            line_height: 24.0,
                            letter_spacing: 0.0,
                            align: kernel_doc::TextAlign::Left,
                            color: "#0f172a".to_string(),
                            sizing: kernel_doc::TextSizingMode::AutoHeight,
                        }),
                        shape: None,
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

    #[test]
    fn bridge_supports_hit_test_and_selection_bounds() {
        let bridge = EditorBridgeHandle::new();
        let _ = bridge.load_document(&sample_doc_json()).expect("load doc");

        let hit = bridge
            .hit_test("page-1", 15.0, 15.0, "topmost")
            .expect("hit test should succeed");
        assert!(hit.contains("\"topNodeId\":\"title\""));

        let _ = bridge
            .dispatch_editor_commands(r#"[{"kind":"select_nodes","nodeIds":["title"]}]"#)
            .expect("select should succeed");
        let bounds = bridge.selection_bounds().expect("selection bounds should serialize");
        assert!(bounds.contains("\"w\":50.0"));
        assert!(bounds.contains("\"h\":48.0"));

        let handles = bridge
            .transform_handles()
            .expect("transform handles should serialize");
        assert!(handles.contains("\"kind\":\"rotate\""));
    }

    #[test]
    fn bridge_supports_resize_selection() {
        let bridge = EditorBridgeHandle::new();
        let _ = bridge.load_document(&sample_doc_json()).expect("load doc");

        let _ = bridge
            .dispatch_editor_commands(r#"[{"kind":"select_nodes","nodeIds":["title"]}]"#)
            .expect("select should succeed");
        let resized = bridge
            .dispatch_editor_commands(
                r#"[{"kind":"resize_selection","handle":"se","deltaX":10,"deltaY":5}]"#,
            )
            .expect("resize should succeed");

        assert!(resized.contains("\"resize_selection\""));
        assert!(resized.contains("\"dirtyNodeIds\":[\"title\"]"));
        assert!(resized.contains("\"w\":60.0"));
        assert!(resized.contains("\"h\":24.0"));
    }
}
