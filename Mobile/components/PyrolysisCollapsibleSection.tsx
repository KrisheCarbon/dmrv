import React, { type ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { colors, fonts, spacing, radius } from "../constants/theme";

export default function PyrolysisCollapsibleSection({
  title,
  subtitle,
  expanded,
  unlocked,
  completed,
  savedLocally,
  saving,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  expanded: boolean;
  unlocked: boolean;
  completed: boolean;
  savedLocally: boolean;
  saving?: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const statusLabel = saving
    ? "Saving…"
    : savedLocally
      ? "Saved"
      : null;

  return (
    <View
      style={[
        styles.wrap,
        !unlocked && styles.wrapLocked,
        completed && styles.wrapCompleted,
      ]}
    >
      <TouchableOpacity
        style={styles.header}
        onPress={onToggle}
        disabled={!unlocked}
        activeOpacity={0.85}
      >
        <View style={styles.headerLeft}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            {completed ? (
              <View style={styles.completeDot}>
                <Text style={styles.completeDotText}>✓</Text>
              </View>
            ) : null}
          </View>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {!unlocked ? (
            <Text style={styles.lockedHint}>Complete the section above first</Text>
          ) : null}
        </View>
        {statusLabel ? (
          <Text style={[styles.statusLabel, savedLocally && styles.statusLabelDone]}>
            {statusLabel}
          </Text>
        ) : null}
        <Text style={styles.chevron}>{expanded ? "▾" : "▸"}</Text>
      </TouchableOpacity>

      {expanded && unlocked ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wrapLocked: {
    opacity: 0.55,
  },
  wrapCompleted: {
    borderColor: colors.chartreuseMuted,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    gap: spacing.xs,
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.brunswick,
  },
  completeDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  completeDotText: {
    color: colors.white,
    fontSize: 10,
    fontFamily: fonts.bold,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
  },
  lockedHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.warning,
    marginTop: 4,
  },
  statusLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.smoke,
  },
  statusLabelDone: {
    color: colors.success,
  },
  chevron: {
    fontSize: 16,
    color: colors.smoke,
    fontFamily: fonts.medium,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
});
