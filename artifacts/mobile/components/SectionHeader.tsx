import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import colors from "@/constants/colors";

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {!!action && (
        <Pressable onPress={onAction} hitSlop={8}>
          <View style={styles.actionWrap}>
            <Text style={styles.action}>{action}</Text>
            <Feather name="chevron-right" size={14} color={colors.light.tint} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 12,
    marginTop: 24,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: colors.light.text,
  },
  actionWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  action: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: colors.light.tint,
  },
});
