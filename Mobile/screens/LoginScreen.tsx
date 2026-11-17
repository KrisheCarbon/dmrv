import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { backendFetch } from "../services/backendApi";
import { sendEmailOtp, signInWithPassword, signOut, verifyEmailOtp } from "../services/cognitoSession";
import { assertActiveAccount, resolvePasswordLoginEmail } from "../services/auth";
import {
  OTP_EMAIL_REQUIRED_ERROR,
  canAccessMobileApp,
  isPhoneLoginEmail,
} from "@krishecarbon/shared";
import { colors, fonts, spacing, radius, logos } from "../constants/theme";
import PrimaryButton from "../components/PrimaryButton";

const loginBg = colors.white;
const loginSurface = colors.chalk;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInput>(null);
  const otpRef = useRef<TextInput>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [otpSent, setOtpSent] = useState(false);
  const [otpSession, setOtpSession] = useState("");
  const [loading, setLoading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  function switchMode(nextMode: "password" | "otp") {
    setMode(nextMode);
    setOtpSent(false);
    setOtp("");
    setOtpSession("");
    setPassword("");
  }

  async function rejectWebOnlyAccount(userId: string) {
    let profile: { role?: string } | null = null;
    try {
      profile = await backendFetch<{ role?: string }>("/auth/me");
    } catch {
      return false;
    }
    if (!profile?.role || canAccessMobileApp(profile.role)) return false;
    await signOut();
    Alert.alert(
      "Web access only",
      "This account can sign in on the web dashboard. It cannot use the field app.",
    );
    return true;
  }

  async function handlePasswordLogin() {
    if (!email || !password) {
      Alert.alert("Missing details", "Enter your email or mobile number and password.");
      return;
    }

    setLoading(true);
    try {
      const loginEmail = await resolvePasswordLoginEmail(email);
      const user = await signInWithPassword(loginEmail, password);

      if (await rejectWebOnlyAccount(user.id)) return;
      if (!(await assertActiveAccount(user.id))) {
        Alert.alert(
          "Account not active",
          "Ask your admin to activate this account from the Users page."
        );
      }
    } catch (err) {
      Alert.alert(
        "Login failed",
        err instanceof Error ? err.message : "Unable to sign in"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp() {
    if (!email) {
      Alert.alert("Missing email", "Enter the email or mobile number for the account.");
      return;
    }

    setLoading(true);
    try {
      const loginEmail = await resolvePasswordLoginEmail(email);
      if (isPhoneLoginEmail(loginEmail)) {
        Alert.alert("No email inbox", OTP_EMAIL_REQUIRED_ERROR);
        return;
      }
      const session = await sendEmailOtp(loginEmail);
      setEmail(loginEmail);
      setOtpSession(session);
      setOtpSent(true);
    } catch (err) {
      Alert.alert(
        "Could not send the code",
        err instanceof Error ? err.message : "Could not send the email code.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otp) {
      Alert.alert("Missing code", "Enter the code from your email.");
      return;
    }
    if (!otpSession) {
      Alert.alert("Request a new code", "Send the email code again, then enter it.");
      return;
    }

    setLoading(true);
    try {
      const user = await verifyEmailOtp(email.trim().toLowerCase(), otp, otpSession);
      if (await rejectWebOnlyAccount(user.id)) return;
      if (!(await assertActiveAccount(user.id))) {
        Alert.alert(
          "Account not active",
          "Ask your admin to activate this account from the Users page.",
        );
      }
    } catch (err) {
      Alert.alert(
        "Code not accepted",
        err instanceof Error ? err.message : "That code doesn't match.",
      );
    } finally {
      setLoading(false);
    }
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
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          keyboardVisible ? styles.scrollKeyboardOpen : styles.scrollResting,
          {
            paddingTop: keyboardVisible
              ? spacing.md
              : insets.top + spacing.xl,
            paddingBottom: keyboardVisible
              ? spacing.md
              : Math.max(insets.bottom, spacing.lg)
          }
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, keyboardVisible && styles.heroCompact]}>
          <Image
            source={logos.verticalWhite}
            style={[styles.logo, keyboardVisible && styles.logoCompact]}
            resizeMode="contain"
          />
        </View>

        <View style={[styles.card, keyboardVisible && styles.cardCompact]}>
          <Text style={styles.cardTitle}>Sign in to your account</Text>

          <View style={[styles.modeRow, keyboardVisible && styles.modeRowCompact]}>
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

          <Text style={styles.label}>Email or mobile number</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com or 10-digit mobile"
            placeholderTextColor={colors.smokeLight}
            value={email}
            onChangeText={setEmail}
            keyboardType="default"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            returnKeyType={mode === "password" || otpSent ? "next" : "done"}
            blurOnSubmit={false}
            editable={mode === "password" || !otpSent}
            onSubmitEditing={() => {
              if (mode === "password") {
                passwordRef.current?.focus();
                return;
              }
              if (otpSent) {
                otpRef.current?.focus();
                return;
              }
              handleSubmit();
            }}
          />

          {mode === "password" ? (
            <>
              <Text style={styles.label}>Password</Text>
              <TextInput
                ref={passwordRef}
                style={styles.input}
                placeholder="Your password"
                placeholderTextColor={colors.smokeLight}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
              />
            </>
          ) : null}

          {mode === "otp" && otpSent ? (
            <>
              <Text style={styles.label}>One-time code</Text>
              <TextInput
                ref={otpRef}
                style={styles.input}
                placeholder="Enter the code from your email"
                placeholderTextColor={colors.smokeLight}
                value={otp}
                onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 8))}
                keyboardType="number-pad"
                maxLength={8}
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
              />
            </>
          ) : null}

          {mode === "otp" && !otpSent ? (
            <Text style={styles.hint}>
              We'll email a sign-in code to the address on this account.
            </Text>
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
    paddingHorizontal: spacing.lg
  },
  scrollResting: {
    justifyContent: "center"
  },
  scrollKeyboardOpen: {
    justifyContent: "flex-end"
  },
  hero: {
    alignItems: "center",
    marginBottom: spacing.xl,
    backgroundColor: loginBg
  },
  heroCompact: {
    marginBottom: spacing.sm
  },
  logo: {
    width: 200,
    height: 200
  },
  logoCompact: {
    width: 96,
    height: 96
  },
  card: {
    backgroundColor: loginSurface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border
  },
  cardCompact: {
    padding: spacing.md
  },
  modeRowCompact: {
    marginBottom: spacing.md
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
  },
  hint: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18
  }
});
