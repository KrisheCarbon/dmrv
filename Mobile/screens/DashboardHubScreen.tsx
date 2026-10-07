import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { ScreenShell } from "../components/ScreenHeader";
import { colors, fonts, spacing, radius } from "../constants/theme";

const MODULES = [
  {
    key: "payments",
    title: "Payments stats",
    subtitle: "Amounts paid, once payment records are connected",
    screen: "DashboardModule",
    params: { module: "payments" },
  },
  {
    key: "farms",
    title: "Farmers stats",
    subtitle: "Farmers, farms, consent, and soil entered",
    screen: "FieldActivity",
    params: undefined,
  },
  {
    key: "pyrolysis",
    title: "Pyrolysis stats",
    subtitle: "Batches entered by the team",
    screen: "DashboardModule",
    params: { module: "pyrolysis" },
  },
  {
    key: "mixing",
    title: "Mixing stats",
    subtitle: "Mixing entries recorded by the team",
    screen: "DashboardModule",
    params: { module: "mixing" },
  },
] as const;

export default function DashboardHubScreen({ navigation }) {
  return (
    <ScreenShell>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>Dashboard</Text>
            <Text style={styles.subtitle}>
              Farmers, pyrolysis, mixing, and payments.
            </Text>
          </View>
        </View>

        {MODULES.map((module) => (
          <Pressable
            key={module.key}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => navigation.navigate(module.screen, module.params)}
          >
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{module.title}</Text>
              <Text style={styles.cardSubtitle}>{module.subtitle}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
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
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.white,
  },
  cardPressed: {
    backgroundColor: colors.chalk,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.brunswick,
  },
  cardSubtitle: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  chevron: {
    fontSize: 22,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
});
