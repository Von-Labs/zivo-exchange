"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Keypair,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMintInstruction,
  getMinimumBalanceForRentExemptMint,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

// Metaplex Token Metadata Program ID
const METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

// Helper function to get metadata PDA
const getMetadataPDA = (mint: PublicKey): PublicKey => {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    METADATA_PROGRAM_ID
  );
  return pda;
};

// Helper function to create metadata instruction (manual construction)
const createMetadataInstruction = (
  metadata: PublicKey,
  mint: PublicKey,
  mintAuthority: PublicKey,
  payer: PublicKey,
  updateAuthority: PublicKey,
  name: string,
  symbol: string,
  uri: string
) => {
  const keys = [
    { pubkey: metadata, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: mintAuthority, isSigner: true, isWritable: false },
    { pubkey: payer, isSigner: true, isWritable: false },
    { pubkey: updateAuthority, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  // Instruction discriminator for CreateMetadataAccountV3
  const discriminator = Buffer.from([33]);

  // Encode name (string with length prefix)
  const nameBuffer = Buffer.from(name);
  const nameLen = Buffer.alloc(4);
  nameLen.writeUInt32LE(nameBuffer.length);

  // Encode symbol (string with length prefix)
  const symbolBuffer = Buffer.from(symbol);
  const symbolLen = Buffer.alloc(4);
  symbolLen.writeUInt32LE(symbolBuffer.length);

  // Encode uri (string with length prefix)
  const uriBuffer = Buffer.from(uri);
  const uriLen = Buffer.alloc(4);
  uriLen.writeUInt32LE(uriBuffer.length);

  // CreateMetadataAccountV3 data structure
  const data = Buffer.concat([
    discriminator,
    nameLen,
    nameBuffer,
    symbolLen,
    symbolBuffer,
    uriLen,
    uriBuffer,
    Buffer.from([0, 0]), // sellerFeeBasisPoints (u16) = 0
    Buffer.from([0]), // creators Option::None
    Buffer.from([0]), // collection Option::None
    Buffer.from([0]), // uses Option::None
    Buffer.from([1]), // isMutable = true
    Buffer.from([0]), // collectionDetails Option::None
  ]);

  return {
    keys,
    programId: METADATA_PROGRAM_ID,
    data,
  };
};

const SplTokenCreator = () => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState("9");
  const [supply, setSupply] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [mintLoading, setMintLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mintAddress, setMintAddress] = useState("");
  const [createdMintKey, setCreatedMintKey] = useState<PublicKey | null>(null);
  const [createdMintDecimals, setCreatedMintDecimals] = useState<number>(9);

  // Upload metadata to Pinata IPFS
  const uploadMetadataToPinata = async (
    tokenName: string,
    tokenSymbol: string,
    tokenDescription: string,
    tokenImageUrl: string
  ): Promise<string> => {
    const metadata = {
      name: tokenName,
      symbol: tokenSymbol,
      description: tokenDescription,
      image: tokenImageUrl,
    };

    const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiIxODY4MmVkNC00YjdiLTQyMDAtYjI1OC0zMDk3MDBhNGYwODAiLCJlbWFpbCI6InRhb2xhc2lldW5oYW5zeWxhc0BnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiNDAxMzlmZDNiMDIzODVlNzlkM2MiLCJzY29wZWRLZXlTZWNyZXQiOiIzMjg1NTMzMzIzNWRiMTdkNDc1OWVhZmRlZDlhNzE5NWQ5YmViMmI4ZjhlYmRmZWYxNWRhMmQ3MDU5ZGRhNWU4IiwiZXhwIjoxODAwNzYzNjMwfQ.r0Y8QvJfSyEFf_YLQWnSsuTA-4RJIOeSS3rRaT0Q0oE`,
      },
      body: JSON.stringify({
        pinataContent: metadata,
        pinataMetadata: {
          name: `${tokenSymbol}-metadata`,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Pinata error:", errorData);
      throw new Error(`Failed to upload metadata to IPFS: ${errorData}`);
    }

    const data = await response.json();
    return `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`;
  };

  const handleCreateToken = async () => {
    if (!publicKey) {
      setError("Please connect your wallet");
      return;
    }

    if (!name || !symbol) {
      setError("Please fill in all required fields");
      return;
    }

    setCreateLoading(true);
    setError("");
    setSuccess("");
    setMintAddress("");

    try {
      // Generate new keypair for the mint
      const mintKeypair = Keypair.generate();

      // Upload metadata to IPFS if image URL is provided
      let metadataUri = "";
      if (imageUrl) {
        setSuccess("Uploading metadata to IPFS...");
        metadataUri = await uploadMetadataToPinata(
          name,
          symbol,
          description || `${name} Token`,
          imageUrl
        );
      }

      // Get minimum lamports for rent exemption
      const lamports = await getMinimumBalanceForRentExemptMint(connection);

      // Create transaction
      const transaction = new Transaction().add(
        // Create account for mint
        SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports,
          programId: TOKEN_PROGRAM_ID,
        }),
        // Initialize mint
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          parseInt(decimals),
          publicKey, // Mint authority
          publicKey, // Freeze authority
          TOKEN_PROGRAM_ID
        )
      );

      // Add metadata instruction if we have a URI
      if (metadataUri) {
        const metadataPDA = getMetadataPDA(mintKeypair.publicKey);
        const metadataInstruction = createMetadataInstruction(
          metadataPDA,
          mintKeypair.publicKey,
          publicKey,
          publicKey,
          publicKey,
          name,
          symbol,
          metadataUri
        );
        transaction.add(metadataInstruction);
      }

      // Send transaction
      setSuccess("Creating token on-chain...");
      const signature = await sendTransaction(transaction, connection, {
        signers: [mintKeypair],
      });

      // Wait for confirmation
      await connection.confirmTransaction(signature, "confirmed");

      setMintAddress(mintKeypair.publicKey.toBase58());
      setCreatedMintKey(mintKeypair.publicKey);
      setCreatedMintDecimals(parseInt(decimals)); // Save decimals for minting
      setSuccess(
        `Token created successfully! Mint: ${mintKeypair.publicKey.toBase58()}${metadataUri ? ` | Metadata: ${metadataUri}` : ""}`
      );

      // Reset form (keep mint address for minting tokens)
      setName("");
      setSymbol("");
      setDecimals("9");
      setSupply("");
      setImageUrl("");
      setDescription("");
    } catch (err: any) {
      console.error("Error creating token:", err);
      setError(err.message || "Failed to create token");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleMintTokens = async () => {
    if (!publicKey || !createdMintKey) {
      setError("Please create a token first or connect your wallet");
      return;
    }

    if (!recipientAddress || !mintAmount) {
      setError("Please fill in recipient address and amount");
      return;
    }

    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipientAddress);
    } catch (err) {
      setError("Invalid recipient address");
      return;
    }

    setMintLoading(true);
    setError("");

    try {
      // Get or create associated token account for recipient
      const recipientAta = await getAssociatedTokenAddress(
        createdMintKey,
        recipientPubkey
      );

      // Check if ATA exists
      const accountInfo = await connection.getAccountInfo(recipientAta);
      const transaction = new Transaction();

      // Create ATA if it doesn't exist
      if (!accountInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey, // Payer
            recipientAta, // ATA address
            recipientPubkey, // Owner
            createdMintKey, // Mint
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      // Add mint instruction
      const amount = parseFloat(mintAmount) * Math.pow(10, createdMintDecimals);
      transaction.add(
        createMintToInstruction(
          createdMintKey, // Mint
          recipientAta, // Destination
          publicKey, // Authority
          amount // Amount (with decimals)
        )
      );

      // Send transaction
      const signature = await sendTransaction(transaction, connection);

      // Wait for confirmation
      await connection.confirmTransaction(signature, "confirmed");

      setSuccess(
        `Successfully minted ${mintAmount} tokens to ${recipientAddress.slice(0, 8)}...${recipientAddress.slice(-8)}`
      );

      // Reset mint form
      setRecipientAddress("");
      setMintAmount("");
    } catch (err: any) {
      console.error("Error minting tokens:", err);
      setError(err.message || "Failed to mint tokens");
    } finally {
      setMintLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Create SPL Token</h2>
        <p className="text-gray-600 text-sm">
          Create a standard SPL token on Solana
        </p>
      </div>

      <div className="space-y-4">
        {/* Token Name */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Token Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., My Token"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={createLoading}
          />
        </div>

        {/* Token Symbol */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Token Symbol <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="e.g., MTK"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={createLoading}
          />
        </div>

        {/* Decimals */}
        <div>
          <label className="block text-sm font-medium mb-2">Decimals</label>
          <input
            type="number"
            value={decimals}
            onChange={(e) => setDecimals(e.target.value)}
            min="0"
            max="9"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={createLoading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Standard is 9 decimals (like SOL)
          </p>
        </div>

        {/* Token Image URL */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Token Image URL
          </label>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://example.com/token-image.png"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={createLoading}
          />
          <p className="text-xs text-gray-500 mt-1">
            URL to your token logo (PNG, JPG, or SVG)
          </p>
        </div>

        {/* Token Description */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your token..."
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            disabled={createLoading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Brief description of your token
          </p>
        </div>

        {/* Initial Supply */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Initial Supply (optional)
          </label>
          <input
            type="number"
            value={supply}
            onChange={(e) => setSupply(e.target.value)}
            placeholder="0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={createLoading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Leave empty to mint tokens later
          </p>
        </div>

        {/* Image Preview */}
        {imageUrl && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-sm font-medium mb-2">Image Preview:</p>
            <div className="flex items-center gap-4">
              <img
                src={imageUrl}
                alt="Token preview"
                className="w-16 h-16 rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "";
                  (e.target as HTMLImageElement).alt = "Failed to load image";
                }}
              />
              <div className="flex-1">
                <p className="font-semibold">{name || "Token Name"}</p>
                <p className="text-sm text-gray-600">{symbol || "SYMBOL"}</p>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-600 text-sm font-medium mb-2">
              {success}
            </p>
            {mintAddress && (
              <div className="mt-2">
                <p className="text-xs text-gray-600 mb-1">Mint Address:</p>
                <code className="text-xs bg-gray-100 p-2 rounded block break-all">
                  {mintAddress}
                </code>
              </div>
            )}
          </div>
        )}

        {/* Create Button */}
        <button
          onClick={handleCreateToken}
          disabled={createLoading || !publicKey}
          className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
            createLoading || !publicKey
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {createLoading ? "Creating Token..." : "Create SPL Token"}
        </button>

        {!publicKey && (
          <p className="text-sm text-gray-500 text-center">
            Please connect your wallet to create a token
          </p>
        )}

        {/* Mint Tokens Section - Only show after token is created */}
        {createdMintKey && (
          <>
            <div className="border-t pt-6 mt-6">
              <h3 className="text-xl font-bold mb-4">Mint Tokens</h3>
              <p className="text-sm text-gray-600 mb-4">
                Mint tokens to any address
              </p>

              {/* Token Info */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm">
                  <strong>Mint:</strong>{" "}
                  <code className="text-xs bg-white px-2 py-1 rounded">
                    {mintAddress}
                  </code>
                </p>
                <p className="text-sm mt-1">
                  <strong>Decimals:</strong> {createdMintDecimals}
                </p>
              </div>

              {/* Recipient Address */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Recipient Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  placeholder="Enter Solana wallet address"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={mintLoading}
                />
              </div>

              {/* Mint Amount */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Amount <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={mintAmount}
                  onChange={(e) => setMintAmount(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="any"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={mintLoading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Amount of tokens to mint
                </p>
              </div>

              {/* Mint Button */}
              <button
                onClick={handleMintTokens}
                disabled={mintLoading || !recipientAddress || !mintAmount}
                className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
                  mintLoading || !recipientAddress || !mintAmount
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {mintLoading ? "Minting Tokens..." : "Mint Tokens"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SplTokenCreator;
