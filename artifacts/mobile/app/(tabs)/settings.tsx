import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";

import { useAuth } from "@/lib/auth-context";
import { apiPost, apiDelete } from "@/lib/api";
import colors from "@/constants/colors";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const {
    user,
    logout,
    biometricAvailable,
    biometricEnabled,
    toggleBiometric,
  } = useAuth();

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      setPushEnabled(status === "granted");
    });
  }, []);

  const togglePush = useCallback(async () => {
    setPushLoading(true);
    try {
      if (!pushEnabled) {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission Required",
            "Enable notifications in your device settings to receive alerts.",
          );
          setPushLoading(false);
          return;
        }
        const tokenData = await Notifications.getExpoPushTokenAsync();
        const platform =
          Platform.OS === "ios"
            ? "ios"
            : Platform.OS === "android"
              ? "android"
              : "web";
        await apiPost("push-tokens/register", {
          token: tokenData.data,
          platform,
        });
        setPushEnabled(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        try {
          const tokenData = await Notifications.getExpoPushTokenAsync();
          await apiDelete("push-tokens/deregister", {
            token: tokenData.data,
          });
        } catch {}
        setPushEnabled(false);
        Haptics.selectionAsync();
      }
    } catch {
      Alert.alert("Error", "Failed to update push notification settings.");
    } finally {
      setPushLoading(false);
    }
  }, [pushEnabled]);

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          logout();
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: tabBarHeight + 20,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Settings</Text>

      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileInitial}>
            {user?.displayName?.charAt(0)?.toUpperCase() || "U"}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.displayName || "User"}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user?.role}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Security</Text>
      <View style={styles.section}>
        {biometricAvailable && (
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View
                style={[
                  styles.settingIcon,
                  { backgroundColor: colors.light.accentLight },
                ]}
              >
                <Feather
                  name="smartphone"
                  size={16}
                  color={colors.light.accent}
                />
              </View>
              <View>
                <Text style={styles.settingLabel}>Biometric Login</Text>
                <Text style={styles.settingDesc}>
                  Use Face ID or fingerprint
                </Text>
              </View>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={() => {
                Haptics.selectionAsync();
                toggleBiometric();
              }}
              trackColor={{ true: colors.light.tint, false: colors.light.border }}
              thumbColor="#FFFFFF"
            />
          </View>
        )}
      </View>

      <Text style={styles.sectionTitle}>Notifications</Text>
      <View style={styles.section}>
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <View
              style={[
                styles.settingIcon,
                { backgroundColor: colors.light.tintLight },
              ]}
            >
              <Feather name="bell" size={16} color={colors.light.tint} />
            </View>
            <View>
              <Text style={styles.settingLabel}>Push Notifications</Text>
              <Text style={styles.settingDesc}>
                Approvals, alerts & updates
              </Text>
            </View>
          </View>
          <Switch
            value={pushEnabled}
            onValueChange={togglePush}
            disabled={pushLoading}
            trackColor={{ true: colors.light.tint, false: colors.light.border }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.section}>
        <Pressable style={styles.menuRow} onPress={handleLogout}>
          <View style={styles.settingLeft}>
            <View
              style={[
                styles.settingIcon,
                { backgroundColor: colors.light.dangerLight },
              ]}
            >
              <Feather name="log-out" size={16} color={colors.light.danger} />
            </View>
            <Text style={[styles.settingLabel, { color: colors.light.danger }]}>
              Sign Out
            </Text>
          </View>
          <Feather
            name="chevron-right"
            size={16}
            color={colors.light.textTertiary}
          />
        </Pressable>
      </View>

      <Text style={styles.version}>GalaxyBots Mobile v1.0.0</Text>
    </ScrollView>
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
    marginBottom: 20,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.light.surface,
    borderRadius: 18,
    padding: 18,
    marginHorizontal: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
    marginBottom: 24,
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInitial: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
  },
  profileEmail: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    marginTop: 1,
  },
  roleBadge: {
    marginTop: 6,
    backgroundColor: colors.light.tintLight,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  roleText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.tint,
    textTransform: "capitalize",
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.textSecondary,
    paddingHorizontal: 20,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  section: {
    backgroundColor: colors.light.surface,
    borderRadius: 16,
    marginHorizontal: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  settingLabel: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: colors.light.text,
  },
  settingDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    marginTop: 1,
  },
  version: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
    textAlign: "center",
    marginTop: 8,
  },
});
