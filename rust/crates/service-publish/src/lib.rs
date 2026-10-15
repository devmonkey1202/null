use core_error::CoreError;

pub trait PublishService {
    fn create_snapshot(&self, document_id: &str) -> Result<String, CoreError>;
}

