use core_error::CoreError;

pub trait ControlPlaneService {
    fn create_project(&self, title: &str) -> Result<String, CoreError>;
}

