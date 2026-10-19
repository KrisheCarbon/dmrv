import React, { useState } from "react";
import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors, fonts, spacing, radius, typeScale } from "../constants/theme";

export default function FormDateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date;
  onChange: (next: Date) => void;
}) {
  const [step, setStep] = useState<"date" | "time" | null>(null);

  if (Platform.OS === "ios") {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>{label}</Text>
        <DateTimePicker
          value={value}
          mode="datetime"
          display="spinner"
          onChange={(_, date) => {
            if (date) onChange(date);
          }}
        />
      </View>
    );
  }
  const shown = value.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={() => setStep("date")}>
        <Text style={styles.value}>{shown}</Text>
      </Pressable>
      {step ? (
        <DateTimePicker
          value={value}
          mode={step}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, date) => {
            if (Platform.OS !== "ios") setStep(null);
            if (!date) return;
            if (step === "date") {
              const next = new Date(value);
              next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
              onChange(next);
              setStep("time");
              return;
            }
            const next = new Date(value);
            next.setHours(date.getHours(), date.getMinutes(), 0, 0);
            onChange(next);
            setStep(null);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label,
    color: colors.text,
  },
  field: {
    minHeight: 48,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
  },
  value: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    color: colors.text,
  },
});
