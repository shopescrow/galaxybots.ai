import { useQueryClient } from "@tanstack/react-query";
import { 
  useListClients, 
  useCreateClient, 
  useGetClient,
  useGetClientBots,
  useHireBot,
  getListClientsQueryKey,
  getGetClientBotsQueryKey
} from "@workspace/api-client-react";

export function useClients() {
  return useListClients();
}

export function useClient(id: number) {
  return useGetClient(id, { query: { enabled: !!id } });
}

export function useClientBots(id: number) {
  return useGetClientBots(id, { query: { enabled: !!id } });
}

export function useCreateNewClient() {
  const queryClient = useQueryClient();
  
  return useCreateClient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
      }
    }
  });
}

export function useHireNewBot() {
  const queryClient = useQueryClient();
  
  return useHireBot({
    mutation: {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: getGetClientBotsQueryKey(variables.id) });
      }
    }
  });
}
