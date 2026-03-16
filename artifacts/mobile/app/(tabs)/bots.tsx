import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  TextInput,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { apiFetch } from "@/lib/api";
import { ListSkeleton } from "@/components/LoadingSkeleton";
import { EmptyState } from "@/components/EmptyState";
import colors from "@/constants/colors";
import type { Bot } from "@/lib/types";

const DEPT_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  sales: "trending-up",
  marketing: "target",
  support: "headphones",
  finance: "dollar-sign",
  hr: "users",
  engineering: "code",
  operations: "settings",
  legal: "file-text",
};

const DEPT_COLORS: Record<string, string> = {
  sales: "#10B981",
  marketing: "#F59E0B",
  support: "#6366F1",
  finance: "#EF4444",
  hr: "#EC4899",
  engineering: "#3B82F6",
  operations: "#8B5CF6",
  legal: "#64748B",
};

export default function BotsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["bots"],
    queryFn: () => apiFetch<Bot[]>("bots"),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const filtered = (data || []).filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.department.toLowerCase().includes(search.toLowerCase()) ||
      b.title.toLowerCase().includes(search.toLowerCase()),
  );

  const renderItem = useCallback(({ item }: { item: Bot }) => {
    const dept = item.department.toLowerCase();
    const deptColor = DEPT_COLORS[dept] || colors.light.tint;
    const deptIcon = DEPT_ICONS[dept] || "cpu";

    return (
      <Pressable
        style={({ pressed }) => [styles.botCard, pressed && { opacity: 0.95, transform: [{ scale: 0.98 }] }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push({ pathname: "/chat/[botId]", params: { botId: String(item.id) } });
        }}
      >
        <View style={[styles.botAvatar, { backgroundColor: deptColor + "18" }]}>
          <Feather name={deptIcon} size={20} color={deptColor} />
        </View>
        <View style={styles.botInfo}>
          <Text style={styles.botName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.botTitle} numberOfLines={1}>{item.title}</Text>
          <View style={styles.deptRow}>
            <View style={[styles.deptDot, { backgroundColor: deptColor }]} />
            <Text style={styles.deptText}>{item.department}</Text>
          </View>
        </View>
        <Feather name="message-circle" size={20} color={colors.light.textTertiary} />
      </Pressable>
    );
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Bots</Text>

      <View style={styles.searchWrap}>
        <Feather name="search" size={18} color={colors.light.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search bots..."
          placeholderTextColor={colors.light.textTertiary}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Feather name="x" size={18} color={colors.light.textTertiary} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <ListSkeleton count={5} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: tabBarHeight + 20, flexGrow: 1 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.light.tint} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="cpu"
              title="No bots found"
              message={search ? "Try a different search term" : "No bots are available yet"}
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
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.light.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: colors.light.text,
  },
  botCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.light.surface,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
  },
  botAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  botInfo: {
    flex: 1,
  },
  botName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
  },
  botTitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    marginTop: 1,
  },
  deptRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  deptDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  deptText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: colors.light.textTertiary,
    textTransform: "capitalize",
  },
});
