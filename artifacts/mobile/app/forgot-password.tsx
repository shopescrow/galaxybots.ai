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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { API_BASE } from "@/lib/api";
import colors from "@/constants/colors";

type Step = "request" | "reset" | "done";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRequest = async () => {
    if (!email.trim()) {
      Alert.alert("Required", "Please enter your email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}api/auth/request-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setStep("reset");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!token.trim()) {
      Alert.alert("Required", "Please enter the reset code from your email.");
      return;
    }
    if (!newPassword.trim() || newPassword.length < 8) {
      Alert.alert("Weak password", "Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Mismatch", "Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setStep("done");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 24,
        flexGrow: 1,
      }}
      bottomOffset={20}
    >
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Feather name="arrow-left" size={20} color={colors.light.text} />
        <Text style={styles.backText}>Back to Sign In</Text>
      </Pressable>

      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Feather name="lock" size={24} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>
          {step === "request"
            ? "Enter your email and we'll send a reset code."
            : step === "reset"
              ? "Enter the code from your email and choose a new password."
              : "Your password has been updated."}
        </Text>
      </View>

      {step === "request" && (
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email Address</Text>
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
                returnKeyType="done"
                onSubmitEditing={handleRequest}
              />
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.9 }, loading && { opacity: 0.7 }]}
            onPress={handleRequest}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.buttonText}>Send Reset Code</Text>
            )}
          </Pressable>
        </View>
      )}

      {step === "reset" && (
        <View style={styles.form}>
          <View style={styles.infoBox}>
            <Feather name="mail" size={16} color={colors.light.tint} />
            <Text style={styles.infoText}>
              A reset code was sent to <Text style={styles.infoEmail}>{email}</Text>. Check your inbox (and spam folder).
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Reset Code</Text>
            <View style={styles.inputWrap}>
              <Feather name="hash" size={18} color={colors.light.textTertiary} />
              <TextInput
                style={styles.input}
                placeholder="Paste code from email"
                placeholderTextColor={colors.light.textTertiary}
                value={token}
                onChangeText={setToken}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>New Password</Text>
            <View style={styles.inputWrap}>
              <Feather name="lock" size={18} color={colors.light.textTertiary} />
              <TextInput
                style={styles.input}
                placeholder="Min. 8 characters"
                placeholderTextColor={colors.light.textTertiary}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showNew}
              />
              <Pressable onPress={() => setShowNew(!showNew)} hitSlop={8}>
                <Feather name={showNew ? "eye-off" : "eye"} size={18} color={colors.light.textTertiary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Confirm Password</Text>
            <View style={styles.inputWrap}>
              <Feather name="lock" size={18} color={colors.light.textTertiary} />
              <TextInput
                style={styles.input}
                placeholder="Repeat new password"
                placeholderTextColor={colors.light.textTertiary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirm}
                returnKeyType="done"
                onSubmitEditing={handleReset}
              />
              <Pressable onPress={() => setShowConfirm(!showConfirm)} hitSlop={8}>
                <Feather name={showConfirm ? "eye-off" : "eye"} size={18} color={colors.light.textTertiary} />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.9 }, loading && { opacity: 0.7 }]}
            onPress={handleReset}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.buttonText}>Set New Password</Text>
            )}
          </Pressable>

          <Pressable style={styles.resend} onPress={() => setStep("request")}>
            <Text style={styles.resendText}>Didn't get the code? Go back</Text>
          </Pressable>
        </View>
      )}

      {step === "done" && (
        <View style={styles.form}>
          <View style={styles.successBox}>
            <Feather name="check-circle" size={40} color={colors.light.tint} />
            <Text style={styles.successTitle}>Password Updated</Text>
            <Text style={styles.successText}>
              You can now sign in with your new password.
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.9 }]}
            onPress={() => router.replace("/login")}
          >
            <Text style={styles.buttonText}>Back to Sign In</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 32,
  },
  backText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: colors.light.text,
  },
  header: {
    alignItems: "center",
    marginBottom: 36,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: colors.light.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  form: {
    gap: 20,
  },
  infoBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.light.tintLight,
    borderRadius: 12,
    padding: 14,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: colors.light.tint,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    lineHeight: 18,
  },
  infoEmail: {
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
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
  button: {
    backgroundColor: colors.light.tint,
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  resend: {
    alignItems: "center",
  },
  resendText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
  },
  successBox: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 24,
  },
  successTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: colors.light.text,
  },
  successText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    textAlign: "center",
  },
});
