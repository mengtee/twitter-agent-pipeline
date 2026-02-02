import useSWR from "swr";
import type { SearchConfig } from "@pipeline/types.js";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useSearches() {
  const { data, error, isLoading, mutate } = useSWR<{ searches: SearchConfig[] }>(
    "/api/searches",
    fetcher
  );

  return {
    searches: data?.searches ?? [],
    isLoading,
    error,
    mutate,
  };
}
