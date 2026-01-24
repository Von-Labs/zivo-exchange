import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet as useWalletBase } from "@solana/wallet-adapter-react";
import Image from "next/image";
import Link from "next/link";

const Header = () => {
  const { publicKey, disconnect } = useWalletBase();
  const { setVisible } = useWalletModal();

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const handleDisconnect = () => {
    disconnect();
  };

  return (
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-8">
        <Link href="/">
          <h2>Zivo Exchange</h2>
          {/* <Image src="/zivo.svg" alt="Zivo Exchange" width={139} height={40} /> */}
        </Link>
        <nav className="flex gap-6">
          <Link
            href="/"
            className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
          >
            Home
          </Link>
          <Link
            href="/create-token"
            className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
          >
            Create Token
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        {publicKey ? (
          <>
            <span className="text-sm font-medium text-gray-700">
              {formatAddress(publicKey.toBase58())}
            </span>
            <button
              onClick={handleDisconnect}
              className="rounded-full bg-gray-200 text-gray-700 px-4 py-2 font-medium hover:bg-gray-300 transition-colors"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={() => setVisible(true)}
            className="rounded-full bg-[#3673F5] text-white px-6 py-3 font-medium hover:bg-[#2d5bd6] transition-colors"
          >
            Connect Wallet
          </button>
        )}
      </div>
    </div>
  );
};

export default Header;
