import { NextResponse } from "next/server";

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3/coins";
const DEFAULT_DAYS = 180;
const MAX_DAYS = 365;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const coin = searchParams.get("coin") ?? "ethereum";
  const vsCurrency = searchParams.get("vs") ?? "usd";
  const daysParam = Number.parseInt(searchParams.get("days") ?? "", 10);
  const days = Number.isNaN(daysParam)
    ? DEFAULT_DAYS
    : Math.min(Math.max(daysParam, 1), MAX_DAYS);

  const url = `${COINGECKO_BASE_URL}/${encodeURIComponent(
    coin,
  )}/market_chart?vs_currency=${encodeURIComponent(vsCurrency)}&days=${days}&interval=daily`;

  const headers: HeadersInit = { accept: "application/json" };

  if (process.env.COINGECKO_API_KEY) {
    headers["x-cg-pro-api-key"] = process.env.COINGECKO_API_KEY;
  }

  const response = await fetch(url, {
    headers,
    next: { revalidate: 60 * 30 },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Upstream error" },
      { status: response.status },
    );
  }

  const payload = await response.json();
  const result = NextResponse.json(payload);

  result.headers.set(
    "Cache-Control",
    "public, s-maxage=1800, stale-while-revalidate=21600",
  );

  return result;
}
