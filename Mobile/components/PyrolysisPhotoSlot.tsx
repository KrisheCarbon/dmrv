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
import { PhotoThumb } from "./PhotoSlot";

type PyrolysisPhotoSlotProps = {
  label: string;
  required?: boolean;
  localUri?: string | null;
  remoteUrl?: string | null;
  metadata?: FieldPhotoMetadata | null;
  capturing?: boolean;
  onCapture: () => void;
  onRemove?: () => void;
};

export default function PyrolysisPhotoSlot({
  label,
  required = false,
  localUri,
  remoteUrl,
  metadata,
  capturing = false,
  onCapture,
  onRemove,
}: PyrolysisPhotoSlotProps) {
  const previewUri = normalizeImageUri(localUri || remoteUrl || null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const hasPhoto = Boolean(previewUri);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label}
          {required ? " *" : " (optional)"}
        </Text>
        {hasPhoto ? <Text style={styles.savedTag}>✓ Saved</Text> : null}
      </View>

      <View style={styles.row}>
        {hasPhoto ? (
          <PhotoThumb
            uri={previewUri!}
            onRemove={onRemove}
            onPress={() => setViewerOpen(true)}
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderIcon}>📷</Text>
          </View>
        )}

        <View style={styles.rowBody}>
          {metadata && hasPhoto ? (
            <Text style={styles.meta} numberOfLines={2}>
              {metadata.captured_at.slice(0, 19).replace("T", " ")} IST
              {"\n"}
              {metadata.latitude.toFixed(5)}, {metadata.longitude.toFixed(5)}
            </Text>
          ) : (
            <Text style={styles.hint}>
              {hasPhoto
                ? "Use the red × on the photo to remove it."
                : "Photo is watermarked automatically"}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.button, capturing && styles.buttonDisabled]}
            onPress={onCapture}
            disabled={capturing}
            activeOpacity={0.85}
          >
            {capturing ? (
              <ActivityIndicator color={colors.brunswick} size="small" />
            ) : (
              <Text style={styles.buttonText}>{hasPhoto ? "Retake photo" : "Take photo"}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

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
  labelRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  label: {
    flex: 1,
    flexShrink: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 18,
    color: colors.brunswick,
  },
  savedTag: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.success,
    flexShrink: 0,
    marginTop: 1,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  rowBody: {
    flex: 1,
    minWidth: 140,
    gap: 6,
    justifyContent: "center",
  },
  placeholder: {
    width: 64,
    height: 64,
    flexShrink: 0,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAFAFA",
  },
  placeholderIcon: {
    fontSize: 22,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.smoke,
    lineHeight: 15,
    flexShrink: 1,
  },
  button: {
    alignSelf: "flex-start",
    backgroundColor: colors.chalk,
    borderWidth: 1,
    borderColor: colors.brunswick,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.brunswick,
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
