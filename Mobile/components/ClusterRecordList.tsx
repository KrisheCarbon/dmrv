import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, spacing } from "../constants/theme";
import type { ClusterRecordCard } from "../services/clusterRecords";

/** Submitted work from other people in the same cluster. View only. */
export default function ClusterRecordList({
  title,
  rows,
}: {
  title: string;
  rows: ClusterRecordCard[];
}) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{title}</Text>
      <Text style={styles.note}>Visible to this cluster. Submitted entries cannot be edited.</Text>
      {rows.map((row) => (
        <View key={row.id} style={styles.card}>
          <Text style={styles.title}>{row.title}</Text>
          {row.subtitle ? <Text style={styles.subtitle}>{row.subtitle}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  heading: {
    fontFamily: fonts.medium,
    color: colors.brunswick,
    fontSize: 16,
  },
  note: {
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    fontSize: 13,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  title: {
    fontFamily: fonts.medium,
    color: colors.text,
    fontSize: 15,
  },
  subtitle: {
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    fontSize: 13,
  },
});
