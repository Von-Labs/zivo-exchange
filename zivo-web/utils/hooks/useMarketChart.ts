import { useQuery } from "@tanstack/react-query";

import { http } from "@/utils/http";

export type MarketChartResponse = {
  prices: [number, number][];
  total_volumes: [number, number][];
};

type MarketChartParams = {
  coin?: string;
  vs?: string;
  days: number;
};

const fetchMarketChart = async ({
  coin = "solana",
  vs = "usd",
  days,
}: MarketChartParams) => {
  const response = await http.get<MarketChartResponse>(
    "/api/coingecko/market-chart",
    {
      params: { coin, vs, days },
    },
  );

  return response.data;
};

export const useMarketChart = ({ coin = "solana", vs = "usd", days }: MarketChartParams) =>
  useQuery({
    queryKey: ["marketChart", coin, vs, days],
    queryFn: () => fetchMarketChart({ coin, vs, days }),
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60 * 12,
    refetchOnWindowFocus: false,
    retry: 1,
  });
