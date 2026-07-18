import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  Image
} from "react-native";
import PrimaryButton from "../components/PrimaryButton";
import { ScreenShell } from "../components/ScreenHeader";
import {
  requestAllPermissions,
  markPermissionsGranted
} from "../services/permissions";
import { colors, fonts, spacing, radius, logos } from "../constants/theme";

const PERMISSION_ITEMS = [
  {
    title: "Location",
    desc: "Capture farm GPS and address while onboarding."
  },
  {
    title: "Camera",
    desc: "Photograph consent forms on-site."
  },
  {
    title: "Photos & files",
    desc: "Upload consent documents from your phone."
  },
  {
    title: "Bluetooth",
    desc: "Connect to kiln sensors and download batch recordings."
  }
];

export default function PermissionsScreen({ onComplete }) {
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    setLoading(true);
    const results = await requestAllPermissions();
    setLoading(false);

    const missing = [];
    if (!results.location) missing.push("Location");
    if (!results.camera) missing.push("Camera");
    if (!results.media) missing.push("Photos");

    if (missing.length) {
      Alert.alert(
        "Some permissions missing",
        `${missing.join(", ")} — you can enable later in Settings.`,
        [
          { text: "Continue anyway", onPress: finish },
          { text: "Try again", onPress: handleContinue }
        ]
      );
      return;
    }

    finish();
  }

  async function finish() {
    try {
      await markPermissionsGranted();
    } catch (err) {
      console.warn("Failed to save permissions flag:", err);
    }

    if (typeof onComplete === "function") {
      onComplete();
    }
  }

  return (
    <ScreenShell>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={logos.symbolLight}
          style={styles.symbol}
          resizeMode="contain"
        />

        <Text style={styles.title}>Quick setup</Text>
        <Text style={styles.subtitle}>
          We need a few permissions so you can onboard farmers — even without
          network signal.
        </Text>

        {PERMISSION_ITEMS.map((item) => (
          <View key={item.title} style={styles.card}>
            <View style={styles.dot} />
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardText}>{item.desc}</Text>
            </View>
          </View>
        ))}

        <PrimaryButton
          title={loading ? "Requesting..." : "Allow & Continue"}
          onPress={handleContinue}
          loading={loading}
        />
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingTop: spacing.xxl
  },
  symbol: {
    width: 72,
    height: 72,
    marginBottom: spacing.lg
  },
  title: {
    fontSize: 28,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    marginBottom: spacing.sm
  },
  subtitle: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.smoke,
    lineHeight: 22,
    marginBottom: spacing.lg
  },
  card: {
    flexDirection: "row",
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.chartreuse,
    marginTop: 6,
    marginRight: spacing.md
  },
  cardBody: {
    flex: 1
  },
  cardTitle: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.brunswick,
    marginBottom: 4
  },
  cardText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.smoke,
    lineHeight: 20
  }
});
