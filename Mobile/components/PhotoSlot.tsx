import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, fonts, spacing, radius } from "../constants/theme";
import { normalizeImageUri } from "../utils/pyrolysisLocalPhotos";

export type PhotoSlotMeta = {
  latitude?: number | null;
  longitude?: number | null;
  captured_at?: string | null;
};

type PhotoThumbProps = {
  uri: string;
  onRemove?: () => void;
  onPress?: () => void;
};

export function PhotoThumb({ uri, onRemove, onPress }: PhotoThumbProps) {
  const previewUri = normalizeImageUri(uri);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    setPreviewError(false);
  }, [previewUri]);

  if (!previewUri || previewError) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderIcon}>📷</Text>
      </View>
    );
  }

  return (
    <View style={styles.thumbWrap}>
      <TouchableOpacity
        style={styles.thumbnail}
        onPress={onPress}
        activeOpacity={0.85}
        disabled={!onPress}
      >
        <Image
          source={{ uri: previewUri }}
          style={styles.thumbnailImage}
          onError={() => setPreviewError(true)}
        />
      </TouchableOpacity>
      {onRemove ? (
        <TouchableOpacity
          style={styles.removeBadge}
          onPress={onRemove}
          hitSlop={8}
          accessibilityLabel="Remove photo"
          accessibilityRole="button"
        >
          <Text style={styles.removeBadgeText}>×</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

type PhotoSlotProps = {
  label: string;
  required?: boolean;
  uris: string[];
  max?: number;
  capturing?: boolean;
  onAdd: () => void;
  onRemove: (uri: string) => void;
  addLabel?: string;
  hint?: string;
  metadata?: Array<PhotoSlotMeta | null | undefined>;
};

export default function PhotoSlot({
  label,
  required = false,
  uris,
  max = 1,
  capturing = false,
  onAdd,
  onRemove,
  addLabel,
  hint,
  metadata,
}: PhotoSlotProps) {
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const photos = (uris || []).filter(Boolean);
  const hasPhoto = photos.length > 0;
  const atMax = photos.length >= max;
  const single = max <= 1;
  const firstMeta = metadata?.[0];

  const buttonLabel = addLabel
    ? addLabel
    : atMax && single
      ? "Retake photo"
      : hasPhoto
        ? `Take photo (${photos.length}/${max})`
        : "Take photo";

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label}
          {required ? " *" : ""}
        </Text>
        {hasPhoto ? (
          <Text style={styles.savedTag}>
            {photos.length > 1 ? `${photos.length} saved` : "✓ Saved"}
          </Text>
        ) : null}
      </View>

      {single ? (
        <View style={styles.row}>
          {hasPhoto ? (
            <PhotoThumb
              uri={photos[0]}
              onRemove={() => onRemove(photos[0])}
              onPress={() => setViewerUri(photos[0])}
            />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderIcon}>📷</Text>
            </View>
          )}

          <View style={styles.rowBody}>
            {firstMeta && hasPhoto ? (
              <Text style={styles.meta} numberOfLines={2}>
                {[
                  firstMeta.captured_at
                    ? firstMeta.captured_at.slice(0, 19).replace("T", " ")
                    : null,
                  firstMeta.latitude != null && firstMeta.longitude != null
                    ? `${Number(firstMeta.latitude).toFixed(5)}, ${Number(firstMeta.longitude).toFixed(5)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join("\n")}
              </Text>
            ) : (
              <Text style={styles.hint}>
                {hint || "Photo is watermarked automatically"}
              </Text>
            )}

            <TouchableOpacity
              style={[styles.button, capturing && styles.buttonDisabled]}
              onPress={onAdd}
              disabled={capturing}
              activeOpacity={0.85}
            >
              {capturing ? (
                <ActivityIndicator color={colors.brunswick} size="small" />
              ) : (
                <Text style={styles.buttonText}>{buttonLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.multiWrap}>
          <Text style={styles.hint}>
            {hint || "Tap a photo to view. Use × if you need to retake it."}
          </Text>
          {!atMax ? (
            <TouchableOpacity
              style={[styles.button, capturing && styles.buttonDisabled]}
              onPress={onAdd}
              disabled={capturing}
              activeOpacity={0.85}
            >
              {capturing ? (
                <ActivityIndicator color={colors.brunswick} size="small" />
              ) : (
                <Text style={styles.buttonText}>{buttonLabel}</Text>
              )}
            </TouchableOpacity>
          ) : (
            <Text style={styles.hint}>Maximum of {max} photos added.</Text>
          )}
          {hasPhoto ? (
            <View style={styles.photoRow}>
              {photos.map((uri) => (
                <PhotoThumb
                  key={uri}
                  uri={uri}
                  onRemove={() => onRemove(uri)}
                  onPress={() => setViewerUri(uri)}
                />
              ))}
            </View>
          ) : null}
        </View>
      )}

      <Modal
        visible={Boolean(viewerUri)}
        animationType="fade"
        transparent
        onRequestClose={() => setViewerUri(null)}
      >
        <View style={styles.viewerBackdrop}>
          {viewerUri ? (
            <Image
              source={{ uri: normalizeImageUri(viewerUri) || viewerUri }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          ) : null}
          <TouchableOpacity
            style={styles.viewerClose}
            onPress={() => setViewerUri(null)}
          >
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
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.brunswick,
  },
  savedTag: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.success,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  rowBody: {
    flex: 1,
    gap: 6,
    justifyContent: "center",
  },
  multiWrap: {
    gap: spacing.sm,
  },
  photoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingTop: 8,
    paddingRight: 8,
  },
  thumbWrap: {
    width: 64,
    height: 64,
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.chalk,
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
  },
  removeBadge: {
    position: "absolute",
    top: -7,
    right: -7,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderDark,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    elevation: 2,
  },
  removeBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    lineHeight: 18,
    color: colors.error,
    marginTop: -1,
  },
  placeholder: {
    width: 64,
    height: 64,
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
    lineHeight: 16,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.smoke,
    lineHeight: 15,
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
