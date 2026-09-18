import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
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
import { LocationUnavailableError } from "../services/fieldPhoto";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import {
  autoSaveKontikkiSectionLocal,
  getSessionKontikkis,
} from "../services/pyrolysisService";
import { waitForLocation } from "../services/locationCache";
import {
  fetchMobileNetworkOverview,
  type NetworkFeedstock,
} from "../services/backendApi";
import type { SessionKontikkiView } from "../services/pyrolysisService";
import { colors, fonts, spacing, radius } from "../constants/theme";

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

const MAX_MOISTURE_READING = 25;

function isMoistureReadingCompleted(reading: {
  reading: number | null;
  photo_local_uri?: string | null;
  photo_url?: string | null;
}): boolean {
  return reading.reading != null && Boolean(reading.photo_local_uri || reading.photo_url);
}

function isMoistureAboveLimit(text: string): boolean {
  if (!text) return false;
  const value = Number(text);
  return Number.isFinite(value) && value > MAX_MOISTURE_READING;
}

function emptyInfoDraft(): PyrolysisKontikkiData {
  return {
    batch_number: "",
    feedstock_quantity: null,
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

export default function PyrolysisKontikkiWorkflowScreen({ route, navigation }) {
  const { sessionId, kontikkiRowId, kontikkiCode } = route.params ?? {};
  const [kontikki, setKontikki] = useState<SessionKontikkiView | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] =
    useState<PyrolysisKontikkiWorkflowSection>("info");
  const [savingSection, setSavingSection] =
    useState<PyrolysisKontikkiWorkflowSection | null>(null);
  const [capturingKey, setCapturingKey] = useState<string | null>(null);
  const [feedstockOptions, setFeedstockOptions] = useState<NetworkFeedstock[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const [infoDraft, setInfoDraft] = useState(emptyInfoDraft());
  const [moistureDraft, setMoistureDraft] = useState(emptyMoistureReadings());
  const [expandedMoistureIndex, setExpandedMoistureIndex] = useState(0);
  const [locationLoading, setLocationLoading] = useState(false);
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
  const sampleIdManuallyEdited = useRef(false);

  const loadKontikki = useCallback(async () => {
    if (!sessionId || !kontikkiRowId) return null;
    const rows = await getSessionKontikkis(sessionId);
    const row = rows.find((item) => item.id === kontikkiRowId) ?? null;
    setKontikki(row);
    return row;
  }, [sessionId, kontikkiRowId]);

  const loadData = useCallback(async () => {
    if (!sessionId || !kontikkiRowId) {
      setLoading(false);
      Alert.alert("Batch not found", "This kontikki batch is missing.", [
        { text: "OK", onPress: () => navigation.goBack() }
      ]);
      return;
    }
    try {
      await loadKontikki();
    } finally {
      setLoading(false);
    }
  }, [loadKontikki, sessionId, kontikkiRowId, navigation]);

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
        setFeedstockOptions(overview.feedstock ?? []);
      } catch {
        if (!cancelled) {
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
    const moisture =
      payload.moisture_readings?.length === MOISTURE_READING_COUNT
        ? payload.moisture_readings
        : emptyMoistureReadings();
    setMoistureDraft(moisture);
    const firstIncompleteMoisture = moisture.findIndex(
      (reading) => !isMoistureReadingCompleted(reading),
    );
    setExpandedMoistureIndex(
      firstIncompleteMoisture === -1 ? moisture.length - 1 : firstIncompleteMoisture,
    );
    setStagePhotos(normalizeStagePhotos(payload.stage_photos));
    setYieldDraft({
      yield_percent: payload.yield_percent ?? null,
      comment: payload.comment ?? "",
    });
    setSampleDraft({
      sample_id: payload.sample_id ?? payload.batch_number ?? "",
      sample_photo_local_uri: payload.sample_photo_local_uri ?? null,
      sample_photo_url: payload.sample_photo_url ?? null,
      sample_photo_metadata: payload.sample_photo_metadata ?? null,
    });
    sampleIdManuallyEdited.current = Boolean(
      payload.sample_id?.trim() && payload.sample_id.trim() !== payload.batch_number?.trim(),
    );
    setExpandedSection(firstOpenSection(kontikki));
    draftLoadedFor.current = kontikki.id;
  }, [kontikki?.id]);

  useEffect(() => {
    if (!kontikki) return;
    if (kontikki.payload?.location) return;

    let cancelled = false;
    setLocationLoading(true);
    waitForLocation()
      .then((location) => {
        if (cancelled || !location) return;
        updateInfoDraft({ location });
      })
      .finally(() => {
        if (!cancelled) setLocationLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [kontikki?.id]);

  useEffect(() => {
    return () => {
      Object.values(saveTimers.current).forEach(clearTimeout);
    };
  }, []);

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
        const captured = await captureAndSaveFieldPhoto();
        if (!captured) return;
        await onAccepted(captured);
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
      if (isMoistureReadingCompleted(next[index]) && index < next.length - 1) {
        setExpandedMoistureIndex(index + 1);
      }
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

  function handleRemoveFeedstockPhoto(kind: "feedstock" | "feedstock_size") {
    if (kind === "feedstock") {
      const nextInfo = {
        ...infoDraft,
        feedstock_photo_local_uri: null,
        feedstock_photo_url: null,
        feedstock_photo_metadata: null,
      };
      setInfoDraft(nextInfo);
      queueAutoSave("info", nextInfo);
    } else {
      const nextInfo = {
        ...infoDraft,
        feedstock_size_photo_local_uri: null,
        feedstock_size_photo_url: null,
        feedstock_size_photo_metadata: null,
      };
      setInfoDraft(nextInfo);
      queueAutoSave("info", nextInfo);
    }
  }

  function handleRemoveMoisturePhoto(index: number) {
    const next = [...moistureDraft];
    next[index] = {
      ...next[index],
      photo_local_uri: null,
      photo_url: null,
      photo_metadata: null,
    };
    setMoistureDraft(next);
    queueAutoSave("moisture", { moisture_readings: next });
  }

  function handleRemoveStagePhoto(stage: PyrolysisStageKey) {
    const nextStagePhotos = {
      ...stagePhotos,
      [stage]: {
        local_uri: null,
        url: null,
        captured_at: null,
        metadata: null,
      },
    };
    setStagePhotos(nextStagePhotos);
    queueAutoSave(stage, {
      stage_photos: nextStagePhotos,
    });
  }

  function handleRemoveSamplePhoto() {
    const next = {
      ...sampleDraft,
      sample_photo_local_uri: null,
      sample_photo_url: null,
      sample_photo_metadata: null,
    };
    setSampleDraft(next);
    queueAutoSave("sample", next);
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

    if (patch.batch_number !== undefined && !sampleIdManuallyEdited.current) {
      const nextSampleId = patch.batch_number ?? "";
      setSampleDraft((prev) => {
        const next = { ...prev, sample_id: nextSampleId };
        queueAutoSave("sample", next);
        return next;
      });
    }
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
        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Date & time</Text>
            <Text style={styles.metaValue}>
              {new Date(kontikki.createdAt).toLocaleString()}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Location</Text>
            {locationLoading && !infoDraft.location ? (
              <View style={styles.metaLocationLoading}>
                <ActivityIndicator size="small" color={colors.brunswick} />
                <Text style={styles.metaValue}>Fetching GPS…</Text>
              </View>
            ) : infoDraft.location ? (
              <View style={styles.metaLocationValue}>
                <Text style={styles.metaValue}>
                  {infoDraft.location.lat.toFixed(4)}, {infoDraft.location.lng.toFixed(4)}
                </Text>
                {infoDraft.location.address ? (
                  <Text style={styles.metaSubValue} numberOfLines={1}>
                    {infoDraft.location.address}
                  </Text>
                ) : null}
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  setLocationLoading(true);
                  waitForLocation()
                    .then((location) => {
                      if (location) updateInfoDraft({ location });
                    })
                    .finally(() => setLocationLoading(false));
                }}
              >
                <Text style={styles.metaRetry}>Tap to fetch location</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {optionsLoading ? (
          <View style={styles.optionsLoading}>
            <ActivityIndicator size="small" color={colors.brunswick} />
            <Text style={styles.optionsLoadingText}>Loading feedstock list…</Text>
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
                    onRemove={() => handleRemoveFeedstockPhoto("feedstock")}
                  />

                  <PyrolysisPhotoSlot
                    label="Feedstock size measurement photo"
                    localUri={infoDraft.feedstock_size_photo_local_uri}
                    remoteUrl={infoDraft.feedstock_size_photo_url}
                    metadata={infoDraft.feedstock_size_photo_metadata}
                    capturing={capturingKey === "feedstock_size"}
                    onCapture={() => handleFeedstockPhoto("feedstock_size")}
                    onRemove={() => handleRemoveFeedstockPhoto("feedstock_size")}
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
                  {moistureDraft.map((reading, index) => {
                    const readingCompleted = isMoistureReadingCompleted(reading);
                    const readingUnlocked =
                      index === 0 || isMoistureReadingCompleted(moistureDraft[index - 1]);
                    return (
                      <PyrolysisCollapsibleSection
                        key={`moisture-${index}`}
                        title={`Moisture reading ${index + 1}`}
                        expanded={expandedMoistureIndex === index}
                        unlocked={readingUnlocked}
                        completed={readingCompleted}
                        savedLocally={readingCompleted}
                        onToggle={() => {
                          if (!readingUnlocked) return;
                          setExpandedMoistureIndex(index);
                        }}
                      >
                        <FormInput
                          label="Moisture value"
                          keyboardType="decimal-pad"
                          value={reading.reading != null ? String(reading.reading) : ""}
                          onChangeText={(text) => {
                            if (isMoistureAboveLimit(text)) {
                              Alert.alert(
                                "Moisture not allowed",
                                "Moisture more than 25 is not allowed.",
                              );
                              return;
                            }
                            const next = [...moistureDraft];
                            next[index] = {
                              ...next[index],
                              reading: text ? Number(text) : null,
                            };
                            setMoistureDraft(next);
                            queueAutoSave("moisture", { moisture_readings: next });
                            if (
                              isMoistureReadingCompleted(next[index]) &&
                              index < next.length - 1
                            ) {
                              setExpandedMoistureIndex(index + 1);
                            }
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
                          onRemove={() => handleRemoveMoisturePhoto(index)}
                        />
                      </PyrolysisCollapsibleSection>
                    );
                  })}

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
                    onRemove={() => handleRemoveStagePhoto(section)}
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
                    onChangeText={(text) => {
                      sampleIdManuallyEdited.current = true;
                      updateSampleDraft({ sample_id: text });
                    }}
                  />
                  <PyrolysisPhotoSlot
                    label="Sample photo"
                    required
                    localUri={sampleDraft.sample_photo_local_uri}
                    remoteUrl={sampleDraft.sample_photo_url}
                    metadata={sampleDraft.sample_photo_metadata}
                    capturing={capturingKey === "sample"}
                    onCapture={handleSamplePhoto}
                    onRemove={handleRemoveSamplePhoto}
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
  metaCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.chartreuseMuted,
    padding: spacing.md,
    gap: spacing.xs,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  metaLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.brunswick,
  },
  metaValue: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.brunswick,
    flexShrink: 1,
    textAlign: "right",
  },
  metaLocationValue: {
    flexShrink: 1,
    maxWidth: "62%",
    alignItems: "flex-end",
  },
  metaSubValue: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.smoke,
    textAlign: "right",
  },
  metaLocationLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaRetry: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.brunswick,
    textDecorationLine: "underline",
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
