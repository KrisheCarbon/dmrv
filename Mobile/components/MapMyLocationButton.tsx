import React from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";

type Props = {
  onPress: () => void;
  loading?: boolean;
};

/** Jumps the map back to the blue dot, like the my-location control in chat maps. */
export default function MapMyLocationButton({ onPress, loading }: Props) {
  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={onPress}
      disabled={loading}
      accessibilityLabel="Show my location"
    >
      {loading ? (
        <ActivityIndicator size="small" color="#1A73E8" />
      ) : (
        <View style={styles.ring}>
          <View style={styles.dot} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#1A73E8",
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#1A73E8",
  },
});
