import React, { forwardRef, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type KeyboardSafeScrollProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
} & Pick<ScrollViewProps, "showsVerticalScrollIndicator">;

const KeyboardSafeScroll = forwardRef<ScrollView, KeyboardSafeScrollProps>(
  function KeyboardSafeScroll(
    { children, style, contentContainerStyle, showsVerticalScrollIndicator = false },
    ref,
  ) {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          ref={ref}
          style={[styles.flex, style]}
          contentContainerStyle={contentContainerStyle}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  },
);

export default KeyboardSafeScroll;

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
