import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, fonts, spacing, radius } from "../constants/theme";

export default function FarmerCard({ farmer, onPress }) {
  const syncLabel =
    farmer.sync_status === "pending"
      ? "Pending"
      : farmer.sync_status === "error"
      ? "Failed"
      : "Synced";

  const syncColor =
    farmer.sync_status === "pending"
      ? colors.warning
      : farmer.sync_status === "error"
      ? colors.error
      : colors.success;

  const syncBg =
    farmer.sync_status === "pending"
      ? colors.warningBg
      : farmer.sync_status === "error"
      ? colors.errorBg
      : colors.successBg;

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
          <View style={[styles.badge, { backgroundColor: syncBg }]}>
            <Text style={[styles.badgeText, { color: syncColor }]}>
              {syncLabel}
            </Text>
          </View>
        </View>
        <Text style={styles.mobile}>{farmer.mobile_number}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
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
  chevron: {
    fontSize: 24,
    color: colors.smokeLight
  }
});
