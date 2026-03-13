import { useQueryClient } from "@tanstack/react-query";
import { 
  useListConversations, 
  useCreateConversation, 
  useGetConversationMessages, 
  useSendMessage,
  getListConversationsQueryKey,
  getGetConversationMessagesQueryKey
} from "@workspace/api-client-react";

export function useConversations(clientId?: number | null, botId?: number | null) {
  return useListConversations(
    { clientId, botId },
    { query: { enabled: true } }
  );
}

export function useStartConversation() {
  const queryClient = useQueryClient();
  
  return useCreateConversation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      }
    }
  });
}

export function useChatMessages(conversationId: number) {
  return useGetConversationMessages(conversationId, {
    query: {
      enabled: !!conversationId,
      refetchInterval: 3000, // Poll for new messages 
    }
  });
}

export function useSendChatMessage() {
  const queryClient = useQueryClient();
  
  return useSendMessage({
    mutation: {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ 
          queryKey: getGetConversationMessagesQueryKey(variables.id) 
        });
      }
    }
  });
}
