import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import type { Connection, Commitment } from "@solana/web3.js";
import type { AnchorWallet } from "@solana/wallet-adapter-react";

import orderbookIdl from "@/idl/zivo_orderbook_program.json";

export type OrderbookProgram = Program<Idl>;

type ProgramOptions = {
  commitment?: Commitment;
};

export const getOrderbookProgram = (
  connection: Connection,
  wallet: AnchorWallet,
  options: ProgramOptions = {},
): OrderbookProgram => {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: options.commitment ?? "confirmed",
  });

  return new Program(orderbookIdl as Idl, provider);
};
