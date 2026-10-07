import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, fonts, spacing, radius } from "../constants/theme";

type SearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  onFocus?: () => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
};

function SearchIcon({ active }: { active: boolean }) {
  const color = active ? colors.brunswick : colors.smoke;
  return (
    <View style={styles.iconWrap} pointerEvents="none">
      <View style={[styles.iconRing, { borderColor: color }]} />
      <View style={[styles.iconHandle, { backgroundColor: color }]} />
    </View>
  );
}

export default function SearchField({
  value,
  onChangeText,
  placeholder,
  onFocus,
  onBlur,
  autoFocus = false,
  style,
}: SearchFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.box, focused && styles.boxFocused, style]}>
      <SearchIcon active={focused} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.smokeLight}
        style={styles.input}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        autoComplete="off"
        importantForAutofill="no"
        returnKeyType="search"
        clearButtonMode="never"
        underlineColorAndroid="transparent"
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText("")}
          hitSlop={10}
          style={styles.clearBtn}
          accessibilityLabel="Clear search"
        >
          <Text style={styles.clearText}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    backgroundColor: colors.chalk,
  },
  boxFocused: {
    borderColor: colors.brunswick,
    backgroundColor: colors.white,
  },
  iconWrap: {
    width: 16,
    height: 16,
  },
  iconRing: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  iconHandle: {
    position: "absolute",
    width: 6,
    height: 1.5,
    borderRadius: 1,
    right: 0,
    bottom: 1,
    transform: [{ rotate: "45deg" }],
  },
  input: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 0,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlay,
  },
  clearText: {
    fontSize: 18,
    lineHeight: 20,
    color: colors.smoke,
    fontFamily: fonts.medium,
    marginTop: -1,
  },
});
