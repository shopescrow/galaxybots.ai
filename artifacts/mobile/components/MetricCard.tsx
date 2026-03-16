import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import colors from "@/constants/colors";

interface Props {
  icon: keyof typeof Feather.glyphMap;
  iconColor?: string;
  label: string;
  value: string | number;
  subtitle?: string;
  compact?: boolean;
}

export function MetricCard({ icon, iconColor, label, value, subtitle, compact }: Props) {
  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={[styles.iconWrap, { backgroundColor: (iconColor || colors.light.tint) + "15" }]}>
        <Feather name={icon} size={compact ? 16 : 18} color={iconColor || colors.light.tint} />
      </View>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <Text style={[styles.value, compact && styles.valueCompact]} numberOfLines={1}>{value}</Text>
      {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.light.surface,
    borderRadius: 16,
    padding: 16,
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
  },
  cardCompact: {
    padding: 12,
    minWidth: 100,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: colors.light.textSecondary,
    marginBottom: 4,
  },
  value: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: colors.light.text,
  },
  valueCompact: {
    fontSize: 18,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
    marginTop: 2,
  },
});
