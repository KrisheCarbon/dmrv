import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  MOISTURE_READING_COUNT,
  PYROLYSIS_KONTIKKI_SECTIONS,
  emptyMoistureReadings,
  isKontikkiWorkflowSectionCompleted,
  isKontikkiWorkflowSectionUnlocked,
  isPyrolysisStageKey,
  kontikkiWorkflowProgress,
  normalizeStagePhotos,
  normalizeStageSavedAt,
  pyrolysisWorkflowSectionLabel,
  pyrolysisWorkflowSectionSubtitle,
  type FieldPhotoMetadata,
  type PyrolysisKontikkiData,
  type PyrolysisKontikkiWorkflowSection,
  type PyrolysisStageKey,
  type PyrolysisStagePhotos,
} from "@krishecarbon/shared";
import ScreenHeader, { ScreenShell } from "../components/ScreenHeader";
import FormInput from "../components/FormInput";
import FormPicker from "../components/FormPicker";
import PyrolysisCollapsibleSection from "../components/PyrolysisCollapsibleSection";
import PyrolysisPhotoSlot from "../components/PyrolysisPhotoSlot";
import PhotoReviewModal from "../components/PhotoReviewModal";
import { captureFieldPhotoFromCamera } from "../services/fieldPhoto";
import {
  persistAcceptedFieldPhoto,
  watermarkFieldPhotoForReview,
} from "../services/photoWatermark";
import {
  autoSaveKontikkiSectionLocal,
  getSessionKontikkis,
} from "../services/pyrolysisService";
import {
  fetchMobileNetworkOverview,
  type NetworkFarm,
  type NetworkFeedstock,
} from "../services/backendApi";
import type { SessionKontikkiView } from "../services/pyrolysisService";
import { colors, fonts, spacing } from "../constants/theme";

function kontikkiFlags(row: SessionKontikkiView) {
  return {
    infoCompleted: row.infoCompleted,
    moistureCompleted: row.moistureCompleted,
    pyrolysisCompleted: row.pyrolysisCompleted,
    sampleCompleted: row.sampleCompleted,
  };
}

function firstOpenSection(row: SessionKontikkiView): PyrolysisKontikkiWorkflowSection {
  for (const section of PYROLYSIS_KONTIKKI_SECTIONS) {
    if (
      isKontikkiWorkflowSectionUnlocked(kontikkiFlags(row), row.payload, section) &&
      !isKontikkiWorkflowSectionCompleted(kontikkiFlags(row), row.payload, section)
    ) {
      return section;
    }
  }
  return "info";
}

function emptyInfoDraft(): PyrolysisKontikkiData {
  return {
    batch_number: "",
    feedstock_quantity: null,
    farm_id: null,
    farm_name: "",
    avg_feedstock_size_cm: null,
    feedstock_id: null,
    feedstock_name: "",
    feedstock_photo_local_uri: null,
    feedstock_photo_url: null,
    feedstock_photo_metadata: null,
    feedstock_size_photo_local_uri: null,
    feedstock_size_photo_url: null,
    feedstock_size_photo_metadata: null,
  };
}

type PhotoReviewState = {
  previewUri: string;
  metadata: FieldPhotoMetadata;
  onAccept: () => Promise<void>;
};

