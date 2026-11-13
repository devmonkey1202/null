use core_error::CoreError;

#[derive(Debug, Clone)]
pub struct PlatformSession {
    pub session_id: String,
    pub user_id: String,
}

pub trait PlatformAuthService {
    fn login(&self, email: &str, password: &str) -> Result<PlatformSession, CoreError>;
}

