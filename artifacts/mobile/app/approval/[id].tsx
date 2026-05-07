import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { apiFetch, apiPost } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { ListSkeleton } from "@/components/LoadingSkeleton";
import colors from "@/constants/colors";
import type { Approval } from "@/lib/types";

export default function ApprovalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);

  const { data: approval, isLoading } = useQuery({
    queryKey: ["approval", id],
    queryFn: async () => {
      const all = await apiFetch<Approval[]>("governance/approvals?status=all");
      return all.find((a) => a.id === Number(id)) ?? null;
    },
  });

  const handleAction = async (action: "approve" | "reject") => {
    if (!approval) return;

    const label = action === "approve" ? "Approve" : "Reject";
    Alert.alert(
      `${label} this action?`,
      `The bot "${approval.botName || "Bot"}" wants to run "${approval.toolName}".`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: label,
          style: action === "reject" ? "destructive" : "default",
          onPress: async () => {
            setActing(action);
            Haptics.notificationAsync(
              action === "approve"
                ? Haptics.NotificationFeedbackType.Success
                : Haptics.NotificationFeedbackType.Warning,
            );
            try {
              await apiPost(`governance/approvals/${id}/${action}`, {});
              queryClient.invalidateQueries({ queryKey: ["approvals"] });
              queryClient.invalidateQueries({ queryKey: ["pendingApprovals"] });
              queryClient.invalidateQueries({ queryKey: ["approval", id] });
              router.back();
            } catch (err) {
              Alert.alert("Error", err instanceof Error ? err.message : "Action failed");
            } finally {
              setActing(null);
            }
          },
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.light.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Approval Detail</Text>
          <View style={{ width: 34 }} />
        </View>
        <ListSkeleton count={3} />
      </View>
    );
  }

  if (!approval) {
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
            This approval was not found.
          </Text>
        </View>
      </View>
    );
  }

  const inputStr = approval.toolInput
    ? JSON.stringify(approval.toolInput, null, 2)
    : "No input data";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Approval Detail</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Tool</Text>
            <Text style={styles.infoValue}>{approval.toolName}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Bot</Text>
            <Text style={styles.infoValue}>{approval.botName || `Bot #${approval.botId}`}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status</Text>
            <StatusBadge
              label={approval.status}
              variant={approval.status === "pending" ? "warning" : approval.status === "approved" ? "success" : "danger"}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Created</Text>
            <Text style={styles.infoValue}>
              {new Date(approval.createdAt).toLocaleString()}
            </Text>
          </View>
          {approval.resolvedAt && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Resolved</Text>
                <Text style={styles.infoValue}>
                  {new Date(approval.resolvedAt).toLocaleString()}
                </Text>
              </View>
            </>
          )}
          {approval.rejectionReason && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Reason</Text>
                <Text style={[styles.infoValue, { color: colors.light.danger }]}>{approval.rejectionReason}</Text>
              </View>
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>Tool Input</Text>
        <View style={styles.codeBlock}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text style={styles.codeText}>{inputStr}</Text>
          </ScrollView>
        </View>
      </ScrollView>

      {approval.status === "pending" && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            style={[styles.rejectBtn, !!acting && { opacity: 0.6 }]}
            onPress={() => handleAction("reject")}
            disabled={!!acting}
          >
            {acting === "reject" ? (
              <ActivityIndicator size="small" color={colors.light.danger} />
            ) : (
              <>
                <Feather name="x" size={18} color={colors.light.danger} />
                <Text style={styles.rejectText}>Reject</Text>
              </>
            )}
          </Pressable>
          <Pressable
            style={[styles.approveBtn, !!acting && { opacity: 0.6 }]}
            onPress={() => handleAction("approve")}
            disabled={!!acting}
          >
            {acting === "approve" ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Feather name="check" size={18} color="#FFFFFF" />
                <Text style={styles.approveText}>Approve</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
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
  infoCard: {
    backgroundColor: colors.light.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: colors.light.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
    maxWidth: "60%",
    textAlign: "right",
  },
  divider: {
    height: 1,
    backgroundColor: colors.light.borderLight,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
    marginTop: 24,
    marginBottom: 10,
  },
  codeBlock: {
    backgroundColor: colors.light.surfaceElevated,
    borderRadius: 12,
    padding: 14,
  },
  codeText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.text,
    lineHeight: 18,
  },
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.light.surface,
    borderTopWidth: 1,
    borderTopColor: colors.light.border,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.light.dangerLight,
    borderWidth: 1,
    borderColor: colors.light.danger + "30",
  },
  rejectText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.danger,
  },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.light.accent,
  },
  approveText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
});
