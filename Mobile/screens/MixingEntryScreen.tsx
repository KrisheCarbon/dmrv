import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
} from "react-native";
import {
  MIXING_MATERIAL_TYPES,
  mixingMaterialLabel,
  type MixingMaterialType,
} from "@krishecarbon/shared";
import ScreenHeader, { ScreenShell } from "../components/ScreenHeader";
import FormInput from "../components/FormInput";
import FormPicker from "../components/FormPicker";
import FormMultiSelectDropdown from "../components/FormMultiSelectDropdown";
import PyrolysisPhotoSlot from "../components/PyrolysisPhotoSlot";
import ReviewStatusBadge from "../components/ReviewStatusBadge";
import LocationPickerModal, {
  openMapPickerIfOnline,
} from "../components/LocationPickerModal";
import PrimaryButton from "../components/PrimaryButton";
import KeyboardSafeScroll from "../components/KeyboardSafeScroll";
import { LocationUnavailableError } from "../services/fieldPhoto";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import {
  fetchAvailablePyrolysisBatches,
  getMixingEntry,
  refreshMixingReviewStatuses,
  setMixingPyrolysisLinks,
  submitMixingEntry,
  toMixingEntryView,
  updateMixingEntryLocal,
  type MixingEntryView,
  type SelectablePyrolysisBatch,
} from "../services/mixingService";
import {
  fetchMobileNetworkOverview,
  type NetworkFarm,
} from "../services/backendApi";
import { getCurrentFarmLocation } from "../utils/location";
import { startLocationCache } from "../services/locationCache";
import { colors, fonts, spacing, radius } from "../constants/theme";

type PhotoKind = "biochar" | "substrate" | "mixing";

