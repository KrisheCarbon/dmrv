import type { LocationValue } from "./index";
import type { PyrolysisBatchFlatRow } from "./pyrolysisBatchFlat";

export const PYROLYSIS_SESSION_STATUS = [
  "active",
  "completed",
  "cancelled",
] as const;

export type PyrolysisSessionStatus = (typeof PYROLYSIS_SESSION_STATUS)[number];

export const PYROLYSIS_STEPS = [
  "select",
  "info",
  "moisture",
  "pyrolysis",
  "complete",
] as const;

export type PyrolysisStep = (typeof PYROLYSIS_STEPS)[number];

export const PYROLYSIS_STAGE_KEYS = [
  "initial",
  "middle",
  "final",
  "quenching",
] as const;

export type PyrolysisStageKey = (typeof PYROLYSIS_STAGE_KEYS)[number];

export const PYROLYSIS_KONTIKKI_SECTIONS = [
  "info",
  "moisture",
  ...PYROLYSIS_STAGE_KEYS,
  "yield",
  "sample",
] as const;

export type PyrolysisKontikkiWorkflowSection =
  (typeof PYROLYSIS_KONTIKKI_SECTIONS)[number];

export const MOISTURE_READING_COUNT = 5;

export interface FieldPhotoMetadata {
  captured_at: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  device_time_iso?: string | null;
  exif?: Record<string, unknown> | null;
}

export interface MoistureReading {
  reading: number | null;
  photo_local_uri?: string | null;
  photo_url?: string | null;
  photo_metadata?: FieldPhotoMetadata | null;
}

export interface PyrolysisStagePhoto {
  local_uri?: string | null;
  url?: string | null;
  captured_at?: string | null;
  metadata?: FieldPhotoMetadata | null;
}

export type PyrolysisStagePhotos = Partial<
  Record<PyrolysisStageKey, PyrolysisStagePhoto>
>;

export interface PyrolysisKontikkiData {
  batch_number?: string;
  feedstock_quantity?: number | null;
  avg_feedstock_size_cm?: number | null;
  feedstock_id?: string | null;
  feedstock_name?: string | null;
  location?: LocationValue | null;
  feedstock_photo_local_uri?: string | null;
  feedstock_photo_url?: string | null;
  feedstock_photo_metadata?: FieldPhotoMetadata | null;
  feedstock_size_photo_local_uri?: string | null;
  feedstock_size_photo_url?: string | null;
  feedstock_size_photo_metadata?: FieldPhotoMetadata | null;
  moisture_readings?: MoistureReading[];
  stage_photos?: PyrolysisStagePhotos;
  stage_saved_at?: Partial<Record<PyrolysisStageKey, string>>;
  yield_percent?: number | null;
  comment?: string | null;
  yield_saved_at?: string | null;
  sample_id?: string | null;
  sample_photo_local_uri?: string | null;
  sample_photo_url?: string | null;
  sample_photo_metadata?: FieldPhotoMetadata | null;
  sample_saved_at?: string | null;
  info_saved_at?: string | null;
  moisture_saved_at?: string | null;
  pyrolysis_saved_at?: string | null;
}

export interface PyrolysisKontikkiOption {
  id: string;
  kontikki_code: string;
  status: string;
  biochar_producer_id?: string | null;
  producer_name?: string | null;
  capacity?: number | null;
}

export interface StartPyrolysisSessionPayload {
  kontikki_ids: string[];
}

export const PYROLYSIS_SUBMISSION_STATUSES = ["draft", "submitted"] as const;

export type PyrolysisSubmissionStatus = (typeof PYROLYSIS_SUBMISSION_STATUSES)[number];

export interface PyrolysisBatchRecord extends PyrolysisBatchFlatRow {
  id: string;
  session_id: string;
  kontikki_id: string;
  kontikki_code: string;
  review_status?: string | null;
  reviewer_notes?: string | null;
  /** Whether the operator has finalized this kontikki's data for this batch.
   * Only "submitted" kontikkis are synced/reviewed; "draft" ones remain
   * local-only and keep the kontikki reserved for this session. */
  submission_status?: PyrolysisSubmissionStatus;
  created_at?: string;
  updated_at?: string;
}

export interface PyrolysisSessionRecord {
  id: string;
  operator_id: string;
  status: PyrolysisSessionStatus;
  current_step: PyrolysisStep;
  batches: PyrolysisBatchRecord[];
  created_at?: string;
  updated_at?: string;
}

/** @deprecated Use PyrolysisBatchRecord — mobile offline DTO only */
export interface PyrolysisSessionKontikkiRecord {
  id: string;
  session_id: string;
  kontikki_id: string;
  kontikki_code: string;
  info_completed: boolean;
  moisture_completed: boolean;
  pyrolysis_completed: boolean;
  data: PyrolysisKontikkiData;
}

export interface PyrolysisKontikkiWorkflowFlags {
  infoCompleted: boolean;
  moistureCompleted: boolean;
  pyrolysisCompleted: boolean;
  sampleCompleted: boolean;
}

export function emptyMoistureReadings(): MoistureReading[] {
  return Array.from({ length: MOISTURE_READING_COUNT }, () => ({
    reading: null,
    photo_local_uri: null,
    photo_url: null,
  }));
}

