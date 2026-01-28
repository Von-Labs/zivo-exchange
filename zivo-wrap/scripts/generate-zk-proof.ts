import fs from "fs";
import path from "path";
import { generateProofPayload } from "../tests/zk-proof.helper";

const required = [
  "ZK_ROOT",
  "ZK_NULLIFIER",
  "ZK_RECIPIENT",
  "ZK_AMOUNT",
  "ZK_LEAF",
  "ZK_INDEX",
  "ZK_SIBLINGS",
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing ${key}`);
  }
}

const circuitDir =
  process.env.ZK_CIRCUIT_DIR || path.resolve(__dirname, "..", "noir_circuit");
const circuitName = process.env.ZK_CIRCUIT_NAME || "zivo_wrap_shielded";

const siblings = (process.env.ZK_SIBLINGS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const payload = generateProofPayload(
  { circuitDir, circuitName },
  {
    root: process.env.ZK_ROOT!,
    nullifier: process.env.ZK_NULLIFIER!,
    recipient: process.env.ZK_RECIPIENT!,
    amount: process.env.ZK_AMOUNT!,
    leaf: process.env.ZK_LEAF!,
    index: process.env.ZK_INDEX!,
    siblings,
  }
);

const base64 = payload.toString("base64");
const outFile = process.env.ZK_OUT_FILE || path.resolve("target", "zk_proof_payload.b64");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, base64);
process.stdout.write(`${base64}\n`);
