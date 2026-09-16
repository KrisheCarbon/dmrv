import React from "react";
import { View, Text, Pressable, Image, StyleSheet, Alert } from "react-native";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import { colors, fonts, spacing, radius } from "../constants/theme";

export default function FarmerPhotoField({
  uri,
  required = false,
  onChange,
}: {
  uri?: string | null;
  required?: boolean;
  onChange: (uri: string) => void;
}) {
  async function takePhoto() {
    try {
      const captured = await captureAndSaveFieldPhoto();
      if (!captured) return;
      onChange(captured.uri);
    } catch (err) {
      Alert.alert("Photo", err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{required ? "Farmer photo *" : "Farmer photo"}</Text>
      <Pressable style={styles.button} onPress={takePhoto}>
        <Text style={styles.buttonText}>
          {uri ? "Retake farmer photo" : "Take farmer photo"}
        </Text>
      </Pressable>
      {uri ? (
        <Image source={{ uri }} style={styles.photo} />
      ) : (
        <Text style={styles.hint}>
          Open the camera and photograph the farmer.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  label: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
  },
  button: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.chalk,
  },
  buttonText: {
    fontFamily: fonts.medium,
    color: colors.brunswick,
    fontSize: 13,
  },
  photo: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.chalk,
  },
  hint: {
    fontFamily: fonts.regular,
    color: colors.smoke,
    fontSize: 12,
  },
});
