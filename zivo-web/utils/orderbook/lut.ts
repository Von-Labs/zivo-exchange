import { AddressLookupTableAccount, Connection, PublicKey } from "@solana/web3.js";
import lutConfig from "@/config/orderbook-lut.json";

export const getOrderbookLutAddress = (): PublicKey | null => {
  const value = typeof lutConfig.orderbookLut === "string" ? lutConfig.orderbookLut.trim() : "";
  if (!value) return null;
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
};

export const fetchOrderbookLut = async (
  connection: Connection,
): Promise<AddressLookupTableAccount | null> => {
  const address = getOrderbookLutAddress();
  if (!address) return null;
  const lookup = await connection.getAddressLookupTable(address);
  return lookup.value ?? null;
};
