import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, fonts } from "../constants/theme";

/** Compact text mark for in-app headers (no image — avoids PNG background boxes) */
export default function BrandLogo() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.krishe}>KriSHE</Text>
      <Text style={styles.carbon}>Carbon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "flex-start"
  },
  krishe: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.chartreuse,
    letterSpacing: -0.5,
    lineHeight: 24
  },
  carbon: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.smoke,
    letterSpacing: 0.5,
    marginTop: -2
  }
});