export default function PyrolysisKontikkiWorkflowScreen({ route, navigation }) {
  const { sessionId, kontikkiRowId, kontikkiCode } = route.params;
  const [kontikki, setKontikki] = useState<SessionKontikkiView | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] =
    useState<PyrolysisKontikkiWorkflowSection>("info");
  const [savingSection, setSavingSection] =
    useState<PyrolysisKontikkiWorkflowSection | null>(null);
  const [capturingKey, setCapturingKey] = useState<string | null>(null);
  const [photoReview, setPhotoReview] = useState<PhotoReviewState | null>(null);
  const [farms, setFarms] = useState<NetworkFarm[]>([]);
  const [feedstockOptions, setFeedstockOptions] = useState<NetworkFeedstock[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const [infoDraft, setInfoDraft] = useState(emptyInfoDraft());
  const [moistureDraft, setMoistureDraft] = useState(emptyMoistureReadings());
  const [stagePhotos, setStagePhotos] = useState<PyrolysisStagePhotos>({});
  const [yieldDraft, setYieldDraft] = useState({
    yield_percent: null as number | null,
    comment: "",
  });
  const [sampleDraft, setSampleDraft] = useState({
    sample_id: "",
    sample_photo_local_uri: null as string | null,
    sample_photo_url: null as string | null,
    sample_photo_metadata: null as FieldPhotoMetadata | null,
  });

  const draftLoadedFor = useRef<string | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadKontikki = useCallback(async () => {
    const rows = await getSessionKontikkis(sessionId);
    const row = rows.find((item) => item.id === kontikkiRowId) ?? null;
    setKontikki(row);
    return row;
  }, [sessionId, kontikkiRowId]);

  const loadData = useCallback(async () => {
    try {
      await loadKontikki();
    } finally {
      setLoading(false);
    }
  }, [loadKontikki]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", loadData);
    return unsubscribe;
  }, [navigation, loadData]);

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        const overview = await fetchMobileNetworkOverview();
        if (cancelled) return;
        setFarms(overview.farms ?? []);
        setFeedstockOptions(overview.feedstock ?? []);
      } catch {
        if (!cancelled) {
          setFarms([]);
          setFeedstockOptions([]);
        }
      } finally {
        if (!cancelled) setOptionsLoading(false);
      }
    }

    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!kontikki || draftLoadedFor.current === kontikki.id) return;

    const payload = kontikki.payload ?? {};
    setInfoDraft({
      batch_number: payload.batch_number ?? "",
      feedstock_quantity: payload.feedstock_quantity ?? null,
      farm_id: payload.farm_id ?? null,
      farm_name: payload.farm_name ?? "",
      avg_feedstock_size_cm: payload.avg_feedstock_size_cm ?? null,
      feedstock_id: payload.feedstock_id ?? null,
      feedstock_name: payload.feedstock_name ?? "",
      location: payload.location ?? null,
      feedstock_photo_local_uri: payload.feedstock_photo_local_uri ?? null,
      feedstock_photo_url: payload.feedstock_photo_url ?? null,
      feedstock_photo_metadata: payload.feedstock_photo_metadata ?? null,
      feedstock_size_photo_local_uri: payload.feedstock_size_photo_local_uri ?? null,
      feedstock_size_photo_url: payload.feedstock_size_photo_url ?? null,
      feedstock_size_photo_metadata: payload.feedstock_size_photo_metadata ?? null,
      info_saved_at: payload.info_saved_at ?? null,
    });
    setMoistureDraft(
      payload.moisture_readings?.length === MOISTURE_READING_COUNT
        ? payload.moisture_readings
        : emptyMoistureReadings(),
    );
    setStagePhotos(normalizeStagePhotos(payload.stage_photos));
    setYieldDraft({
      yield_percent: payload.yield_percent ?? null,
      comment: payload.comment ?? "",
    });
    setSampleDraft({
      sample_id: payload.sample_id ?? "",
      sample_photo_local_uri: payload.sample_photo_local_uri ?? null,
      sample_photo_url: payload.sample_photo_url ?? null,
      sample_photo_metadata: payload.sample_photo_metadata ?? null,
    });
    setExpandedSection(firstOpenSection(kontikki));
    draftLoadedFor.current = kontikki.id;
  }, [kontikki?.id]);

  useEffect(() => {
    return () => {
      Object.values(saveTimers.current).forEach(clearTimeout);
    };
  }, []);

  const farmPickerOptions = useMemo(
    () =>
      farms.map((farm) => ({
        value: farm.id,
        label: farm.address
          ? `${farm.farmer_name} — ${farm.address}`
          : farm.farmer_name,
      })),
    [farms],
  );

  const feedstockPickerOptions = useMemo(
    () =>
      feedstockOptions.map((item) => ({
        value: item.id,
        label: item.producer?.name
          ? `${item.biomass_type} (${item.producer.name})`
          : item.biomass_type,
      })),
    [feedstockOptions],
  );

  const progress = useMemo(() => {
    if (!kontikki) return 0;
    return kontikkiWorkflowProgress(kontikkiFlags(kontikki), kontikki.payload);
  }, [kontikki]);

  const queueAutoSave = useCallback(
    (
      section: PyrolysisKontikkiWorkflowSection,
      payload: Partial<PyrolysisKontikkiData>,
    ) => {
      if (saveTimers.current[section]) {
        clearTimeout(saveTimers.current[section]);
      }

      saveTimers.current[section] = setTimeout(async () => {
        try {
          setSavingSection(section);
          await autoSaveKontikkiSectionLocal(sessionId, kontikkiRowId, section, payload);
          const refreshed = await loadKontikki();
          if (refreshed) {
            const flags = kontikkiFlags(refreshed);
            const completed = isKontikkiWorkflowSectionCompleted(
              flags,
              refreshed.payload,
              section,
            );
            if (completed) {
              const next = PYROLYSIS_KONTIKKI_SECTIONS.find(
                (item) =>
                  item !== section &&
                  isKontikkiWorkflowSectionUnlocked(flags, refreshed.payload, item) &&
                  !isKontikkiWorkflowSectionCompleted(flags, refreshed.payload, item),
              );
              if (next) setExpandedSection(next);
            }
          }
        } catch (err) {
          Alert.alert(
            "Save failed",
            err instanceof Error ? err.message : "Could not save changes locally.",
          );
        } finally {
          setSavingSection((current) => (current === section ? null : current));
        }
      }, 450);
    },
    [sessionId, kontikkiRowId, loadKontikki],
  );

  const reviewCapturedPhoto = useCallback(
    async (
      captureKey: string,
      onAccepted: (photo: { uri: string; metadata: FieldPhotoMetadata }) => Promise<void>,
    ) => {
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

  async function handleFeedstockPhoto(kind: "feedstock" | "feedstock_size") {
    await reviewCapturedPhoto(kind, async (photo) => {
      if (kind === "feedstock") {
        const nextInfo = {
          ...infoDraft,
          feedstock_photo_local_uri: photo.uri,
          feedstock_photo_metadata: photo.metadata,
          location:
            photo.metadata.latitude || photo.metadata.longitude
              ? {
                  lat: photo.metadata.latitude,
                  lng: photo.metadata.longitude,
                  address: photo.metadata.address ?? undefined,
                }
              : infoDraft.location,
        };
        setInfoDraft(nextInfo);
        queueAutoSave("info", nextInfo);
      } else {
        const nextInfo = {
          ...infoDraft,
          feedstock_size_photo_local_uri: photo.uri,
          feedstock_size_photo_metadata: photo.metadata,
        };
        setInfoDraft(nextInfo);
        queueAutoSave("info", nextInfo);
      }
    });
  }

  async function handleMoisturePhoto(index: number) {
    await reviewCapturedPhoto(`moisture-${index}`, async (photo) => {
      const next = [...moistureDraft];
      next[index] = {
        ...next[index],
        photo_local_uri: photo.uri,
        photo_metadata: photo.metadata,
      };
      setMoistureDraft(next);
      queueAutoSave("moisture", { moisture_readings: next });
    });
  }

  async function handleStagePhoto(stage: PyrolysisStageKey) {
    await reviewCapturedPhoto(`stage-${stage}`, async (photo) => {
      const nextStagePhotos = {
        ...stagePhotos,
        [stage]: {
          local_uri: photo.uri,
          captured_at: photo.metadata.captured_at,
          metadata: photo.metadata,
        },
      };
      setStagePhotos(nextStagePhotos);
      queueAutoSave(stage, {
        stage_photos: nextStagePhotos,
      });
    });
  }

  async function handleSamplePhoto() {
    await reviewCapturedPhoto("sample", async (photo) => {
      const next = {
        ...sampleDraft,
        sample_photo_local_uri: photo.uri,
        sample_photo_metadata: photo.metadata,
      };
      setSampleDraft(next);
      queueAutoSave("sample", next);
    });
  }

  function updateSampleDraft(patch: Partial<typeof sampleDraft>) {
    setSampleDraft((prev) => {
      const next = { ...prev, ...patch };
      queueAutoSave("sample", next);
      return next;
    });
  }

  function updateInfoDraft(patch: Partial<PyrolysisKontikkiData>) {
    setInfoDraft((prev) => {
      const next = { ...prev, ...patch };
      queueAutoSave("info", next);
      return next;
    });
  }

  function handleFarmChange(farmId: string) {
    const farm = farms.find((item) => item.id === farmId);
    updateInfoDraft({
      farm_id: farmId || null,
      farm_name: farm?.farmer_name ?? "",
    });
  }

  function handleFeedstockChange(feedstockId: string) {
    const feedstock = feedstockOptions.find((item) => item.id === feedstockId);
    updateInfoDraft({
      feedstock_id: feedstockId || null,
      feedstock_name: feedstock?.biomass_type ?? "",
    });
  }

  function sectionSavedAt(section: PyrolysisKontikkiWorkflowSection): string | null {
    if (!kontikki) return null;
    const payload = kontikki.payload ?? {};

    if (section === "info") return payload.info_saved_at ?? null;
    if (section === "moisture") return payload.moisture_saved_at ?? null;
    if (section === "yield") return payload.yield_saved_at ?? null;
    if (section === "sample") return payload.sample_saved_at ?? null;
    if (isPyrolysisStageKey(section)) {
      return normalizeStageSavedAt(payload.stage_saved_at)[section] ?? null;
    }
    return null;
  }

  if (loading || !kontikki) {
    return (
      <ScreenShell>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brunswick} />
        </View>
      </ScreenShell>
    );
  }

  const flags = kontikkiFlags(kontikki);

  return (
    <ScreenShell>
      <ScreenHeader
        title={kontikkiCode ?? kontikki.kontikkiCode}
        subtitle={`${progress}% complete for this kontikki`}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {kontikki.producerName ? (
          <Text style={styles.producer}>{kontikki.producerName}</Text>
        ) : null}

        <Text style={styles.hint}>
          Complete each section in order. Changes save automatically on this device.
          Submit the full batch from the kontikki list when finished.
        </Text>

        {optionsLoading ? (
          <View style={styles.optionsLoading}>
            <ActivityIndicator size="small" color={colors.brunswick} />
            <Text style={styles.optionsLoadingText}>Loading farm & feedstock lists…</Text>
          </View>
        ) : null}

        {PYROLYSIS_KONTIKKI_SECTIONS.map((section) => {
          const completed = isKontikkiWorkflowSectionCompleted(
            flags,
            kontikki.payload,
            section,
          );
          const unlocked = isKontikkiWorkflowSectionUnlocked(
            flags,
            kontikki.payload,
            section,
          );
          const savedAt = sectionSavedAt(section);

          return (
            <PyrolysisCollapsibleSection
              key={section}
              title={pyrolysisWorkflowSectionLabel(section)}
              subtitle={pyrolysisWorkflowSectionSubtitle(section)}
              expanded={expandedSection === section}
              unlocked={unlocked}
              completed={completed}
              savedLocally={completed}
              saving={savingSection === section}
              onToggle={() => {
                if (!unlocked) return;
                setExpandedSection(section);
              }}
            >
              {section === "info" ? (
                <View style={styles.form}>
                  <FormInput
                    label="Batch number"
                    value={infoDraft.batch_number ?? ""}
                    onChangeText={(text) => updateInfoDraft({ batch_number: text })}
                  />
                  <FormInput
                    label="Feedstock quantity (kg)"
                    keyboardType="decimal-pad"
                    value={
                      infoDraft.feedstock_quantity != null
                        ? String(infoDraft.feedstock_quantity)
                        : ""
                    }
                    onChangeText={(text) =>
                      updateInfoDraft({
                        feedstock_quantity: text ? Number(text) : null,
                      })
                    }
                  />
                  <FormPicker
                    label="Farm"
                    placeholder="Select a farm"
                    value={infoDraft.farm_id ?? ""}
                    options={farmPickerOptions}
                    onValueChange={handleFarmChange}
                    enabled={!optionsLoading}
                  />
                  <FormInput
                    label="Average feedstock size (cm)"
                    keyboardType="decimal-pad"
                    value={
                      infoDraft.avg_feedstock_size_cm != null
                        ? String(infoDraft.avg_feedstock_size_cm)
                        : ""
                    }
                    onChangeText={(text) =>
                      updateInfoDraft({
                        avg_feedstock_size_cm: text ? Number(text) : null,
                      })
                    }
                  />
                  <FormPicker
                    label="Feedstock type"
                    placeholder="Select feedstock"
                    value={infoDraft.feedstock_id ?? ""}
                    options={feedstockPickerOptions}
                    onValueChange={handleFeedstockChange}
                    enabled={!optionsLoading}
                  />

                  <PyrolysisPhotoSlot
                    label="Feedstock photo"
                    required
                    localUri={infoDraft.feedstock_photo_local_uri}
                    remoteUrl={infoDraft.feedstock_photo_url}
                    metadata={infoDraft.feedstock_photo_metadata}
                    capturing={capturingKey === "feedstock"}
                    onCapture={() => handleFeedstockPhoto("feedstock")}
                  />

                  <PyrolysisPhotoSlot
                    label="Feedstock size measurement photo"
                    localUri={infoDraft.feedstock_size_photo_local_uri}
                    remoteUrl={infoDraft.feedstock_size_photo_url}
                    metadata={infoDraft.feedstock_size_photo_metadata}
                    capturing={capturingKey === "feedstock_size"}
                    onCapture={() => handleFeedstockPhoto("feedstock_size")}
                  />

                  {infoDraft.location ? (
                    <Text style={styles.locationMeta}>
                      Location:{" "}
                      {infoDraft.location.address ??
                        `${infoDraft.location.lat.toFixed(6)}, ${infoDraft.location.lng.toFixed(6)}`}
                    </Text>
                  ) : null}

                  {savedAt ? (
                    <Text style={styles.savedAt}>
                      Last saved {savedAt.slice(0, 19).replace("T", " ")} IST
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {section === "moisture" ? (
                <View style={styles.form}>
                  {moistureDraft.map((reading, index) => (
                    <View key={`moisture-${index}`} style={styles.moistureBlock}>
                      <Text style={styles.moistureTitle}>Reading {index + 1}</Text>
                      <FormInput
                        label="Moisture value"
                        keyboardType="decimal-pad"
                        value={reading.reading != null ? String(reading.reading) : ""}
                        onChangeText={(text) => {
                          const next = [...moistureDraft];
                          next[index] = {
                            ...next[index],
                            reading: text ? Number(text) : null,
                          };
                          setMoistureDraft(next);
                          queueAutoSave("moisture", { moisture_readings: next });
                        }}
                      />
                      <PyrolysisPhotoSlot
                        label="Moisture photo"
                        required
                        localUri={reading.photo_local_uri}
                        remoteUrl={reading.photo_url}
                        metadata={reading.photo_metadata}
                        capturing={capturingKey === `moisture-${index}`}
                        onCapture={() => handleMoisturePhoto(index)}
                      />
                    </View>
                  ))}

                  {savedAt ? (
                    <Text style={styles.savedAt}>
                      Last saved {savedAt.slice(0, 19).replace("T", " ")} IST
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {isPyrolysisStageKey(section) ? (
                <View style={styles.form}>
                  <PyrolysisPhotoSlot
                    label={pyrolysisWorkflowSectionLabel(section)}
                    required
                    localUri={stagePhotos[section]?.local_uri}
                    remoteUrl={stagePhotos[section]?.url}
                    metadata={stagePhotos[section]?.metadata}
                    capturing={capturingKey === `stage-${section}`}
                    onCapture={() => handleStagePhoto(section)}
                  />

                  {savedAt ? (
                    <Text style={styles.savedAt}>
                      Last saved {savedAt.slice(0, 19).replace("T", " ")} IST
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {section === "yield" ? (
                <View style={styles.form}>
                  <FormInput
                    label="Yield percent"
                    keyboardType="decimal-pad"
                    value={
                      yieldDraft.yield_percent != null
                        ? String(yieldDraft.yield_percent)
                        : ""
                    }
                    onChangeText={(text) => {
                      const next = {
                        ...yieldDraft,
                        yield_percent: text ? Number(text) : null,
                      };
                      setYieldDraft(next);
                      queueAutoSave("yield", next);
                    }}
                  />
                  <FormInput
                    label="Comment"
                    value={yieldDraft.comment ?? ""}
                    onChangeText={(text) => {
                      const next = { ...yieldDraft, comment: text };
                      setYieldDraft(next);
                      queueAutoSave("yield", next);
                    }}
                    multiline
                  />

                  {savedAt ? (
                    <Text style={styles.savedAt}>
                      Last saved {savedAt.slice(0, 19).replace("T", " ")} IST
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {section === "sample" ? (
                <View style={styles.form}>
                  <FormInput
                    label="Sample ID"
                    value={sampleDraft.sample_id}
                    onChangeText={(text) => updateSampleDraft({ sample_id: text })}
                  />
                  <PyrolysisPhotoSlot
                    label="Sample photo"
                    required
                    localUri={sampleDraft.sample_photo_local_uri}
                    remoteUrl={sampleDraft.sample_photo_url}
                    metadata={sampleDraft.sample_photo_metadata}
                    capturing={capturingKey === "sample"}
                    onCapture={handleSamplePhoto}
                  />

                  {savedAt ? (
                    <Text style={styles.savedAt}>
                      Last saved {savedAt.slice(0, 19).replace("T", " ")} IST
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </PyrolysisCollapsibleSection>
          );
        })}
      </ScrollView>

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
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  producer: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
    lineHeight: 17,
    marginBottom: spacing.xs,
  },
  optionsLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  optionsLoadingText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
  },
  form: { gap: spacing.sm },
  moistureBlock: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  moistureTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.brunswick,
  },
  locationMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
    lineHeight: 17,
  },
  savedAt: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.smoke,
    fontStyle: "italic",
  },
});
