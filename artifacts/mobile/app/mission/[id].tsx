import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { apiFetch, apiPost } from "@/lib/api";
import { useClient } from "@/lib/client-context";
import { StatusBadge } from "@/components/StatusBadge";
import { ListSkeleton } from "@/components/LoadingSkeleton";
import colors from "@/constants/colors";
import type { TaskSession, SessionMessage, Approval } from "@/lib/types";

export default function MissionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { activeClient } = useClient();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [actingApprovalId, setActingApprovalId] = useState<number | null>(null);

  const subParam = activeClient ? `?subClientId=${activeClient.id}` : "";
  const subAmp = activeClient ? `&subClientId=${activeClient.id}` : "";

  const { data: session, isLoading: sessionLoading, refetch: refetchSession } = useQuery({
    queryKey: ["task-session", id, activeClient?.id],
    queryFn: () => apiFetch<TaskSession>(`task-sessions/${id}${subParam}`),
  });

  const { data: messages, isLoading: messagesLoading, refetch: refetchMessages } = useQuery({
    queryKey: ["task-session-messages", id, activeClient?.id],
    queryFn: () => apiFetch<SessionMessage[]>(`task-sessions/${id}/messages${subParam}`),
    refetchInterval: session?.status === "active" || session?.status === "running" ? 5000 : false,
  });

  const { data: pendingApprovals, refetch: refetchApprovals } = useQuery({
    queryKey: ["mission-approvals", id, activeClient?.id],
    queryFn: () =>
      apiFetch<Approval[]>(`governance/approvals?status=pending${subAmp}`).then((all) =>
        all.filter((a) => a.sessionId === Number(id))
      ),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([refetchSession(), refetchMessages(), refetchApprovals()]);
    setRefreshing(false);
  }, [refetchSession, refetchMessages, refetchApprovals]);

  const handleApprovalAction = useCallback(
    async (approval: Approval, action: "approve" | "reject") => {
      const label = action === "approve" ? "Approve" : "Reject";
      Alert.alert(
        `${label} step?`,
        `Bot "${approval.botName || "Bot"}" wants to run "${approval.toolName}".`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: label,
            style: action === "reject" ? "destructive" : "default",
            onPress: async () => {
              setActingApprovalId(approval.id);
              Haptics.notificationAsync(
                action === "approve"
                  ? Haptics.NotificationFeedbackType.Success
                  : Haptics.NotificationFeedbackType.Warning
              );
              try {
                await apiPost(`governance/approvals/${approval.id}/${action}`, {
                  ...(action === "reject" ? {} : {}),
                  subClientId: activeClient?.id,
                });
                queryClient.invalidateQueries({ queryKey: ["mission-approvals"] });
                queryClient.invalidateQueries({ queryKey: ["governance-pending"] });
                queryClient.invalidateQueries({ queryKey: ["approvals"] });
                queryClient.invalidateQueries({ queryKey: ["pendingApprovals"] });
                refetchApprovals();
                refetchMessages();
              } catch (err) {
                Alert.alert(
                  "Error",
                  err instanceof Error ? err.message : "Action failed"
                );
              } finally {
                setActingApprovalId(null);
              }
            },
          },
        ]
      );
    },
    [queryClient, refetchApprovals, refetchMessages]
  );

  if (sessionLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.light.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Mission</Text>
          <View style={{ width: 34 }} />
        </View>
        <ListSkeleton count={4} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.light.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Not Found</Text>
          <View style={{ width: 34 }} />
        </View>
        <View style={{ padding: 40, alignItems: "center" }}>
          <Text style={{ fontFamily: "Inter_400Regular", color: colors.light.textSecondary }}>
            Mission not found.
          </Text>
        </View>
      </View>
    );
  }

  const isLive = session.status === "active" || session.status === "running";
  const botNames = session.teamBots?.map((b) => b.name) ?? [];
  const textMessages = messages?.filter((m) => m.messageType === "text") ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Mission</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.light.tint} />
        }
      >
        <View style={styles.missionCard}>
          <View style={styles.missionCardHeader}>
            <View style={styles.missionIcon}>
              <Feather name="target" size={20} color={colors.light.tint} />
            </View>
            <View style={{ flex: 1 }}>
              <StatusBadge
                label={session.status}
                variant={
                  isLive
                    ? "info"
                    : session.status === "completed"
                    ? "success"
                    : session.status === "failed"
                    ? "danger"
                    : "warning"
                }
              />
              {isLive && (
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>Live</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={styles.objective}>{session.objective || "No objective set"}</Text>
          {botNames.length > 0 && (
            <View style={styles.botsRow}>
              <Feather name="cpu" size={13} color={colors.light.textTertiary} />
              <Text style={styles.botsText}>{botNames.join(", ")}</Text>
            </View>
          )}
          <Text style={styles.sessionDate}>
            Started {new Date(session.createdAt).toLocaleString()}
          </Text>
        </View>

        {pendingApprovals && pendingApprovals.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              <Feather name="alert-circle" size={14} color={colors.light.warning} /> Awaiting Approval
            </Text>
            {pendingApprovals.map((approval) => {
              const isActing = actingApprovalId === approval.id;
              return (
                <View key={approval.id} style={styles.approvalCard}>
                  <Text style={styles.approvalTool}>{approval.toolName}</Text>
                  <Text style={styles.approvalBot} numberOfLines={1}>
                    {approval.botName || `Bot #${approval.botId}`}
                  </Text>
                  <View style={styles.approvalActions}>
                    <Pressable
                      style={[styles.rejectBtn, isActing && { opacity: 0.6 }]}
                      onPress={() => handleApprovalAction(approval, "reject")}
                      disabled={isActing}
                    >
                      {isActing ? (
                        <ActivityIndicator size="small" color={colors.light.danger} />
                      ) : (
                        <>
                          <Feather name="x" size={15} color={colors.light.danger} />
                          <Text style={styles.rejectText}>Reject</Text>
                        </>
                      )}
                    </Pressable>
                    <Pressable
                      style={[styles.approveBtn, isActing && { opacity: 0.6 }]}
                      onPress={() => handleApprovalAction(approval, "approve")}
                      disabled={isActing}
                    >
                      {isActing ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Feather name="check" size={15} color="#FFFFFF" />
                          <Text style={styles.approveText}>Approve</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </>
        )}

        <Text style={styles.sectionTitle}>Activity Log</Text>
        {messagesLoading ? (
          <ListSkeleton count={3} />
        ) : textMessages.length === 0 ? (
          <View style={styles.emptyLog}>
            <Text style={styles.emptyLogText}>No activity yet</Text>
          </View>
        ) : (
          <View style={styles.logList}>
            {textMessages.map((entry, index) => (
              <View key={entry.id || index} style={styles.logEntry}>
                <View style={styles.logLine}>
                  <View style={[styles.logDot, { backgroundColor: getLogColor(entry.role) }]} />
                  {index < textMessages.length - 1 && <View style={styles.logConnector} />}
                </View>
                <View style={styles.logContent}>
                  <Text style={styles.logMessage}>{entry.content}</Text>
                  {entry.botName && (
                    <Text style={styles.logBot}>{entry.botName}</Text>
                  )}
                  <Text style={styles.logTime}>{timeAgo(entry.createdAt)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function getLogColor(role: string): string {
  if (role === "user") return colors.light.tint;
  if (role === "bot") return colors.light.accent;
  return colors.light.textTertiary;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.border,
    backgroundColor: colors.light.surface,
    gap: 10,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
    textAlign: "center",
  },
  missionCard: {
    backgroundColor: colors.light.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
    marginBottom: 20,
    gap: 10,
  },
  missionCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  missionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.light.tintLight,
    alignItems: "center",
    justifyContent: "center",
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.light.accent,
  },
  liveText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.accent,
  },
  objective: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
    lineHeight: 22,
  },
  botsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  botsText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    flex: 1,
  },
  sessionDate: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
    marginBottom: 12,
    marginTop: 4,
  },
  approvalCard: {
    backgroundColor: colors.light.warningLight,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.light.warning + "40",
    marginBottom: 10,
    gap: 6,
  },
  approvalTool: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
  },
  approvalBot: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    marginBottom: 4,
  },
  approvalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.light.dangerLight,
    borderWidth: 1,
    borderColor: colors.light.danger + "30",
  },
  rejectText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.danger,
  },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.light.accent,
  },
  approveText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  emptyLog: {
    padding: 32,
    alignItems: "center",
  },
  emptyLogText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
  },
  logList: {
    gap: 0,
  },
  logEntry: {
    flexDirection: "row",
    gap: 12,
    minHeight: 52,
  },
  logLine: {
    alignItems: "center",
    width: 16,
  },
  logDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  logConnector: {
    flex: 1,
    width: 1.5,
    backgroundColor: colors.light.borderLight,
    marginTop: 4,
    marginBottom: -4,
  },
  logContent: {
    flex: 1,
    paddingBottom: 16,
  },
  logMessage: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: colors.light.text,
    lineHeight: 20,
  },
  logBot: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.tint,
    marginTop: 2,
  },
  logTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
    marginTop: 2,
  },
});
