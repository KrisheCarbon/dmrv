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
  type FieldPhotoMetadata,
  type MixingMaterialType,
} from "@krishecarbon/shared";
import ScreenHeader, { ScreenShell } from "../components/ScreenHeader";
import FormInput from "../components/FormInput";
import FormPicker from "../components/FormPicker";
import FormMultiSelect from "../components/FormMultiSelect";
import PyrolysisPhotoSlot from "../components/PyrolysisPhotoSlot";
import PhotoReviewModal from "../components/PhotoReviewModal";
import LocationPickerModal, {
  openMapPickerIfOnline,
} from "../components/LocationPickerModal";
import PrimaryButton from "../components/PrimaryButton";
import { captureFieldPhotoFromCamera } from "../services/fieldPhoto";
import {
  persistAcceptedFieldPhoto,
  watermarkFieldPhotoForReview,
} from "../services/photoWatermark";
import {
  fetchAvailablePyrolysisBatches,
  getMixingEntry,
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
import { colors, fonts, spacing, radius } from "../constants/theme";

type PhotoKind = "biochar" | "substrate" | "mixing";

export default function MixingEntryScreen({ navigation, route }) {
  const entryId = route.params?.entryId as string;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [photoReview, setPhotoReview] = useState<{
    previewUri: string;
    metadata: FieldPhotoMetadata;
    onAccept: () => Promise<void>;
  } | null>(null);

  const isEditable = entry?.status === "draft" || entry?.uploadStatus === "local";

  const farmOptions = useMemo(
    () =>
      farms.map((farm) => ({
        value: farm.id,
        label: farm.farmer_name,
      })),
    [farms],
  );

  const materialOptions = useMemo(
    () =>
      MIXING_MATERIAL_TYPES.map((type) => ({
        value: type,
        label: mixingMaterialLabel(type),
      })),
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

  async function captureLocation() {
    setLocationLoading(true);
    try {
      const location = await getCurrentFarmLocation();
      queueAutoSave({
        locationLat: location.latitude,
        locationLng: location.longitude,
        locationAddress: location.address,
      });
    } catch (err) {
      Alert.alert(
        "Location",
        err instanceof Error ? err.message : "Could not get GPS location.",
      );
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

  async function handleBatchSelection(nextIds: string[]) {
    setSelectedBatchIds(nextIds);
    const selected = pyrolysisBatches.filter((batch) => nextIds.includes(batch.id));
    await setMixingPyrolysisLinks(entryId, selected);
    await loadEntry();
  }

  const reviewCapturedPhoto = useCallback(
    async (captureKey: string, onAccepted: (photo: {
      uri: string;
      metadata: FieldPhotoMetadata;
    }) => Promise<void>) => {
      try {
        setCapturingKey(captureKey);
        const raw = await captureFieldPhotoFromCamera();
        if (!raw) return;

        const previewUri = await watermarkFieldPhotoForReview(raw.uri, raw.metadata);

        setPhotoReview({
          previewUri,
          metadata: raw.metadata,
          onAccept: async () => {
            const persistedUri = await persistAcceptedFieldPhoto(previewUri);
            await onAccepted({ uri: persistedUri, metadata: raw.metadata });
          },
        });
      } catch (err) {
        Alert.alert(
          "Camera",
          err instanceof Error ? err.message : "Could not capture photo.",
        );
      } finally {
        setCapturingKey(null);
      }
    },
    [],
  );

  async function handlePhoto(kind: PhotoKind) {
    if (!isEditable) return;
    await reviewCapturedPhoto(kind, async (photo) => {
      if (kind === "biochar") {
        queueAutoSave({
          biocharPhotoLocalUri: photo.uri,
          biocharPhotoMetadata: photo.metadata,
        });
      } else if (kind === "substrate") {
        queueAutoSave({
          substratePhotoLocalUri: photo.uri,
          substratePhotoMetadata: photo.metadata,
        });
      } else {
        queueAutoSave({
          mixingPhotoLocalUri: photo.uri,
          mixingPhotoMetadata: photo.metadata,
        });
      }
    });
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
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Start</Text>
          <Text style={styles.metaLine}>
            Time: {new Date(entry.startedAt).toLocaleString()}
          </Text>
          {saving ? <Text style={styles.saveHint}>Saving…</Text> : null}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Farm</Text>
          <FormPicker
            label="Select farm *"
            value={entry.farmId ?? ""}
            options={farmOptions}
            onValueChange={handleFarmChange}
            enabled={isEditable}
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Mixing location *</Text>
          <View style={styles.locationActions}>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.secondaryBtnPressed,
              ]}
              onPress={captureLocation}
              disabled={!isEditable || locationLoading}
            >
              <Text style={styles.secondaryBtnText}>
                {locationLoading ? "Getting GPS…" : "Use GPS"}
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
          {entry.locationAddress ? (
            <Text style={styles.locationText}>{entry.locationAddress}</Text>
          ) : null}
          {entry.locationLat != null && entry.locationLng != null ? (
            <Text style={styles.metaLine}>
              {entry.locationLat.toFixed(6)}, {entry.locationLng.toFixed(6)}
            </Text>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Pyrolysis batches *</Text>
          <Text style={styles.sectionHint}>
            Completed batches from producers in your network.
          </Text>
          <FormMultiSelect
            label="Link batches"
            values={selectedBatchIds}
            options={batchOptions}
            onChange={handleBatchSelection}
            emptyText="No completed pyrolysis batches available yet."
            enabled={isEditable}
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Biochar photo *</Text>
          <PyrolysisPhotoSlot
            label="Biochar"
            required
            localUri={entry.biocharPhotoLocalUri}
            remoteUrl={entry.biocharPhotoUrl}
            metadata={entry.biocharPhotoMetadata}
            capturing={capturingKey === "biochar"}
            onCapture={() => handlePhoto("biochar")}
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
          <FormInput
            label="Material to biochar ratio *"
            placeholder="e.g. 3"
            value={
              entry.materialToBiocharRatio != null
                ? String(entry.materialToBiocharRatio)
                : ""
            }
            onChangeText={(text) => {
              const parsed = text.trim() === "" ? null : Number(text);
              queueAutoSave({
                materialToBiocharRatio:
                  parsed == null || Number.isNaN(parsed) ? null : parsed,
              });
            }}
            keyboardType="decimal-pad"
            editable={isEditable}
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Substrate photo *</Text>
          <PyrolysisPhotoSlot
            label="Substrate material"
            required
            localUri={entry.substratePhotoLocalUri}
            remoteUrl={entry.substratePhotoUrl}
            metadata={entry.substratePhotoMetadata}
            capturing={capturingKey === "substrate"}
            onCapture={() => handlePhoto("substrate")}
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Comment</Text>
          <FormInput
            label="Notes (optional)"
            placeholder="Any observations about this mixing"
            value={entry.comment ?? ""}
            onChangeText={(text) => queueAutoSave({ comment: text || null })}
            multiline
            editable={isEditable}
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Mixing photo *</Text>
          <PyrolysisPhotoSlot
            label="Mixing"
            required
            localUri={entry.mixingPhotoLocalUri}
            remoteUrl={entry.mixingPhotoUrl}
            metadata={entry.mixingPhotoMetadata}
            capturing={capturingKey === "mixing"}
            onCapture={() => handlePhoto("mixing")}
          />
        </View>

        {isEditable ? (
          <PrimaryButton
            title={submitting ? "Submitting…" : "Submit mixing entry"}
            onPress={handleSubmit}
            disabled={submitting}
          />
        ) : (
          <Text style={styles.readOnlyNote}>
            This entry has been submitted. Sync status: {entry.uploadStatus}
          </Text>
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

      {photoReview ? (
        <PhotoReviewModal
          visible
          previewUri={photoReview.previewUri}
          metadata={photoReview.metadata}
          onReject={() => {
            setTimeout(() => setPhotoReview(null), 200);
          }}
          onAccept={async () => {
            try {
              await photoReview.onAccept();
              await new Promise((resolve) => setTimeout(resolve, 600));
              setPhotoReview(null);
            } catch (err) {
              Alert.alert(
                "Photo",
                err instanceof Error ? err.message : "Could not save photo.",
              );
            }
          }}
        />
      ) : null}
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
  readOnlyNote: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
