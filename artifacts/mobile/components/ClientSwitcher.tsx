import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  FlatList,
  StyleSheet,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useClient, Client } from "@/lib/client-context";
import colors from "@/constants/colors";

export function ClientSwitcher() {
  const { clients, activeClient, switchClient } = useClient();
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  if (!activeClient) return null;

  const handleSelect = async (client: Client) => {
    Haptics.selectionAsync();
    await switchClient(client);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.8 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setOpen(true);
        }}
      >
        <View style={styles.dot} />
        <Text style={styles.pillText} numberOfLines={1}>
          {activeClient.companyName}
        </Text>
        <Feather name="chevron-down" size={12} color={colors.light.tint} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Switch Client</Text>
          <FlatList
            data={clients}
            keyExtractor={(item) => String(item.id)}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item }) => {
              const isActive = item.id === activeClient.id;
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.clientRow,
                    isActive && styles.clientRowActive,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  <View style={styles.clientIcon}>
                    <Feather
                      name="briefcase"
                      size={18}
                      color={isActive ? colors.light.tint : colors.light.textSecondary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.clientName, isActive && { color: colors.light.tint }]}
                      numberOfLines={1}
                    >
                      {item.companyName}
                    </Text>
                    <Text style={styles.clientPlan}>{item.plan}</Text>
                  </View>
                  {isActive && (
                    <Feather name="check" size={18} color={colors.light.tint} />
                  )}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.light.tintLight,
    borderWidth: 1,
    borderColor: colors.light.tint + "40",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: 200,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.light.accent,
  },
  pillText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: colors.light.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "70%",
    borderTopWidth: 1,
    borderTopColor: colors.light.border,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.light.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: colors.light.text,
    marginBottom: 16,
  },
  clientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: colors.light.surfaceElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
  },
  clientRowActive: {
    borderColor: colors.light.tint + "60",
    backgroundColor: colors.light.tintLight,
  },
  clientIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.light.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  clientName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
  },
  clientPlan: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    marginTop: 2,
  },
});
