use core_id::StableId;

pub const SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Clone)]
pub struct SceneDocHandle {
    pub document_id: StableId,
    pub title: String,
    pub schema_version: u32,
}

impl SceneDocHandle {
    pub fn new(document_id: StableId, title: impl Into<String>) -> Self {
        Self {
            document_id,
            title: title.into(),
            schema_version: SCHEMA_VERSION,
        }
    }
}

