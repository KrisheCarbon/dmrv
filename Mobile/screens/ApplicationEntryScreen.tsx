import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
} from "react-native";
import ScreenHeader, { ScreenShell } from "../components/ScreenHeader";
import FormInput from "../components/FormInput";
import FormPicker from "../components/FormPicker";
import FormMultiSelectDropdown from "../components/FormMultiSelectDropdown";
import ReviewStatusBadge from "../components/ReviewStatusBadge";
import LocationPickerModal, {
  openMapPickerIfOnline,
} from "../components/LocationPickerModal";
import PrimaryButton from "../components/PrimaryButton";
import { captureApplicationVideo, LocationUnavailableError } from "../services/fieldPhoto";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import { getCurrentFarmLocation } from "../utils/location";
import { startLocationCache } from "../services/locationCache";
import {
  fetchAvailablePyrolysisBatches,
  getApplicationEntry,
  refreshApplicationReviewStatuses,
  setApplicationPyrolysisLinks,
  submitApplicationEntry,
  toApplicationEntryView,
  updateApplicationEntryLocal,
  type ApplicationEntryView,
  type SelectablePyrolysisBatch,
} from "../services/applicationService";
import { fetchMobileNetworkOverview, type NetworkFarm } from "../services/backendApi";
import { normalizeImageUri } from "../utils/pyrolysisLocalPhotos";
import { colors, fonts, spacing, radius } from "../constants/theme";

