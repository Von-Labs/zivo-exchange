import { PublicKey } from "@solana/web3.js";

const HELIUS_API_KEY = process.env.NEXT_PUBLIC_HELIUS_API_KEY;

export interface TokenMetadata {
  name?: string;
  symbol?: string;
  decimals?: number;
  logoURI?: string;
  mint?: string;
}

/**
 * Fetch token metadata using Helius API
 * Supports both SPL tokens (with Metaplex metadata) and tokens without metadata
 */
export async function fetchTokenMetadata(
  mintAddress: string
): Promise<TokenMetadata | null> {
  if (!HELIUS_API_KEY) {
    console.error("Helius API key not found");
    return null;
  }

  try {
    const url = `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

    // First, try to get Metaplex metadata PDA
    const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    const mintPubkey = new PublicKey(mintAddress);

    const [metadataPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
      TOKEN_METADATA_PROGRAM_ID
    );

    // Try to fetch Metaplex metadata
    const metadataResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "metadata",
        method: "getAccountInfo",
        params: [
          metadataPDA.toBase58(),
          { encoding: "base64" },
        ],
      }),
    });

    const metadataData = await metadataResponse.json();

    if (metadataData.result?.value) {
      // Parse Metaplex metadata (simplified - just get name and symbol)
      const buffer = Buffer.from(metadataData.result.value.data[0], "base64");

      // Metaplex metadata structure (simplified parsing)
      // We'll try to extract name and symbol from the data
      try {
        const nameStart = 69; // Offset where name starts in metadata
        const nameLength = buffer.readUInt32LE(65);
        const name = buffer.slice(nameStart, nameStart + nameLength).toString('utf8').replace(/\0/g, '');

        const symbolStart = nameStart + nameLength + 4;
        const symbolLength = buffer.readUInt32LE(nameStart + nameLength);
        const symbol = buffer.slice(symbolStart, symbolStart + symbolLength).toString('utf8').replace(/\0/g, '');

        const uriStart = symbolStart + symbolLength + 4;
        const uriLength = buffer.readUInt32LE(symbolStart + symbolLength);
        const uri = buffer.slice(uriStart, uriStart + uriLength).toString('utf8').replace(/\0/g, '');

        console.log("Metaplex metadata found:", { name, symbol, uri });

        // If we have a URI, try to fetch the JSON metadata
        let logoURI;
        if (uri && uri.startsWith('http')) {
          try {
            console.log("Fetching metadata from URI:", uri);
            const jsonResponse = await fetch(uri);
            const jsonData = await jsonResponse.json();
            console.log("Metadata JSON from URI:", jsonData);
            logoURI = jsonData.image;
            console.log("Extracted logo URI:", logoURI);
          } catch (err) {
            console.log("Failed to fetch URI metadata:", err);
          }
        } else {
          console.log("URI not an HTTP URL:", uri);
        }

        // Fetch actual decimals from mint account
        const mintResponse = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "mint-info",
            method: "getAccountInfo",
            params: [
              mintAddress,
              {
                encoding: "jsonParsed",
              },
            ],
          }),
        });

        const mintData = await mintResponse.json();
        const decimals = mintData.result?.value?.data?.parsed?.info?.decimals || 9;
        console.log("Actual decimals from mint:", decimals);

        return {
          name: name || `Token ${mintAddress.slice(0, 8)}`,
          symbol: symbol || "TOKEN",
          decimals: decimals,
          logoURI,
          mint: mintAddress,
        };
      } catch (parseErr) {
        console.log("Failed to parse Metaplex metadata:", parseErr);
      }
    }

    // Fallback: Try to get mint info directly
    const mintResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "my-id",
        method: "getAccountInfo",
        params: [
          mintAddress,
          {
            encoding: "jsonParsed",
          },
        ],
      }),
    });

    const mintData = await mintResponse.json();

    if (mintData.result?.value?.data?.parsed?.info) {
      const info = mintData.result.value.data.parsed.info;
      return {
        name: `Token ${mintAddress.slice(0, 4)}...${mintAddress.slice(-4)}`,
        symbol: "UNKNOWN",
        decimals: info.decimals || 9,
        mint: mintAddress,
      };
    }

    return null;
  } catch (error) {
    console.error("Error fetching token metadata from Helius:", error);
    return null;
  }
}

/**
 * Fetch multiple token metadata in batch
 */
export async function fetchMultipleTokenMetadata(
  mintAddresses: string[]
): Promise<Map<string, TokenMetadata>> {
  const metadataMap = new Map<string, TokenMetadata>();

  // Fetch in parallel
  const results = await Promise.allSettled(
    mintAddresses.map((mint) => fetchTokenMetadata(mint))
  );

  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value) {
      metadataMap.set(mintAddresses[index], result.value);
    }
  });

  return metadataMap;
}

/**
 * Get RPC endpoint with Helius API key
 */
export function getHeliusRpcEndpoint(network: "mainnet" | "devnet" = "devnet"): string {
  if (!HELIUS_API_KEY) {
    throw new Error("Helius API key not configured");
  }

  const subdomain = network === "mainnet" ? "mainnet" : "devnet";
  return `https://${subdomain}.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
}
