import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  type KeyboardTypeOptions,
} from "react-native";
import { colors, fonts, spacing, radius } from "../constants/theme";

interface FormInputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: KeyboardTypeOptions;
  editable?: boolean;
  multiline?: boolean;
  error?: string;
  onFocus?: () => void;
}

export default function FormInput({
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType = "default",
  editable = true,
  multiline = false,
  error,
  onFocus,
}: FormInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholder={placeholder}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          focused && editable && styles.inputFocused,
          !editable && styles.inputDisabled,
          error && styles.inputError,
        ]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        editable={editable}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        placeholderTextColor={colors.smokeLight}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => setFocused(false)}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
  input: {
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  inputMultiline: {
    minHeight: 96,
    paddingTop: spacing.md,
  },
  inputFocused: {
    backgroundColor: colors.white,
    borderColor: colors.brunswick,
  },
  inputDisabled: {
    opacity: 0.7,
    color: colors.smoke,
  },
  inputError: {
    borderColor: colors.error,
  },
  errorText: {
    marginTop: 6,
    color: colors.error,
    fontSize: 12,
    fontFamily: fonts.regular,
  },
});
