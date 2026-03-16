import { readFileSync } from "node:fs";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

const mode = process.argv[2];
if (!mode) {
  console.error("missing_mode");
  process.exit(1);
}

if (mode === "read") {
  const input = await readStdin();
  if (input.length < 3 || input[0] !== 0x46 || input[1] !== 0x49 || input[2] !== 0x47) {
    console.error("invalid_direct_fig_fixture");
    process.exit(1);
  }
  const payloadPath = process.env.NULL_DIRECT_FIG_ADAPTER_PAYLOAD_PATH;
  if (!payloadPath) {
    console.error("missing_payload_path");
    process.exit(1);
  }
  const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
  process.stdout.write(
    JSON.stringify({
      adapterName: "fixture-direct-fig-cli",
      kind: "payload",
      data: payload,
      warnings: ["cli-adapter-decoded-direct-fig"],
    }),
  );
  process.exit(0);
}

if (mode === "write") {
  const input = await readStdin();
  const parsed = JSON.parse(input.toString("utf8"));
  if (!parsed?.bundleJson) {
    console.error("missing_bundle_json");
    process.exit(1);
  }
  process.stdout.write(Buffer.from("FIGCLI", "utf8"));
  process.exit(0);
}

console.error("unknown_mode");
process.exit(1);
