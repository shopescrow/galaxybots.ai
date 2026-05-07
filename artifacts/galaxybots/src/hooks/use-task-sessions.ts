import { useQueryClient } from "@tanstack/react-query";
import {
  useListTaskSessions,
  useGetTaskSession,
  useGetTaskSessionMessages,
  useGetTaskSessionAlerts,
  useAnalyzeTask,
  useCreateTaskSession,
  useSendTaskSessionMessage,
  useExpandTaskSession,
  useFabricateBot,
  getListTaskSessionsQueryKey,
  getGetTaskSessionQueryKey,
  getGetTaskSessionMessagesQueryKey,
  getGetTaskSessionAlertsQueryKey,
} from "@workspace/api-client-react";

export function useTaskSessions() {
  return useListTaskSessions({
    query: {
      refetchInterval: 10000,
    },
  });
}

export function useTaskSession(id: number) {
  return useGetTaskSession(id, {
    query: {
      enabled: id > 0,
    },
  });
}

export function useTaskSessionMessages(id: number) {
  return useGetTaskSessionMessages(id, {
    query: {
      enabled: id > 0,
      refetchInterval: 5000,
    },
  });
}

export function useTaskSessionAlerts(id: number) {
  return useGetTaskSessionAlerts(id, {
    query: {
      enabled: id > 0,
      refetchInterval: 8000,
    },
  });
}

export function useAnalyzeTaskMutation() {
  return useAnalyzeTask();
}

export function useCreateTaskSessionMutation() {
  const queryClient = useQueryClient();
  return useCreateTaskSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListTaskSessionsQueryKey(),
        });
      },
    },
  });
}

export function useSendTaskMessage(sessionId: number) {
  const queryClient = useQueryClient();
  return useSendTaskSessionMessage({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetTaskSessionMessagesQueryKey(sessionId),
        });
        queryClient.invalidateQueries({
          queryKey: getGetTaskSessionAlertsQueryKey(sessionId),
        });
      },
    },
  });
}

export function useExpandSession(sessionId: number) {
  const queryClient = useQueryClient();
  return useExpandTaskSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetTaskSessionQueryKey(sessionId),
        });
        queryClient.invalidateQueries({
          queryKey: getGetTaskSessionAlertsQueryKey(sessionId),
        });
      },
    },
  });
}

export function useFabricateBotMutation() {
  const queryClient = useQueryClient();
  return useFabricateBot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListTaskSessionsQueryKey(),
        });
      },
    },
  });
}
