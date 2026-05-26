#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StableId(String);

impl StableId {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

