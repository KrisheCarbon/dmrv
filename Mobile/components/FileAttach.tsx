import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, spacing, typeScale } from "../constants/theme";
import type { PickedFile } from "../services/fieldOperations";

export default function FileAttach({
  label,
  hint,
  files,
  single,
  onAdd,
  onRemove,
}: {
  label: string;
  hint: string;
  files: PickedFile[];
  single?: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <View style={styles.box}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.add} onPress={onAdd}>
        <Text style={styles.addText}>
          {files.length === 0 ? "Choose files" : single ? "Replace file" : "Add more files"}
        </Text>
        <Text style={styles.hint}>{hint}</Text>
      </Pressable>
      {files.map((file, index) => (
        <View key={`${file.name}-${file.uri}-${index}`} style={styles.row}>
          <Text style={styles.name} numberOfLines={2}>
            {file.name}
          </Text>
          <Pressable style={styles.remove} onPress={() => onRemove(index)}>
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderDark,
    borderRadius: radius.md,
    backgroundColor: colors.neutralFill,
    padding: spacing.md,
    gap: spacing.sm,
  },
  label: { fontFamily: fonts.medium, fontSize: typeScale.label, color: colors.text },
  add: { minHeight: 56, justifyContent: "center", gap: spacing.xs },
  addText: { fontFamily: fonts.medium, fontSize: typeScale.body, color: colors.brunswick },
  hint: { fontFamily: fonts.regular, fontSize: typeScale.label, color: colors.textSecondary },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
  },
  name: { flex: 1, fontFamily: fonts.medium, fontSize: typeScale.bodySmall, color: colors.text },
  remove: { minHeight: 48, justifyContent: "center", paddingHorizontal: spacing.sm },
  removeText: { fontFamily: fonts.medium, fontSize: typeScale.bodySmall, color: colors.error },
});
