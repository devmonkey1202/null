import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const MAX_WASM_RAW_BYTES = 3_000_000;
const MAX_INITIAL_GZIP_BYTES = 2_500_000;

const assets = [
  {
    name: "editor WASM",
    path: "src/v2/editor/wasm/pkg/ffi_wasm_editor_bg.wasm",
  },
  {
    name: "Inter regular",
    path: "public/v2/fonts/InterVariable.ttf",
    sha256: "4989B125924991B90D05B2D16E0E388C48F7D5BB8B30539BBF9C755278D0CCAF",
  },
  {
    name: "Inter italic",
    path: "public/v2/fonts/InterVariable-Italic.ttf",
    sha256: "D6F1F6A172D9E588438DB9F986FD5CFAD7B30F644374080A8A9D4D91E344586F",
  },
  {
    name: "Noto Sans Hebrew",
    path: "public/v2/fonts/NotoSansHebrew-Variable.ttf",
    sha256: "7EF36A2C3593758CDB622E1BDEF4F84523E92FBC3CCC667438DD80FF54C2DE88",
  },
  {
    name: "Noto Sans Arabic",
    path: "public/v2/fonts/NotoSansArabic-Variable.ttf",
    sha256: "63111B5B2E074DD48CC67692E0A2726D86EE94C1C37FE8598257B7B4E87E869E",
  },
];

const measurements = assets.map((asset) => {
  const bytes = readFileSync(asset.path);
  const sha256 = createHash("sha256").update(bytes).digest("hex").toUpperCase();
  if (asset.sha256 && sha256 !== asset.sha256) {
    throw new Error(`${asset.name} SHA-256 mismatch: expected ${asset.sha256}, received ${sha256}`);
  }
  return {
    ...asset,
    rawBytes: bytes.byteLength,
    gzipBytes: gzipSync(bytes, { level: 9 }).byteLength,
  };
});

const wasm = measurements[0];
const initialGzipBytes = measurements.reduce((total, asset) => total + asset.gzipBytes, 0);

if (wasm.rawBytes > MAX_WASM_RAW_BYTES) {
  throw new Error(
    `Editor WASM raw size ${wasm.rawBytes} exceeds the ${MAX_WASM_RAW_BYTES} byte gate.`,
  );
}
if (initialGzipBytes > MAX_INITIAL_GZIP_BYTES) {
  throw new Error(
    `Editor WASM + default fonts gzip size ${initialGzipBytes} exceeds the ${MAX_INITIAL_GZIP_BYTES} byte gate.`,
  );
}

for (const asset of measurements) {
  console.log(`${asset.name}: raw=${asset.rawBytes} gzip=${asset.gzipBytes}`);
}
console.log(
  `v2 editor asset gate passed: initial gzip=${initialGzipBytes}/${MAX_INITIAL_GZIP_BYTES} bytes`,
);
