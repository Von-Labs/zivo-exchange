import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet as useWalletBase } from "@solana/wallet-adapter-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const Header = () => {
  const { publicKey, disconnect } = useWalletBase();
  const { setVisible } = useWalletModal();
  const [showNetworkHint, setShowNetworkHint] = useState(false);
  const networkRef = useRef<HTMLDivElement | null>(null);

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const handleDisconnect = () => {
    disconnect();
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!networkRef.current) return;
      if (!networkRef.current.contains(event.target as Node)) {
        setShowNetworkHint(false);
      }
    };
    if (showNetworkHint) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showNetworkHint]);

  return (
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center gap-1">
          <Image
            src="/zivo-logo.png"
            alt="Zivo Exchange"
            width={140}
            height={40}
            className="h-9 w-auto"
          />
          <h2 className="text-xl font-semibold">Zivo Exchange</h2>
        </Link>
        <nav className="flex gap-6">
          <Link
            href="/"
            className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
          >
            Home
          </Link>
          <Link
            href="/airdrop"
            className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
          >
            Airdrop
          </Link>
          {/* <Link
            href="/admin"
            className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
          >
            Admin
          </Link> */}
          <Link
            href="/wrap"
            className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
          >
            Wrap Token
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative" ref={networkRef}>
          <button
            type="button"
            onClick={() => setShowNetworkHint((prev) => !prev)}
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"
          >
            Network: Devnet
          </button>
          {showNetworkHint ? (
            <div className="absolute right-0 mt-2 w-64 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 shadow-md z-20">
              Please switch wallet to Solana Devnet
            </div>
          ) : null}
        </div>
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
