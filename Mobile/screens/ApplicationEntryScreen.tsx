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
import {
  applicationAreaAcres,
  applicationPolygonInsideFarm,
  checkApplicationPhoto,
  formatApplicationAcres,
  type ApplicationFarmerOption,
} from "@krishecarbon/shared";
import ScreenHeader, { ScreenShell } from "../components/ScreenHeader";
import FormInput from "../components/FormInput";
import FormPicker from "../components/FormPicker";
import FormMultiSelectDropdown from "../components/FormMultiSelectDropdown";
import ReviewStatusBadge from "../components/ReviewStatusBadge";
import LocationPickerModal, {
  openMapPickerIfOnline,
} from "../components/LocationPickerModal";
import PolygonMapperModal from "../components/PolygonMapperModal";
import PrimaryButton from "../components/PrimaryButton";
import KeyboardSafeScroll from "../components/KeyboardSafeScroll";
import { PhotoRemoveBadge } from "../components/PhotoSlot";
import { captureApplicationVideo, LocationUnavailableError } from "../services/fieldPhoto";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import { getCurrentFarmLocation } from "../utils/location";
import { startLocationCache } from "../services/locationCache";
import {
  applicationDraftHasContent,
  deleteApplicationDraft,
  fetchAvailablePyrolysisBatches,
  getApplicationEntry,
  loadApplicationFarmers,
  refreshApplicationReviewStatuses,
  setApplicationPyrolysisLinks,
  submitApplicationEntry,
  toApplicationEntryView,
  updateApplicationEntryLocal,
  type ApplicationEntryUpdate,
  type ApplicationEntryView,
  type SelectablePyrolysisBatch,
} from "../services/applicationService";
import { normalizeImageUri } from "../utils/pyrolysisLocalPhotos";
import { colors, fonts, spacing, radius, typeScale } from "../constants/theme";

