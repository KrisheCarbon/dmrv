import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { ScreenShell } from "../components/ScreenHeader";
import { colors, fonts, spacing, radius } from "../constants/theme";

const MODULES = {
  payments: {
    title: "Payments stats",
    subtitle: "Amounts paid to farmers and climapreneurs.",
    body: "Payment records are not in the app yet. This will show who was paid, the amount, and the date once those entries exist.",
  },
  pyrolysis: {
    title: "Pyrolysis stats",
    subtitle: "Batches entered by supervisors and climapreneurs.",
    body: "Team batch totals are not connected yet. This will show how many pyrolysis batches were entered between two dates, and who entered them.",
  },
  mixing: {
    title: "Mixing stats",
    subtitle: "Mixing entries by supervisors and climapreneurs.",
    body: "Team mixing totals are not connected yet. This will show how many mixing entries were recorded between two dates, and who entered them.",
  },
} as const;

export default function DashboardModuleScreen({ navigation, route }) {
  const moduleKey = route.params?.module;
  const module = MODULES[moduleKey] || MODULES.payments;

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>{module.title}</Text>
            <Text style={styles.subtitle}>{module.subtitle}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardText}>{module.body}</Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.xs,
  },
  backText: {
    fontSize: 28,
    lineHeight: 30,
    color: colors.brunswick,
    fontFamily: fonts.medium,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.chalk,
  },
  cardText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
});
