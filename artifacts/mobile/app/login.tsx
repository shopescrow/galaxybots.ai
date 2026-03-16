import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/lib/auth-context";
import colors from "@/constants/colors";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, biometricAvailable, biometricEnabled, authenticateWithBiometric } = useAuth();
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
    } catch (err: any) {
      Alert.alert("Login failed", err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const handleBiometric = async () => {
    const success = await authenticateWithBiometric();
    if (success) {
      setLoading(true);
      try {
        await login(email.trim(), password);
      } catch {
      } finally {
        setLoading(false);
      }
    }
  };

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
        <View style={styles.logoWrap}>
          <Feather name="cpu" size={28} color="#FFFFFF" />
        </View>
        <Text style={styles.brand}>GalaxyBots</Text>
        <Text style={styles.subtitle}>Mobile Command Center</Text>
      </View>

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

        {biometricAvailable && biometricEnabled && (
          <Pressable style={styles.biometricButton} onPress={handleBiometric}>
            <Feather name="smartphone" size={20} color={colors.light.tint} />
            <Text style={styles.biometricText}>Use Biometric Login</Text>
          </Pressable>
        )}
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
  logoWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  brand: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: colors.light.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
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
  biometricButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  biometricText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: colors.light.tint,
  },
  footer: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
    textAlign: "center",
  },
});