export default function ApplicationEntryScreen({ navigation, route }) {
  const entryId = route.params?.entryId as string;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<ApplicationEntryUpdate>({});
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const leavingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [entry, setEntry] = useState<ApplicationEntryView | null>(null);
  const [farmers, setFarmers] = useState<ApplicationFarmerOption[]>([]);
  const [pyrolysisBatches, setPyrolysisBatches] = useState<SelectablePyrolysisBatch[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [capturingKey, setCapturingKey] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [polygonVisible, setPolygonVisible] = useState(false);

  const isEditable = entry?.status === "draft" || entry?.uploadStatus === "local";
  const locationAutoFetchTried = useRef(false);

  const farmerOptions = useMemo(
    () =>
      farmers.map((farmer) => ({
        value: farmer.id,
        label: farmer.farmer_name,
        hint: [farmer.village, farmer.cluster_name].filter(Boolean).join(" · "),
      })),
    [farmers],
  );

  const selectedFarmer = farmers.find((farmer) => farmer.id === entry?.farmId) ?? null;
  const fieldOptions = useMemo(
    () =>
      (selectedFarmer?.fields ?? []).map((field) => ({
        value: field.id,
        label: field.field_code,
        hint: formatApplicationAcres(field.area_acres),
      })),
    [selectedFarmer],
  );
  const selectedField =
    selectedFarmer?.fields.find((field) => field.id === entry?.farmFieldId) ?? null;

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
        const [loadedFarmers, batches] = await Promise.all([
          loadApplicationFarmers(),
          fetchAvailablePyrolysisBatches(),
        ]);

        if (cancelled) return;

        setFarmers(loadedFarmers);
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

  const flushPendingSave = useCallback(async () => {
    if (saveInFlightRef.current) await saveInFlightRef.current;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const patch = pendingPatchRef.current;
    if (Object.keys(patch).length === 0) return;
    pendingPatchRef.current = {};
    const work = updateApplicationEntryLocal(entryId, patch).then(() => undefined);
    saveInFlightRef.current = work;
    try {
      await work;
    } finally {
      if (saveInFlightRef.current === work) saveInFlightRef.current = null;
    }
  }, [entryId]);

  const queueAutoSave = useCallback(
    (patch: ApplicationEntryUpdate) => {
      if (!isEditable) return;

      pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await flushPendingSave();
          await loadEntry();
        } catch (err) {
          console.warn("[application] auto-save failed:", err);
        } finally {
          setSaving(false);
        }
      }, 450);
    },
    [isEditable, flushPendingSave, loadEntry],
  );

  const flushPendingSaveRef = useRef(flushPendingSave);
  flushPendingSaveRef.current = flushPendingSave;

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (leavingRef.current) return;
      event.preventDefault();
      leavingRef.current = true;
      void (async () => {
        try {
          await flushPendingSaveRef.current();
          const view = await toApplicationEntryView(await getApplicationEntry(entryId));
          if (
            view.status === "draft" &&
            !view.serverId &&
            view.uploadStatus === "local" &&
            !applicationDraftHasContent(view)
          ) {
            await deleteApplicationDraft(entryId);
          }
        } catch (err) {
          console.warn("[application] leave save failed:", err);
        }
        navigation.dispatch(event.data.action);
      })();
    });
    return unsubscribe;
  }, [navigation, entryId]);

  function handleFarmerChange(farmerId: string) {
    const farmer = farmers.find((item) => item.id === farmerId);
    queueAutoSave({
      farmId: farmerId || null,
      farmName: farmer?.farmer_name ?? null,
      farmFieldId: null,
      fieldCode: null,
      applicationBoundary: null,
      mediaType: null,
      mediaLocalUri: null,
      mediaMetadata: null,
    });
  }

  function handleFieldChange(fieldId: string) {
    const field = selectedFarmer?.fields.find((item) => item.id === fieldId);
    const boundaryStillFits =
      field &&
      entry?.applicationBoundary.length &&
      applicationPolygonInsideFarm(entry.applicationBoundary, field.boundary);
    queueAutoSave({
      farmFieldId: fieldId || null,
      fieldCode: field?.field_code ?? null,
      applicationBoundary: boundaryStillFits ? entry?.applicationBoundary : null,
      mediaType: boundaryStillFits ? undefined : null,
      mediaLocalUri: boundaryStillFits ? undefined : null,
      mediaMetadata: boundaryStillFits ? undefined : null,
    });
  }

  function photoCheck(latitude?: number | null, longitude?: number | null) {
    if (!selectedField) {
      return {
        ok: false as const,
        title: "Select a farm",
        message: "Choose the farmer and the farm plot before taking the photo.",
      };
    }
    return checkApplicationPhoto({
      farmBoundary: selectedField.boundary,
      appliedBoundary: entry?.applicationBoundary ?? [],
      latitude,
      longitude,
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
      const check = photoCheck(captured.metadata.latitude, captured.metadata.longitude);
      if (check.ok === false) {
        Alert.alert(check.title, check.message);
        return;
      }

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
      const captured = await captureApplicationVideo({ requireLocation: true });
      if (!captured) return;
      const check = photoCheck(captured.metadata.latitude, captured.metadata.longitude);
      if (check.ok === false) {
        Alert.alert(check.title, check.message);
        return;
      }

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
    const check = photoCheck(entry?.mediaMetadata?.latitude, entry?.mediaMetadata?.longitude);
    if (check.ok === false) {
      Alert.alert(check.title, check.message);
      return;
    }
    if (!selectedField || (entry?.applicationBoundary.length ?? 0) < 3) {
      Alert.alert(
        "Draw the applied area",
        "Choose the farm and draw where the biochar was applied before submitting.",
      );
      return;
    }

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
      <KeyboardSafeScroll
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
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
            label="Farmer *"
            value={entry.farmId ?? ""}
            options={farmerOptions}
            onValueChange={handleFarmerChange}
            enabled={isEditable}
            searchable
            searchPlaceholder="Search farmer or village"
          />
          <FormPicker
            label="Farm plot *"
            value={entry.farmFieldId ?? ""}
            options={fieldOptions}
            onValueChange={handleFieldChange}
            enabled={isEditable && Boolean(selectedFarmer)}
            searchable
            searchPlaceholder="Search farm plot"
          />
          <Text style={styles.metaLine}>
            {farmerOptions.length === 0
              ? "No onboarded farm with a mapped boundary is on this phone. Draw the farm plot, then connect once so it can be selected."
              : selectedField
                ? `This farm is ${formatApplicationAcres(selectedField.area_acres)}.`
                : "Select the farmer, then the farm plot."}
          </Text>
          <Text style={styles.areaText}>
            {entry.applicationBoundary.length >= 3
              ? `Biochar applied on ${formatApplicationAcres(applicationAreaAcres(entry.applicationBoundary))}.`
              : "Draw the part of the farm where biochar was applied."}
          </Text>
          {isEditable ? (
            <PrimaryButton
              title={entry.applicationBoundary.length >= 3 ? "Redraw applied area" : "Draw applied area"}
              variant="outline"
              onPress={() => {
                if (!selectedField) {
                  Alert.alert("Select a farm", "Choose the farmer and the farm plot first.");
                  return;
                }
                void openMapPickerIfOnline(() => setPolygonVisible(true)).then((opened) => {
                  if (!opened) {
                    Alert.alert(
                      "Offline",
                      "Drawing the applied area needs an internet connection for the map.",
                    );
                  }
                });
              }}
            />
          ) : null}
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
          <Text style={styles.sectionHint}>
            Take the photo inside this farm, within 100 m of the area where biochar was applied.
          </Text>

          {entry.mediaType && mediaPreviewUri ? (
            <View style={styles.previewBox}>
              {entry.mediaType === "photo" ? (
                <View style={styles.photoPreviewWrap}>
                  <Image source={{ uri: mediaPreviewUri }} style={styles.photoPreview} resizeMode="cover" />
                  {isEditable ? (
                    <PhotoRemoveBadge
                      onPress={() =>
                        queueAutoSave({
                          mediaType: null,
                          mediaLocalUri: null,
                          mediaUrl: null,
                          mediaMetadata: null,
                        })
                      }
                    />
                  ) : null}
                </View>
              ) : (
                <View style={styles.videoPreview}>
                  {isEditable ? (
                    <PhotoRemoveBadge
                      onPress={() =>
                        queueAutoSave({
                          mediaType: null,
                          mediaLocalUri: null,
                          mediaUrl: null,
                          mediaMetadata: null,
                        })
                      }
                    />
                  ) : null}
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
            onFocus={() => {
              setTimeout(() => {
                scrollRef.current?.scrollToEnd({ animated: true });
              }, 250);
            }}
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
      </KeyboardSafeScroll>

      <PolygonMapperModal
        visible={polygonVisible}
        title="Applied area"
        hint="The dark outline is the farm. Tap inside it to mark where the biochar was applied."
        initialLatitude={entry.locationLat}
        initialLongitude={entry.locationLng}
        initialPoints={entry.applicationBoundary}
        farmOutline={selectedField?.boundary ?? []}
        onClose={() => setPolygonVisible(false)}
        onConfirm={(points) => {
          setPolygonVisible(false);
          if (!selectedField || !applicationPolygonInsideFarm(points, selectedField.boundary)) {
            Alert.alert(
              "Outside the farm",
              "Draw the applied area inside the farm boundary shown on the map.",
            );
            return;
          }
          queueAutoSave({
            applicationBoundary: points,
            mediaType: null,
            mediaLocalUri: null,
            mediaMetadata: null,
          });
        }}
      />

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
    paddingBottom: spacing.xxl + 32,
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
    fontSize: typeScale.label,
    color: colors.textSecondary,
  },
  areaText: {
    fontFamily: fonts.medium,
    fontSize: typeScale.body,
    color: colors.text,
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
  photoPreviewWrap: {
    position: "relative",
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
    position: "relative",
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
