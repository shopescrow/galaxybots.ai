import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBoardroomMessages,
  usePostBoardroomMessage,
  getGetBoardroomMessagesQueryKey,
} from "@workspace/api-client-react";

const SSE_ENDPOINT = "/api/events/background";

export function useBoardroom(limit?: number) {
  const queryClient = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetBoardroomMessagesQueryKey() });
  }, [queryClient]);

  useEffect(() => {
    if (esRef.current) return;

    const es = new EventSource(SSE_ENDPOINT);
    esRef.current = es;

    es.addEventListener("boardroom_message", () => {
      invalidate();
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setTimeout(() => {
        if (!esRef.current) {
          const next = new EventSource(SSE_ENDPOINT);
          esRef.current = next;
          next.addEventListener("boardroom_message", () => {
            invalidate();
          });
          next.onerror = () => {
            next.close();
            esRef.current = null;
          };
        }
      }, 5000);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [invalidate]);

  return useGetBoardroomMessages({ limit });
}

export function useSendBoardroomMessage() {
  const queryClient = useQueryClient();

  return usePostBoardroomMessage({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBoardroomMessagesQueryKey() });
      },
    },
  });
}
