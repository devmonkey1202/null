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

impl Default for EditorViewport {
    fn default() -> Self {
        Self {
            zoom: 1.0,
            x: 0.0,
            y: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum EditorCommand {
    SelectNodes { node_ids: Vec<String> },
    SetViewport { viewport: EditorViewport },
    RenameNode { node_id: String, name: String },
    MoveNode { node_id: String, frame: FramePatch },
    CreateNode { page_id: String, node: SceneNode },
    DeleteNode { node_id: String },
    Undo,
    Redo,
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
        }
    }

    ValidationReport {
        document_id: doc.document_id.clone(),
        generated_at: doc.meta.updated_at.clone(),
        issues,
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
}
