import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useEffect } from "react";
import {
  gaaGet,
  gaaPost,
  gaaPatch,
  type GaaGoal,
  type GaaJournalEntry,
  type GaaEscalation,
  type GaaConstitutionPrinciple,
  type GaaOverview,
  type GaaCycleSummary,
  type SelfActOverview,
  type BotCapability,
  type BotReflectionRow,
  type PracticeRunRow,
  type KnowledgeTransferRow,
  type SelfModificationRow,
  type SelfActMetricRow,
} from "@/lib/gaa-fetch";

const SSE_ENDPOINT = "/api/events/background";

const keys = {
  overview: ["gaa", "overview"] as const,
  goals: (status?: string) => ["gaa", "goals", status ?? "all"] as const,
  journal: ["gaa", "journal"] as const,
  escalations: (status?: string) =>
    ["gaa", "escalations", status ?? "all"] as const,
  constitution: ["gaa", "constitution"] as const,
  memory: ["gaa", "memory"] as const,
  conflicts: ["gaa", "conflicts"] as const,
  selfAct: {
    overview: ["gaa", "self-act", "overview"] as const,
    capability: ["gaa", "self-act", "capability"] as const,
    reflections: ["gaa", "self-act", "reflections"] as const,
    practice: ["gaa", "self-act", "practice"] as const,
    transfers: ["gaa", "self-act", "transfers"] as const,
    modifications: ["gaa", "self-act", "modifications"] as const,
    metrics: ["gaa", "self-act", "metrics"] as const,
  },
};

/**
 * Opens a shared SSE connection for GAA real-time events.
 * Invalidates the memory query on gaa_memory_promoted and the
 * conflicts query on gaa_conflicts_detected / gaa_conflict_resolved.
 * Admin-only: the backend gates platform-channel events on role.
 */
export function useGaaSSE() {
  const queryClient = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (esRef.current) return;

    const es = new EventSource(SSE_ENDPOINT);
    esRef.current = es;

    const handleMemory = () => {
      queryClient.invalidateQueries({ queryKey: keys.memory });
    };
    const handleConflicts = () => {
      queryClient.invalidateQueries({ queryKey: keys.conflicts });
      queryClient.invalidateQueries({ queryKey: ["gaa", "goals"] });
    };

    es.addEventListener("gaa_memory_promoted", handleMemory);
    es.addEventListener("gaa_conflicts_detected", handleConflicts);
    es.addEventListener("gaa_conflict_resolved", handleConflicts);

    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    es.onerror = () => {
      es.close();
      esRef.current = null;
      retryTimeout = setTimeout(() => {
        if (!esRef.current) {
          const next = new EventSource(SSE_ENDPOINT);
          esRef.current = next;
          next.addEventListener("gaa_memory_promoted", handleMemory);
          next.addEventListener("gaa_conflicts_detected", handleConflicts);
          next.addEventListener("gaa_conflict_resolved", handleConflicts);
          next.onerror = () => {
            next.close();
            esRef.current = null;
          };
        }
      }, 5000);
    };

    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
      es.close();
      esRef.current = null;
    };
  }, [queryClient]);
}

export type GaaMemoryRow = {
  id: number;
  key: string;
  content: string;
  tier: string;
  scope: string;
  clientId: number | null;
  confidence: number;
  timesReinforced: number;
  updatedAt: string;
};

export type GaaConflictRow = {
  goalAId: number;
  goalATitle: string;
  goalBId: number;
  goalBTitle: string;
  conflictType: string;
  overlap: number;
};

/**
 * Fetches GAA memory. Invalidated in real-time by useGaaSSE when
 * gaa_memory_promoted events arrive — no polling needed.
 */
export function useGaaMemory(scope?: "platform" | "client", clientId?: number) {
  return useQuery({
    queryKey: [...keys.memory, scope, clientId] as const,
    queryFn: () => {
      const params: Record<string, string> = {};
      if (scope) params.scope = scope;
      if (clientId != null) params.clientId = String(clientId);
      return gaaGet<GaaMemoryRow[]>("/memory", params);
    },
  });
}

/**
 * Fetches active goal conflicts. Invalidated in real-time by useGaaSSE when
 * gaa_conflicts_detected / gaa_conflict_resolved events arrive — no polling needed.
 */
export function useGaaConflicts() {
  return useQuery({
    queryKey: keys.conflicts,
    queryFn: () => gaaGet<GaaConflictRow[]>("/conflicts"),
  });
}

