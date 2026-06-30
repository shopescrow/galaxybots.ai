import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";

import { apiFetch, apiPost } from "@/lib/api";
import { useClient } from "@/lib/client-context";
import { ClientSwitcher } from "@/components/ClientSwitcher";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/LoadingSkeleton";
import colors from "@/constants/colors";
import type { Approval } from "@/lib/types";

type Tab = "pending" | "history";

const HIGH_RISK_TOOLS = [
  "galaxy_mind_strategy",
  "send_email",
  "delete_record",
  "execute_code",
  "write_file",
  "create_webhook",
  "modify_permissions",
];

const MEDIUM_RISK_TOOLS = [
  "web_search",
  "read_file",
  "query_database",
  "create_document",
  "update_record",
];

function getRisk(toolName: string): "high" | "medium" | "low" {
  if (HIGH_RISK_TOOLS.some((t) => toolName.toLowerCase().includes(t.toLowerCase())))
    return "high";
  if (MEDIUM_RISK_TOOLS.some((t) => toolName.toLowerCase().includes(t.toLowerCase())))
    return "medium";
  return "low";
}

function summarizeInput(toolInput: unknown): string {
  if (!toolInput) return "";
  try {
    const obj = typeof toolInput === "string" ? JSON.parse(toolInput) : toolInput;
    if (typeof obj !== "object" || obj === null) return String(toolInput).slice(0, 120);
    const entries = Object.entries(obj as Record<string, unknown>).slice(0, 3);
    return entries
      .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`)
      .join(" · ");
  } catch {
    return String(toolInput).slice(0, 120);
  }
}

export default function GovernanceScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { activeClient } = useClient();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("pending");
  const [refreshing, setRefreshing] = useState(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actingId, setActingId] = useState<number | null>(null);

  const subParam = activeClient ? `&subClientId=${activeClient.id}` : "";

  const pending = useQuery({
    queryKey: ["governance-pending", activeClient?.id],
    queryFn: () =>
      apiFetch<Approval[]>(`governance/approvals?status=pending${subParam}`),
    enabled: !!activeClient && tab === "pending",
  });

  const history = useQuery({
    queryKey: ["governance-history", activeClient?.id],
    queryFn: () =>
      apiFetch<Approval[]>(`governance/approvals?status=all${subParam}`).then(
        (all) => all.filter((a) => a.status !== "pending")
      ),
    enabled: !!activeClient && tab === "history",
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (tab === "pending") await pending.refetch();
    else await history.refetch();
    setRefreshing(false);
  }, [tab, pending, history]);

  const handleApprove = useCallback(
    async (item: Approval) => {
      setActingId(item.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      try {
        await apiPost(`governance/approvals/${item.id}/approve`, {
          subClientId: activeClient?.id,
        });
        queryClient.invalidateQueries({ queryKey: ["governance-pending"] });
        queryClient.invalidateQueries({ queryKey: ["governance-history"] });
        queryClient.invalidateQueries({ queryKey: ["approvals"] });
        queryClient.invalidateQueries({ queryKey: ["pendingApprovals"] });
      } catch (err) {
        Alert.alert(
          "Error",
          err instanceof Error ? err.message : "Could not approve"
        );
      } finally {
        setActingId(null);
      }
    },
    [queryClient]
  );

  const handleReject = useCallback(
    async (item: Approval) => {
      if (!rejectReason.trim()) {
        Alert.alert("Reason Required", "Please enter a reason for rejection.");
        return;
      }
      setActingId(item.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      try {
        await apiPost(`governance/approvals/${item.id}/reject`, {
          reason: rejectReason.trim(),
          subClientId: activeClient?.id,
        });
        setRejectingId(null);
        setRejectReason("");
        queryClient.invalidateQueries({ queryKey: ["governance-pending"] });
        queryClient.invalidateQueries({ queryKey: ["governance-history"] });
        queryClient.invalidateQueries({ queryKey: ["approvals"] });
        queryClient.invalidateQueries({ queryKey: ["pendingApprovals"] });
      } catch (err) {
        Alert.alert(
          "Error",
          err instanceof Error ? err.message : "Could not reject"
        );
      } finally {
        setActingId(null);
      }
    },
    [rejectReason, queryClient]
  );

  const renderPendingItem = useCallback(
    ({ item }: { item: Approval }) => {
      const isActing = actingId === item.id;
      const isRejectOpen = rejectingId === item.id;
      const risk = getRisk(item.toolName);
      const inputSummary = summarizeInput(item.toolInput);

      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.riskIcon, { backgroundColor: getRiskBg(risk) }]}>
              <Feather
                name={getRiskIcon(risk)}
                size={16}
                color={getRiskColor(risk)}
              />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {item.toolName}
              </Text>
              <View style={styles.badges}>
                <StatusBadge
                  label={risk === "high" ? "High Risk" : risk === "medium" ? "Medium Risk" : "Low Risk"}
                  variant={risk === "high" ? "danger" : risk === "medium" ? "warning" : "info"}
                />
              </View>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Feather name="cpu" size={12} color={colors.light.textTertiary} />
            <Text style={styles.infoText}>
              {item.botName || `Bot #${item.botId}`}
            </Text>
          </View>

          {inputSummary.length > 0 && (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Parameters</Text>
              <Text style={styles.summaryText} numberOfLines={3}>
                {inputSummary}
              </Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Feather name="clock" size={12} color={colors.light.textTertiary} />
            <Text style={styles.infoText}>{formatDate(item.createdAt)}</Text>
          </View>

          {isRejectOpen && (
            <View style={styles.rejectInputWrap}>
              <TextInput
                style={styles.rejectInput}
                placeholder="Enter reason for rejection…"
                placeholderTextColor={colors.light.textTertiary}
                value={rejectReason}
                onChangeText={setRejectReason}
                multiline
                numberOfLines={3}
                autoFocus
              />
            </View>
          )}

          <View style={styles.actionRow}>
            {isRejectOpen ? (
              <>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => {
                    setRejectingId(null);
                    setRejectReason("");
                  }}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.confirmRejectBtn, isActing && { opacity: 0.6 }]}
                  onPress={() => handleReject(item)}
                  disabled={isActing}
                >
                  {isActing ? (
                    <ActivityIndicator size="small" color={colors.light.danger} />
                  ) : (
                    <Text style={styles.confirmRejectText}>Confirm Reject</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={[styles.rejectBtn, isActing && { opacity: 0.6 }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setRejectingId(item.id);
                    setRejectReason("");
                  }}
                  disabled={isActing}
                >
                  <Feather name="x" size={15} color={colors.light.danger} />
                  <Text style={styles.rejectText}>Reject</Text>
                </Pressable>
                <Pressable
                  style={[styles.approveBtn, isActing && { opacity: 0.6 }]}
                  onPress={() => handleApprove(item)}
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
              </>
            )}
          </View>
        </View>
      );
    },
    [actingId, rejectingId, rejectReason, handleApprove, handleReject]
  );

  const renderHistoryItem = useCallback(
    ({ item }: { item: Approval }) => {
      const risk = getRisk(item.toolName);
      return (
        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.historyTitle} numberOfLines={2}>
                {item.toolName}
              </Text>
              <View style={styles.historyMeta}>
                <Text style={styles.historyBot}>
                  {item.botName || `Bot #${item.botId}`}
                </Text>
                <Text style={styles.docDot}>·</Text>
                <Text style={[styles.historyBot, { color: getRiskColor(risk) }]}>
                  {risk === "high" ? "High Risk" : risk === "medium" ? "Medium" : "Low Risk"}
                </Text>
              </View>
            </View>
            <StatusBadge
              label={item.status}
              variant={item.status === "approved" ? "success" : "danger"}
            />
          </View>
          {item.rejectionReason && (
            <Text style={styles.historyReason} numberOfLines={2}>
              "{item.rejectionReason}"
            </Text>
          )}
          {item.resolvedAt && (
            <Text style={styles.historyDate}>{formatDate(item.resolvedAt)}</Text>
          )}
        </View>
      );
    },
    []
  );

  const isLoading = tab === "pending" ? pending.isLoading : history.isLoading;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Governance</Text>
        <ClientSwitcher />
      </View>

      <View style={styles.tabRow}>
        {(["pending", "history"] as Tab[]).map((t) => (
          <Pressable
            key={t}
            style={[styles.tabChip, tab === t && styles.tabChipActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setTab(t);
            }}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "pending" ? "Pending Review" : "History"}
            </Text>
            {t === "pending" && (pending.data?.length ?? 0) > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pending.data!.length}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <ListSkeleton count={3} />
      ) : tab === "pending" ? (
        <FlatList
          data={pending.data || []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderPendingItem}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: tabBarHeight + 20,
            flexGrow: 1,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.light.tint}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="shield"
              title="No pending items"
              message="All tool approvals have been reviewed."
            />
          }
        />
      ) : (
        <FlatList
          data={history.data || []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderHistoryItem}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: tabBarHeight + 20,
            flexGrow: 1,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.light.tint}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="clock"
              title="No decisions yet"
              message="Approved and rejected tool requests will appear here."
            />
          }
        />
      )}
    </View>
  );
}

