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

export type MultiSelectOption = {
  value: string;
  label: string;
  subtitle?: string;
};

type FormMultiSelectDropdownProps = {
  label: string;
  placeholder?: string;
  values: string[];
  options: MultiSelectOption[];
  onChange: (values: string[]) => void;
  emptyText?: string;
  enabled?: boolean;
};

export default function FormMultiSelectDropdown({
  label,
  placeholder = "Select batches…",
  values,
  options,
  onChange,
  emptyText = "No options available.",
  enabled = true,
}: FormMultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(values);

  const selectedLabels = useMemo(() => {
    const byValue = new Map(options.map((option) => [option.value, option.label]));
    return values.map((value) => byValue.get(value)).filter(Boolean) as string[];
  }, [options, values]);

  const summaryText = useMemo(() => {
    if (selectedLabels.length === 0) return "";
    if (selectedLabels.length <= 2) return selectedLabels.join(", ");
    return `${selectedLabels.length} selected`;
  }, [selectedLabels]);

  function openSheet() {
    if (!enabled) return;
    setDraft(values);
    setOpen(true);
  }

  function toggle(value: string) {
    setDraft((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  }

  function applyAndClose() {
    onChange(draft);
    setOpen(false);
  }

  function cancel() {
    setDraft(values);
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
        onPress={openSheet}
        disabled={!enabled}
      >
        <Text
          style={[styles.fieldText, !summaryText && styles.placeholder]}
          numberOfLines={1}
        >
          {summaryText || placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={cancel}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={cancel} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            {options.length === 0 ? (
              <Text style={styles.empty}>{emptyText}</Text>
            ) : (
              <FlatList
                data={options}
                keyExtractor={(item) => item.value}
                keyboardShouldPersistTaps="handled"
                style={styles.list}
                renderItem={({ item }) => {
                  const selected = draft.includes(item.value);
                  return (
                    <Pressable
                      style={({ pressed }) => [
                        styles.option,
                        selected && styles.optionSelected,
                        pressed && styles.optionPressed,
                      ]}
                      onPress={() => toggle(item.value)}
                    >
                      <View
                        style={[styles.checkbox, selected && styles.checkboxSelected]}
                      >
                        {selected ? <Text style={styles.checkmark}>✓</Text> : null}
                      </View>
                      <View style={styles.optionTextWrap}>
                        <Text
                          style={[
                            styles.optionLabel,
                            selected && styles.optionLabelSelected,
                          ]}
                        >
                          {item.label}
                        </Text>
                        {item.subtitle ? (
                          <Text style={styles.optionSubtitle}>{item.subtitle}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}
            <View style={styles.actions}>
              <Pressable style={styles.cancelBtn} onPress={cancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.doneBtn} onPress={applyAndClose}>
                <Text style={styles.doneText}>
                  Done{draft.length > 0 ? ` (${draft.length})` : ""}
                </Text>
              </Pressable>
            </View>
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
    maxHeight: "75%",
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
  empty: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.smokeLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
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
    gap: spacing.sm,
  },
  optionSelected: {
    backgroundColor: colors.overlay,
  },
  optionPressed: {
    backgroundColor: colors.overlay,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
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
  optionTextWrap: {
    flex: 1,
    gap: 2,
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
  optionSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.smoke,
  },
  doneBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.brunswick,
  },
  doneText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.white,
  },
});
