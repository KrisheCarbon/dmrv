import React, { useState } from "react";
import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors, fonts, spacing, radius } from "../constants/theme";

function parseIsoDate(value: string): Date {
  if (!value) return new Date();
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayAfterIso(value: string): Date {
  const next = parseIsoDate(value);
  next.setDate(next.getDate() + 1);
  return next;
}

export default function FormDateField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  afterDate,
  error,
}: {
  label: string;
  value: string;
  onChange: (isoDate: string) => void;
  minimumDate?: string;
  maximumDate?: string;
  afterDate?: string;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const minDate = afterDate
    ? dayAfterIso(afterDate)
    : minimumDate
      ? parseIsoDate(minimumDate)
      : undefined;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={({ pressed }) => [
          styles.field,
          error ? styles.fieldError : null,
          pressed && styles.fieldPressed,
        ]}
        onPress={() => setOpen(true)}
      >
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value || "Select date"}
        </Text>
      </Pressable>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {open ? (
        <DateTimePicker
          value={parseIsoDate(value)}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          minimumDate={minDate}
          maximumDate={maximumDate ? parseIsoDate(maximumDate) : undefined}
          onChange={(_, date) => {
            setOpen(Platform.OS === "ios");
            if (date) onChange(toLocalIsoDate(date));
          }}
        />
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
  field: {
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldError: {
    borderColor: colors.error,
  },
  fieldPressed: {
    backgroundColor: colors.chalk,
  },
  value: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  placeholder: {
    color: colors.smokeLight,
  },
  errorText: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.error,
  },
});
