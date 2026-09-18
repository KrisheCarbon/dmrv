import React, { useState } from "react";
import { Alert } from "react-native";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import PhotoSlot from "./PhotoSlot";

export default function FarmerPhotoField({
  uri,
  required = false,
  onChange,
}: {
  uri?: string | null;
  required?: boolean;
  onChange: (uri: string | null) => void;
}) {
  const [capturing, setCapturing] = useState(false);

  async function takePhoto() {
    try {
      setCapturing(true);
      const captured = await captureAndSaveFieldPhoto();
      if (!captured) return;
      onChange(captured.uri);
    } catch (err) {
      Alert.alert("Photo", err instanceof Error ? err.message : String(err));
    } finally {
      setCapturing(false);
    }
  }

  return (
    <PhotoSlot
      label={required ? "Farmer photo" : "Farmer photo"}
      required={required}
      uris={uri ? [uri] : []}
      capturing={capturing}
      onAdd={takePhoto}
      onRemove={() => onChange(null)}
      addLabel={uri ? "Retake photo" : "Take photo"}
      hint="Open the camera and photograph the farmer. Use the red × on the photo to remove it."
    />
  );
}
