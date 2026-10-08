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
  RAINBOW_KONTIKKI_SECTIONS,
  rainbowRequiredMoistureCount,
  emptyMoistureReadings,
  emptyRainbowMoistureReadings,
  isKontikkiWorkflowSectionCompleted,
  isKontikkiWorkflowSectionUnlocked,
  isPyrolysisStageKey,
  isRainbowSectionCompleted,
  isRainbowSectionUnlocked,
  kontikkiWorkflowProgress,
  normalizeStagePhotos,
  normalizeStageSavedAt,
  pyrolysisWorkflowSectionLabel,
  rainbowKontikkiWorkflowProgress,
  rainbowWorkflowSectionLabel,
  type FieldPhotoMetadata,
  type PyrolysisKontikkiData,
  type PyrolysisKontikkiWorkflowSection,
  type PyrolysisStageKey,
  type PyrolysisStagePhotos,
  type RainbowBiomassLoad,
  type RainbowKontikkiWorkflowSection,
} from "@krishecarbon/shared";
import ScreenHeader, { ScreenShell } from "../components/ScreenHeader";
import FormInput from "../components/FormInput";
import FormPicker from "../components/FormPicker";
import KeyboardSafeScroll from "../components/KeyboardSafeScroll";
import PyrolysisCollapsibleSection from "../components/PyrolysisCollapsibleSection";
import PyrolysisPhotoSlot from "../components/PyrolysisPhotoSlot";
import { captureApplicationVideo, LocationUnavailableError } from "../services/fieldPhoto";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import {
  autoSaveKontikkiSectionLocal,
  getSessionKontikkis,
} from "../services/pyrolysisService";
import {
  saveRainbowBiomassLoadsLocal,
  saveRainbowInfoLocal,
  saveRainbowMoistureLocal,
  saveRainbowSampleLocal,
  saveRainbowYieldLocal,
} from "../services/rainbowPyrolysisService";
import { generateId } from "../database/sqlHelpers";
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

function rainbowFlags(row: SessionKontikkiView) {
  return {
    infoCompleted: row.infoCompleted,
    moistureCompleted: row.moistureCompleted,
    productionCompleted: Boolean(row.productionCompleted),
    yieldCompleted: Boolean(row.yieldCompleted),
    sampleCompleted: row.sampleCompleted,
  };
}

function fittedRainbowMoisture<T extends { reading: number | null; photo_local_uri?: string | null; photo_url?: string | null }>(
  stored: T[],
  feedstockName: string | null | undefined,
): T[] {
  const required = rainbowRequiredMoistureCount(feedstockName);
  const blanks = emptyRainbowMoistureReadings(required);
  const base = blanks.map((empty, index) => stored[index] ?? (empty as T));
  const extras = stored.slice(required).filter(
    (item) => item.reading != null || item.photo_local_uri || item.photo_url,
  );
  return [...base, ...extras];
}

