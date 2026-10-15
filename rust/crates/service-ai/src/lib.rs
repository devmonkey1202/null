use core_error::CoreError;

pub trait AiPatchService {
    fn validate_patch(&self, patch_json: &str) -> Result<(), CoreError>;
}

