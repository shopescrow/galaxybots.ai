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
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { apiFetch } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/LoadingSkeleton";
import colors from "@/constants/colors";
import type { Approval } from "@/lib/types";

type Filter = "pending" | "approved" | "rejected";

export default function ApprovalsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [filter, setFilter] = useState<Filter>("pending");
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["approvals", filter],
    queryFn: () => apiFetch<Approval[]>(`governance/approvals?status=${filter}`),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderItem = useCallback(({ item }: { item: Approval }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.95, transform: [{ scale: 0.98 }] }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({ pathname: "/approval/[id]", params: { id: String(item.id) } });
      }}
    >
      <View style={styles.cardHeader}>
        <View style={styles.toolIconWrap}>
          <Feather name="tool" size={16} color={colors.light.tint} />
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.toolName} numberOfLines={1}>{item.toolName}</Text>
          <Text style={styles.botName} numberOfLines={1}>
            {item.botName || `Bot #${item.botId}`}
          </Text>
        </View>
        <StatusBadge
          label={item.status}
          variant={item.status === "pending" ? "warning" : item.status === "approved" ? "success" : "danger"}
        />
      </View>
      <Text style={styles.timestamp}>{formatDate(item.createdAt)}</Text>
      <View style={styles.cardFooter}>
        <Feather name="chevron-right" size={16} color={colors.light.textTertiary} />
      </View>
    </Pressable>
  ), []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Approvals</Text>

      <View style={styles.filterRow}>
        {(["pending", "approved", "rejected"] as Filter[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setFilter(f);
            }}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

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
              icon="shield"
              title={`No ${filter} approvals`}
              message={filter === "pending" ? "All caught up! No actions need your approval." : `No ${filter} approvals to show.`}
            />
          }
        />
      )}
    </View>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.light.surfaceElevated,
  },
  filterChipActive: {
    backgroundColor: colors.light.tint,
  },
  filterText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: colors.light.textSecondary,
  },
  filterTextActive: {
    color: "#FFFFFF",
  },
  card: {
    backgroundColor: colors.light.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  toolIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.light.tintLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderText: {
    flex: 1,
  },
  toolName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
  },
  botName: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    marginTop: 1,
  },
  timestamp: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
    marginTop: 4,
  },
  cardFooter: {
    alignItems: "flex-end",
    marginTop: 4,
  },
});