export function emptyPyrolysisKontikkiData(): PyrolysisKontikkiData {
  return {
    moisture_readings: emptyMoistureReadings(),
    stage_photos: {},
  };
}

export function isPyrolysisStageKey(
  value: string,
): value is PyrolysisStageKey {
  return (PYROLYSIS_STAGE_KEYS as readonly string[]).includes(value);
}

export function normalizeStagePhotos(
  photos?: PyrolysisStagePhotos | null,
): PyrolysisStagePhotos {
  if (!photos) return {};

  const normalized = { ...photos } as Record<string, PyrolysisStagePhoto | undefined>;
  if (normalized.end && !normalized.final) {
    normalized.final = normalized.end;
  }
  delete normalized.end;

  return normalized as PyrolysisStagePhotos;
}

export function normalizeStageSavedAt(
  savedAt?: Partial<Record<PyrolysisStageKey, string>> | null,
): Partial<Record<PyrolysisStageKey, string>> {
  if (!savedAt) return {};

  const normalized = { ...savedAt } as Record<string, string | undefined>;
  if (normalized.end && !normalized.final) {
    normalized.final = normalized.end;
  }
  delete normalized.end;

  return normalized as Partial<Record<PyrolysisStageKey, string>>;
}

export function pyrolysisStageLabel(stage: PyrolysisStageKey): string {
  switch (stage) {
    case "initial":
      return "Initial stage of pyrolysis";
    case "middle":
      return "Middle stage of pyrolysis";
    case "final":
      return "Final stage of pyrolysis";
    case "quenching":
      return "Quenching";
    default:
      return stage;
  }
}

export function pyrolysisWorkflowSectionLabel(
  section: PyrolysisKontikkiWorkflowSection,
): string {
  if (isPyrolysisStageKey(section)) return pyrolysisStageLabel(section);
  if (section === "info") return "Batch info";
  if (section === "moisture") return "Moisture readings";
  if (section === "yield") return "Yield & comment";
  if (section === "sample") return "Sample";
  return section;
}

export function pyrolysisWorkflowSectionSubtitle(
  section: PyrolysisKontikkiWorkflowSection,
): string {
  if (section === "info") {
    return "Batch number, feedstock, location & photos";
  }
  if (section === "moisture") {
    return "5 moisture photos with readings";
  }
  if (section === "yield") {
    return "Yield percent and optional comment";
  }
  if (section === "sample") {
    return "Sample ID and photo";
  }
  return "Camera photo with GPS and time watermark";
}

export const PYROLYSIS_KONTIKKI_SECTION_COUNT =
  PYROLYSIS_KONTIKKI_SECTIONS.length;

export function isKontikkiWorkflowSectionCompleted(
  flags: PyrolysisKontikkiWorkflowFlags,
  data: PyrolysisKontikkiData | undefined,
  section: PyrolysisKontikkiWorkflowSection,
): boolean {
  if (section === "info") return flags.infoCompleted;
  if (section === "moisture") return flags.moistureCompleted;
  if (section === "yield") return flags.pyrolysisCompleted;
  if (section === "sample") return flags.sampleCompleted;

  const savedAt = normalizeStageSavedAt(data?.stage_saved_at);
  return Boolean(savedAt[section]);
}

export function isKontikkiWorkflowSectionUnlocked(
  flags: PyrolysisKontikkiWorkflowFlags,
  data: PyrolysisKontikkiData | undefined,
  section: PyrolysisKontikkiWorkflowSection,
): boolean {
  if (section === "info") return true;
  if (section === "moisture") return flags.infoCompleted;
  if (section === "initial") return flags.moistureCompleted;

  const savedAt = normalizeStageSavedAt(data?.stage_saved_at);

  if (section === "yield") {
    return Boolean(savedAt.quenching);
  }

  if (section === "sample") {
    return flags.pyrolysisCompleted;
  }

  if (isPyrolysisStageKey(section)) {
    const stageIndex = PYROLYSIS_STAGE_KEYS.indexOf(section);
    if (stageIndex <= 0) return flags.moistureCompleted;

    const previousStage = PYROLYSIS_STAGE_KEYS[stageIndex - 1];
    return Boolean(savedAt[previousStage]);
  }

  return false;
}

export function kontikkiWorkflowProgress(
  flags: PyrolysisKontikkiWorkflowFlags,
  data: PyrolysisKontikkiData | undefined,
): number {
  let done = 0;

  for (const section of PYROLYSIS_KONTIKKI_SECTIONS) {
    if (isKontikkiWorkflowSectionCompleted(flags, data, section)) {
      done += 1;
    }
  }

  return Math.round((done / PYROLYSIS_KONTIKKI_SECTION_COUNT) * 100);
}

export function pyrolysisStepLabel(step: PyrolysisStep): string {
  switch (step) {
    case "select":
      return "Select kontikkis";
    case "info":
      return "Batch info";
    case "moisture":
      return "Moisture readings";
    case "pyrolysis":
      return "Pyrolysis stages";
    case "complete":
      return "Complete";
    default:
      return step;
  }
}
