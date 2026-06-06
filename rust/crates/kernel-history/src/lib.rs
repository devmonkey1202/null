use core_error::CoreError;
use kernel_doc::EditorSnapshot;

pub const DEFAULT_HISTORY_LIMIT: usize = 200;

#[derive(Debug, Clone)]
pub struct HistoryStore {
    limit: usize,
    cursor: usize,
    entries: Vec<EditorSnapshot>,
}

impl Default for HistoryStore {
    fn default() -> Self {
        Self::new(DEFAULT_HISTORY_LIMIT)
    }
}

impl HistoryStore {
    pub fn new(limit: usize) -> Self {
        Self {
            limit: limit.max(1),
            cursor: 0,
            entries: Vec::new(),
        }
    }

    pub fn seed(&mut self, snapshot: EditorSnapshot) {
        self.entries.clear();
        self.entries.push(snapshot);
        self.cursor = 0;
    }

    pub fn current(&self) -> Option<&EditorSnapshot> {
        self.entries.get(self.cursor)
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn can_undo(&self) -> bool {
        !self.entries.is_empty() && self.cursor > 0
    }

    pub fn can_redo(&self) -> bool {
        !self.entries.is_empty() && self.cursor + 1 < self.entries.len()
    }

    pub fn push(&mut self, snapshot: EditorSnapshot) {
        if self.entries.is_empty() {
            self.seed(snapshot);
            return;
        }

        if self.cursor + 1 < self.entries.len() {
            self.entries.truncate(self.cursor + 1);
        }

        if self.entries.last().is_some_and(|current| current == &snapshot) {
            return;
        }

        self.entries.push(snapshot);

        if self.entries.len() > self.limit {
            let overflow = self.entries.len() - self.limit;
            self.entries.drain(0..overflow);
            self.cursor = self.entries.len().saturating_sub(1);
        } else {
            self.cursor = self.entries.len() - 1;
        }
    }

    pub fn undo(&mut self) -> Result<EditorSnapshot, CoreError> {
        if !self.can_undo() {
            return Err(CoreError::new(
                "history.undo.unavailable",
                "Undo is unavailable at the current history cursor.",
            ));
        }

        self.cursor -= 1;
        self.current()
            .cloned()
            .ok_or_else(|| CoreError::new("history.undo.missing_entry", "Undo entry missing."))
    }

    pub fn redo(&mut self) -> Result<EditorSnapshot, CoreError> {
        if !self.can_redo() {
            return Err(CoreError::new(
                "history.redo.unavailable",
                "Redo is unavailable at the current history cursor.",
            ));
        }

        self.cursor += 1;
        self.current()
            .cloned()
            .ok_or_else(|| CoreError::new("history.redo.missing_entry", "Redo entry missing."))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use kernel_doc::{
        EditorRect, EditorViewport, SceneDoc, SceneDocMeta, SceneNode, SceneNodeKind, ScenePage,
    };

    fn snapshot(version: u64, title: &str) -> EditorSnapshot {
        EditorSnapshot {
            version,
            selection: Vec::new(),
            viewport: EditorViewport::default(),
            doc: SceneDoc {
                schema_version: 2,
                document_id: "doc-1".to_string(),
                title: title.to_string(),
                pages: vec![ScenePage {
                    id: "page-1".to_string(),
                    name: "Canvas".to_string(),
                    root_id: "root".to_string(),
                    guides: vec![],
                    nodes: vec![SceneNode {
                        id: "root".to_string(),
                        kind: SceneNodeKind::Frame,
                        name: "Root".to_string(),
                        parent_id: None,
                        children: None,
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
                        instance_source_node_id: None,
                    }],
                }],
                meta: SceneDocMeta {
                    created_at: "2026-05-27T00:00:00.000Z".to_string(),
                    updated_at: "2026-05-27T00:00:00.000Z".to_string(),
                },
            },
        }
    }

    #[test]
    fn undo_and_redo_walk_snapshots() {
        let mut store = HistoryStore::new(10);
        store.seed(snapshot(1, "One"));
        store.push(snapshot(2, "Two"));
        store.push(snapshot(3, "Three"));

        let undo = store.undo().expect("undo available");
        assert_eq!(undo.version, 2);
        assert_eq!(undo.doc.title, "Two");

        let redo = store.redo().expect("redo available");
        assert_eq!(redo.version, 3);
        assert_eq!(redo.doc.title, "Three");
    }

    #[test]
    fn push_truncates_redo_branch() {
        let mut store = HistoryStore::new(10);
        store.seed(snapshot(1, "One"));
        store.push(snapshot(2, "Two"));
        store.push(snapshot(3, "Three"));

        let _ = store.undo().expect("undo available");
        store.push(snapshot(4, "Four"));

        assert!(!store.can_redo());
        assert_eq!(store.len(), 3);
        assert_eq!(store.current().expect("current").version, 4);
    }
}
