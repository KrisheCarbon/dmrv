import type { FieldPhotoMetadata, MoistureReading } from "./pyrolysis";
import {
  pyrolysisProtocolForRegistry,
  type PyrolysisProtocol,
} from "./producerRegistry";

export const RAINBOW_MOISTURE_READING_COUNT = 10;

export const RAINBOW_KONTIKKI_SECTIONS = [
  "info",
  "moisture",
  "biomass_loads",
  "yield",
  "sample",
] as const;

export type RainbowKontikkiWorkflowSection =
  (typeof RAINBOW_KONTIKKI_SECTIONS)[number];

export interface RainbowBiomassLoad {
  id: string;
  sequence: number;
  photo_local_uri?: string | null;
  photo_url?: string | null;
  photo_metadata?: FieldPhotoMetadata | null;
  captured_at?: string | null;
  note?: string | null;
}

export interface RainbowPyrolysisBatchRecord {
  id: string;
  session_id: string;
  kontikki_id: string;
  kontikki_code: string;
  producer_id?: string | null;
  producer_name?: string | null;
  protocol: "rainbow";
  batch_number?: string | null;
  feedstock_quantity?: number | null;
  avg_feedstock_size_cm?: number | null;
  feedstock_id?: string | null;
  feedstock_name?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_address?: string | null;
  feedstock_photo_url?: string | null;
  feedstock_size_photo_url?: string | null;
  feedstock_photo_metadata?: FieldPhotoMetadata | null;
  feedstock_size_photo_metadata?: FieldPhotoMetadata | null;
  moisture: MoistureReading[];
  biomass_loads: RainbowBiomassLoad[];
  info_completed: boolean;
  moisture_completed: boolean;
  production_completed: boolean;
  yield_completed: boolean;
  sample_completed: boolean;
  info_saved_at?: string | null;
  moisture_saved_at?: string | null;
  production_saved_at?: string | null;
  yield_saved_at?: string | null;
  yield_percent?: number | null;
  comment?: string | null;
  sample_id?: string | null;
  sample_photo_url?: string | null;
  sample_photo_metadata?: FieldPhotoMetadata | null;
  sample_saved_at?: string | null;
  submission_status?: "draft" | "submitted";
  review_status?: string | null;
  reviewer_notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export function emptyRainbowMoistureReadings(): MoistureReading[] {
  return Array.from({ length: RAINBOW_MOISTURE_READING_COUNT }, () => ({
    reading: null,
    photo_local_uri: null,
    photo_url: null,
  }));
}

export function isRainbowMoistureComplete(readings: MoistureReading[]): boolean {
  if (readings.length < RAINBOW_MOISTURE_READING_COUNT) return false;
  return readings.slice(0, RAINBOW_MOISTURE_READING_COUNT).every(
    (item) =>
      item.reading != null &&
      !Number.isNaN(item.reading) &&
      Boolean(item.photo_local_uri || item.photo_url),
  );
}

export function isRainbowBiomassLoadComplete(load: RainbowBiomassLoad): boolean {
  return Boolean(load.photo_local_uri || load.photo_url);
}

export function isRainbowProductionComplete(loads: RainbowBiomassLoad[]): boolean {
  return loads.length > 0 && loads.every(isRainbowBiomassLoadComplete);
}

export function rainbowWorkflowSectionLabel(
  section: RainbowKontikkiWorkflowSection,
): string {
  if (section === "info") return "Batch info";
  if (section === "moisture") return "Moisture readings";
  if (section === "biomass_loads") return "Biomass in kontikki";
  if (section === "yield") return "Yield & comment";
  if (section === "sample") return "Sample";
  return section;
}

export function rainbowWorkflowSectionSubtitle(
  section: RainbowKontikkiWorkflowSection,
): string {
  if (section === "info") {
    return "Batch number, feedstock, location & photos";
  }
  if (section === "moisture") {
    return `${RAINBOW_MOISTURE_READING_COUNT} moisture photos with readings`;
  }
  if (section === "biomass_loads") {
    return "One photo each time biomass is loaded into the kontikki";
  }
  if (section === "yield") {
    return "Yield percent and optional comment";
  }
  if (section === "sample") {
    return "Sample ID and photo";
  }
  return "";
}

export type RainbowWorkflowFlags = {
  infoCompleted: boolean;
  moistureCompleted: boolean;
  productionCompleted: boolean;
  yieldCompleted: boolean;
  sampleCompleted: boolean;
};

export function isRainbowSectionCompleted(
  flags: RainbowWorkflowFlags,
  loads: RainbowBiomassLoad[],
  section: RainbowKontikkiWorkflowSection,
): boolean {
  if (section === "info") return flags.infoCompleted;
  if (section === "moisture") return flags.moistureCompleted;
  if (section === "biomass_loads") {
    return flags.productionCompleted || isRainbowProductionComplete(loads);
  }
  if (section === "yield") return flags.yieldCompleted;
  if (section === "sample") return flags.sampleCompleted;
  return false;
}

export function isRainbowSectionUnlocked(
  flags: RainbowWorkflowFlags,
  section: RainbowKontikkiWorkflowSection,
): boolean {
  if (section === "info") return true;
  if (section === "moisture") return flags.infoCompleted;
  if (section === "biomass_loads") return flags.moistureCompleted;
  if (section === "yield") return flags.productionCompleted;
  if (section === "sample") return flags.yieldCompleted;
  return false;
}

export function rainbowKontikkiWorkflowProgress(
  flags: RainbowWorkflowFlags,
  loads: RainbowBiomassLoad[],
): number {
  let done = 0;
  for (const section of RAINBOW_KONTIKKI_SECTIONS) {
    if (isRainbowSectionCompleted(flags, loads, section)) done += 1;
  }
  return Math.round((done / RAINBOW_KONTIKKI_SECTIONS.length) * 100);
}

export function protocolForKontikkiRegistry(
  registry?: string | null,
): PyrolysisProtocol {
  return pyrolysisProtocolForRegistry(registry);
}
