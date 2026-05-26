use core_error::CoreError;
use kernel_doc::SceneDocHandle;

pub trait DocumentService {
    fn load_document(&self, document_id: &str) -> Result<SceneDocHandle, CoreError>;
}

