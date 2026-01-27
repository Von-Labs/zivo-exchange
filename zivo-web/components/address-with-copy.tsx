"use client";

import { useEffect, useRef, useState } from "react";

interface AddressWithCopyProps {
  address: string;
  className?: string;
  textClassName?: string;
  buttonClassName?: string;
  prefixLength?: number;
  suffixLength?: number;
  copyLabel?: string;
  copiedLabel?: string;
}

const formatAddress = (address: string, prefixLength: number, suffixLength: number) => {
  if (!address) return "";
  if (address.length <= prefixLength + suffixLength + 3) return address;
  if (suffixLength <= 0) return `${address.slice(0, prefixLength)}...`;
  return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`;
};

const AddressWithCopy = ({
  address,
  className,
  textClassName,
  buttonClassName,
  prefixLength = 8,
  suffixLength = 8,
  copyLabel = "Copy",
  copiedLabel = "Copied",
}: AddressWithCopyProps) => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (!address) return;

    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className ?? ""}`.trim()}>
      <span className={textClassName}>{formatAddress(address, prefixLength, suffixLength)}</span>
      <button
        type="button"
        onClick={handleCopy}
        className={`rounded px-1.5 py-0.5 text-xs font-medium transition ${buttonClassName ?? "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`.trim()}
        aria-label={`Copy address ${address}`}
      >
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
};

export default AddressWithCopy;
