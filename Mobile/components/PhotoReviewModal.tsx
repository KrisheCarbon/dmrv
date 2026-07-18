import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { FieldPhotoMetadata } from "@krishecarbon/shared";
import {
  formatWatermarkGps,
  formatWatermarkTime,
} from "../services/fieldPhoto";
import { colors, fonts, spacing, radius } from "../constants/theme";

type PhotoReviewModalProps = {
  visible: boolean;
  previewUri: string;
  metadata: FieldPhotoMetadata;
  onAccept: () => void;
  onReject: () => void;
};

export default function PhotoReviewModal({
  visible,
  previewUri,
  metadata,
  onAccept,
  onReject,
}: PhotoReviewModalProps) {
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!visible) setPreviewOpen(false);
  }, [visible]);

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={onReject}
      >
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>Save this photo?</Text>
            <Text style={styles.subtitle}>
              GPS and time watermark will be saved on this device.
            </Text>

            <View style={styles.metaBlock}>
              <Text style={styles.meta}>
                GPS: {formatWatermarkGps(metadata.latitude, metadata.longitude)}
              </Text>
              <Text style={styles.meta}>
                Time: {formatWatermarkTime(metadata.captured_at)}
              </Text>
              {metadata.address ? (
                <Text style={styles.meta} numberOfLines={2}>
                  {metadata.address}
                </Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={styles.previewLink}
              onPress={() => setPreviewOpen(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.previewLinkText}>Preview watermarked photo</Text>
            </TouchableOpacity>

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.rejectBtn}
                activeOpacity={0.85}
                onPress={onReject}
              >
                <Text style={styles.rejectText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.acceptBtn}
                activeOpacity={0.85}
                onPress={onAccept}
              >
                <Text style={styles.acceptText}>Accept & save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={previewOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewOpen(false)}
      >
        <View style={styles.previewBackdrop}>
          <Image
            source={{ uri: previewUri }}
            style={styles.previewImage}
            resizeMode="contain"
          />
          <TouchableOpacity
            style={styles.previewClose}
            onPress={() => setPreviewOpen(false)}
          >
            <Text style={styles.previewCloseText}>Close preview</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.brunswick,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
    lineHeight: 18,
  },
  metaBlock: {
    gap: 4,
    paddingVertical: spacing.xs,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
    lineHeight: 16,
  },
  previewLink: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
  },
  previewLinkText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.brunswick,
    textDecorationLine: "underline",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  rejectBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  rejectText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.smoke,
  },
  acceptBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.brunswick,
    alignItems: "center",
  },
  acceptText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.white,
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  previewImage: {
    flex: 1,
    width: "100%",
  },
  previewClose: {
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
  },
  previewCloseText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.brunswick,
  },
});