export default function ApplicationEntryScreen({ navigation, route }) {
  const entryId = route.params?.entryId as string;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [entry, setEntry] = useState<ApplicationEntryView | null>(null);
  const [farms, setFarms] = useState<NetworkFarm[]>([]);
  const [pyrolysisBatches, setPyrolysisBatches] = useState<SelectablePyrolysisBatch[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [capturingKey, setCapturingKey] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);

  const isEditable = entry?.status === "draft" || entry?.uploadStatus === "local";
  const locationAutoFetchTried = useRef(false);

  const farmOptions = useMemo(
    () =>
      farms.map((farm) => ({
        value: farm.id,
        label: farm.farmer_name,
      })),
    [farms],
  );

  const batchOptions = useMemo(
    () =>
      pyrolysisBatches.map((batch) => ({
        value: batch.id,
        label: batch.batch_number
          ? `${batch.kontikki_code} · ${batch.batch_number}`
          : batch.kontikki_code,
        subtitle: [batch.producer_name, batch.yield_percent != null ? `Yield ${batch.yield_percent}%` : null]
          .filter(Boolean)
          .join(" · "),
      })),
    [pyrolysisBatches],
  );

  const mediaPreviewUri = useMemo(() => {
    if (!entry?.mediaLocalUri && !entry?.mediaUrl) return null;
    if (entry.mediaType === "photo") {
      return normalizeImageUri(entry.mediaLocalUri || entry.mediaUrl);
    }
    return entry.mediaLocalUri || entry.mediaUrl;
  }, [entry?.mediaLocalUri, entry?.mediaUrl, entry?.mediaType]);

  const loadEntry = useCallback(async () => {
    try {
      await refreshApplicationReviewStatuses();
    } catch {
      // Keep cached review status offline.
    }
    const row = await getApplicationEntry(entryId);
    const view = await toApplicationEntryView(row);
    setEntry(view);
    setSelectedBatchIds(view.pyrolysisLinks.map((link) => link.pyrolysisBatchServerId));
  }, [entryId]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const [overview, batches] = await Promise.all([
          fetchMobileNetworkOverview(),
          fetchAvailablePyrolysisBatches(),
        ]);

        if (cancelled) return;

        setFarms(overview.farms ?? []);
        setPyrolysisBatches(batches);
        await loadEntry();
      } catch (err) {
        Alert.alert(
          "Load failed",
          err instanceof Error ? err.message : "Could not load application entry.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [entryId, loadEntry]);

  const queueAutoSave = useCallback(
    (patch: Parameters<typeof updateApplicationEntryLocal>[1]) => {
      if (!isEditable) return;

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await updateApplicationEntryLocal(entryId, patch);
          await loadEntry();
        } catch (err) {
          console.warn("[application] auto-save failed:", err);
        } finally {
          setSaving(false);
        }
      }, 450);
    },
    [entryId, isEditable, loadEntry],
  );

  async function handleFarmChange(farmId: string) {
    const farm = farms.find((item) => item.id === farmId);
    queueAutoSave({
      farmId: farmId || null,
      farmName: farm?.farmer_name ?? null,
    });
  }

  async function captureLocation(showErrors = true) {
    setLocationLoading(true);
    try {
      const location = await getCurrentFarmLocation();
      void startLocationCache();
      queueAutoSave({
        locationLat: location.latitude,
        locationLng: location.longitude,
        locationAddress: location.address,
      });
    } catch (err) {
      if (showErrors) {
        Alert.alert(
          "Location",
          err instanceof Error ? err.message : "Could not get GPS location.",
        );
      }
    } finally {
      setLocationLoading(false);
    }
  }

  async function openMapPicker() {
    const opened = await openMapPickerIfOnline(() => setMapVisible(true));
    if (!opened) {
      Alert.alert(
        "Offline",
        "Map picker needs an internet connection. Use GPS or try again when online.",
      );
    }
  }

  // Location should be captured by default as soon as the entry is open,
  // without requiring the operator to tap "Use GPS" first. Only attempted
  // once per entry — a failure (e.g. permission denied) falls back to the
  // manual buttons below instead of repeatedly prompting.
  useEffect(() => {
    if (!entry || !isEditable) return;
    if (locationAutoFetchTried.current) return;
    if (entry.locationLat != null && entry.locationLng != null) return;

    locationAutoFetchTried.current = true;
    void captureLocation(false);
  }, [entry, isEditable]);

  async function handleBatchSelection(nextIds: string[]) {
    setSelectedBatchIds(nextIds);
    const selected = pyrolysisBatches.filter((batch) => nextIds.includes(batch.id));
    await setApplicationPyrolysisLinks(entryId, selected);
    await loadEntry();
  }

  async function handlePhotoCapture() {
    if (!isEditable) return;

    try {
      setCapturingKey("photo");
      const captured = await captureAndSaveFieldPhoto();
      if (!captured) return;

      queueAutoSave({
        mediaType: "photo",
        mediaLocalUri: captured.uri,
        mediaMetadata: captured.metadata,
      });
    } catch (err) {
      if (err instanceof LocationUnavailableError) {
        Alert.alert("Location error", err.message);
        return;
      }
      Alert.alert(
        "Camera",
        err instanceof Error ? err.message : "Could not capture photo.",
      );
    } finally {
      setCapturingKey(null);
    }
  }

  async function handleVideoCapture() {
    if (!isEditable) return;

    try {
      setCapturingKey("video");
      const captured = await captureApplicationVideo();
      if (!captured) return;

      queueAutoSave({
        mediaType: "video",
        mediaLocalUri: captured.uri,
        mediaMetadata: captured.metadata,
      });
    } catch (err) {
      Alert.alert(
        "Camera",
        err instanceof Error ? err.message : "Could not capture video.",
      );
    } finally {
      setCapturingKey(null);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await submitApplicationEntry(entryId);
      await loadEntry();
      Alert.alert(
        "Submitted",
        "Application entry saved on device and queued for cloud sync.",
        [{ text: "OK", onPress: () => navigation.navigate("ApplicationDashboard") }],
      );
    } catch (err) {
      Alert.alert(
        "Cannot submit",
        err instanceof Error ? err.message : "Complete all required fields.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !entry) {
    return (
      <ScreenShell>
        <ScreenHeader title="Application entry" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brunswick} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <ScreenHeader title="Application entry" onBack={() => navigation.goBack()} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Entry started</Text>
          <Text style={styles.metaLine}>
            {new Date(entry.appliedAt).toLocaleDateString()} ·{" "}
            {new Date(entry.appliedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>

          <View style={styles.locationHeaderRow}>
            <Text style={styles.sectionTitle}>Location</Text>
            {locationLoading ? (
              <ActivityIndicator size="small" color={colors.brunswick} />
            ) : null}
          </View>

          {entry.locationLat != null && entry.locationLng != null ? (
            <>
              <Text style={styles.locationText}>
                {entry.locationLat.toFixed(4)}, {entry.locationLng.toFixed(4)}
              </Text>
              {entry.locationAddress ? (
                <Text style={styles.metaLine} numberOfLines={2}>
                  {entry.locationAddress}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.metaLine}>
              {locationLoading ? "Fetching GPS…" : "Location not captured yet."}
            </Text>
          )}

          <View style={styles.locationActions}>
            <Pressable
              style={({ pressed }) => [
                styles.mediaBtn,
                pressed && styles.mediaBtnPressed,
              ]}
              onPress={() => captureLocation(true)}
              disabled={!isEditable || locationLoading}
            >
              <Text style={styles.mediaBtnText}>
                {locationLoading
                  ? "Getting GPS…"
                  : entry.locationLat != null
                    ? "Retry GPS"
                    : "Use GPS"}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.mediaBtn,
                pressed && styles.mediaBtnPressed,
              ]}
              onPress={openMapPicker}
              disabled={!isEditable}
            >
              <Text style={styles.mediaBtnText}>Pick on map</Text>
            </Pressable>
          </View>

          {saving ? <Text style={styles.saveHint}>Saving…</Text> : null}
        </View>

        <View style={styles.sectionCard}>
          <FormPicker
            label="Select farm *"
            value={entry.farmId ?? ""}
            options={farmOptions}
            onValueChange={handleFarmChange}
            enabled={isEditable}
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Biochar batches *</Text>
          <Text style={styles.sectionHint}>
            Completed pyrolysis batches from producers in your network.
          </Text>
          <FormMultiSelectDropdown
            label="Link batches"
            values={selectedBatchIds}
            options={batchOptions}
            onChange={handleBatchSelection}
            emptyText="No completed pyrolysis batches available yet."
            enabled={isEditable}
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Media *</Text>
          <Text style={styles.sectionHint}>Capture a photo or video of the application.</Text>

          {entry.mediaType && mediaPreviewUri ? (
            <View style={styles.previewBox}>
              {entry.mediaType === "photo" ? (
                <Image source={{ uri: mediaPreviewUri }} style={styles.photoPreview} resizeMode="cover" />
              ) : (
                <View style={styles.videoPreview}>
                  <Text style={styles.videoPreviewTitle}>Video saved on device</Text>
                  <Text style={styles.videoPreviewMeta} numberOfLines={2}>
                    {mediaPreviewUri.split("/").pop()}
                  </Text>
                </View>
              )}
              <Text style={styles.mediaTypeLabel}>
                {entry.mediaType === "photo" ? "Photo" : "Video"} attached
              </Text>
            </View>
          ) : (
            <Text style={styles.metaLine}>No media captured yet.</Text>
          )}

          {entry.mediaMetadata && entry.mediaType === "photo" ? (
            <Text style={styles.metaLine}>
              GPS: {entry.mediaMetadata.latitude.toFixed(6)}, {entry.mediaMetadata.longitude.toFixed(6)}
              {" · "}
              {entry.mediaMetadata.captured_at.slice(0, 19).replace("T", " ")} IST
            </Text>
          ) : null}

          <View style={styles.mediaActions}>
            <Pressable
              style={({ pressed }) => [
                styles.mediaBtn,
                entry.mediaType === "photo" && styles.mediaBtnActive,
                pressed && styles.mediaBtnPressed,
              ]}
              onPress={handlePhotoCapture}
              disabled={!isEditable || capturingKey === "photo"}
            >
              {capturingKey === "photo" ? (
                <ActivityIndicator size="small" color={colors.brunswick} />
              ) : (
                <Text style={styles.mediaBtnText}>Take photo</Text>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.mediaBtn,
                entry.mediaType === "video" && styles.mediaBtnActive,
                pressed && styles.mediaBtnPressed,
              ]}
              onPress={handleVideoCapture}
              disabled={!isEditable || capturingKey === "video"}
            >
              {capturingKey === "video" ? (
                <ActivityIndicator size="small" color={colors.brunswick} />
              ) : (
                <Text style={styles.mediaBtnText}>Record video</Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <FormInput
            label="Comments (optional)"
            placeholder="Any observations about this application"
            value={entry.comment ?? ""}
            onChangeText={(text) => queueAutoSave({ comment: text || null })}
            multiline
            editable={isEditable}
          />
        </View>

        {isEditable ? (
          <PrimaryButton
            title={submitting ? "Submitting…" : "Submit application entry"}
            onPress={handleSubmit}
            disabled={submitting}
          />
        ) : (
          <View style={styles.reviewBox}>
            <ReviewStatusBadge status={entry.reviewStatus || "pending_review"} />
            {entry.reviewerNotes ? (
              <Text style={styles.readOnlyNote}>{entry.reviewerNotes}</Text>
            ) : (
              <Text style={styles.readOnlyNote}>
                This entry has been submitted. Pull to refresh for the latest dashboard
                review.
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      <LocationPickerModal
        visible={mapVisible}
        initialLatitude={entry.locationLat}
        initialLongitude={entry.locationLng}
        onClose={() => setMapVisible(false)}
        onConfirm={(location) => {
          setMapVisible(false);
          queueAutoSave({
            locationLat: location.latitude,
            locationLng: location.longitude,
            locationAddress: location.address,
          });
        }}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.brunswick,
  },
  sectionHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  metaLine: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  saveHint: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.brunswick,
  },
  locationHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  locationActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  locationText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  previewBox: {
    gap: spacing.xs,
  },
  photoPreview: {
    width: "100%",
    height: 180,
    borderRadius: radius.sm,
    backgroundColor: colors.chalk,
  },
  videoPreview: {
    width: "100%",
    minHeight: 100,
    borderRadius: radius.sm,
    backgroundColor: colors.chalk,
    padding: spacing.md,
    justifyContent: "center",
  },
  videoPreviewTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.brunswick,
  },
  videoPreviewMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  mediaTypeLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.success,
  },
  mediaActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  mediaBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.chalk,
  },
  mediaBtnActive: {
    borderColor: colors.brunswick,
    backgroundColor: colors.white,
  },
  mediaBtnPressed: {
    opacity: 0.85,
  },
  mediaBtnText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.brunswick,
  },
  reviewBox: {
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  readOnlyNote: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
