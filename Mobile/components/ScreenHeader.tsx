import React, { type ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fonts, spacing } from "../constants/theme";

type ScreenHeaderProps = {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  rightElement?: ReactNode;
};

export default function ScreenHeader({
  title,
  subtitle,
  onBack,
  rightElement,
}: ScreenHeaderProps) {
  const hasToolbar = Boolean(onBack || rightElement);

  return (
    <View style={[styles.wrap, !hasToolbar && styles.wrapNoToolbar]}>
      {hasToolbar ? (
        <View style={styles.row}>
          {onBack ? (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={onBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
          ) : null}
          {rightElement ? (
            <View style={styles.rowRight}>{rightElement}</View>
          ) : null}
        </View>
      ) : null}

      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function ScreenShell({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={[styles.safe, style]} edges={["top", "left", "right"]}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.white
  },
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  wrapNoToolbar: {
    paddingTop: spacing.md,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  rowRight: {
    marginLeft: "auto",
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    fontSize: 22,
    color: colors.brunswick,
    fontFamily: fonts.medium,
    marginTop: -2
  },
  title: {
    fontSize: 28,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    letterSpacing: -0.5
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.smoke,
    marginTop: 6,
    lineHeight: 20
  }
});
