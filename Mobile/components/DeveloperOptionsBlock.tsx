import React from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import PrimaryButton from "./PrimaryButton";
import { colors, fonts, spacing, typeScale } from "../constants/theme";

async function openDeveloperSettings() {
  try {
    await Linking.sendIntent("android.settings.APPLICATION_DEVELOPMENT_SETTINGS");
  } catch {
    await Linking.openSettings();
  }
}

/** Shown instead of the app while Android Developer options are on. */
export default function DeveloperOptionsBlock() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>Developer options are on</Text>
        <Text style={styles.body}>
          This phone has Developer options switched on. Fake GPS apps need that
          setting to change the location. Turn Developer options off, then come
          back to this app.
        </Text>
        <PrimaryButton title="Open Developer options" onPress={openDeveloperSettings} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: typeScale.title,
    color: colors.text,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    lineHeight: 24,
    color: colors.textSecondary,
  },
});
