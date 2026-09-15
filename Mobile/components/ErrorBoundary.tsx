import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import PrimaryButton from "./PrimaryButton";
import { colors, fonts, spacing } from "../constants/theme";

type Props = {
  children: React.ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * Catches render/lifecycle errors from any screen so a single broken screen
 * shows a recoverable message instead of white-screening the whole app.
 * This does not catch errors inside async callbacks (those are handled by
 * each screen's own try/catch + Alert), only errors thrown during render.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] caught error:", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;

    if (error) {
      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              This screen ran into a problem. Your data saved so far is safe
              on this device.
            </Text>
            {__DEV__ ? (
              <Text style={styles.debug}>{error.message}</Text>
            ) : null}
            <PrimaryButton title="Try again" onPress={this.reset} />
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.brunswick,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  message: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.smoke,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  debug: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.error,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
});
