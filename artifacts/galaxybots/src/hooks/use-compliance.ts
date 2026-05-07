import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPlatformCompliance,
  useGetPlatformComplianceConfig,
  useListClientCompliance,
  useCreateClientCompliance,
  useUpdateClientCompliance,
  useDeleteClientCompliance,
  getListClientComplianceQueryKey,
} from "@workspace/api-client-react";

export function usePlatformCompliance() {
  return useGetPlatformCompliance({
    query: {
      refetchInterval: 30000,
    },
  });
}

export function usePlatformComplianceConfig() {
  return useGetPlatformComplianceConfig();
}

export function useClientCompliance(clientId: number) {
  return useListClientCompliance(clientId, {
    query: {
      enabled: clientId > 0,
      refetchInterval: 15000,
    },
  });
}

export function useCreateClientComplianceMutation(clientId: number) {
  const queryClient = useQueryClient();
  return useCreateClientCompliance({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListClientComplianceQueryKey(clientId),
        });
      },
    },
  });
}

export function useUpdateClientComplianceMutation(clientId: number) {
  const queryClient = useQueryClient();
  return useUpdateClientCompliance({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListClientComplianceQueryKey(clientId),
        });
      },
    },
  });
}

export function useDeleteClientComplianceMutation(clientId: number) {
  const queryClient = useQueryClient();
  return useDeleteClientCompliance({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListClientComplianceQueryKey(clientId),
        });
      },
    },
  });
}