export function useGaaOverview() {
  return useQuery({
    queryKey: keys.overview,
    queryFn: () => gaaGet<GaaOverview>("/overview"),
    refetchInterval: 15000,
  });
}

export function useGaaGoals(status?: string) {
  return useQuery({
    queryKey: keys.goals(status),
    queryFn: () => gaaGet<GaaGoal[]>("/goals", { status }),
    refetchInterval: 15000,
  });
}

export function useGaaJournal() {
  return useQuery({
    queryKey: keys.journal,
    queryFn: () => gaaGet<GaaJournalEntry[]>("/journal"),
    refetchInterval: 15000,
  });
}

export function useGaaEscalations(status?: string) {
  return useQuery({
    queryKey: keys.escalations(status),
    queryFn: () => gaaGet<GaaEscalation[]>("/escalations", { status }),
    refetchInterval: 15000,
  });
}

export function useGaaConstitution() {
  return useQuery({
    queryKey: keys.constitution,
    queryFn: () => gaaGet<GaaConstitutionPrinciple[]>("/constitution"),
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      description?: string;
      mode?: string;
      temporalTier?: string;
      priority?: number;
      purpose?: string;
    }) => gaaPost<GaaGoal>("/goals", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gaa", "goals"] });
      qc.invalidateQueries({ queryKey: keys.overview });
    },
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      status?: string;
      priority?: number;
      costEnvelopeCents?: number;
    }) => gaaPatch<GaaGoal>(`/goals/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gaa", "goals"] });
      qc.invalidateQueries({ queryKey: keys.overview });
    },
  });
}

export function useResolveEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      decision,
      resolution,
    }: {
      id: number;
      decision: "approved" | "redirected" | "aborted";
      resolution?: string;
    }) => gaaPost<GaaEscalation>(`/escalations/${id}/resolve`, { decision, resolution }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gaa", "escalations"] });
      qc.invalidateQueries({ queryKey: keys.overview });
    },
  });
}

export function useRunTick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => gaaPost<GaaCycleSummary>("/tick"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gaa"] });
    },
  });
}

// ---- Self-actualization engine -------------------------------------------
export function useSelfActOverview() {
  return useQuery({
    queryKey: keys.selfAct.overview,
    queryFn: () => gaaGet<SelfActOverview>("/self-actualization/overview"),
    refetchInterval: 15000,
  });
}

export function useSelfActCapability() {
  return useQuery({
    queryKey: keys.selfAct.capability,
    queryFn: () => gaaGet<BotCapability[]>("/self-actualization/capability"),
    refetchInterval: 30000,
  });
}

export function useSelfActReflections() {
  return useQuery({
    queryKey: keys.selfAct.reflections,
    queryFn: () => gaaGet<BotReflectionRow[]>("/self-actualization/reflections"),
    refetchInterval: 30000,
  });
}

export function useSelfActPractice() {
  return useQuery({
    queryKey: keys.selfAct.practice,
    queryFn: () => gaaGet<PracticeRunRow[]>("/self-actualization/practice"),
    refetchInterval: 30000,
  });
}

export function useSelfActTransfers() {
  return useQuery({
    queryKey: keys.selfAct.transfers,
    queryFn: () =>
      gaaGet<KnowledgeTransferRow[]>("/self-actualization/transfers"),
    refetchInterval: 30000,
  });
}

export function useSelfActModifications() {
  return useQuery({
    queryKey: keys.selfAct.modifications,
    queryFn: () =>
      gaaGet<SelfModificationRow[]>("/self-actualization/modifications"),
    refetchInterval: 15000,
  });
}

export function useSelfActMetrics() {
  return useQuery({
    queryKey: keys.selfAct.metrics,
    queryFn: () => gaaGet<SelfActMetricRow[]>("/self-actualization/metrics"),
    refetchInterval: 30000,
  });
}

export function useSetKillSwitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (active: boolean) =>
      gaaPost<{ active: boolean; rolledBack: number }>(
        "/self-actualization/kill-switch",
        { active },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gaa", "self-act"] });
    },
  });
}

export function useApproveModification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      gaaPost<SelfModificationRow>(
        `/self-actualization/modifications/${id}/approve`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.selfAct.modifications });
    },
  });
}

export function useRejectModification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      gaaPost<SelfModificationRow>(
        `/self-actualization/modifications/${id}/reject`,
        { reason },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.selfAct.modifications });
    },
  });
}

export function useRollbackModification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      gaaPost<SelfModificationRow>(
        `/self-actualization/modifications/${id}/rollback`,
        { reason },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.selfAct.modifications });
    },
  });
}
