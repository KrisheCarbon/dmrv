import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Alert } from "react-native";
import {
  BIOMASS_COLLECTION_TRACTOR_NOTICE,
  checkLoadedPhotoNearFarm,
  describeFarmPhotoDistance,
  nearestBoundaryDistanceMeters,
} from "@krishecarbon/shared";
import ScreenHeader, { ScreenShell } from "../components/ScreenHeader";
import FormInput from "../components/FormInput";
import FormPicker from "../components/FormPicker";
import PrimaryButton from "../components/PrimaryButton";
import KeyboardSafeScroll from "../components/KeyboardSafeScroll";
import PyrolysisPhotoSlot from "../components/PyrolysisPhotoSlot";
import { LocationUnavailableError } from "../services/fieldPhoto";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import {
  getBiomassCollection,
  loadBiomassCollectionOptions,
  saveLoadedStep,
  submitBiomassCollection,
  toBiomassCollectionView,
  updateBiomassCollectionLocal,
  type BiomassCollectionOptions,
  type BiomassCollectionUpdate,
  type BiomassCollectionView,
} from "../services/biomassCollectionService";
import { colors, fonts, spacing, radius, typeScale } from "../constants/theme";

function formatCapturedAt(iso?: string | null) {
  if (!iso) return null;
  return `${iso.slice(0, 19).replace("T", " ")} IST`;
}

function TractorNotice() {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>⚠ {BIOMASS_COLLECTION_TRACTOR_NOTICE}</Text>
    </View>
  );
}