export default function MixingEntryScreen({ navigation, route }) {
  const entryId = route.params?.entryId as string;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [entry, setEntry] = useState<MixingEntryView | null>(null);
  const [farms, setFarms] = useState<NetworkFarm[]>([]);
  const [pyrolysisBatches, setPyrolysisBatches] = useState<SelectablePyrolysisBatch[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [capturingKey, setCapturingKey] = useState<string | null>(null);

  const isEditable = entry?.status === "draft" || entry?.uploadStatus === "local";
  const locationAutoFetchTried = useRef(false);

  const farmOptions = useMemo(
    () =>
      farms.map((farm) => ({
        value: farm.id,
        label: farm.farmer_name,
        hint: [farm.village, farm.cluster_name].filter(Boolean).join(" · "),
      })),
    [farms],
  );

  const materialOptions = useMemo(
    () =>
      MIXING_MATERIAL_TYPES.filter((type) => type !== "liquid_manure").map((type) => ({
        value: type,
        label: mixingMaterialLabel(type),
      })),
    [],
  );

  const ratioOptions = useMemo(
    () => [
      { value: "1", label: "1:1" },
      { value: "2", label: "1:2" },
      { value: "3", label: "1:3" },
    ],
    [],
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

  const loadEntry = useCallback(async () => {
    try {
      await refreshMixingReviewStatuses();
    } catch {
      // Keep cached review status offline.
    }
    const row = await getMixingEntry(entryId);
    const view = await toMixingEntryView(row);
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
          err instanceof Error ? err.message : "Could not load mixing entry.",
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
    (patch: Parameters<typeof updateMixingEntryLocal>[1]) => {
      if (!isEditable) return;

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await updateMixingEntryLocal(entryId, patch);
          await loadEntry();
        } catch (err) {
          console.warn("[mixing] auto-save failed:", err);
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

  async function openMapPicker() {
    const opened = await openMapPickerIfOnline(() => setMapVisible(true));
    if (!opened) {
      Alert.alert(
        "Offline",
        "Map picker needs an internet connection. Use GPS or try again when online.",
      );
    }
  }

  async function handleBatchSelection(nextIds: string[]) {
    setSelectedBatchIds(nextIds);
    const selected = pyrolysisBatches.filter((batch) => nextIds.includes(batch.id));
    await setMixingPyrolysisLinks(entryId, selected);
    await loadEntry();
  }

  async function handlePhoto(kind: PhotoKind) {
    if (!isEditable) return;
    try {
      setCapturingKey(kind);
      const photo = await captureAndSaveFieldPhoto();
      if (!photo) return;
      if (kind === "biochar") {
        queueAutoSave({
          biocharPhotoLocalUri: photo.uri,
          biocharPhotoMetadata: photo.metadata,
          biocharPhotoUrl: null,
        });
      } else if (kind === "substrate") {
        queueAutoSave({
          substratePhotoLocalUri: photo.uri,
          substratePhotoMetadata: photo.metadata,
          substratePhotoUrl: null,
        });
      } else {
        queueAutoSave({
          mixingPhotoLocalUri: photo.uri,
          mixingPhotoMetadata: photo.metadata,
          mixingPhotoUrl: null,
        });
      }
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

  function handleRemovePhoto(kind: PhotoKind) {
    if (!isEditable) return;
    if (kind === "biochar") {
      queueAutoSave({
        biocharPhotoLocalUri: null,
        biocharPhotoMetadata: null,
        biocharPhotoUrl: null,
      });
    } else if (kind === "substrate") {
      queueAutoSave({
        substratePhotoLocalUri: null,
        substratePhotoMetadata: null,
        substratePhotoUrl: null,
      });
    } else {
      queueAutoSave({
        mixingPhotoLocalUri: null,
        mixingPhotoMetadata: null,
        mixingPhotoUrl: null,
      });
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await submitMixingEntry(entryId);
      await loadEntry();
      Alert.alert(
        "Submitted",
        "Mixing entry saved on device and queued for cloud sync.",
        [{ text: "OK", onPress: () => navigation.navigate("MixingDashboard") }],
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
        <ScreenHeader title="Mixing entry" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brunswick} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <ScreenHeader title="Mixing entry" onBack={() => navigation.goBack()} />
      <KeyboardSafeScroll
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Entry started</Text>
          <Text style={styles.metaLine}>
            {new Date(entry.startedAt).toLocaleDateString()} ·{" "}
            {new Date(entry.startedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>

          <View style={styles.locationHeaderRow}>
            <Text style={styles.sectionTitle}>Location *</Text>
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
                styles.secondaryBtn,
                pressed && styles.secondaryBtnPressed,
              ]}
              onPress={() => captureLocation(true)}
              disabled={!isEditable || locationLoading}
            >
              <Text style={styles.secondaryBtnText}>
                {locationLoading
                  ? "Getting GPS…"
                  : entry.locationLat != null
                    ? "Retry GPS"
                    : "Use GPS"}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.secondaryBtnPressed,
              ]}
              onPress={openMapPicker}
              disabled={!isEditable}
            >
              <Text style={styles.secondaryBtnText}>Pick on map</Text>
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
          <Text style={styles.sectionTitle}>Pyrolysis batches *</Text>
          <Text style={styles.sectionHint}>
            Completed batches from producers in your network. Once a batch is
            mixed, it can’t be selected again.
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
          <PyrolysisPhotoSlot
            label="Biochar photo"
            required
            localUri={entry.biocharPhotoLocalUri}
            remoteUrl={entry.biocharPhotoUrl}
            metadata={entry.biocharPhotoMetadata}
            capturing={capturingKey === "biochar"}
            onCapture={() => handlePhoto("biochar")}
            onRemove={isEditable ? () => handleRemovePhoto("biochar") : undefined}
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Material</Text>
          <FormPicker
            label="Material type *"
            value={entry.materialType ?? ""}
            options={materialOptions}
            onValueChange={(value) =>
              queueAutoSave({ materialType: (value || null) as MixingMaterialType | null })
            }
            enabled={isEditable}
          />
          <FormPicker
            label="Material to biochar ratio *"
            placeholder="Select ratio"
            value={
              entry.materialToBiocharRatio != null
                ? String(entry.materialToBiocharRatio)
                : ""
            }
            options={ratioOptions}
            onValueChange={(value) => {
              const parsed = value.trim() === "" ? null : Number(value);
              queueAutoSave({
                materialToBiocharRatio:
                  parsed == null || Number.isNaN(parsed) ? null : parsed,
              });
            }}
            enabled={isEditable}
          />
        </View>

        <View style={styles.sectionCard}>
          <PyrolysisPhotoSlot
            label="Substrate photo"
            required
            localUri={entry.substratePhotoLocalUri}
            remoteUrl={entry.substratePhotoUrl}
            metadata={entry.substratePhotoMetadata}
            capturing={capturingKey === "substrate"}
            onCapture={() => handlePhoto("substrate")}
            onRemove={isEditable ? () => handleRemovePhoto("substrate") : undefined}
          />
        </View>

        <View style={styles.sectionCard}>
          <PyrolysisPhotoSlot
            label="Mixing photo"
            required
            localUri={entry.mixingPhotoLocalUri}
            remoteUrl={entry.mixingPhotoUrl}
            metadata={entry.mixingPhotoMetadata}
            capturing={capturingKey === "mixing"}
            onCapture={() => handlePhoto("mixing")}
            onRemove={isEditable ? () => handleRemovePhoto("mixing") : undefined}
          />
        </View>

        <View style={styles.sectionCard}>
          <FormInput
            label="Comments (optional)"
            placeholder="Any observations about this mixing"
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
            title={submitting ? "Submitting…" : "Submit mixing entry"}
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
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.chalk,
  },
  secondaryBtnPressed: {
    opacity: 0.85,
  },
  secondaryBtnText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.brunswick,
  },
  locationText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
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
