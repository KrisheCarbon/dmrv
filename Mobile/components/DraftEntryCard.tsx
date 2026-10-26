import React from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import EntryStatusPill from "./EntryStatusPill";
import { colors, fonts, radius, spacing, typeScale } from "../constants/theme";

/**
 * Unfinished entry on a module list. Same card the farmers lists use:
 * it appears after something has been entered, and offers Continue or Delete.
 */
export default function DraftEntryCard({
  title = "Unfinished entry",
  subtitle,
  pillLabel = "Draft · not submitted",
  confirmMessage = "Everything entered in this unfinished entry will be removed. This cannot be undone.",
  onContinue,
  onDelete,
}: {
  title?: string;
  subtitle?: string;
  pillLabel?: string;
  confirmMessage?: string;
  onContinue: () => void;
  onDelete?: () => void;
}) {
  function confirmDelete() {
    if (!onDelete) return;
    Alert.alert("Delete this draft?", confirmMessage, [
      { text: "Keep draft", style: "cancel" },
      { text: "Delete draft", style: "destructive", onPress: () => onDelete() },
    ]);
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onContinue}
      onLongPress={onDelete ? confirmDelete : undefined}
      delayLongPress={400}
      accessibilityHint={onDelete ? "Long press to delete this draft" : undefined}
    >
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <EntryStatusPill label={pillLabel} tone="draft" />
      <View style={styles.actions}>
        <Pressable style={styles.button} onPress={onContinue} accessibilityRole="button">
          <Text style={styles.continueText}>Continue</Text>
        </Pressable>
        {onDelete ? (
          <Pressable
            style={[styles.button, styles.deleteButton]}
            onPress={confirmDelete}
            accessibilityRole="button"
          >
            <Text style={styles.deleteText}>Delete draft</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    borderStyle: "dashed",
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardPressed: {
    backgroundColor: colors.chalk,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: typeScale.body,
    color: colors.brunswick,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: typeScale.label,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  button: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.brunswick,
    backgroundColor: colors.white,
  },
  continueText: {
    fontFamily: fonts.bold,
    fontSize: typeScale.label,
    color: colors.brunswick,
  },
  deleteButton: {
    borderColor: colors.error,
  },
  deleteText: {
    fontFamily: fonts.bold,
    fontSize: typeScale.label,
    color: colors.error,
  },
});
