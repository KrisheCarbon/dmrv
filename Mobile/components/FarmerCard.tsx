import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { colors, fonts, spacing, radius } from "../constants/theme";
import { isFarmerProfileComplete } from "@krishecarbon/shared";
import ChecklistItem from "./ChecklistItem";

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

export default function FarmerCard({ farmer, syncProgress = 0, onPress, checklist }) {
  const { label, color, bg } = getSyncMeta(farmer.sync_status);
  const isSyncing = farmer.sync_status === "syncing";
  const progress = Math.min(100, Math.max(0, syncProgress));
  const profileComplete = isFarmerProfileComplete(farmer);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.body}>
        <View style={styles.titleRow}>
          {farmer.farmer_photo_uri || farmer.farmer_photo_url ? (
            <Image
              source={{ uri: farmer.farmer_photo_uri || farmer.farmer_photo_url }}
              style={styles.avatar}
            />
          ) : null}
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
        {farmer.farmer_code ? (
          <Text style={styles.code}>{farmer.farmer_code}</Text>
        ) : null}

        {checklist ? (
          <View style={styles.checks}>
            <ChecklistItem
              tone={profileComplete ? "ok" : "warn"}
              label="Farmer"
            />
            <ChecklistItem done={checklist.hasFields} label="Farms" />
            <ChecklistItem
              tone={
                checklist.soilSampleTone === "accepted"
                  ? "ok"
                  : checklist.soilSampleTone === "rejected"
                    ? "error"
                    : checklist.soilSampleTone === "collected"
                      ? "warn"
                      : "none"
              }
              label="Sample"
            />
            <ChecklistItem done={checklist.hasSoilReport} label="Report" />
          </View>
        ) : null}

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
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.chalk,
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
  code: {
    fontSize: 11,
    color: colors.smokeLight,
    fontFamily: fonts.regular,
    marginTop: 2,
  },
  checks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
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
