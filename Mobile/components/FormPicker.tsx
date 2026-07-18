import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { colors, fonts, spacing, radius } from "../constants/theme";

export type FormPickerOption = {
  value: string;
  label: string;
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
  const pickerValue = value || "";

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.pickerWrap, !enabled && styles.pickerDisabled]}>
        <Picker
          enabled={enabled}
          selectedValue={pickerValue}
          onValueChange={(next) => onValueChange(String(next))}
          style={styles.picker}
        >
          <Picker.Item label={placeholder} value="" color={colors.smokeLight} />
          {options.map((option) => (
            <Picker.Item
              key={option.value}
              label={option.label}
              value={option.value}
            />
          ))}
        </Picker>
      </View>
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
  pickerWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    overflow: "hidden",
  },
  pickerDisabled: {
    opacity: 0.65,
    backgroundColor: colors.chalk,
  },
  picker: {
    height: 48,
  },
});
