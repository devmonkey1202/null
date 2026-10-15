use core_error::CoreError;

pub trait MediaService {
    fn create_upload_session(&self, document_id: &str, filename: &str) -> Result<String, CoreError>;
}