function getRiskIcon(risk: "high" | "medium" | "low"): keyof typeof Feather.glyphMap {
  if (risk === "high") return "alert-triangle";
  if (risk === "medium") return "alert-circle";
  return "info";
}

function getRiskColor(risk: "high" | "medium" | "low"): string {
  if (risk === "high") return colors.light.danger;
  if (risk === "medium") return colors.light.warning;
  return colors.light.tint;
}

function getRiskBg(risk: "high" | "medium" | "low"): string {
  if (risk === "high") return colors.light.dangerLight;
  if (risk === "medium") return colors.light.warningLight;
  return colors.light.tintLight;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: colors.light.text,
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.light.surfaceElevated,
  },
  tabChipActive: {
    backgroundColor: colors.light.tint,
  },
  tabText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: colors.light.textSecondary,
  },
  tabTextActive: {
    color: "#FFFFFF",
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.light.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  card: {
    backgroundColor: colors.light.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  riskIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  cardHeaderText: {
    flex: 1,
    gap: 6,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  itemTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
    lineHeight: 21,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
  },
  summaryBox: {
    backgroundColor: colors.light.surfaceElevated,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  summaryLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    lineHeight: 17,
  },
  rejectInputWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.danger + "50",
    backgroundColor: colors.light.dangerLight,
    padding: 10,
  },
  rejectInput: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.light.text,
    minHeight: 64,
    textAlignVertical: "top",
  },
  actionRow: {
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
    height: 44,
    borderRadius: 12,
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
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.light.accent,
  },
  approveText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.light.surfaceElevated,
  },
  cancelText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: colors.light.textSecondary,
  },
  confirmRejectBtn: {
    flex: 2,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.light.dangerLight,
    borderWidth: 1,
    borderColor: colors.light.danger + "50",
  },
  confirmRejectText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.danger,
  },
  historyCard: {
    backgroundColor: colors.light.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
    gap: 6,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  historyTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
    lineHeight: 20,
  },
  historyMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  historyBot: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
  },
  docDot: {
    fontSize: 12,
    color: colors.light.textTertiary,
  },
  historyReason: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    lineHeight: 18,
    fontStyle: "italic",
  },
  historyDate: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
  },
});
