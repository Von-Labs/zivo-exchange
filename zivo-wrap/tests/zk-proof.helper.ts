import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export interface ShieldedPoolInputs {
  root: string;
  nullifier: string;
  recipient: string;
  amount: number | string;
  mint: string;
  commitment: string;
  leaf: string;
  index: number | string;
  siblings: string[];
  owner: string;
  blinding: string;
  nullifier_secret: string;
}

export interface CircuitConfig {
  circuitDir: string;
  circuitName: string;
}

export function generateProofPayload(config: CircuitConfig, inputs: ShieldedPoolInputs): Buffer {
  const proverTomlPath = path.join(config.circuitDir, "Prover.toml");

  let toml = "";
  toml += `root = "${inputs.root}"\n`;
  toml += `nullifier = "${inputs.nullifier}"\n`;
  toml += `recipient = "${inputs.recipient}"\n`;
  toml += `amount = ${inputs.amount}\n`;
  toml += `mint = "${inputs.mint}"\n`;
  toml += `commitment = "${inputs.commitment}"\n`;
  toml += `leaf = "${inputs.leaf}"\n`;
  toml += `index = ${inputs.index}\n`;
  toml += `siblings = [\n`;
  for (const sib of inputs.siblings) {
    toml += `  "${sib}",\n`;
  }
  toml += `]\n`;
  toml += `owner = "${inputs.owner}"\n`;
  toml += `blinding = "${inputs.blinding}"\n`;
  toml += `nullifier_secret = "${inputs.nullifier_secret}"\n`;

  fs.writeFileSync(proverTomlPath, toml);

  execSync("nargo execute", { cwd: config.circuitDir, stdio: "inherit" });

  const targetDir = path.join(config.circuitDir, "target");
  const acirPath = path.join(targetDir, `${config.circuitName}.json`);
  const witnessPath = path.join(targetDir, `${config.circuitName}.gz`);
  const ccsPath = path.join(targetDir, `${config.circuitName}.ccs`);
  const pkPath = path.join(targetDir, `${config.circuitName}.pk`);

  execSync(`sunspot prove ${acirPath} ${witnessPath} ${ccsPath} ${pkPath}`, {
    cwd: config.circuitDir,
    stdio: "inherit",
  });

  const proof = fs.readFileSync(path.join(targetDir, `${config.circuitName}.proof`));
  const publicWitness = fs.readFileSync(path.join(targetDir, `${config.circuitName}.pw`));

  return Buffer.concat([proof, publicWitness]);
}
