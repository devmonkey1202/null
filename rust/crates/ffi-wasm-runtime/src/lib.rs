use core_error::CoreError;

pub struct RuntimeBridgeHandle;

impl RuntimeBridgeHandle {
    pub fn load_runtime_graph(&self, graph_json: &str) -> Result<String, CoreError> {
        if graph_json.is_empty() {
            return Err(CoreError::new("runtime.graph.empty", "graph_json is empty"));
        }

        Ok(graph_json.to_owned())
    }
}

