import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Alert, Pressable } from "react-native";
import {
  BIOMASS_COLLECTION_TRACTOR_NOTICE,
  checkLoadedPhotoNearFarm,
  describeFarmPhotoDistance,
  formatApplicationAcres,
  biomassAcresLimitMessage,
  formatBiomassAcres,
  nearestBoundaryDistanceMeters,
  parseBiomassQuantity,
  type ApplicationFarmFieldOption,
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
  biomassDraftHasContent,
  biomassIsUnfinished,
  deleteBiomassDraft,
  getBiomassCollectionView,
  loadBiomassDropSites,
  loadBiomassFarmerFields,
  loadBiomassFarmerNames,
  loadCollectedAcres,
  readCachedBiomassFarmerNames,
  setOpenBiomassCollectionId,
  newBiomassSourceDraft,
  saveBiomassSources,
  saveLoadedStep,
  submitBiomassCollection,
  updateBiomassCollectionLocal,
  type BiomassCollectionUpdate,
  type BiomassCollectionView,
  type BiomassDropSite,
  type BiomassFarmerName,
  type BiomassSourceDraft,
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
  const tractorDirty = useRef(false);
  const tractorValue = useRef<string | null>(null);
  const tractorSaveRef = useRef<Promise<void> | null>(null);
  const leavingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState<"loaded" | "unloaded" | null>(null);
  const [collection, setCollection] = useState<BiomassCollectionView | null>(null);
  const [sites, setSites] = useState<BiomassDropSite[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [farmerNames, setFarmerNames] = useState<BiomassFarmerName[]>([]);
  const [farmerNamesState, setFarmerNamesState] = useState<"idle" | "loading" | "ready">("idle");
  const [fieldsByFarmer, setFieldsByFarmer] = useState<
    Record<string, ApplicationFarmFieldOption[]>
  >({});
  const [fieldsLoadingId, setFieldsLoadingId] = useState<string | null>(null);
  const [sources, setSources] = useState<BiomassSourceDraft[]>([]);
  const [usedAcres, setUsedAcres] = useState<Record<string, number>>({});
  const [tractorNumber, setTractorNumber] = useState("");
  const sourcesRef = useRef<BiomassSourceDraft[]>([]);
  const sourceSaveGen = useRef(0);
  const farmerNamesRef = useRef<BiomassFarmerName[]>([]);
  const fieldsRef = useRef<Record<string, ApplicationFarmFieldOption[]>>({});

  const loadingEditable = collection?.status === "draft";
  const unloadingEditable = collection?.status === "loaded";

  const siteOptions = useMemo(
    () =>
      [...sites]
        .sort((a, b) => {
          const byProducer = (a.producerName ?? "").localeCompare(b.producerName ?? "");
          if (byProducer !== 0) return byProducer;
          return a.siteName.localeCompare(b.siteName);
        })
        .map((site) => ({
          value: site.id,
          label: site.siteName,
          group: site.producerName ?? "Producer",
        })),
    [sites],
  );

  const reload = useCallback(async () => {
    const view = await getBiomassCollectionView(collectionId);
    setCollection(view);
    return view;
  }, [collectionId]);

  function rememberSources(next: BiomassSourceDraft[]) {
    sourcesRef.current = next;
    setSources(next);
  }

  useEffect(() => {
    setOpenBiomassCollectionId(collectionId);
    return () => setOpenBiomassCollectionId(null);
  }, [collectionId]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const view = await reload();
        const initial = view.sources.length > 0 ? view.sources : [newBiomassSourceDraft()];
        if (!cancelled) {
          setTractorNumber(view.tractorNumber ?? "");
          rememberSources(initial);
        }
        if (!cancelled) setLoading(false);
        const [loadedSites, used] = await Promise.all([
          loadBiomassDropSites().catch(() => [] as BiomassDropSite[]),
          loadCollectedAcres(collectionId).catch(() => ({}) as Record<string, number>),
        ]);
        if (cancelled) return;
        setSites(loadedSites);
        setSitesLoading(false);
        setUsedAcres(used);
        for (const source of view.sources) {
          if (source.farmId) void ensureFarmerFields(source.farmId);
        }
      } catch (err) {
        if (!cancelled) setSitesLoading(false);
        Alert.alert(
          "Could not open this trip",
          err instanceof Error ? err.message : "Could not open this biomass collection.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (leavingRef.current) return;
      event.preventDefault();
      leavingRef.current = true;
      void (async () => {
        try {
          if (tractorTimer.current) {
            clearTimeout(tractorTimer.current);
            tractorTimer.current = null;
          }
          if (tractorSaveRef.current) await tractorSaveRef.current;
          if (tractorDirty.current) {
            tractorDirty.current = false;
            await updateBiomassCollectionLocal(collectionId, {
              tractorNumber: tractorValue.current,
            });
          }
          await saveBiomassSources(collectionId, sourcesRef.current);
          const view = await getBiomassCollectionView(collectionId);
          if (
            biomassIsUnfinished(view) &&
            !biomassDraftHasContent(view) &&
            !view.serverId &&
            view.uploadStatus === "local"
          ) {
            await deleteBiomassDraft(view.id);
          }
        } catch (err) {
          console.warn("[biomass] leave save failed:", err);
        }
        navigation.dispatch(event.data.action);
      })();
    });
    return unsubscribe;
  }, [navigation, collectionId]);

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
    tractorDirty.current = true;
    tractorValue.current = value.trim() || null;
    if (tractorTimer.current) clearTimeout(tractorTimer.current);
    tractorTimer.current = setTimeout(() => {
      tractorDirty.current = false;
      const work = save({ tractorNumber: tractorValue.current }).finally(() => {
        if (tractorSaveRef.current === work) tractorSaveRef.current = null;
      });
      tractorSaveRef.current = work;
    }, 450);
  }

  function rememberFarmerNames(next: BiomassFarmerName[]) {
    farmerNamesRef.current = next;
    setFarmerNames(next);
  }

  function rememberFields(farmId: string, fields: ApplicationFarmFieldOption[]) {
    fieldsRef.current = { ...fieldsRef.current, [farmId]: fields };
    setFieldsByFarmer(fieldsRef.current);
  }

  async function ensureFarmerNames() {
    if (farmerNamesRef.current.length > 0 && farmerNamesState === "ready") return;
    if (farmerNamesRef.current.length === 0) {
      const cached = await readCachedBiomassFarmerNames();
      if (cached.length > 0) rememberFarmerNames(cached);
    }
    if (farmerNamesRef.current.length === 0) setFarmerNamesState("loading");
    try {
      rememberFarmerNames(await loadBiomassFarmerNames());
      setFarmerNamesState("ready");
    } catch (err) {
      if (farmerNamesRef.current.length > 0) {
        setFarmerNamesState("ready");
        return;
      }
      setFarmerNamesState("idle");
      Alert.alert(
        "Farmers",
        err instanceof Error ? err.message : "Could not load farmers for your clusters.",
      );
    }
  }

  async function ensureFarmerFields(farmId: string) {
    if (!farmId || fieldsRef.current[farmId]) return fieldsRef.current[farmId] ?? [];
    setFieldsLoadingId(farmId);
    try {
      const fields = await loadBiomassFarmerFields(farmId);
      rememberFields(farmId, fields);
      return fields;
    } catch (err) {
      Alert.alert(
        "Farms",
        err instanceof Error ? err.message : "Could not load this farmer's farms.",
      );
      return [];
    } finally {
      setFieldsLoadingId((current) => (current === farmId ? null : current));
    }
  }

  function selectedFields(drafts: BiomassSourceDraft[] = sourcesRef.current) {
    return drafts
      .map((source) => {
        if (!source.farmId || !source.farmFieldId) return null;
        const fields = fieldsRef.current[source.farmId] ?? [];
        const field = fields.find((item) => item.id === source.farmFieldId);
        if (!field) return null;
        const named = farmerNamesRef.current.find((item) => item.id === source.farmId);
        return {
          farmer: {
            id: source.farmId,
            farmer_name: named?.farmer_name ?? source.farmName ?? "Farmer",
            fields,
          },
          field,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null);
  }

  async function persistSources(next: BiomassSourceDraft[]) {
    const gen = ++sourceSaveGen.current;
    rememberSources(next);
    try {
      await saveBiomassSources(collectionId, next);
      if (gen !== sourceSaveGen.current) return;
      await reload();
    } catch (err) {
      if (gen !== sourceSaveGen.current) return;
      Alert.alert(
        "Save failed",
        err instanceof Error ? err.message : "Could not save this farm on this phone.",
      );
    }
  }

  async function capture(kind: "loaded" | "unloaded") {
    const chosen = selectedFields();
    if (kind === "loaded" && chosen.length === 0) {
      Alert.alert(
        "Select a farm",
        "Choose the farmer and the farm plot before taking the loaded photo.",
      );
      return;
    }

    try {
      setCapturing(kind);
      const photo = await captureAndSaveFieldPhoto();
      if (!photo) return;

      if (kind === "loaded") {
        const check = checkLoadedPhotoNearFarm({
          farmName: chosen.map((item) => `${item.farmer.farmer_name} (${item.field.field_code})`).join(", "),
          boundaries: chosen.map((item) => item.field.boundary),
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
    await saveBiomassSources(collectionId, sourcesRef.current);
    const chosen = selectedFields();
    const check = checkLoadedPhotoNearFarm({
      farmName: chosen.map((item) => `${item.farmer.farmer_name} (${item.field.field_code})`).join(", "),
      boundaries: chosen.map((item) => item.field.boundary),
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
  const chosenFields = selectedFields(sources);
  const loadedDistance = collection.loadedPhotoMetadata
    ? describeFarmPhotoDistance(
        chosenFields.length
          ? nearestBoundaryDistanceMeters(
              {
                latitude: collection.loadedPhotoMetadata.latitude,
                longitude: collection.loadedPhotoMetadata.longitude,
              },
              chosenFields.map((item) => item.field.boundary),
            )
          : null,
        {
          hasGps: Number.isFinite(collection.loadedPhotoMetadata.latitude),
          hasBoundary: chosenFields.some((item) => item.field.boundary.length >= 3),
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

          {sources.map((source, index) => {
            const named = farmerNames.find((item) => item.id === source.farmId) ?? null;
            const farmerFields = source.farmId ? fieldsByFarmer[source.farmId] ?? [] : [];
            const field = farmerFields.find((item) => item.id === source.farmFieldId) ?? null;
            const farmerChoices = farmerNames.map((item) => ({
              value: item.id,
              label: item.farmer_name,
              hint: [item.village, item.cluster_name].filter(Boolean).join(" · ") || undefined,
            }));
            if (source.farmId && !farmerChoices.some((item) => item.value === source.farmId)) {
              farmerChoices.unshift({
                value: source.farmId,
                label: source.farmName || "Farmer",
                hint: undefined,
              });
            }
            const fieldOptions = farmerFields.map((item) => ({
              value: item.id,
              label: item.field_code,
              hint: formatApplicationAcres(item.area_acres),
            }));
            const siblingAcres = sources.reduce((sum, other, otherIndex) => {
              if (otherIndex === index || other.farmFieldId !== source.farmFieldId) return sum;
              return sum + (parseBiomassQuantity(other.acresText) ?? 0);
            }, 0);
            const used = field ? (usedAcres[field.id] ?? 0) + siblingAcres : 0;
            const left = field ? Math.max(field.area_acres - used, 0) : 0;
            const enteredAcres = parseBiomassQuantity(source.acresText);
            const acreLimit =
              field && enteredAcres != null
                ? biomassAcresLimitMessage({
                    farmLabel: `${named?.farmer_name ?? source.farmName ?? "This farm"} (${field.field_code})`,
                    areaAcres: field.area_acres,
                    alreadyUsedAcres: used,
                    nextAcres: enteredAcres,
                  })
                : null;
            return (
              <View key={source.id} style={styles.sourceCard}>
                <View style={styles.stepHeader}>
                  <Text style={styles.sourceTitle}>Farm {index + 1}</Text>
                  {loadingEditable && sources.length > 1 ? (
                    <Pressable
                      style={styles.removeButton}
                      onPress={() => {
                        const next = sources.filter((item) => item.id !== source.id);
                        void persistSources(next.length ? next : [newBiomassSourceDraft()]);
                      }}
                    >
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
                <FormPicker
                  label="Farmer *"
                  value={source.farmId ?? ""}
                  options={farmerChoices}
                  searchable
                  searchPlaceholder="Search farmer or village"
                  enabled={loadingEditable}
                  loading={farmerNamesState === "loading" && farmerNames.length === 0}
                  emptyText="No farmers are linked to your clusters."
                  onOpen={() => {
                    void ensureFarmerNames();
                  }}
                  onValueChange={(farmerId) => {
                    const nextFarmer = farmerNames.find((item) => item.id === farmerId);
                    if (farmerId) void ensureFarmerFields(farmerId);
                    const next = sources.map((item) =>
                      item.id === source.id
                        ? {
                            ...item,
                            farmId: farmerId || null,
                            farmName: nextFarmer?.farmer_name ?? null,
                            farmFieldId: null,
                            fieldCode: null,
                            acresText: "",
                            biomassText: "",
                          }
                        : item,
                    );
                    void persistSources(next);
                  }}
                />
                <FormPicker
                  label="Farm *"
                  value={source.farmFieldId ?? ""}
                  options={fieldOptions}
                  searchable
                  searchPlaceholder="Search farm"
                  enabled={loadingEditable && Boolean(source.farmId)}
                  loading={fieldsLoadingId === source.farmId}
                  emptyText="This farmer has no mapped farm."
                  onOpen={() => {
                    if (source.farmId) void ensureFarmerFields(source.farmId);
                  }}
                  onValueChange={(fieldId) => {
                    const nextField = farmerFields.find((item) => item.id === fieldId);
                    const duplicate = sources.some(
                      (item) => item.id !== source.id && item.farmFieldId && item.farmFieldId === fieldId,
                    );
                    if (duplicate) {
                      Alert.alert(
                        "Farm already added",
                        "Increase the acres on the farm already in this trip.",
                      );
                      return;
                    }
                    const next = sources.map((item) =>
                      item.id === source.id
                        ? {
                            ...item,
                            farmFieldId: fieldId || null,
                            fieldCode: nextField?.field_code ?? null,
                          }
                        : item,
                    );
                    void persistSources(next);
                  }}
                />
                <Text style={styles.valueLine}>
                  {field
                    ? `${formatBiomassAcres(used)} of ${formatBiomassAcres(field.area_acres)} already collected. ${formatBiomassAcres(left)} left.`
                    : "Select the farmer, then the farm."}
                </Text>
                {acreLimit ? <Text style={styles.errorLine}>{acreLimit}</Text> : null}
                <FormInput
                  label="Acres collected *"
                  placeholder="e.g. 2"
                  value={source.acresText}
                  keyboardType="decimal-pad"
                  editable={loadingEditable && Boolean(field)}
                  onChangeText={(text) => {
                    const next = sources.map((item) =>
                      item.id === source.id ? { ...item, acresText: text } : item,
                    );
                    rememberSources(next);
                  }}
                  onBlur={() => {
                    void persistSources(sourcesRef.current);
                  }}
                />
                <FormInput
                  label="Estimated biomass (tonnes)"
                  placeholder="Optional, e.g. 1.5"
                  value={source.biomassText}
                  keyboardType="decimal-pad"
                  editable={loadingEditable && Boolean(field)}
                  onChangeText={(text) => {
                    const next = sources.map((item) =>
                      item.id === source.id ? { ...item, biomassText: text } : item,
                    );
                    rememberSources(next);
                  }}
                  onBlur={() => {
                    void persistSources(sourcesRef.current);
                  }}
                />
              </View>
            );
          })}
          {loadingEditable ? (
            <PrimaryButton
              title="Add another farm"
              variant="outline"
              onPress={() => rememberSources([...sources, newBiomassSourceDraft()])}
            />
          ) : null}

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
              dropping site.
            </Text>
          ) : (
            <>
              <FormPicker
                label="Production site *"
                value={collection.producerSiteId ?? ""}
                options={siteOptions}
                searchable
                searchPlaceholder="Search production site"
                loading={sitesLoading}
                enabled={unloadingEditable}
                onValueChange={(siteId) => {
                  const site = sites.find((item) => item.id === siteId);
                  void save({
                    producerSiteId: siteId || null,
                    producerId: site?.producerId ?? null,
                    producerName: site?.siteName ?? null,
                  });
                }}
              />
              <Text style={styles.metaLine}>
                {siteOptions.length === 0
                  ? "No production sites are linked to your cluster. Add the sites on that producer first."
                  : "These are the production sites under the producer linked to your cluster."}
              </Text>

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
  sourceCard: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sourceTitle: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typeScale.body,
    color: colors.text,
  },
  valueLine: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    color: colors.text,
  },
  errorLine: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    color: colors.error,
  },
  removeButton: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  removeText: {
    fontFamily: fonts.medium,
    fontSize: typeScale.body,
    color: colors.error,
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
    color: colors.warning,
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
