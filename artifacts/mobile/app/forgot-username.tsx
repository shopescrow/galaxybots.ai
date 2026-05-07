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

export default function ForgotUsernameScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [result, setResult] = useState<{ message: string; email?: string | null } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!companyName.trim() || !contactName.trim()) {
      Alert.alert("Required", "Please enter both your company name and your name.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}api/auth/forgot-username`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          contactName: contactName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      setResult(data);
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
          <Feather name="user" size={24} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>Find My Account</Text>
        <Text style={styles.subtitle}>
          Enter your company name and your name and we'll look up the email address associated with your account.
        </Text>
      </View>

      {!result ? (
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Company Name</Text>
            <View style={styles.inputWrap}>
              <Feather name="briefcase" size={18} color={colors.light.textTertiary} />
              <TextInput
                style={styles.input}
                placeholder="Acme Corporation"
                placeholderTextColor={colors.light.textTertiary}
                value={companyName}
                onChangeText={setCompanyName}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Your Name</Text>
            <View style={styles.inputWrap}>
              <Feather name="user" size={18} color={colors.light.textTertiary} />
              <TextInput
                style={styles.input}
                placeholder="Jane Smith"
                placeholderTextColor={colors.light.textTertiary}
                value={contactName}
                onChangeText={setContactName}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.9 }, loading && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.buttonText}>Find My Account</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.form}>
          {result.email ? (
            <View style={styles.resultBox}>
              <Feather name="check-circle" size={32} color={colors.light.tint} />
              <Text style={styles.resultTitle}>Account Found</Text>
              <Text style={styles.resultText}>Your login email address is:</Text>
              <View style={styles.emailBox}>
                <Feather name="mail" size={18} color={colors.light.tint} />
                <Text style={styles.emailText}>{result.email}</Text>
              </View>
              <Text style={styles.resultHint}>
                Use this email on the Sign In screen. If you've forgotten your password, tap "Forgot password?" on the login screen.
              </Text>
            </View>
          ) : (
            <View style={styles.resultBox}>
              <Feather name="info" size={32} color={colors.light.textTertiary} />
              <Text style={styles.resultTitle}>Account Located</Text>
              <Text style={styles.resultText}>{result.message}</Text>
              <Text style={styles.resultHint}>
                Contact your account administrator or GalaxyBots support for help accessing your account.
              </Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.9 }]}
            onPress={() => router.replace("/login")}
          >
            <Text style={styles.buttonText}>Back to Sign In</Text>
          </Pressable>

          <Pressable style={styles.tryAgain} onPress={() => setResult(null)}>
            <Text style={styles.tryAgainText}>Try different details</Text>
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
  resultBox: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
  },
  resultTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: colors.light.text,
  },
  resultText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    textAlign: "center",
  },
  emailBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.light.tintLight,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: colors.light.tint,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  emailText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.tint,
  },
  resultHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  tryAgain: {
    alignItems: "center",
  },
  tryAgainText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
  },
});
