use core_error::CoreError;

pub struct EditorBridgeHandle;

impl EditorBridgeHandle {
    pub fn load_document(&self, serialized_doc: &str) -> Result<String, CoreError> {
        if serialized_doc.is_empty() {
            return Err(CoreError::new("editor.load.empty", "serialized_doc is empty"));
        }

        Ok(serialized_doc.to_owned())
    }

    pub fn dispatch_editor_command(&self, command_json: &str) -> Result<String, CoreError> {
        if command_json.is_empty() {
            return Err(CoreError::new("editor.command.empty", "command_json is empty"));
        }

        Ok(command_json.to_owned())
    }
}

