import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, fonts, radius } from "../constants/theme";

/** Round "+" at the top right of a list screen that opens a new entry. */
export default function AddEntryButton({
  onPress,
  label,
}: {
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <Text style={styles.plus}>+</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.brunswick,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    backgroundColor: colors.brunswickLight,
  },
  plus: {
    fontSize: 28,
    lineHeight: 30,
    color: colors.chartreuse,
    fontFamily: fonts.medium,
    marginTop: -2,
  },
});
