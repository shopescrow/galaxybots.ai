import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
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
