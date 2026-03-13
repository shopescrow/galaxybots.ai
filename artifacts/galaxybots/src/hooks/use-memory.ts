import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBotMemories,
  useDeleteMemory,
  useConsolidateSession,
  useListBotAssignments,
  useCreateBotAssignment,
  useUpdateBotAssignment,
  useDeleteBotAssignment,
  useRunBotAssignment,
  useListBackgroundReports,
  getGetBotMemoriesQueryKey,
  getListBotAssignmentsQueryKey,
  getListBackgroundReportsQueryKey,
} from "@workspace/api-client-react";

export function useBotMemories(botId: number, limit?: number) {
  return useGetBotMemories(botId, { limit }, {
    query: {
      enabled: botId > 0,
    },
  });
}

export function useDeleteMemoryMutation() {
  const queryClient = useQueryClient();
  return useDeleteMemory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            return Array.isArray(key) && typeof key[0] === "string" && key[0].includes("memories");
          },
        });
      },
    },
  });
}

export function useConsolidateSessionMutation() {
  return useConsolidateSession();
}

export function useBotAssignments() {
  return useListBotAssignments({
    query: {
      refetchInterval: 15000,
    },
  });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useCreateBotAssignment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListBotAssignmentsQueryKey(),
        });
      },
    },
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();
  return useUpdateBotAssignment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListBotAssignmentsQueryKey(),
        });
      },
    },
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  return useDeleteBotAssignment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListBotAssignmentsQueryKey(),
        });
      },
    },
  });
}

export function useRunAssignment() {
  const queryClient = useQueryClient();
  return useRunBotAssignment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListBotAssignmentsQueryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: getListBackgroundReportsQueryKey(),
        });
      },
    },
  });
}

export function useBackgroundReports(botId?: number, limit?: number) {
  return useListBackgroundReports({ botId, limit }, {
    query: {
      refetchInterval: 15000,
    },
  });
}
