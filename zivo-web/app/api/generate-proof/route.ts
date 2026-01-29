import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

interface ProofRequest {
  root: string;
  nullifier: string;
  recipient: string;
  amount: string | number;
  mint: string;
  commitment: string;
  leaf: string;
  index: string | number;
  siblings: string[];
  owner: string;
  blinding: string;
  nullifier_secret: string;
}

export async function POST(request: NextRequest) {
  try {
    const inputs: ProofRequest = await request.json();

    console.log("Generating ZK proof with inputs:", {
      root: inputs.root,
      nullifier: inputs.nullifier,
      recipient: inputs.recipient,
      amount: inputs.amount,
      commitment: inputs.commitment,
    });

    // Path to Noir circuit directory
    const circuitDir = path.resolve(process.cwd(), "..", "zivo-wrap", "noir_circuit");
    const circuitName = "zivo_wrap_shielded";

    // Check if circuit directory exists
    if (!fs.existsSync(circuitDir)) {
      return NextResponse.json(
        { error: `Noir circuit directory not found at: ${circuitDir}` },
        { status: 500 }
      );
    }

    // Generate Prover.toml file
    const proverTomlPath = path.join(circuitDir, "Prover.toml");
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
    console.log("Wrote Prover.toml");

    // Execute Noir to generate witness
    try {
      execSync("nargo execute", {
        cwd: circuitDir,
        stdio: "inherit",
        env: {
          ...process.env,
          PATH: `${process.env.HOME}/.nargo/bin:${process.env.PATH}`,
        },
      });
      console.log("Noir witness generation completed");
    } catch (error: any) {
      console.error("Noir execution failed:", error);
      return NextResponse.json(
        { error: `Noir execution failed: ${error.message}` },
        { status: 500 }
      );
    }

    // Generate Groth16 proof using Sunspot
    const targetDir = path.join(circuitDir, "target");
    const acirPath = path.join(targetDir, `${circuitName}.json`);
    const witnessPath = path.join(targetDir, `${circuitName}.gz`);
    const ccsPath = path.join(targetDir, `${circuitName}.ccs`);
    const pkPath = path.join(targetDir, `${circuitName}.pk`);

    try {
      execSync(`sunspot prove ${acirPath} ${witnessPath} ${ccsPath} ${pkPath}`, {
        cwd: circuitDir,
        stdio: "inherit",
        env: {
          ...process.env,
          PATH: `${process.env.HOME}/Desktop/sunspot/go:${process.env.PATH}`,
          GNARK_VERIFIER_BIN: process.env.GNARK_VERIFIER_BIN || `${process.env.HOME}/Desktop/sunspot/gnark-solana/crates/verifier-bin`,
        },
      });
      console.log("Sunspot proof generation completed");
    } catch (error: any) {
      console.error("Sunspot proof generation failed:", error);
      return NextResponse.json(
        { error: `Sunspot proof generation failed: ${error.message}` },
        { status: 500 }
      );
    }

    // Read proof and public witness
    const proofPath = path.join(targetDir, `${circuitName}.proof`);
    const pwPath = path.join(targetDir, `${circuitName}.pw`);

    if (!fs.existsSync(proofPath) || !fs.existsSync(pwPath)) {
      return NextResponse.json(
        { error: "Proof files not generated" },
        { status: 500 }
      );
    }

    const proof = fs.readFileSync(proofPath);
    const publicWitness = fs.readFileSync(pwPath);

    // Concatenate proof and public witness
    const proofPayload = Buffer.concat([proof, publicWitness]);

    console.log("Proof generation successful, size:", proofPayload.length);

    // Return proof as base64
    return NextResponse.json({
      success: true,
      proof: proofPayload.toString("base64"),
      proofSize: proof.length,
      publicWitnessSize: publicWitness.length,
    });
  } catch (error: any) {
    console.error("Error generating proof:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate proof" },
      { status: 500 }
    );
  }
}
