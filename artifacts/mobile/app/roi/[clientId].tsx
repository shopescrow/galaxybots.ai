import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  Share,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { apiFetch, apiPost, API_BASE } from "@/lib/api";
import { MetricCard } from "@/components/MetricCard";
import { ListSkeleton } from "@/components/LoadingSkeleton";
import { SectionHeader } from "@/components/SectionHeader";
import colors from "@/constants/colors";
import type { RoiData } from "@/lib/types";

export default function RoiScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery({
    queryKey: ["roi", clientId],
    queryFn: () => apiFetch<RoiData>(`roi/client/${clientId}`),
  });

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await apiPost<{ shareToken: string }>(
        `roi/client/${clientId}/shareable`,
        {
          dateFrom: new Date(Date.now() - 30 * 86400000).toISOString(),
          dateTo: new Date().toISOString(),
          title: `${data?.companyName || "Company"} ROI Report`,
        },
      );
      const shareUrl = `${API_BASE}roi/shared/${result.shareToken}`;
      await Share.share({
        message: `Check out our AI ROI report: ${shareUrl}`,
        url: shareUrl,
      });
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to generate share link");
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.light.text} />
          </Pressable>
          <Text style={styles.headerTitle}>ROI Report</Text>
          <View style={{ width: 34 }} />
        </View>
        <ListSkeleton count={4} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.light.text} />
          </Pressable>
          <Text style={styles.headerTitle}>ROI Report</Text>
          <View style={{ width: 34 }} />
        </View>
        <View style={{ padding: 40, alignItems: "center" }}>
          <Text style={{ fontFamily: "Inter_400Regular", color: colors.light.textSecondary }}>
            No ROI data available for this company.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{data.companyName}</Text>
        <Pressable onPress={handleShare} hitSlop={12} style={styles.backBtn}>
          <Feather name="share" size={20} color={colors.light.tint} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 30 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Total Value Delivered</Text>
          <Text style={styles.heroValue}>
            ${data.totalDollarsSaved.toLocaleString()}
          </Text>
          <Text style={styles.heroSub}>
            {data.totalHoursSaved.toFixed(1)} hours saved across {data.totalSessions} sessions
          </Text>
        </View>

        <View style={styles.metricsRow}>
          <MetricCard
            icon="clock"
            iconColor={colors.light.accent}
            label="Hours Saved"
            value={data.totalHoursSaved.toFixed(1)}
            compact
          />
          <MetricCard
            icon="zap"
            iconColor={colors.light.warning}
            label="Sessions"
            value={data.totalSessions}
            compact
          />
          <MetricCard
            icon="tool"
            iconColor={colors.light.tint}
            label="Tools Used"
            value={data.totalToolsUsed}
            compact
          />
        </View>

        {data.topBots.length > 0 && (
          <>
            <SectionHeader title="Top Performers" />
            <View style={styles.listWrap}>
              {data.topBots.slice(0, 5).map((bot, i) => (
                <View key={bot.name} style={styles.listItem}>
                  <View style={[styles.rank, i === 0 && styles.rankFirst]}>
                    <Text style={[styles.rankText, i === 0 && styles.rankTextFirst]}>
                      {i + 1}
                    </Text>
                  </View>
                  <View style={styles.listItemContent}>
                    <Text style={styles.listItemName} numberOfLines={1}>{bot.name}</Text>
                    <Text style={styles.listItemMeta}>
                      {bot.sessions} sessions · {bot.hoursSaved.toFixed(1)}h saved
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {data.departmentBreakdown.length > 0 && (
          <>
            <SectionHeader title="By Department" />
            <View style={styles.listWrap}>
              {data.departmentBreakdown.map((dept) => (
                <View key={dept.name} style={styles.deptItem}>
                  <Text style={styles.deptName}>{dept.name}</Text>
                  <View style={styles.deptMeta}>
                    <Text style={styles.deptValue}>{dept.hoursSaved.toFixed(1)}h</Text>
                    <Text style={styles.deptSub}>{dept.sessions} sessions</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {data.recentOutcomes?.length > 0 && (
          <>
            <SectionHeader title="Recent Outcomes" />
            {data.recentOutcomes.slice(0, 5).map((outcome) => (
              <View key={outcome.id} style={styles.outcomeCard}>
                <Text style={styles.outcomeSummary} numberOfLines={3}>
                  {outcome.summary}
                </Text>
                <View style={styles.outcomeMeta}>
                  <Text style={styles.outcomeMetaText}>
                    {outcome.department} · {outcome.hoursSaved.toFixed(1)}h saved
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
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
  heroCard: {
    backgroundColor: colors.light.tint,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
  },
  heroLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.8)",
    marginBottom: 6,
  },
  heroValue: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  listWrap: {
    backgroundColor: colors.light.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
    overflow: "hidden",
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.borderLight,
  },
  rank: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.light.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  rankFirst: {
    backgroundColor: colors.light.warningLight,
  },
  rankText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: colors.light.textSecondary,
  },
  rankTextFirst: {
    color: colors.light.warning,
  },
  listItemContent: {
    flex: 1,
  },
  listItemName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
  },
  listItemMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    marginTop: 1,
  },
  deptItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.borderLight,
  },
  deptName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: colors.light.text,
    textTransform: "capitalize",
  },
  deptMeta: {
    alignItems: "flex-end",
  },
  deptValue: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: colors.light.text,
  },
  deptSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
  },
  outcomeCard: {
    backgroundColor: colors.light.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
  },
  outcomeSummary: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.light.text,
    lineHeight: 20,
  },
  outcomeMeta: {
    marginTop: 8,
  },
  outcomeMetaText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: colors.light.textSecondary,
  },
});
