import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
} from "@/lib/gaa-fetch";

const keys = {
  overview: ["gaa", "overview"] as const,
  goals: (status?: string) => ["gaa", "goals", status ?? "all"] as const,
  journal: ["gaa", "journal"] as const,
  escalations: (status?: string) =>
    ["gaa", "escalations", status ?? "all"] as const,
  constitution: ["gaa", "constitution"] as const,
};

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
