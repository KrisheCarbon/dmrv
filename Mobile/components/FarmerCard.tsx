import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, fonts, spacing, radius } from "../constants/theme";

function getSyncMeta(status) {
  switch (status) {
    case "syncing":
      return { label: "Syncing", color: colors.brunswick, bg: colors.chalk };
    case "pending":
      return { label: "Pending", color: colors.warning, bg: colors.warningBg };
    case "error":
      return { label: "Failed", color: colors.error, bg: colors.errorBg };
    default:
      return { label: "Synced", color: colors.success, bg: colors.successBg };
  }
}

export default function FarmerCard({ farmer, syncProgress = 0, onPress }) {
  const { label, color, bg } = getSyncMeta(farmer.sync_status);
  const isSyncing = farmer.sync_status === "syncing";
  const progress = Math.min(100, Math.max(0, syncProgress));

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {farmer.farmer_name}
          </Text>
          <View style={[styles.badge, { backgroundColor: bg }]}>
            <Text style={[styles.badgeText, { color }]}>{label}</Text>
          </View>
        </View>
        <Text
          style={[
            styles.mobile,
            !farmer.mobile_number && styles.mobileMissing
          ]}
        >
          {farmer.mobile_number || "Mobile not added yet"}
        </Text>

        {farmer.sync_status === "error" && farmer.sync_error ? (
          <Text style={styles.errorText} numberOfLines={2}>
            {farmer.sync_error}
          </Text>
        ) : null}

        {isSyncing && (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressText}>{Math.round(progress)}%</Text>
          </View>
        )}
      </View>

      {!isSyncing && <Text style={styles.chevron}>›</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border
  },
  body: {
    flex: 1,
    marginRight: spacing.sm
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4
  },
  name: {
    fontSize: 16,
    fontFamily: fonts.medium,
    color: colors.brunswick,
    flexShrink: 1
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill
  },
  badgeText: {
    fontSize: 10,
    fontFamily: fonts.medium,
    textTransform: "uppercase",
    letterSpacing: 0.3
  },
  mobile: {
    fontSize: 13,
    color: colors.smoke,
    fontFamily: fonts.regular
  },
  mobileMissing: {
    fontStyle: "italic"
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    fontFamily: fonts.regular,
    marginTop: 6
  },
  progressWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: "hidden"
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.chartreuse
  },
  progressText: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: colors.brunswick,
    minWidth: 32,
    textAlign: "right"
  },
  chevron: {
    fontSize: 24,
    color: colors.smokeLight
  }
});