export default function BiomassCollectionEntryScreen({ navigation, route }) {
  const collectionId = route.params?.collectionId as string;
  const tractorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState<"loaded" | "unloaded" | null>(null);
  const [collection, setCollection] = useState<BiomassCollectionView | null>(null);
  const [options, setOptions] = useState<BiomassCollectionOptions>({ farms: [], producers: [] });
  const [tractorNumber, setTractorNumber] = useState("");

  const loadingEditable = collection?.status === "draft";
  const unloadingEditable = collection?.status === "loaded";

  const farmOptions = useMemo(
    () =>
      options.farms.map((farm) => ({
        value: farm.id,
        label: farm.farmer_name,
        hint: [farm.village, farm.cluster_name].filter(Boolean).join(" · "),
      })),
    [options.farms],
  );

  const producerOptions = useMemo(
    () =>
      options.producers.map((producer) => ({
        value: producer.id,
        label: producer.name,
        hint: producer.producer_code ?? undefined,
      })),
    [options.producers],
  );

  const reload = useCallback(async () => {
    const view = toBiomassCollectionView(await getBiomassCollection(collectionId));
    setCollection(view);
    return view;
  }, [collectionId]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const view = await reload();
        if (!cancelled) setTractorNumber(view.tractorNumber ?? "");
        const loaded = await loadBiomassCollectionOptions();
        if (!cancelled) setOptions(loaded);
      } catch (err) {
        Alert.alert(
          "Farms and sites",
          err instanceof Error
            ? `${err.message}\nConnect to the internet once to load your farms and production sites.`
            : "Could not load farms and production sites.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
      if (tractorTimer.current) clearTimeout(tractorTimer.current);
    };
  }, [reload]);

  async function save(patch: BiomassCollectionUpdate) {
    try {
      await updateBiomassCollectionLocal(collectionId, patch);
      await reload();
    } catch (err) {
      Alert.alert(
        "Save failed",
        err instanceof Error ? err.message : "Could not save on this phone.",
      );
    }
  }

  function handleTractorChange(text: string) {
    const value = text.toUpperCase();
    setTractorNumber(value);
    if (tractorTimer.current) clearTimeout(tractorTimer.current);
    tractorTimer.current = setTimeout(() => {
      void save({ tractorNumber: value.trim() || null });
    }, 450);
  }

  async function capture(kind: "loaded" | "unloaded") {
    if (kind === "loaded" && !collection?.farmId) {
      Alert.alert(
        "Select a farm",
        "Choose the onboarded farm before taking the loaded photo.",
      );
      return;
    }

    try {
      setCapturing(kind);
      const photo = await captureAndSaveFieldPhoto();
      if (!photo) return;

      if (kind === "loaded") {
        const farm = options.farms.find((item) => item.id === collection?.farmId);
        const check = checkLoadedPhotoNearFarm({
          farmName: farm?.farmer_name ?? collection?.farmName,
          boundaries: farm?.boundaries ?? [],
          latitude: photo.metadata.latitude,
          longitude: photo.metadata.longitude,
        });
        if (check.ok === false) {
          Alert.alert(check.title, check.message);
          return;
        }
      }

      await save(
        kind === "loaded"
          ? { loadedPhotoLocalUri: photo.uri, loadedPhotoMetadata: photo.metadata }
          : { unloadedPhotoLocalUri: photo.uri, unloadedPhotoMetadata: photo.metadata },
      );
    } catch (err) {
      if (err instanceof LocationUnavailableError) {
        Alert.alert("Location error", err.message);
        return;
      }
      Alert.alert("Camera", err instanceof Error ? err.message : "Could not capture photo.");
    } finally {
      setCapturing(null);
    }
  }

  async function handleSaveLoaded() {
    const farm = options.farms.find((item) => item.id === collection?.farmId);
    const check = checkLoadedPhotoNearFarm({
      farmName: farm?.farmer_name ?? collection?.farmName,
      boundaries: farm?.boundaries ?? [],
      latitude: collection?.loadedPhotoMetadata?.latitude,
      longitude: collection?.loadedPhotoMetadata?.longitude,
    });
    if (check.ok === false) {
      Alert.alert(check.title, check.message);
      return;
    }

    setBusy(true);
    try {
      if (tractorTimer.current) clearTimeout(tractorTimer.current);
      await updateBiomassCollectionLocal(collectionId, {
        tractorNumber: tractorNumber.trim() || null,
      });
      await saveLoadedStep(collectionId);
      await reload();
      Alert.alert(
        "Loaded trip saved",
        "Saved on this phone. Open this trip again at the production site to add the unloaded photo.",
      );
    } catch (err) {
      Alert.alert("Cannot save", err instanceof Error ? err.message : "Complete the farm step.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    setBusy(true);
    try {
      await submitBiomassCollection(collectionId);
      await reload();
      Alert.alert("Submitted", "Saved on this phone and queued to sync.", [
        { text: "OK", onPress: () => navigation.navigate("BiomassCollectionDashboard") },
      ]);
    } catch (err) {
      Alert.alert(
        "Cannot submit",
        err instanceof Error ? err.message : "Complete the production site step.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading || !collection) {
    return (
      <ScreenShell>
        <ScreenHeader title="Biomass collection" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brunswick} />
        </View>
      </ScreenShell>
    );
  }

  const submitted = collection.status === "submitted" || collection.status === "synced";
  const selectedFarm = options.farms.find((farm) => farm.id === collection.farmId);
  const loadedDistance = collection.loadedPhotoMetadata
    ? describeFarmPhotoDistance(
        selectedFarm
          ? nearestBoundaryDistanceMeters(
              {
                latitude: collection.loadedPhotoMetadata.latitude,
                longitude: collection.loadedPhotoMetadata.longitude,
              },
              selectedFarm.boundaries,
            )
          : null,
        {
          hasGps: Number.isFinite(collection.loadedPhotoMetadata.latitude),
          hasBoundary: (selectedFarm?.boundaries.length ?? 0) > 0,
        },
      )
    : null;

  return (
    <ScreenShell>
      <ScreenHeader title="Biomass collection" onBack={() => navigation.goBack()} />
      <KeyboardSafeScroll style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.sectionCard}>
          <View style={styles.stepHeader}>
            <Text style={styles.stepTitle}>1. Loading at the farm</Text>
            <Text style={collection.status === "draft" ? styles.stepOpen : styles.stepDone}>
              {collection.status === "draft" ? "In progress" : "✓ Saved"}
            </Text>
          </View>

          <FormPicker
            label="Onboarded farm *"
            value={collection.farmId ?? ""}
            options={farmOptions}
            searchable
            searchPlaceholder="Search farmer or village"
            enabled={loadingEditable}
            onValueChange={(farmId) => {
              const farm = options.farms.find((item) => item.id === farmId);
              const next = { farmId: farmId || null, farmName: farm?.farmer_name ?? null };
              if (collection.loadedPhotoMetadata && farm) {
                const check = checkLoadedPhotoNearFarm({
                  farmName: farm.farmer_name,
                  boundaries: farm.boundaries,
                  latitude: collection.loadedPhotoMetadata.latitude,
                  longitude: collection.loadedPhotoMetadata.longitude,
                });
                if (check.ok === false) {
                  Alert.alert(
                    check.title,
                    `${check.message}\n\nThe loaded photo was cleared. Take it again at this farm.`,
                  );
                  void save({
                    ...next,
                    loadedPhotoLocalUri: null,
                    loadedPhotoMetadata: null,
                  });
                  return;
                }
              }
              void save(next);
            }}
          />
          <Text style={styles.metaLine}>
            {farmOptions.length === 0
              ? "No onboarded farm with a mapped boundary is on this phone. Draw the farm plot, then connect once so it can be selected."
              : "The loaded photo must be taken within 1 km of this farm's boundary."}
          </Text>

          <FormInput
            label="Tractor number"
            placeholder="e.g. AP 39 AB 1234"
            value={tractorNumber}
            onChangeText={handleTractorChange}
            editable={loadingEditable}
          />

          <TractorNotice />
          <PyrolysisPhotoSlot
            label="Loaded tractor"
            required
            localUri={collection.loadedPhotoLocalUri}
            remoteUrl={collection.loadedPhotoUrl}
            metadata={collection.loadedPhotoMetadata}
            capturing={capturing === "loaded"}
            onCapture={() => {
              if (!loadingEditable) return;
              void capture("loaded");
            }}
            onRemove={
              loadingEditable
                ? () => void save({ loadedPhotoLocalUri: null, loadedPhotoMetadata: null })
                : undefined
            }
          />
          {loadedDistance ? (
            <Text
              style={
                loadedDistance.outsideLimit
                  ? styles.distanceOutside
                  : loadedDistance.distanceM == null
                    ? styles.distanceUnknown
                    : styles.distanceInside
              }
            >
              {loadedDistance.outsideLimit ? "⚠ " : loadedDistance.distanceM == null ? "" : "✓ "}
              {loadedDistance.detail}
            </Text>
          ) : null}

          {loadingEditable ? (
            <PrimaryButton
              title={busy ? "Saving…" : "Save loaded trip"}
              onPress={handleSaveLoaded}
              disabled={busy}
            />
          ) : (
            <Text style={styles.metaLine}>
              Loaded {formatCapturedAt(collection.loadedPhotoMetadata?.captured_at) ?? ""}
            </Text>
          )}
        </View>

        <View style={[styles.sectionCard, collection.status === "draft" && styles.locked]}>
          <View style={styles.stepHeader}>
            <Text style={styles.stepTitle}>2. Unloading at the production site</Text>
            <Text style={submitted ? styles.stepDone : styles.stepOpen}>
              {collection.status === "draft"
                ? "🔒 After step 1"
                : submitted
                  ? "✓ Submitted"
                  : "In progress"}
            </Text>
          </View>

          {collection.status === "draft" ? (
            <Text style={styles.metaLine}>
              Save the loaded trip first. Then open it again when the tractor reaches the
              production site.
            </Text>
          ) : (
            <>
              <FormPicker
                label="Production site *"
                value={collection.producerId ?? ""}
                options={producerOptions}
                searchable
                searchPlaceholder="Search production site"
                enabled={unloadingEditable}
                onValueChange={(producerId) => {
                  const producer = options.producers.find((item) => item.id === producerId);
                  void save({
                    producerId: producerId || null,
                    producerName: producer?.name ?? null,
                  });
                }}
              />

              <TractorNotice />
              <PyrolysisPhotoSlot
                label="Unloaded biomass at the site"
                required
                localUri={collection.unloadedPhotoLocalUri}
                remoteUrl={collection.unloadedPhotoUrl}
                metadata={collection.unloadedPhotoMetadata}
                capturing={capturing === "unloaded"}
                onCapture={() => {
                  if (!unloadingEditable) return;
                  void capture("unloaded");
                }}
                onRemove={
                  unloadingEditable
                    ? () =>
                        void save({ unloadedPhotoLocalUri: null, unloadedPhotoMetadata: null })
                    : undefined
                }
              />

              {unloadingEditable ? (
                <PrimaryButton
                  title={busy ? "Submitting…" : "Submit"}
                  onPress={handleSubmit}
                  disabled={busy}
                />
              ) : null}
            </>
          )}
        </View>

        {submitted ? (
          <View style={styles.sectionCard}>
            <Text style={styles.stepTitle}>Sync</Text>
            <Text
              style={[
                styles.metaLine,
                collection.uploadStatus === "error" && styles.errorText,
                collection.uploadStatus === "synced" && styles.successText,
              ]}
            >
              {collection.uploadStatus === "synced"
                ? "✓ Synced to the dashboard"
                : collection.uploadStatus === "error"
                  ? "Sync failed. Retry from the Biomass collection list."
                  : "Waiting to sync"}
            </Text>
            {collection.syncError && collection.uploadStatus !== "synced" ? (
              <Text style={styles.errorText}>{collection.syncError}</Text>
            ) : null}
          </View>
        ) : null}
      </KeyboardSafeScroll>
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
    paddingBottom: spacing.xxl + spacing.xl,
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
  locked: {
    backgroundColor: colors.chalk,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  stepTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: typeScale.heading,
    color: colors.brunswick,
  },
  stepOpen: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label,
    color: colors.textSecondary,
  },
  stepDone: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label,
    color: colors.success,
  },
  notice: {
    backgroundColor: colors.warningBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  noticeText: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label,
    color: colors.warning,
  },
  metaLine: {
    fontFamily: fonts.regular,
    fontSize: typeScale.label,
    color: colors.textSecondary,
  },
  distanceUnknown: {
    fontFamily: fonts.medium,
    fontSize: typeScale.body,
    color: colors.text,
  },
  distanceInside: {
    fontFamily: fonts.medium,
    fontSize: typeScale.body,
    color: colors.success,
  },
  distanceOutside: {
    fontFamily: fonts.medium,
    fontSize: typeScale.body,
    color: colors.error,
  },
  errorText: {
    fontFamily: fonts.regular,
    fontSize: typeScale.label,
    color: colors.error,
  },
  successText: {
    color: colors.success,
  },
});
