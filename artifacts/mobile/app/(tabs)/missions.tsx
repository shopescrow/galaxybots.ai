import React, { useCallback, useMemo, useState } from "react";
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
import { useClient } from "@/lib/client-context";
import { ClientSwitcher } from "@/components/ClientSwitcher";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/LoadingSkeleton";
import colors from "@/constants/colors";
import type { TaskSession } from "@/lib/types";

type Filter = "active" | "completed" | "all";

export default function MissionsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { activeClient } = useClient();
  const [filter, setFilter] = useState<Filter>("active");
  const [refreshing, setRefreshing] = useState(false);

  const { data: allSessions, isLoading, refetch } = useQuery({
    queryKey: ["task-sessions", activeClient?.id],
    queryFn: () =>
      apiFetch<TaskSession[]>(
        `task-sessions${activeClient ? `?subClientId=${activeClient.id}` : ""}`
      ),
    enabled: !!activeClient,
  });

  const data = useMemo(() => {
    if (!allSessions) return [];
    if (filter === "all") return allSessions;
    return allSessions.filter((s) => {
      if (filter === "active") return s.status === "active" || s.status === "running";
      if (filter === "completed") return s.status === "completed";
      return true;
    });
  }, [allSessions, filter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: TaskSession }) => {
      const botNames = item.teamBots?.map((b) => b.name) ?? [];
      return (
        <Pressable
          style={({ pressed }) => [
            styles.card,
            pressed && { opacity: 0.95, transform: [{ scale: 0.98 }] },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push({
              pathname: "/mission/[id]" as never,
              params: { id: String(item.id) },
            });
          }}
        >
          <View style={styles.cardHeader}>
            <View style={styles.iconWrap}>
              <Feather name="target" size={16} color={colors.light.tint} />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.objective} numberOfLines={2}>
                {item.objective || "Mission"}
              </Text>
              {botNames.length > 0 && (
                <Text style={styles.bots} numberOfLines={1}>
                  {botNames.slice(0, 3).join(", ")}
                </Text>
              )}
            </View>
            <StatusBadge
              label={item.status}
              variant={
                item.status === "active" || item.status === "running"
                  ? "info"
                  : item.status === "completed"
                  ? "success"
                  : item.status === "failed"
                  ? "danger"
                  : "warning"
              }
            />
          </View>

          <View style={styles.cardFooter}>
            <View style={styles.metaRow}>
              <Feather name="clock" size={12} color={colors.light.textTertiary} />
              <Text style={styles.metaText}>{timeAgo(item.createdAt)}</Text>
              {botNames.length > 0 && (
                <View style={styles.botCountBadge}>
                  <Feather name="cpu" size={11} color={colors.light.tint} />
                  <Text style={styles.botCountText}>{botNames.length} bot{botNames.length !== 1 ? "s" : ""}</Text>
                </View>
              )}
            </View>
            <Feather
              name="chevron-right"
              size={16}
              color={colors.light.textTertiary}
            />
          </View>
        </Pressable>
      );
    },
    []
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Missions</Text>
        <ClientSwitcher />
      </View>

      <View style={styles.filterRow}>
        {(["active", "completed", "all"] as Filter[]).map((f) => (
          <Pressable
            key={f}
            style={[
              styles.filterChip,
              filter === f && styles.filterChipActive,
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setFilter(f);
            }}
          >
            <Text
              style={[
                styles.filterText,
                filter === f && styles.filterTextActive,
              ]}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <ListSkeleton count={4} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: tabBarHeight + 20,
            flexGrow: 1,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.light.tint}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="target"
              title="No missions yet"
              message={
                filter === "active"
                  ? "Launch a new mission to deploy your bot fleet."
                  : "No missions to display."
              }
            />
          }
        />
      )}

      <Pressable
        style={[styles.fab, { bottom: tabBarHeight + 16 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push("/mission/new" as never);
        }}
      >
        <Feather name="plus" size={24} color="#FFFFFF" />
      </Pressable>
    </View>
  );
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
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.light.tintLight,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  cardHeaderText: {
    flex: 1,
  },
  objective: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
    lineHeight: 21,
  },
  bots: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    marginTop: 3,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  metaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
    marginRight: 8,
  },
  botCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.light.tintLight,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  botCountText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: colors.light.tint,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.light.tint,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
