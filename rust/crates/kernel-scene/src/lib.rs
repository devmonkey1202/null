use core_id::StableId;

#[derive(Debug, Clone)]
pub struct SceneGraphHandle {
    pub root_id: StableId,
}

impl SceneGraphHandle {
    pub fn new(root_id: StableId) -> Self {
        Self { root_id }
    }
}

