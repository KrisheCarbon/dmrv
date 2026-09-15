import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  FlatList,
  StyleSheet,
} from "react-native";
import { colors, fonts, spacing, radius } from "../constants/theme";

export type FormPickerOption = {
  value: string;
  label: string;
  /** Small helper text shown next to the option, e.g. a biomass rate hint. */
  hint?: string;
};

type FormPickerProps = {
  label: string;
  placeholder?: string;
  value: string;
  options: FormPickerOption[];
  onValueChange: (value: string) => void;
  enabled?: boolean;
};

export default function FormPicker({
  label,
  placeholder = "Select…",
  value,
  options,
  onValueChange,
  enabled = true,
}: FormPickerProps) {
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(() => {
    const match = options.find((option) => option.value === value);
    return match?.label ?? "";
  }, [options, value]);

  function select(next: string) {
    onValueChange(next);
    setOpen(false);
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={({ pressed }) => [
          styles.field,
          !enabled && styles.fieldDisabled,
          pressed && enabled && styles.fieldPressed,
        ]}
        onPress={() => enabled && setOpen(true)}
        disabled={!enabled}
      >
        <Text
          style={[styles.fieldText, !selectedLabel && styles.placeholder]}
          numberOfLines={1}
        >
          {selectedLabel || placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              renderItem={({ item }) => {
                const selected = item.value === value;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.option,
                      selected && styles.optionSelected,
                      pressed && styles.optionPressed,
                    ]}
                    onPress={() => select(item.value)}
                  >
                    <View style={styles.optionTextWrap}>
                      <Text
                        style={[
                          styles.optionLabel,
                          selected && styles.optionLabelSelected,
                        ]}
                      >
                        {item.label}
                      </Text>
                      {item.hint ? (
                        <Text style={styles.optionHint}>{item.hint}</Text>
                      ) : null}
                    </View>
                    {selected ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                );
              }}
            />
            <Pressable style={styles.cancelBtn} onPress={() => setOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  fieldPressed: {
    backgroundColor: colors.overlay,
  },
  fieldDisabled: {
    opacity: 0.65,
    backgroundColor: colors.overlay,
  },
  fieldText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  placeholder: {
    color: colors.smokeLight,
  },
  chevron: {
    fontSize: 16,
    color: colors.smoke,
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(26, 60, 42, 0.35)",
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "70%",
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  sheetTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.brunswick,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.sm,
  },
  option: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionSelected: {
    backgroundColor: colors.overlay,
  },
  optionPressed: {
    backgroundColor: colors.overlay,
  },
  optionTextWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  optionLabel: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  optionLabelSelected: {
    fontFamily: fonts.medium,
    color: colors.brunswick,
  },
  optionHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
  },
  check: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.brunswick,
    marginLeft: spacing.sm,
  },
  cancelBtn: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.smoke,
  },
});
