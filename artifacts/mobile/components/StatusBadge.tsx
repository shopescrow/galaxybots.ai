import React from "react";
import { View, Text, StyleSheet } from "react-native";
import colors from "@/constants/colors";

type Variant = "success" | "warning" | "danger" | "info" | "neutral";

const VARIANTS: Record<Variant, { bg: string; text: string }> = {
  success: { bg: colors.light.accentLight, text: colors.light.accent },
  warning: { bg: colors.light.warningLight, text: colors.light.warning },
  danger: { bg: colors.light.dangerLight, text: colors.light.danger },
  info: { bg: colors.light.tintLight, text: colors.light.tint },
  neutral: { bg: colors.light.surfaceElevated, text: colors.light.textSecondary },
};

export function StatusBadge({
  label,
  variant = "neutral",
}: {
  label: string;
  variant?: Variant;
}) {
  const v = VARIANTS[variant];
  return (
    <View style={[styles.badge, { backgroundColor: v.bg }]}>
      <Text style={[styles.text, { color: v.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
