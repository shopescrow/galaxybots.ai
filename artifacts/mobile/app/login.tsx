import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/lib/auth-context";
import colors from "@/constants/colors";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    login,
    loginWithBiometric,
    biometricAvailable,
    biometricEnabled,
    hasStoredSession,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing fields", "Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      Alert.alert("Login failed", err instanceof Error ? err.message : "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const handleBiometric = async () => {
    setLoading(true);
    try {
      const success = await loginWithBiometric();
      if (!success) {
        Alert.alert(
          "Authentication failed",
          "Biometric check failed or session expired. Please sign in with your password.",
        );
      }
    } catch {
      Alert.alert(
        "Session expired",
        "Please sign in with your password.",
      );
    } finally {
      setLoading(false);
    }
  };

  const showBiometric = biometricAvailable && biometricEnabled && hasStoredSession;

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container]}
      contentContainerStyle={{
        paddingTop: insets.top + 60,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 24,
        flexGrow: 1,
      }}
      bottomOffset={20}
    >
      <View style={styles.header}>
        <Image
          source={require("../assets/images/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.subtitle}>Mobile Command Center</Text>
      </View>

      {showBiometric && (
        <View style={styles.biometricSection}>
          <Pressable
            style={({ pressed }) => [
              styles.biometricMainButton,
              pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              loading && { opacity: 0.7 },
            ]}
            onPress={handleBiometric}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.light.tint} size="small" />
            ) : (
              <>
                <Feather name="unlock" size={22} color={colors.light.tint} />
                <Text style={styles.biometricMainText}>
                  Unlock with Biometrics
                </Text>
              </>
            )}
          </Pressable>
          <Text style={styles.biometricHint}>
            Or sign in with your password below
          </Text>
        </View>
      )}

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Email</Text>
          <View style={styles.inputWrap}>
            <Feather name="mail" size={18} color={colors.light.textTertiary} />
            <TextInput
              style={styles.input}
              placeholder="you@company.com"
              placeholderTextColor={colors.light.textTertiary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Password</Text>
          <View style={styles.inputWrap}>
            <Feather name="lock" size={18} color={colors.light.textTertiary} />
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={colors.light.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
              <Feather
                name={showPassword ? "eye-off" : "eye"}
                size={18}
                color={colors.light.textTertiary}
              />
            </Pressable>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.loginButton,
            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
            loading && { opacity: 0.7 },
          ]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.loginButtonText}>Sign In</Text>
          )}
        </Pressable>

        <View style={styles.recoveryLinks}>
          <Pressable onPress={() => router.push("/forgot-password")} hitSlop={8}>
            <Text style={styles.recoveryLink}>Forgot password?</Text>
          </Pressable>
          <Text style={styles.recoverySep}>·</Text>
          <Pressable onPress={() => router.push("/forgot-username")} hitSlop={8}>
            <Text style={styles.recoveryLink}>Find my account</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <Text style={styles.footer}>Secured by GalaxyBots.ai</Text>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  header: {
    alignItems: "center",
    marginBottom: 48,
  },
  logo: {
    width: 160,
    height: 160,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
  },
  biometricSection: {
    alignItems: "center",
    marginBottom: 32,
    gap: 12,
  },
  biometricMainButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.light.tintLight,
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 24,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.light.tint,
  },
  biometricMainText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.tint,
  },
  biometricHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
    marginLeft: 4,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.light.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: colors.light.text,
  },
  loginButton: {
    backgroundColor: colors.light.tint,
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  loginButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  recoveryLinks: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  recoveryLink: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.light.tint,
  },
  recoverySep: {
    fontSize: 13,
    color: colors.light.textTertiary,
  },
  footer: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
    textAlign: "center",
  },
});
