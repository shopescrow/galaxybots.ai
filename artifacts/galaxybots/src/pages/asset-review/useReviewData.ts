import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  assetGet,
  assetPost,
  assetPut,
  assetDelete,
  type ReviewQueueResponse,
  type BulkReviewAction,
  type BulkReviewResult,
  type AutonomyConfig,
  type AutonomyRunResult,
  type AutoPublishLogEntry,
} from "@/lib/asset-fetch";

const QUEUE_KEY = ["asset-review", "queue"];
const CONFIG_KEY = ["asset-review", "autonomy-configs"];
const AUDIT_KEY = ["asset-review", "audit"];

export interface QueueFilters {
  type?: string;
  platform?: string;
  search?: string;
}

export function useReviewQueue(filters: QueueFilters) {
  return useQuery({
    queryKey: [...QUEUE_KEY, filters],
    queryFn: () =>
      assetGet<ReviewQueueResponse>("/review/queue", {
        type: filters.type,
        platform: filters.platform,
        search: filters.search,
      }),
    refetchInterval: 30_000,
  });
}

export function useBulkReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      ids: number[];
      action: BulkReviewAction;
      note?: string;
    }) => assetPost<BulkReviewResult>("/review/bulk", vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUEUE_KEY });
      qc.invalidateQueries({ queryKey: AUDIT_KEY });
    },
  });
}

export function useAutonomyConfigs() {
  return useQuery({
    queryKey: CONFIG_KEY,
    queryFn: () => assetGet<AutonomyConfig[]>("/autonomy/configs"),
  });
}

export function useUpsertAutonomyConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      assetType: string;
      targetPlatform: string;
      autoPublishEnabled: boolean;
      confidenceThreshold: number;
      requireCompliancePass: boolean;
    }) => assetPut<AutonomyConfig>("/autonomy/configs", vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONFIG_KEY });
      qc.invalidateQueries({ queryKey: QUEUE_KEY });
    },
  });
}

export function useDeleteAutonomyConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      assetDelete<{ success: boolean }>(`/autonomy/configs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONFIG_KEY });
      qc.invalidateQueries({ queryKey: QUEUE_KEY });
    },
  });
}

export function useRunAutonomy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => assetPost<AutonomyRunResult>("/autonomy/run", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUEUE_KEY });
      qc.invalidateQueries({ queryKey: AUDIT_KEY });
    },
  });
}

export function useAutoPublishAudit(rolledBack?: boolean) {
  return useQuery({
    queryKey: [...AUDIT_KEY, rolledBack ?? "all"],
    queryFn: () =>
      assetGet<AutoPublishLogEntry[]>("/autonomy/audit", {
        rolledBack: rolledBack === undefined ? undefined : String(rolledBack),
      }),
  });
}

export function useRollbackAutoPublish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; reason?: string }) =>
      assetPost<AutoPublishLogEntry>(
        `/autonomy/audit/${vars.id}/rollback`,
        { reason: vars.reason },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AUDIT_KEY });
      qc.invalidateQueries({ queryKey: QUEUE_KEY });
    },
  });
}