function firstOpenSection(row: SessionKontikkiView): PyrolysisKontikkiWorkflowSection | RainbowKontikkiWorkflowSection {
  if (row.standard === "rainbow") {
    for (const section of RAINBOW_KONTIKKI_SECTIONS) {
      if (
        isRainbowSectionUnlocked(rainbowFlags(row), section) &&
        !isRainbowSectionCompleted(rainbowFlags(row), row.biomassLoads ?? [], section)
      ) {
        return section;
      }
    }
    return "info";
  }
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
    kiln_photo_local_uri: null,
    kiln_photo_url: null,
    kiln_photo_metadata: null,
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
    useState<PyrolysisKontikkiWorkflowSection | RainbowKontikkiWorkflowSection>("info");
  const [savingSection, setSavingSection] =
    useState<PyrolysisKontikkiWorkflowSection | RainbowKontikkiWorkflowSection | null>(null);
  const [capturingKey, setCapturingKey] = useState<string | null>(null);
  const [feedstockOptions, setFeedstockOptions] = useState<NetworkFeedstock[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const [infoDraft, setInfoDraft] = useState(emptyInfoDraft());
  const [moistureDraft, setMoistureDraft] = useState(emptyMoistureReadings());
  const [expandedMoistureIndex, setExpandedMoistureIndex] = useState(0);
  const [locationLoading, setLocationLoading] = useState(false);
  const [stagePhotos, setStagePhotos] = useState<PyrolysisStagePhotos>({});
  const [biomassLoads, setBiomassLoads] = useState<RainbowBiomassLoad[]>([]);
  const [quenchMode, setQuenchMode] = useState<"photos" | "video">("photos");
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
  const scrollRef = useRef<ScrollView>(null);
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
      feedstock_class: payload.feedstock_class ?? null,
      last_layer_confirmed: Boolean(payload.last_layer_confirmed),
      flame_curtain_photo_local_uri: payload.flame_curtain_photo_local_uri ?? null,
      flame_curtain_photo_url: payload.flame_curtain_photo_url ?? null,
      flame_curtain_photo_metadata: payload.flame_curtain_photo_metadata ?? null,
      quench_start_photo_local_uri: payload.quench_start_photo_local_uri ?? null,
      quench_start_photo_url: payload.quench_start_photo_url ?? null,
      quench_start_photo_metadata: payload.quench_start_photo_metadata ?? null,
      quench_end_photo_local_uri: payload.quench_end_photo_local_uri ?? null,
      quench_end_photo_url: payload.quench_end_photo_url ?? null,
      quench_end_photo_metadata: payload.quench_end_photo_metadata ?? null,
      quench_photos: payload.quench_photos?.length
        ? payload.quench_photos
        : [
            payload.quench_start_photo_local_uri || payload.quench_start_photo_url
              ? {
                  id: "quench-start",
                  photo_local_uri: payload.quench_start_photo_local_uri,
                  photo_url: payload.quench_start_photo_url,
                  photo_metadata: payload.quench_start_photo_metadata,
                }
              : null,
            payload.quench_end_photo_local_uri || payload.quench_end_photo_url
              ? {
                  id: "quench-end",
                  photo_local_uri: payload.quench_end_photo_local_uri,
                  photo_url: payload.quench_end_photo_url,
                  photo_metadata: payload.quench_end_photo_metadata,
                }
              : null,
          ].filter((photo) => photo != null),
      quench_video_local_uri: payload.quench_video_local_uri ?? null,
      quench_video_url: payload.quench_video_url ?? null,
      quench_video_metadata: payload.quench_video_metadata ?? null,
      quench_video_duration_seconds: payload.quench_video_duration_seconds ?? null,
      location: payload.location ?? null,
      kiln_photo_local_uri: payload.kiln_photo_local_uri ?? null,
      kiln_photo_url: payload.kiln_photo_url ?? null,
      kiln_photo_metadata: payload.kiln_photo_metadata ?? null,
      feedstock_photo_local_uri: payload.feedstock_photo_local_uri ?? null,
      feedstock_photo_url: payload.feedstock_photo_url ?? null,
      feedstock_photo_metadata: payload.feedstock_photo_metadata ?? null,
      feedstock_size_photo_local_uri: payload.feedstock_size_photo_local_uri ?? null,
      feedstock_size_photo_url: payload.feedstock_size_photo_url ?? null,
      feedstock_size_photo_metadata: payload.feedstock_size_photo_metadata ?? null,
      info_saved_at: payload.info_saved_at ?? null,
    });
    setQuenchMode(
      payload.quench_video_local_uri || payload.quench_video_url ? "video" : "photos",
    );
    const storedMoisture = payload.moisture_readings ?? [];
    const moisture =
      kontikki.standard === "rainbow"
        ? fittedRainbowMoisture(storedMoisture, payload.feedstock_name)
        : storedMoisture.length === MOISTURE_READING_COUNT
          ? storedMoisture
          : emptyMoistureReadings();
    setMoistureDraft(moisture);
    const firstIncompleteMoisture = moisture.findIndex(
      (reading) => !isMoistureReadingCompleted(reading),
    );
    setExpandedMoistureIndex(
      firstIncompleteMoisture === -1 ? moisture.length - 1 : firstIncompleteMoisture,
    );
    setStagePhotos(normalizeStagePhotos(payload.stage_photos));
    setBiomassLoads(kontikki.biomassLoads ?? []);
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

  const isRainbow = kontikki?.standard === "rainbow";
  const progress = useMemo(() => {
    if (!kontikki) return 0;
    if (kontikki.standard === "rainbow") {
      return rainbowKontikkiWorkflowProgress(rainbowFlags(kontikki), kontikki.biomassLoads ?? []);
    }
    return kontikkiWorkflowProgress(kontikkiFlags(kontikki), kontikki.payload);
  }, [kontikki]);

  const queueAutoSave = useCallback(
    (
      section: PyrolysisKontikkiWorkflowSection | RainbowKontikkiWorkflowSection,
      payload: Partial<PyrolysisKontikkiData>,
      loads?: RainbowBiomassLoad[],
    ) => {
      if (saveTimers.current[section]) {
        clearTimeout(saveTimers.current[section]);
      }

      saveTimers.current[section] = setTimeout(async () => {
        try {
          setSavingSection(section);
          if (isRainbow) {
            if (section === "info") await saveRainbowInfoLocal(kontikkiRowId, { ...infoDraft, ...payload });
            else if (section === "moisture") {
              await saveRainbowMoistureLocal(
                kontikkiRowId,
                payload.moisture_readings ?? moistureDraft,
              );
            } else if (section === "biomass_loads") {
              await saveRainbowBiomassLoadsLocal(
                kontikkiRowId,
                loads ?? biomassLoads,
                { ...infoDraft, ...payload },
              );
            } else if (section === "yield") {
              await saveRainbowYieldLocal(kontikkiRowId, { ...yieldDraft, ...payload });
            } else if (section === "sample") {
              await saveRainbowSampleLocal(kontikkiRowId, { ...sampleDraft, ...payload });
            }
          } else if (section !== "biomass_loads") {
            await autoSaveKontikkiSectionLocal(sessionId, kontikkiRowId, section, payload);
          }
          const refreshed = await loadKontikki();
          if (refreshed) {
            if (refreshed.standard === "rainbow") {
              const flags = rainbowFlags(refreshed);
              const completed = isRainbowSectionCompleted(
                flags,
                refreshed.biomassLoads ?? [],
                section as RainbowKontikkiWorkflowSection,
              );
              if (completed) {
                const next = RAINBOW_KONTIKKI_SECTIONS.find(
                  (item) =>
                    item !== section &&
                    isRainbowSectionUnlocked(flags, item) &&
                    !isRainbowSectionCompleted(flags, refreshed.biomassLoads ?? [], item),
                );
                if (next) setExpandedSection(next);
              }
            } else if (section !== "biomass_loads") {
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
    [
      sessionId,
      kontikkiRowId,
      loadKontikki,
      isRainbow,
      infoDraft,
      moistureDraft,
      biomassLoads,
      yieldDraft,
      sampleDraft,
    ],
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

  async function handleKilnPhoto() {
    await reviewCapturedPhoto("kiln", async (photo) => {
      const nextInfo = {
        ...infoDraft,
        kiln_photo_local_uri: photo.uri,
        kiln_photo_metadata: photo.metadata,
      };
      setInfoDraft(nextInfo);
      queueAutoSave("info", nextInfo);
    });
  }

  function handleRemoveKilnPhoto() {
    const nextInfo = {
      ...infoDraft,
      kiln_photo_local_uri: null,
      kiln_photo_url: null,
      kiln_photo_metadata: null,
    };
    setInfoDraft(nextInfo);
    queueAutoSave("info", nextInfo);
  }

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

  function saveProcessDraft(patch: Partial<PyrolysisKontikkiData>) {
    setInfoDraft((prev) => {
      const next = { ...prev, ...patch };
      queueAutoSave("biomass_loads", next, biomassLoads);
      return next;
    });
  }

  function applyQuenchPhotos(
    photos: NonNullable<PyrolysisKontikkiData["quench_photos"]>,
  ) {
    const filled = photos.filter((photo) => photo.photo_local_uri || photo.photo_url);
    const first = filled[0];
    const last = filled.length >= 2 ? filled[filled.length - 1] : undefined;
    saveProcessDraft({
      quench_photos: photos,
      quench_start_photo_local_uri: first?.photo_local_uri ?? null,
      quench_start_photo_url: first?.photo_url ?? null,
      quench_start_photo_metadata: first?.photo_metadata ?? null,
      quench_end_photo_local_uri: last?.photo_local_uri ?? null,
      quench_end_photo_url: last?.photo_url ?? null,
      quench_end_photo_metadata: last?.photo_metadata ?? null,
    });
  }

  async function retakeQuenchPhoto(id: string) {
    await reviewCapturedPhoto(id, async (photo) => {
      const current = infoDraft.quench_photos ?? [];
      applyQuenchPhotos(
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                photo_local_uri: photo.uri,
                photo_url: null,
                photo_metadata: photo.metadata,
              }
            : item,
        ),
      );
    });
  }

  async function handleAddQuenchPhoto() {
    await reviewCapturedPhoto(`quench-${Date.now()}`, async (photo) => {
      const current = infoDraft.quench_photos ?? [];
      applyQuenchPhotos([
        ...current,
        {
          id: `quench-${Date.now()}`,
          photo_local_uri: photo.uri,
          photo_metadata: photo.metadata,
        },
      ]);
    });
  }

  async function handleQuenchVideo() {
    try {
      setCapturingKey("quench-video");
      const captured = await captureApplicationVideo({
        requireLocation: true,
        maxDurationSeconds: 90,
      });
      if (!captured) return;
      saveProcessDraft({
        quench_video_local_uri: captured.uri,
        quench_video_metadata: captured.metadata,
        quench_video_duration_seconds: captured.durationSeconds,
      });
    } catch (err) {
      if (err instanceof LocationUnavailableError) {
        Alert.alert("Location error", err.message);
        return;
      }
      Alert.alert(
        "Camera",
        err instanceof Error ? err.message : "Could not record the quench video.",
      );
    } finally {
      setCapturingKey(null);
    }
  }

  async function handleProcessPhoto(kind: "flame" | "quench-start" | "quench-end") {
    await reviewCapturedPhoto(kind, async (photo) => {
      if (kind === "flame") {
        saveProcessDraft({
          flame_curtain_photo_local_uri: photo.uri,
          flame_curtain_photo_metadata: photo.metadata,
        });
      } else if (kind === "quench-start") {
        saveProcessDraft({
          quench_start_photo_local_uri: photo.uri,
          quench_start_photo_metadata: photo.metadata,
        });
      } else {
        saveProcessDraft({
          quench_end_photo_local_uri: photo.uri,
          quench_end_photo_metadata: photo.metadata,
        });
      }
    });
  }

  function handleRemoveProcessPhoto(kind: "flame" | "quench-start" | "quench-end") {
    if (kind === "flame") {
      saveProcessDraft({
        flame_curtain_photo_local_uri: null,
        flame_curtain_photo_url: null,
        flame_curtain_photo_metadata: null,
      });
    } else if (kind === "quench-start") {
      saveProcessDraft({
        quench_start_photo_local_uri: null,
        quench_start_photo_url: null,
        quench_start_photo_metadata: null,
      });
    } else {
      saveProcessDraft({
        quench_end_photo_local_uri: null,
        quench_end_photo_url: null,
        quench_end_photo_metadata: null,
      });
    }
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

  async function handleBiomassLoadPhoto(loadId: string) {
    await reviewCapturedPhoto(`biomass-${loadId}`, async (photo) => {
      const next = biomassLoads.map((load) =>
        load.id === loadId
          ? {
              ...load,
              photo_local_uri: photo.uri,
              photo_metadata: photo.metadata,
              captured_at: photo.metadata.captured_at,
            }
          : load,
      );
      setBiomassLoads(next);
      queueAutoSave("biomass_loads", {}, next);
    });
  }

  function addBiomassLoad() {
    const next = [
      ...biomassLoads,
      {
        id: generateId(),
        sequence: biomassLoads.length + 1,
        photo_local_uri: null,
        photo_url: null,
        note: "",
      },
    ];
    setBiomassLoads(next);
    queueAutoSave("biomass_loads", {}, next);
  }

  function removeBiomassLoad(loadId: string) {
    const next = biomassLoads
      .filter((load) => load.id !== loadId)
      .map((load, index) => ({ ...load, sequence: index + 1 }));
    setBiomassLoads(next);
    queueAutoSave("biomass_loads", {}, next);
  }

  async function handleSamplePhoto() {
    await reviewCapturedPhoto("sample", async (photo) => {
      const next = {
        ...sampleDraft,
        sample_id: infoDraft.batch_number?.trim() || sampleDraft.sample_id,
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

    if (isRainbow && patch.feedstock_name !== undefined) {
      setMoistureDraft((prev) => {
        const next = fittedRainbowMoisture(prev, patch.feedstock_name);
        const unchanged =
          next.length === prev.length && next.every((item, index) => item === prev[index]);
        if (unchanged) return prev;
        queueAutoSave("moisture", { moisture_readings: next });
        return next;
      });
    }

    if (patch.batch_number !== undefined) {
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

      <KeyboardSafeScroll
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
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

        {(isRainbow ? RAINBOW_KONTIKKI_SECTIONS : PYROLYSIS_KONTIKKI_SECTIONS).map((section) => {
          const completed = isRainbow
            ? isRainbowSectionCompleted(rainbowFlags(kontikki), biomassLoads, section as RainbowKontikkiWorkflowSection)
            : isKontikkiWorkflowSectionCompleted(
                flags,
                kontikki.payload,
                section as PyrolysisKontikkiWorkflowSection,
              );
          const unlocked = isRainbow
            ? isRainbowSectionUnlocked(rainbowFlags(kontikki), section as RainbowKontikkiWorkflowSection)
            : isKontikkiWorkflowSectionUnlocked(
                flags,
                kontikki.payload,
                section as PyrolysisKontikkiWorkflowSection,
              );
          const savedAt = section === "biomass_loads" ? null : sectionSavedAt(section as PyrolysisKontikkiWorkflowSection);
          const title = isRainbow
            ? rainbowWorkflowSectionLabel(section as RainbowKontikkiWorkflowSection)
            : pyrolysisWorkflowSectionLabel(section as PyrolysisKontikkiWorkflowSection);

          return (
            <PyrolysisCollapsibleSection
              key={section}
              title={title}
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
                  {isRainbow ? (
                    <>
                      <PyrolysisPhotoSlot
                        label="Kiln photo"
                        required
                        localUri={infoDraft.kiln_photo_local_uri}
                        remoteUrl={infoDraft.kiln_photo_url}
                        metadata={infoDraft.kiln_photo_metadata}
                        capturing={capturingKey === "kiln"}
                        onCapture={() => void handleKilnPhoto()}
                        onRemove={handleRemoveKilnPhoto}
                      />
                    </>
                  ) : null}
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
                  {isRainbow ? (
                    <FormPicker
                      label="Feedstock class *"
                      placeholder="Woody or other"
                      value={infoDraft.feedstock_class ?? ""}
                      options={[
                        { value: "woody", label: "Woody" },
                        { value: "other", label: "Other or mixed" },
                      ]}
                      onValueChange={(value) =>
                        updateInfoDraft({
                          feedstock_class: value === "woody" || value === "other" ? value : null,
                        })
                      }
                    />
                  ) : null}

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

              {section === "biomass_loads" ? (
                <View style={styles.form}>
                  {biomassLoads.map((load, index) => (
                    <View key={load.id} style={styles.form}>
                      <PyrolysisPhotoSlot
                        label={`Layer ${index + 1}`}
                        required
                        localUri={load.photo_local_uri}
                        remoteUrl={load.photo_url}
                        metadata={load.photo_metadata}
                        capturing={capturingKey === `biomass-${load.id}`}
                        onCapture={() => handleBiomassLoadPhoto(load.id)}
                        onRemove={() => removeBiomassLoad(load.id)}
                      />
                    </View>
                  ))}
                  <TouchableOpacity onPress={addBiomassLoad} style={styles.metaRetryWrap}>
                    <Text style={styles.metaRetry}>+ Add layer photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      saveProcessDraft({
                        last_layer_confirmed: !infoDraft.last_layer_confirmed,
                      })
                    }
                    style={styles.metaRetryWrap}
                  >
                    <Text style={styles.metaRetry}>
                      {infoDraft.last_layer_confirmed
                        ? "Last layer recorded"
                        : "Mark the last layer"}
                    </Text>
                  </TouchableOpacity>
                  {infoDraft.last_layer_confirmed ? (
                    <>
                      <PyrolysisPhotoSlot
                        label="Flame curtain after the last layer"
                        required
                        localUri={infoDraft.flame_curtain_photo_local_uri}
                        remoteUrl={infoDraft.flame_curtain_photo_url}
                        metadata={infoDraft.flame_curtain_photo_metadata}
                        capturing={capturingKey === "flame"}
                        onCapture={() => handleProcessPhoto("flame")}
                        onRemove={() => handleRemoveProcessPhoto("flame")}
                      />
                      <View style={styles.quenchModeRow}>
                        <TouchableOpacity
                          style={[
                            styles.quenchModeButton,
                            quenchMode === "photos" ? styles.quenchModeButtonOn : null,
                          ]}
                          onPress={() => setQuenchMode("photos")}
                        >
                          <Text style={styles.metaRetry}>Quench photos</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.quenchModeButton,
                            quenchMode === "video" ? styles.quenchModeButtonOn : null,
                          ]}
                          onPress={() => setQuenchMode("video")}
                        >
                          <Text style={styles.metaRetry}>Short video</Text>
                        </TouchableOpacity>
                      </View>
                      {quenchMode === "photos" ? (
                        <>
                          {(infoDraft.quench_photos ?? []).map((photo, index, list) => (
                            <PyrolysisPhotoSlot
                              key={photo.id}
                              label={
                                index === 0
                                  ? "Quenching start"
                                  : index === list.length - 1 && list.length > 1
                                    ? "Quenching end"
                                    : `Quenching photo ${index + 1}`
                              }
                              required={index === 0 || index === list.length - 1}
                              localUri={photo.photo_local_uri}
                              remoteUrl={photo.photo_url}
                              metadata={photo.photo_metadata}
                              capturing={false}
                              onCapture={() => retakeQuenchPhoto(photo.id)}
                              onRemove={() =>
                                applyQuenchPhotos(list.filter((item) => item.id !== photo.id))
                              }
                            />
                          ))}
                          <TouchableOpacity onPress={handleAddQuenchPhoto} style={styles.metaRetryWrap}>
                            <Text style={styles.metaRetry}>
                              {(infoDraft.quench_photos ?? []).length === 0
                                ? "+ Photograph quenching start"
                                : "+ Add quench photo"}
                            </Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <TouchableOpacity onPress={handleQuenchVideo} style={styles.metaRetryWrap}>
                            <Text style={styles.metaRetry}>
                              {infoDraft.quench_video_local_uri || infoDraft.quench_video_url
                                ? "Retake quench video"
                                : "Record quench video"}
                            </Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </>
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
                    onFocus={() => {
                      setTimeout(() => {
                        scrollRef.current?.scrollToEnd({ animated: true });
                      }, 250);
                    }}
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
                    value={infoDraft.batch_number?.trim() || sampleDraft.sample_id}
                    editable={false}
                    onChangeText={() => undefined}
                    onFocus={() => {
                      setTimeout(() => {
                        scrollRef.current?.scrollToEnd({ animated: true });
                      }, 250);
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
      </KeyboardSafeScroll>
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
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  metaLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.brunswick,
    flexShrink: 0,
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
  metaRetryWrap: {
    minHeight: 48,
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  quenchModeRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  quenchModeButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
  },
  quenchModeButtonOn: {
    backgroundColor: colors.chalk,
    borderColor: colors.brunswick,
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
    fontSize: 13,
    color: colors.textSecondary,
  },
});
