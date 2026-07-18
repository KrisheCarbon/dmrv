import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { FieldPhotoMetadata } from "@krishecarbon/shared";
import { colors, fonts, spacing, radius } from "../constants/theme";
import { normalizeImageUri } from "../utils/pyrolysisLocalPhotos";

type PyrolysisPhotoSlotProps = {
  label: string;
  required?: boolean;
  localUri?: string | null;
  remoteUrl?: string | null;
  metadata?: FieldPhotoMetadata | null;
  capturing?: boolean;
  onCapture: () => void;
};

export default function PyrolysisPhotoSlot({
  label,
  required = false,
  localUri,
  remoteUrl,
  metadata,
  capturing = false,
  onCapture,
}: PyrolysisPhotoSlotProps) {
  const previewUri = normalizeImageUri(localUri || remoteUrl || null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  React.useEffect(() => {
    setPreviewError(false);
  }, [previewUri]);

  const hasPhoto = Boolean(previewUri && !previewError);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required ? " *" : " (optional)"}
      </Text>

      {hasPhoto ? (
        <View style={styles.savedRow}>
          <View style={styles.savedBadge}>
            <Text style={styles.savedBadgeText}>✓</Text>
          </View>
          <View style={styles.savedCopy}>
            <Text style={styles.savedTitle}>Photo saved on device</Text>
            <TouchableOpacity onPress={() => setViewerOpen(true)} activeOpacity={0.85}>
              <Text style={styles.viewLink}>View photo</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            {previewError ? "Could not load photo — retake" : "Camera capture only"}
          </Text>
        </View>
      )}

      {metadata && hasPhoto ? (
        <Text style={styles.meta}>
          GPS: {metadata.latitude.toFixed(6)}, {metadata.longitude.toFixed(6)}
          {" · "}
          {metadata.captured_at.slice(0, 19).replace("T", " ")} IST
        </Text>
      ) : null}

      <TouchableOpacity
        style={[styles.button, capturing && styles.buttonDisabled]}
        onPress={onCapture}
        disabled={capturing}
      >
        {capturing ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <Text style={styles.buttonText}>{hasPhoto ? "Retake photo" : "Take photo"}</Text>
        )}
      </TouchableOpacity>

      <Modal
        visible={viewerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setViewerOpen(false)}
      >
        <View style={styles.viewerBackdrop}>
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={styles.viewerImage}
              resizeMode="contain"
              onError={() => setPreviewError(true)}
            />
          ) : null}
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerOpen(false)}>
            <Text style={styles.viewerCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.brunswick,
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.chalk,
  },
  savedBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  savedBadgeText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  savedCopy: {
    flex: 1,
    gap: 2,
  },
  savedTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.brunswick,
  },
  viewLink: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.brunswick,
    textDecorationLine: "underline",
  },
  placeholder: {
    width: "100%",
    height: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAFAFA",
  },
  placeholderText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.smoke,
    lineHeight: 15,
  },
  button: {
    alignSelf: "flex-start",
    backgroundColor: colors.brunswick,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.white,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  viewerImage: {
    flex: 1,
    width: "100%",
  },
  viewerClose: {
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
  },
  viewerCloseText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.brunswick,
  },
});
