import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetBoardroomMessages, 
  usePostBoardroomMessage,
  getGetBoardroomMessagesQueryKey
} from "@workspace/api-client-react";

export function useBoardroom(limit?: number) {
  return useGetBoardroomMessages(
    { limit },
    {
      query: {
        refetchInterval: 5000, // Polling for live board feeling
      }
    }
  );
}

export function useSendBoardroomMessage() {
  const queryClient = useQueryClient();
  
  return usePostBoardroomMessage({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBoardroomMessagesQueryKey() });
      }
    }
  });
}
