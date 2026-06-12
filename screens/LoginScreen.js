import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from "react-native";
import { supabase } from "../services/supabase";
import { colors, fonts, spacing, radius, logos } from "../constants/theme";
import PrimaryButton from "../components/PrimaryButton";

const loginBg = colors.white;
const loginSurface = colors.chalk;

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [mode, setMode] = useState("password");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  function switchMode(nextMode) {
    setMode(nextMode);
    setOtpSent(false);
    setOtp("");
    setPassword("");
  }

  async function handlePasswordLogin() {
    if (!email || !password) {
      Alert.alert("Missing details", "Enter your email and password.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    setLoading(false);

    if (error) Alert.alert("Login failed", error.message);
  }

  async function handleSendOtp() {
    if (!email) {
      Alert.alert("Missing email", "Enter your email to receive a code.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim()
    });
    setLoading(false);

    if (error) {
      Alert.alert("Login failed", error.message);
      return;
    }

    setOtpSent(true);
    Alert.alert("Check your email", "We sent a one-time login code.");
  }

  async function handleVerifyOtp() {
    if (!otp) {
      Alert.alert("Missing code", "Enter the OTP from your email.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp,
      type: "email"
    });
    setLoading(false);

    if (error) Alert.alert("Invalid code", error.message);
  }

  function handleSubmit() {
    if (mode === "password") return handlePasswordLogin();
    if (!otpSent) return handleSendOtp();
    return handleVerifyOtp();
  }

  const submitLabel =
    loading
      ? "Please wait..."
      : mode === "password"
      ? "Sign In"
      : otpSent
      ? "Verify Code"
      : "Send Code to Email";

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Image
            source={logos.verticalWhite}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in to your account</Text>

          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === "password" && styles.modeActive]}
              onPress={() => switchMode("password")}
            >
              <Text
                style={[
                  styles.modeText,
                  mode === "password" && styles.modeTextActive
                ]}
              >
                Password
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === "otp" && styles.modeActive]}
              onPress={() => switchMode("otp")}
            >
              <Text
                style={[styles.modeText, mode === "otp" && styles.modeTextActive]}
              >
                Email Code
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={colors.smokeLight}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={mode === "password" || !otpSent}
          />

          {mode === "password" ? (
            <>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Your password"
                placeholderTextColor={colors.smokeLight}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </>
          ) : null}

          {mode === "otp" && otpSent ? (
            <>
              <Text style={styles.label}>One-time code</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter 6-digit code"
                placeholderTextColor={colors.smokeLight}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
              />
            </>
          ) : null}

          <PrimaryButton
            title={submitLabel}
            onPress={handleSubmit}
            loading={loading}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: loginBg
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    justifyContent: "center"
  },
  hero: {
    alignItems: "center",
    marginBottom: spacing.xl,
    backgroundColor: loginBg
  },
  logo: {
    width: 200,
    height: 200
  },
  card: {
    backgroundColor: loginSurface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border
  },
  cardTitle: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    marginBottom: spacing.md
  },
  modeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.sm,
    backgroundColor: loginBg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center"
  },
  modeActive: {
    backgroundColor: colors.brunswick,
    borderColor: colors.brunswick
  },
  modeText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.brunswick
  },
  modeTextActive: {
    color: colors.white
  },
  label: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
    marginBottom: 8
  },
  input: {
    backgroundColor: loginBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.text,
    marginBottom: spacing.md
  }
});
