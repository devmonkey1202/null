use core_error::CoreError;
use kernel_doc::SceneDoc;
use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LayoutInvalidationPlan {
    pub dirty_node_ids: Vec<String>,
    pub ancestor_node_ids: Vec<String>,
    pub affected_page_ids: Vec<String>,
}

pub fn build_layout_invalidation_plan(
    doc: &SceneDoc,
    dirty_node_ids: &[String],
) -> Result<LayoutInvalidationPlan, CoreError> {
    let mut dirty_seen = HashSet::new();
    let mut dirty = Vec::new();
    let mut ancestors = Vec::new();
    let mut ancestor_seen = HashSet::new();
    let mut pages = Vec::new();
    let mut page_seen = HashSet::new();

    for dirty_id in dirty_node_ids {
        if !dirty_seen.insert(dirty_id.clone()) {
            continue;
        }

        dirty.push(dirty_id.clone());

        let (page_id, parent_chain) = find_node_context(doc, dirty_id)?;
        if page_seen.insert(page_id.clone()) {
            pages.push(page_id);
        }

        for ancestor_id in parent_chain {
            if ancestor_seen.insert(ancestor_id.clone()) {
                ancestors.push(ancestor_id);
            }
        }
    }

    Ok(LayoutInvalidationPlan {
        dirty_node_ids: dirty,
        ancestor_node_ids: ancestors,
        affected_page_ids: pages,
    })
}

fn find_node_context(doc: &SceneDoc, node_id: &str) -> Result<(String, Vec<String>), CoreError> {
    for page in &doc.pages {
        if let Some(node) = page.nodes.iter().find(|node| node.id == node_id) {
            let mut parent_chain = Vec::new();
            let mut cursor = node.parent_id.as_deref();

            while let Some(parent_id) = cursor {
                let parent = page
                    .nodes
                    .iter()
                    .find(|candidate| candidate.id == parent_id)
                    .ok_or_else(|| {
                        CoreError::new(
                            "layout.ancestor.missing",
                            format!("Ancestor '{}' for '{}' was not found.", parent_id, node_id),
                        )
                    })?;

                parent_chain.push(parent.id.clone());
                cursor = parent.parent_id.as_deref();
            }

            return Ok((page.id.clone(), parent_chain));
        }
    }

    Err(CoreError::new(
        "layout.dirty_node.not_found",
        format!("Dirty node '{}' was not found in the document.", node_id),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use kernel_doc::{EditorRect, SceneDocMeta, SceneNode, SceneNodeKind, ScenePage, SCHEMA_VERSION};

    fn sample_doc() -> SceneDoc {
        kernel_doc::SceneDoc {
            schema_version: SCHEMA_VERSION,
            document_id: "doc-layout".to_string(),
            title: "Layout".to_string(),
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
                        children: Some(vec!["group".to_string()]),
                        frame: EditorRect {
                            x: 0.0,
                            y: 0.0,
                            w: 100.0,
                            h: 100.0,
                            rotation: 0.0,
                        },
                    },
                    SceneNode {
                        id: "group".to_string(),
                        kind: SceneNodeKind::Group,
                        name: "Group".to_string(),
                        parent_id: Some("root".to_string()),
                        children: Some(vec!["title".to_string()]),
                        frame: EditorRect {
                            x: 0.0,
                            y: 0.0,
                            w: 80.0,
                            h: 80.0,
                            rotation: 0.0,
                        },
                    },
                    SceneNode {
                        id: "title".to_string(),
                        kind: SceneNodeKind::Text,
                        name: "Title".to_string(),
                        parent_id: Some("group".to_string()),
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
    fn plan_collects_ancestors_and_pages() {
        let doc = sample_doc();
        let plan = build_layout_invalidation_plan(&doc, &["title".to_string()])
            .expect("plan should build");

        assert_eq!(plan.affected_page_ids, vec!["page-1".to_string()]);
        assert_eq!(plan.ancestor_node_ids, vec!["group".to_string(), "root".to_string()]);
    }
}
