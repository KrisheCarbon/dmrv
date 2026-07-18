import React from "react";
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator
} from "react-native";
import { colors, fonts, radius } from "../constants/theme";

export default function PrimaryButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary"
}) {
  const isOutline = variant === "outline";
  const isAccent = variant === "accent";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        isOutline && styles.outline,
        isAccent && styles.accent,
        isOutline && pressed && styles.outlinePressed,
        (disabled || loading) && styles.disabled
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator
          color={
            isOutline || isAccent ? colors.brunswick : colors.white
          }
        />
      ) : (
        <Text
          style={[
            styles.text,
            isOutline && styles.outlineText,
            isAccent && styles.accentText
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.brunswick,
    paddingVertical: 16,
    borderRadius: radius.sm,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center"
  },
  outline: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderDark
  },
  outlinePressed: {
    backgroundColor: colors.chalk
  },
  accent: {
    backgroundColor: colors.chartreuse
  },
  disabled: {
    opacity: 0.6
  },
  text: {
    color: colors.white,
    fontFamily: fonts.medium,
    fontSize: 16
  },
  outlineText: {
    color: colors.brunswick
  },
  accentText: {
    color: colors.brunswick,
    fontFamily: fonts.bold
  }
});
