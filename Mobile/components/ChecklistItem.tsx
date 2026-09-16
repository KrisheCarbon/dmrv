import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, fonts } from "../constants/theme";

export type ChecklistTone = "none" | "ok" | "warn" | "error";

export default function ChecklistItem({
  done,
  label,
  tone,
}: {
  done?: boolean;
  label: string;
  tone?: ChecklistTone;
}) {
  const resolved: ChecklistTone =
    tone ?? (done ? "ok" : "none");
  const filled = resolved !== "none";

  return (
    <View style={styles.item}>
      <View
        style={[
          styles.circle,
          resolved === "ok" && styles.circleOn,
          resolved === "warn" && styles.circleWarn,
          resolved === "error" && styles.circleError,
        ]}
      >
        {filled ? (
          <Text
            style={[
              styles.tick,
              resolved === "warn" && styles.tickWarn,
              resolved === "error" && styles.tickError,
            ]}
          >
            ✓
          </Text>
        ) : null}
      </View>
      <Text
        style={[
          styles.label,
          resolved === "ok" && styles.labelOn,
          resolved === "warn" && styles.labelWarn,
          resolved === "error" && styles.labelError,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  circle: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.smokeLight,
    alignItems: "center",
    justifyContent: "center",
  },
  circleOn: {
    borderColor: colors.brunswick,
    backgroundColor: colors.successBg,
  },
  circleWarn: {
    borderColor: colors.warning,
    backgroundColor: colors.warningBg,
  },
  circleError: {
    borderColor: colors.error,
    backgroundColor: colors.errorBg,
  },
  tick: {
    fontSize: 9,
    lineHeight: 11,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    includeFontPadding: false,
    textAlign: "center",
    marginTop: -0.5,
  },
  tickWarn: {
    color: "#9A7200",
  },
  tickError: {
    color: colors.error,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: colors.smoke,
  },
  labelOn: {
    color: colors.brunswick,
  },
  labelWarn: {
    color: "#9A7200",
  },
  labelError: {
    color: colors.error,
  },
});
