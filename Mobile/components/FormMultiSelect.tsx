import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, fonts, spacing, radius } from "../constants/theme";

export type MultiSelectOption = {
  value: string;
  label: string;
  subtitle?: string;
};

type FormMultiSelectProps = {
  label: string;
  values: string[];
  options: MultiSelectOption[];
  onChange: (values: string[]) => void;
  emptyText?: string;
  enabled?: boolean;
};

export default function FormMultiSelect({
  label,
  values,
  options,
  onChange,
  emptyText = "No options available.",
  enabled = true,
}: FormMultiSelectProps) {
  function toggle(value: string) {
    if (!enabled) return;
    if (values.includes(value)) {
      onChange(values.filter((item) => item !== value));
      return;
    }
    onChange([...values, value]);
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      {options.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        <View style={styles.list}>
          {options.map((option) => {
            const selected = values.includes(option.value);
            return (
              <Pressable
                key={option.value}
                style={({ pressed }) => [
                  styles.row,
                  selected && styles.rowSelected,
                  pressed && enabled && styles.rowPressed,
                  !enabled && styles.rowDisabled,
                ]}
                onPress={() => toggle(option.value)}
                disabled={!enabled}
              >
                <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                  {selected ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <View style={styles.copy}>
                  <Text style={styles.rowLabel}>{option.label}</Text>
                  {option.subtitle ? (
                    <Text style={styles.rowSubtitle}>{option.subtitle}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      {values.length > 0 ? (
        <Text style={styles.count}>{values.length} batch(es) selected</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
  },
  empty: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.smokeLight,
    paddingVertical: spacing.sm,
  },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.white,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowSelected: {
    backgroundColor: colors.chalk,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rowDisabled: {
    opacity: 0.65,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxSelected: {
    backgroundColor: colors.brunswick,
    borderColor: colors.brunswick,
  },
  checkmark: {
    color: colors.white,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.brunswick,
  },
  rowSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  count: {
    marginTop: spacing.xs,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
