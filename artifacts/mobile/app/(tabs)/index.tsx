import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { MetricCard } from "@/components/MetricCard";
import { SectionHeader } from "@/components/SectionHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { CardSkeleton, ListSkeleton } from "@/components/LoadingSkeleton";
import { EmptyState } from "@/components/EmptyState";
import colors from "@/constants/colors";
import type { CompanyCard, CostCapInfo, Approval, ActivityItem } from "@/lib/types";

export default function CommandCenterScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: () => apiFetch<CompanyCard[]>("command-center/companies"),
  });

  const costCap = useQuery({
    queryKey: ["costCap"],
    queryFn: () => apiFetch<CostCapInfo>("analytics/cost-cap"),
  });

  const approvals = useQuery({
    queryKey: ["pendingApprovals"],
    queryFn: () => apiFetch<Approval[]>("governance/approvals?status=pending"),
  });

  const activity = useQuery({
    queryKey: ["recentActivity"],
    queryFn: () => apiFetch<{ items: ActivityItem[]; total: number }>("command-center/activity?limit=5"),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([
      companies.refetch(),
      costCap.refetch(),
      approvals.refetch(),
      activity.refetch(),
    ]);
    setRefreshing(false);
  }, [companies, costCap, approvals, activity]);

  const totalActiveSessions = companies.data?.reduce((s, c) => s + c.activeSessions, 0) ?? 0;
  const pendingCount = approvals.data?.length ?? 0;
  const monthlySpend = costCap.data?.currentMonthlySpend ?? 0;
  const capAmount = costCap.data?.cap?.monthlyCapUsd ?? 0;
  const spendPct = capAmount > 0 ? Math.round((monthlySpend / capAmount) * 100) : 0;

  const isLoading = companies.isLoading || costCap.isLoading;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: tabBarHeight + 20 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.light.tint} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greeting}>
            {getGreeting()}, {user?.displayName?.split(" ")[0] || "Commander"}
          </Text>
          <Text style={styles.headerSubtitle}>Your fleet at a glance</Text>
        </View>
        <View style={styles.avatarWrap}>
          <Feather name="user" size={18} color={colors.light.tint} />
        </View>
      </View>

      {isLoading ? (
        <View style={styles.metricsRow}>
          <CardSkeleton />
          <CardSkeleton />
        </View>
      ) : (
        <>
          <View style={styles.metricsRow}>
            <MetricCard
              icon="activity"
              iconColor={colors.light.accent}
              label="Active Sessions"
              value={totalActiveSessions}
            />
            <Pressable
              style={{ flex: 1 }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/(tabs)/approvals");
              }}
            >
              <MetricCard
                icon="shield"
                iconColor={pendingCount > 0 ? colors.light.warning : colors.light.accent}
                label="Pending Approvals"
                value={pendingCount}
                subtitle={pendingCount > 0 ? "Needs attention" : "All clear"}
              />
            </Pressable>
          </View>
          <View style={styles.metricsRow}>
            <MetricCard
              icon="dollar-sign"
              iconColor={spendPct > 80 ? colors.light.danger : colors.light.tint}
              label="Monthly Spend"
              value={`$${monthlySpend.toFixed(2)}`}
              subtitle={capAmount > 0 ? `${spendPct}% of $${capAmount} cap` : "No cap set"}
            />
            <MetricCard
              icon="briefcase"
              label="Companies"
              value={companies.data?.length ?? 0}
            />
          </View>
        </>
      )}

      {!!companies.data && companies.data.length > 0 && (
        <>
          <SectionHeader title="Company Health" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.companiesScroll}
          >
            {companies.data.map((c) => (
              <Pressable
                key={c.id}
                style={styles.companyCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({ pathname: "/roi/[clientId]", params: { clientId: String(c.id) } });
                }}
              >
                <View style={styles.companyHeader}>
                  <Text style={styles.companyName} numberOfLines={1}>{c.companyName}</Text>
                  <StatusBadge
                    label={c.healthTag || c.status}
                    variant={getHealthVariant(c.healthScore)}
                  />
                </View>
                {c.healthScore !== null && (
                  <View style={styles.healthRow}>
                    <Text style={styles.healthScore}>{c.healthScore}</Text>
                    <Text style={styles.healthLabel}>/100</Text>
                    {c.healthTrend && (
                      <Feather
                        name={c.healthTrend === "up" ? "trending-up" : c.healthTrend === "down" ? "trending-down" : "minus"}
                        size={14}
                        color={c.healthTrend === "up" ? colors.light.accent : c.healthTrend === "down" ? colors.light.danger : colors.light.textTertiary}
                        style={{ marginLeft: 6 }}
                      />
                    )}
                  </View>
                )}
                <View style={styles.companyMeta}>
                  <Text style={styles.companyMetaText}>
                    {c.activeSessions} active {c.activeSessions === 1 ? "session" : "sessions"}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      <SectionHeader
        title="Recent Activity"
        action="View all"
        onAction={() => {}}
      />
      {activity.isLoading ? (
        <ListSkeleton count={3} />
      ) : !activity.data?.items?.length ? (
        <EmptyState
          icon="inbox"
          title="No activity yet"
          message="Bot actions and events will appear here"
        />
      ) : (
        <View style={styles.activityList}>
          {activity.data.items.slice(0, 5).map((item) => (
            <View key={`${item.type}-${item.id}`} style={styles.activityItem}>
              <View style={[styles.activityIcon, { backgroundColor: item.type === "tool_call" ? colors.light.tintLight : colors.light.accentLight }]}>
                <Feather
                  name={item.type === "tool_call" ? "tool" : "file-text"}
                  size={16}
                  color={item.type === "tool_call" ? colors.light.tint : colors.light.accent}
                />
              </View>
              <View style={styles.activityContent}>
                <Text style={styles.activityAction} numberOfLines={1}>{item.action}</Text>
                <Text style={styles.activityMeta} numberOfLines={1}>
                  {item.botName ? `${item.botName} · ` : ""}{timeAgo(item.createdAt)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getHealthVariant(score: number | null) {
  if (score === null) return "neutral" as const;
  if (score >= 80) return "success" as const;
  if (score >= 50) return "warning" as const;
  return "danger" as const;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 20,
    marginTop: 8,
  },
  greeting: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: colors.light.text,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.light.tintLight,
    alignItems: "center",
    justifyContent: "center",
  },
  metricsRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 4,
  },
  companiesScroll: {
    paddingHorizontal: 20,
    gap: 12,
  },
  companyCard: {
    backgroundColor: colors.light.surface,
    borderRadius: 16,
    padding: 16,
    width: 220,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
  },
  companyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 10,
  },
  companyName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
    flex: 1,
  },
  healthRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 6,
  },
  healthScore: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: colors.light.text,
  },
  healthLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
  },
  companyMeta: {
    marginTop: 4,
  },
  companyMetaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
  },
  activityList: {
    paddingHorizontal: 20,
    gap: 8,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.light.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  activityContent: {
    flex: 1,
  },
  activityAction: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: colors.light.text,
  },
  activityMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    marginTop: 2,
  },
});
