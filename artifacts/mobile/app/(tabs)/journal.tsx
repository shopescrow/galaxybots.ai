import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";

import { apiFetch } from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/LoadingSkeleton";
import colors from "@/constants/colors";
import type { JournalEntry } from "@/lib/types";

interface IntelligenceSummary {
  weekOverWeekImprovement: number | null;
  conductorStrategyWinRates: Array<{ strategy: string; avgScore: number; winRate: number }>;
  costEfficiency: { estimatedSavingsUsd: number; savingsPct: number };
  lastCycleRun: { ranAt: string | null; coordinatorCorrections: number; conductorCorrections: number; summary: string | null } | null;
}

function IntelligenceSummaryCard() {
  const { data, isLoading, isError } = useQuery<IntelligenceSummary>({
    queryKey: ["intelligence-summary"],
    queryFn: () => apiFetch<IntelligenceSummary>("intelligence/report?days=7"),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <View style={styles.intelligenceCard}>
        <ActivityIndicator size="small" color={colors.light.tint} />
      </View>
    );
  }

  if (isError || !data) return null;

  const wow = data.weekOverWeekImprovement;
  const savings = data.costEfficiency?.estimatedSavingsUsd ?? 0;
  const bestStrategy = data.conductorStrategyWinRates?.[0];
  const summary = data.lastCycleRun?.summary;

  return (
    <View style={styles.intelligenceCard}>
      <View style={styles.intelligenceHeader}>
        <Feather name="cpu" size={16} color={colors.light.tint} />
        <Text style={styles.intelligenceTitle}>Galaxy Intelligence</Text>
        <View style={styles.intelligenceBadge}>
          <Text style={styles.intelligenceBadgeText}>This Week</Text>
        </View>
      </View>

      <View style={styles.intelligenceMetrics}>
        <View style={styles.intelligenceMetric}>
          <Feather
            name={wow != null && wow >= 0 ? "trending-up" : "trending-down"}
            size={18}
            color={wow != null && wow >= 0 ? "#22c55e" : "#ef4444"}
          />
          <Text
            style={[
              styles.intelligenceMetricValue,
              { color: wow != null && wow >= 0 ? "#22c55e" : "#ef4444" },
            ]}
          >
            {wow != null ? `${wow > 0 ? "+" : ""}${wow}%` : "—"}
          </Text>
          <Text style={styles.intelligenceMetricLabel}>Quality</Text>
        </View>

        <View style={styles.intelligenceMetricDivider} />

        <View style={styles.intelligenceMetric}>
          <Feather name="dollar-sign" size={18} color="#22c55e" />
          <Text style={[styles.intelligenceMetricValue, { color: "#22c55e" }]}>
            ${savings.toFixed(3)}
          </Text>
          <Text style={styles.intelligenceMetricLabel}>Saved</Text>
        </View>

        {bestStrategy && (
          <>
            <View style={styles.intelligenceMetricDivider} />
            <View style={styles.intelligenceMetric}>
              <Feather name="award" size={18} color={colors.light.tint} />
              <Text style={styles.intelligenceMetricValue} numberOfLines={1}>
                {Math.round(bestStrategy.winRate * 100)}%
              </Text>
              <Text style={styles.intelligenceMetricLabel} numberOfLines={1}>
                Win Rate
              </Text>
            </View>
          </>
        )}
      </View>

      {summary && (
        <Text style={styles.intelligenceSummary} numberOfLines={3}>
          {summary}
        </Text>
      )}
    </View>
  );
}

export default function JournalScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["journal"],
    queryFn: () => apiFetch<JournalEntry[]>("journal"),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const toggleExpand = (id: number) => {
    Haptics.selectionAsync();
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderItem = useCallback(
    ({ item }: { item: JournalEntry }) => {
      const isExpanded = !!expanded[item.id];
      const date = new Date(item.date);
      const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
      const dayNum = date.getDate();
      const month = date.toLocaleDateString("en-US", { month: "short" });

      return (
        <Pressable
          style={styles.card}
          onPress={() => toggleExpand(item.id)}
        >
          <View style={styles.cardRow}>
            <View style={styles.dateBox}>
              <Text style={styles.dayName}>{dayName}</Text>
              <Text style={styles.dayNum}>{dayNum}</Text>
              <Text style={styles.month}>{month}</Text>
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle} numberOfLines={isExpanded ? undefined : 2}>
                {item.title}
              </Text>
              <Text style={styles.cardSummary} numberOfLines={isExpanded ? undefined : 3}>
                {item.summary}
              </Text>
              {isExpanded && item.boardroomHighlights?.length > 0 && (
                <View style={styles.highlights}>
                  <Text style={styles.highlightsTitle}>Key Highlights</Text>
                  {item.boardroomHighlights.map((h, i) => (
                    <View key={i} style={styles.highlightRow}>
                      <Feather name="check-circle" size={14} color={colors.light.accent} />
                      <Text style={styles.highlightText}>{h}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
            <Feather
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.light.textTertiary}
            />
          </View>
        </Pressable>
      );
    },
    [expanded],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Daily Journal</Text>

      {isLoading ? (
        <ListSkeleton count={4} />
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: tabBarHeight + 20, flexGrow: 1 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListHeaderComponent={<IntelligenceSummaryCard />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.light.tint} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="book-open"
              title="No journal entries"
              message="Daily AI-generated summaries of your platform activity will appear here"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: colors.light.text,
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  intelligenceCard: {
    backgroundColor: colors.light.tintLight,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.light.tint + "33",
  },
  intelligenceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  intelligenceTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.tint,
    flex: 1,
  },
  intelligenceBadge: {
    backgroundColor: colors.light.tint + "22",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  intelligenceBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: colors.light.tint,
    textTransform: "uppercase",
  },
  intelligenceMetrics: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  intelligenceMetric: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  intelligenceMetricValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: colors.light.text,
  },
  intelligenceMetricLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    textTransform: "uppercase",
  },
  intelligenceMetricDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.light.borderLight,
  },
  intelligenceSummary: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    lineHeight: 17,
    marginTop: 4,
    padding: 8,
    backgroundColor: colors.light.tint + "0D",
    borderRadius: 8,
  },
  card: {
    backgroundColor: colors.light.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
  },
  cardRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  dateBox: {
    alignItems: "center",
    width: 48,
    backgroundColor: colors.light.tintLight,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  dayName: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: colors.light.tint,
    textTransform: "uppercase",
  },
  dayNum: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: colors.light.tint,
  },
  month: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: colors.light.tint,
    textTransform: "uppercase",
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
    marginBottom: 4,
  },
  cardSummary: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    lineHeight: 19,
  },
  highlights: {
    marginTop: 12,
    gap: 6,
  },
  highlightsTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
    marginBottom: 2,
  },
  highlightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  highlightText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
});
