#[derive(Debug, Default)]
pub struct HistoryStore {
    pub version: u64,
}

impl HistoryStore {
    pub fn bump(&mut self) {
        self.version += 1;
    }
}

