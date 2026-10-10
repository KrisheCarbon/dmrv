import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, spacing, typeScale } from "../constants/theme";

export type EntryTone = "draft" | "pending" | "done" | "error" | "neutral";

const PALETTE: Record<EntryTone, { bg: string; fg: string; glyph: string }> = {
  draft: { bg: colors.warningBg, fg: colors.warning, glyph: "✎" },
  pending: { bg: colors.warningBg, fg: colors.warning, glyph: "↑" },
  done: { bg: colors.successBg, fg: colors.success, glyph: "✓" },
  error: { bg: colors.errorBg, fg: colors.error, glyph: "!" },
  neutral: { bg: colors.chalk, fg: colors.brunswick, glyph: "•" },
};

/** Status label with a glyph, so colour is never the only signal. */
export default function EntryStatusPill({ label, tone }: { label: string; tone: EntryTone }) {
  const palette = PALETTE[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[styles.text, { color: palette.fg }]}>
        {palette.glyph} {label}
      </Text>
    </View>
  );
}

/** Upload state of a record saved on the phone. */
export function syncPill(status: string | null | undefined): { label: string; tone: EntryTone } {
  if (status === "synced") return { label: "Uploaded", tone: "done" };
  if (status === "failed" || status === "error") return { label: "Upload failed", tone: "error" };
  return { label: "Waiting to upload", tone: "pending" };
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  text: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label,
  },
});
