$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$rustRoot = Join-Path $repoRoot "rust"
$outputDir = Join-Path $repoRoot "src/v2/editor/wasm/pkg"
$wasmTarget = Join-Path $rustRoot "target/wasm32-unknown-unknown/release/ffi_wasm_editor.wasm"
$wasmBindgen = Join-Path $env:USERPROFILE ".cargo/bin/wasm-bindgen.exe"

if (!(Test-Path $wasmBindgen)) {
  throw "wasm-bindgen.exe not found at $wasmBindgen"
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Get-ChildItem -Path $outputDir -Force | Remove-Item -Recurse -Force

Push-Location $repoRoot
try {
  cargo build --manifest-path rust/Cargo.toml -p ffi-wasm-editor --target wasm32-unknown-unknown --release
  & $wasmBindgen `
    --target web `
    --typescript `
    --out-dir $outputDir `
    $wasmTarget
}
finally {
  Pop-Location
}
