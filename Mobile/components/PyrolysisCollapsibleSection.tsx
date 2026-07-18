import React, { type ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { colors, fonts, spacing, radius } from "../constants/theme";

function StatusTick({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={styles.tickRow}>
      <View style={[styles.tickDot, done && styles.tickDotDone]}>
        {done ? <Text style={styles.tickMark}>✓</Text> : null}
      </View>
      <Text style={[styles.tickLabel, done && styles.tickLabelDone]}>
        {label}
      </Text>
    </View>
  );
}

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
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {!unlocked ? (
            <Text style={styles.lockedHint}>Complete the section above first</Text>
          ) : null}
        </View>
        <Text style={styles.chevron}>{expanded ? "▾" : "▸"}</Text>
      </TouchableOpacity>

      {expanded && unlocked ? (
        <View style={styles.body}>
          {children}

          <View style={styles.statusBlock}>
            <StatusTick
              done={savedLocally}
              label={
                saving
                  ? "Saving on device…"
                  : savedLocally
                    ? "Saved on device"
                    : "Changes save automatically"
              }
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  wrapLocked: {
    opacity: 0.65,
  },
  wrapCompleted: {
    borderColor: colors.brunswick,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.brunswick,
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
  chevron: {
    fontSize: 18,
    color: colors.smoke,
    fontFamily: fonts.medium,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statusBlock: {
    paddingTop: spacing.xs,
  },
  tickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tickDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  tickDotDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  tickMark: {
    color: colors.white,
    fontSize: 11,
    fontFamily: fonts.bold,
  },
  tickLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
  },
  tickLabelDone: {
    color: colors.brunswick,
  },
});
