# NULL v2 Rust Workspace

이 디렉터리는 NULL v2의 Rust/WASM 커널 작업 공간입니다.

현재 상태:

- crate 경계만 먼저 고정
- editor kernel / runtime / service / ffi를 분리
- 실제 로직 구현은 이후 단계에서 진행

우선순위:

1. `kernel-doc`
2. `kernel-scene`
3. `kernel-layout`
4. `kernel-history`
5. `ffi-wasm-editor`

그 다음:

- `kernel-text`
- `kernel-vector`
- `kernel-render`
- `kernel-sync`
- `kernel-runtime`
- `service-*`
- `ffi-wasm-runtime`

