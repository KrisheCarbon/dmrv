import React, { useState } from "react";
import { Alert } from "react-native";
import type { FieldPhotoMetadata } from "@krishecarbon/shared";
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
  const [metadata, setMetadata] = useState<FieldPhotoMetadata | null>(null);

  async function takePhoto() {
    try {
      setCapturing(true);
      const captured = await captureAndSaveFieldPhoto();
      if (!captured) return;
      setMetadata(captured.metadata);
      onChange(captured.uri);
    } catch (err) {
      Alert.alert("Photo", err instanceof Error ? err.message : String(err));
    } finally {
      setCapturing(false);
    }
  }

  return (
    <PhotoSlot
      label="Farmer photo"
      required={required}
      uris={uri ? [uri] : []}
      capturing={capturing}
      onAdd={takePhoto}
      onRemove={() => {
        setMetadata(null);
        onChange(null);
      }}
      addLabel={uri ? "Retake photo" : "Take photo"}
      metadata={metadata ? [metadata] : undefined}
      hint="GPS, time, and the KriSHE mark are stamped on the photo."
    />
  );
}
