import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { apiFetch, apiPost } from "@/lib/api";
import { useClient } from "@/lib/client-context";
import { ListSkeleton } from "@/components/LoadingSkeleton";
import colors from "@/constants/colors";
import type { Bot, TaskSession } from "@/lib/types";

export default function NewMissionScreen() {
  const insets = useSafeAreaInsets();
  const { activeClient } = useClient();
  const queryClient = useQueryClient();
  const [objective, setObjective] = useState("");
  const [selectedBotIds, setSelectedBotIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: bots, isLoading: botsLoading } = useQuery({
    queryKey: ["bots", activeClient?.id],
    queryFn: () =>
      apiFetch<{ data: Bot[] }>(
        `bots${activeClient ? `?subClientId=${activeClient.id}` : ""}`
      ).then((r) => r.data),
  });

  const toggleBot = useCallback((botId: number) => {
    Haptics.selectionAsync();
    setSelectedBotIds((prev) =>
      prev.includes(botId) ? prev.filter((id) => id !== botId) : [...prev, botId]
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!objective.trim()) {
      Alert.alert("Objective Required", "Please describe what this mission should accomplish.");
      return;
    }
    if (selectedBotIds.length === 0) {
      Alert.alert("Select Bots", "Choose at least one bot to deploy for this mission.");
      return;
    }
    if (!activeClient) {
      Alert.alert("No Client", "Select a client before launching a mission.");
      return;
    }

    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const body: { objective: string; botIds: number[]; subClientId?: number } = {
        objective: objective.trim(),
        botIds: selectedBotIds,
      };
      if (activeClient) {
        body.subClientId = activeClient.id;
      }
      const session = await apiPost<TaskSession>("task-sessions", body);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["task-sessions"] });
      router.replace({
        pathname: "/mission/[id]" as never,
        params: { id: String(session.id) },
      });
    } catch (err) {
      Alert.alert(
        "Launch Failed",
        err instanceof Error ? err.message : "Could not start mission."
      );
      setSubmitting(false);
    }
  }, [objective, selectedBotIds, activeClient, queryClient]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="x" size={22} color={colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>New Mission</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.fieldLabel}>Objective</Text>
        <TextInput
          style={styles.objectiveInput}
          placeholder="What should your bots accomplish?"
          placeholderTextColor={colors.light.textTertiary}
          value={objective}
          onChangeText={setObjective}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          autoFocus
        />
        <Text style={styles.fieldHint}>
          Be specific — e.g., "Research and summarize the top 5 competitors in our market and
          draft a competitive analysis report."
        </Text>

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>Deploy Bots</Text>
        <Text style={styles.fieldHint}>Select one or more bots to execute this mission.</Text>

        {botsLoading ? (
          <ListSkeleton count={4} />
        ) : !bots || bots.length === 0 ? (
          <View style={styles.emptyBots}>
            <Text style={styles.emptyBotsText}>No bots available.</Text>
          </View>
        ) : (
          <View style={styles.botGrid}>
            {bots.filter((b) => b.isAvailable).map((bot) => {
              const selected = selectedBotIds.includes(bot.id);
              return (
                <Pressable
                  key={bot.id}
                  style={({ pressed }) => [
                    styles.botCard,
                    selected && styles.botCardSelected,
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => toggleBot(bot.id)}
                >
                  <View style={styles.botCardHeader}>
                    <View style={[styles.botIcon, selected && styles.botIconSelected]}>
                      <Feather
                        name="cpu"
                        size={18}
                        color={selected ? colors.light.tint : colors.light.textSecondary}
                      />
                    </View>
                    {selected && (
                      <View style={styles.checkMark}>
                        <Feather name="check" size={12} color="#FFFFFF" />
                      </View>
                    )}
                  </View>
                  <Text
                    style={[styles.botName, selected && { color: colors.light.tint }]}
                    numberOfLines={1}
                  >
                    {bot.name}
                  </Text>
                  <Text style={styles.botDepartment} numberOfLines={1}>
                    {bot.department}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 12 },
        ]}
      >
        {activeClient && (
          <View style={styles.clientPill}>
            <Feather name="briefcase" size={13} color={colors.light.textSecondary} />
            <Text style={styles.clientPillText} numberOfLines={1}>
              {activeClient.companyName}
            </Text>
          </View>
        )}
        <Pressable
          style={[styles.launchBtn, submitting && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Feather name="zap" size={18} color="#FFFFFF" />
              <Text style={styles.launchText}>Launch Mission</Text>
            </>
          )}
        </Pressable>
      </View>
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
  fieldLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
    marginBottom: 8,
  },
  fieldHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
    lineHeight: 17,
    marginTop: 6,
  },
  objectiveInput: {
    backgroundColor: colors.light.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: colors.light.text,
    minHeight: 100,
    textAlignVertical: "top",
  },
  emptyBots: {
    padding: 32,
    alignItems: "center",
  },
  emptyBotsText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
  },
  botGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  botCard: {
    width: "47%",
    backgroundColor: colors.light.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
    gap: 8,
  },
  botCardSelected: {
    borderColor: colors.light.tint,
    backgroundColor: colors.light.tintLight,
  },
  botCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  botIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.light.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  botIconSelected: {
    backgroundColor: colors.light.tintLight,
  },
  checkMark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  botName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
  },
  botDepartment: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingTop: 12,
    backgroundColor: colors.light.surface,
    borderTopWidth: 1,
    borderTopColor: colors.light.border,
    gap: 10,
  },
  clientPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: colors.light.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  clientPillText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: colors.light.textSecondary,
  },
  launchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.light.tint,
    shadowColor: colors.light.tint,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  launchText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
});
