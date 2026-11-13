use core_error::CoreError;

pub trait CollaborationService {
    fn replay(&self, document_id: &str) -> Result<Vec<String>, CoreError>;
}

