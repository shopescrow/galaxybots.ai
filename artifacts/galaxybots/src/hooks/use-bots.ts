import { useQuery } from "@tanstack/react-query";
import { useListBots, useGetBot } from "@workspace/api-client-react";

export function useBots() {
  return useListBots({
    query: {
      staleTime: 1000 * 60 * 5, // Cache for 5 mins
    }
  });
}

export function useBot(id: number) {
  return useGetBot(id, {
    query: {
      enabled: !!id,
    }
  });
}
