#[derive(Debug, Clone)]
pub struct TextLayoutHandle {
    pub revision: u64,
}

impl Default for TextLayoutHandle {
    fn default() -> Self {
        Self { revision: 0 }
    }
}

