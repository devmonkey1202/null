use core_error::CoreError;
use kernel_doc::SceneDoc;

pub trait DocumentService {
    fn load_document(&self, document_id: &str) -> Result<SceneDoc, CoreError>;
}
