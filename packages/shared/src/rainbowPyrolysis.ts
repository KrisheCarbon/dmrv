import type { FieldPhotoMetadata, MoistureReading } from "./pyrolysis";
import {
  pyrolysisProtocolForRegistry,
  type PyrolysisProtocol,
} from "./producerRegistry";

/**
 * Moisture photos for cotton on a 1,000 L kiln.
 * A full kiln is about 780 kg, and Rainbow's floor is 10 readings.
 */
export const RAINBOW_MOISTURE_READING_COUNT = 10;
/** Corn cobs fill a 1,000 L kiln to about 1,200 kg, so one reading per 100 kg is 12. */
export const RAINBOW_CORN_MOISTURE_READING_COUNT = 12;
/** Kept for the Rainbow rate. The app uses the feedstock minimum above for a full kiln. */
export const RAINBOW_KG_PER_MOISTURE_READING = 100;
export const RAINBOW_MOISTURE_READING_MAX = 25;
export const RAINBOW_WOODY_MOISTURE_MEAN_MAX = 20;
export const RAINBOW_OTHER_MOISTURE_MEAN_MAX = 15;

export const RAINBOW_FEEDSTOCK_CLASSES = ["woody", "other"] as const;
export type RainbowFeedstockClass = (typeof RAINBOW_FEEDSTOCK_CLASSES)[number];

export type RainbowProcessProof = {
  lastLayerConfirmed: boolean;
  flameCurtainPhoto?: string | null;
  quenchStartPhoto?: string | null;
  quenchEndPhoto?: string | null;
  quenchVideo?: string | null;
  quenchPhotoCount?: number;
};

export interface RainbowQuenchPhoto {
  id: string;
  photo_local_uri?: string | null;
  photo_url?: string | null;
  photo_metadata?: FieldPhotoMetadata | null;
}

/** Clock printed on the watermark. Quench length is the gap between the first and last of these. */
export function quenchDurationSeconds(
  photos: Array<{ photo_metadata?: { captured_at?: string | null } | null }>,
): number | null {
  const times = photos
    .map((photo) => Date.parse(photo.photo_metadata?.captured_at ?? ""))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (times.length < 2) return null;
  return Math.max(0, Math.round((times[times.length - 1] - times[0]) / 1000));
}

export function formatQuenchDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  if (minutes <= 0) return `${rest} sec`;
  return `${minutes} min ${rest} sec`;
}

export function isRainbowQuenchComplete(proof?: RainbowProcessProof | null): boolean {
  if (!proof) return false;
  if (proof.quenchVideo) return true;
  if ((proof.quenchPhotoCount ?? 0) >= 2) return true;
  return Boolean(proof.quenchStartPhoto && proof.quenchEndPhoto);
}

export function rainbowRequiredMoistureCount(
  feedstockName?: string | null,
): number {
  const name = (feedstockName ?? "").toLowerCase();
  if (name.includes("corn") || name.includes("maize")) {
    return RAINBOW_CORN_MOISTURE_READING_COUNT;
  }
  return RAINBOW_MOISTURE_READING_COUNT;
}

export function rainbowMoistureMeanLimit(
  feedstockClass: RainbowFeedstockClass | null | undefined,
): number | null {
  if (feedstockClass === "woody") return RAINBOW_WOODY_MOISTURE_MEAN_MAX;
  if (feedstockClass === "other") return RAINBOW_OTHER_MOISTURE_MEAN_MAX;
  return null;
}

export const RAINBOW_KONTIKKI_SECTIONS = [
  "info",
  "layers",
  "quench",
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

export interface RainbowSampleSpot {
  spot: number;
  photo_url?: string | null;
  photo_local_uri?: string | null;
  photo_metadata?: FieldPhotoMetadata | null;
}

/** Three spots, the site composite pile, and either a bag QR or a recorded "no bag". */
export function isRainbowSampleCollectionComplete(input: {
  spots?: RainbowSampleSpot[] | null;
  pilePhotoUrl?: string | null;
  pilePhotoLocalUri?: string | null;
  bagNotUsed?: boolean | null;
  bagCode?: string | null;
  bagPhotoUrl?: string | null;
  bagPhotoLocalUri?: string | null;
}): boolean {
  const spots = input.spots ?? [];
  const threeSpots = [1, 2, 3].every((spot) =>
    spots.some((item) => item.spot === spot && (item.photo_local_uri || item.photo_url)),
  );
  const pile = Boolean(input.pilePhotoLocalUri || input.pilePhotoUrl);
  const bag = input.bagNotUsed
    ? true
    : Boolean((input.bagCode ?? "").trim() && (input.bagPhotoLocalUri || input.bagPhotoUrl));
  return threeSpots && pile && bag;
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
  generated_batch_code?: string | null;
  feedstock_quantity?: number | null;
  avg_feedstock_size_cm?: number | null;
  feedstock_id?: string | null;
  feedstock_name?: string | null;
  feedstock_class?: RainbowFeedstockClass | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_address?: string | null;
  kiln_photo_url?: string | null;
  kiln_photo_metadata?: FieldPhotoMetadata | null;
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
  sample_spots?: RainbowSampleSpot[];
  sample_pile_photo_url?: string | null;
  sample_pile_photo_metadata?: FieldPhotoMetadata | null;
  sample_bag_code?: string | null;
  sample_bag_photo_url?: string | null;
  sample_bag_photo_metadata?: FieldPhotoMetadata | null;
  sample_bag_not_used?: boolean;
  sample_collected_at?: string | null;
  last_layer_confirmed?: boolean;
  flame_curtain_photo_url?: string | null;
  flame_curtain_photo_metadata?: FieldPhotoMetadata | null;
  quench_start_photo_url?: string | null;
  quench_start_photo_metadata?: FieldPhotoMetadata | null;
  quench_end_photo_url?: string | null;
  quench_end_photo_metadata?: FieldPhotoMetadata | null;
  quench_photos?: RainbowQuenchPhoto[];
  quench_video_url?: string | null;
  quench_video_metadata?: FieldPhotoMetadata | null;
  quench_video_duration_seconds?: number | null;
  submission_status?: "draft" | "submitted";
  review_status?: string | null;
  reviewer_notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export function emptyRainbowMoistureReadings(
  count = RAINBOW_MOISTURE_READING_COUNT,
): MoistureReading[] {
  const length = Math.max(RAINBOW_MOISTURE_READING_COUNT, count);
  return Array.from({ length }, () => ({
    reading: null,
    photo_local_uri: null,
    photo_url: null,
  }));
}

function moistureSlotFilled(item: MoistureReading | undefined): boolean {
  return Boolean(
    item &&
      item.reading != null &&
      !Number.isNaN(item.reading) &&
      (item.photo_local_uri || item.photo_url),
  );
}

export function isRainbowMoistureComplete(
  readings: MoistureReading[],
  feedstockName?: string | null,
  feedstockClass?: RainbowFeedstockClass | null,
): boolean {
  const required = rainbowRequiredMoistureCount(feedstockName);
  if (readings.length < required) return false;
  if (!readings.every(moistureSlotFilled)) return false;
  const limit = rainbowMoistureMeanLimit(feedstockClass);
  if (limit == null) return false;
  const values = readings.map((item) => Number(item.reading));
  if (values.some((value) => value > RAINBOW_MOISTURE_READING_MAX)) return false;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return mean <= limit;
}

/** Moisture of the charge, photographed before that biomass is loaded as the layer. */
export function isRainbowLayerPairComplete(
  reading: MoistureReading | undefined,
  load: RainbowBiomassLoad | undefined,
): boolean {
  if (!load) return false;
  return moistureSlotFilled(reading) && isRainbowBiomassLoadComplete(load);
}

export function isRainbowLayeringComplete(
  readings: MoistureReading[],
  loads: RainbowBiomassLoad[],
  feedstockName?: string | null,
  feedstockClass?: RainbowFeedstockClass | null,
  proof?: Pick<RainbowProcessProof, "lastLayerConfirmed" | "flameCurtainPhoto"> | null,
): boolean {
  const required = rainbowRequiredMoistureCount(feedstockName);
  if (loads.length < required || readings.length !== loads.length) return false;
  if (!readings.every((reading, index) => isRainbowLayerPairComplete(reading, loads[index]))) {
    return false;
  }
  if (!isRainbowMoistureComplete(readings, feedstockName, feedstockClass)) return false;
  return Boolean(proof?.lastLayerConfirmed && proof.flameCurtainPhoto);
}

export function isRainbowInfoComplete(input: {
  batchNumber?: string | null;
  feedstockId?: string | null;
  feedstockName?: string | null;
  feedstockClass?: RainbowFeedstockClass | null;
  feedstockPhoto?: string | null;
  kilnPhoto?: string | null;
}): boolean {
  if (!input.batchNumber?.trim()) return false;
  if (!input.feedstockId && !input.feedstockName?.trim()) return false;
  if (input.feedstockClass !== "woody" && input.feedstockClass !== "other") return false;
  if (!input.feedstockPhoto) return false;
  return Boolean(input.kilnPhoto);
}

export function isRainbowBiomassLoadComplete(load: RainbowBiomassLoad): boolean {
  return Boolean(load.photo_local_uri || load.photo_url);
}

export function isRainbowProductionComplete(
  loads: RainbowBiomassLoad[],
  proof?: RainbowProcessProof | null,
  readings?: MoistureReading[] | null,
  feedstockName?: string | null,
  feedstockClass?: RainbowFeedstockClass | null,
): boolean {
  if (readings && readings.length > 0) {
    if (!isRainbowLayeringComplete(readings, loads, feedstockName, feedstockClass, proof)) {
      return false;
    }
  } else {
    const layersOk = loads.length > 0 && loads.every(isRainbowBiomassLoadComplete);
    if (!layersOk || !proof?.lastLayerConfirmed || !proof.flameCurtainPhoto) return false;
  }
  return isRainbowQuenchComplete(proof);
}

export function rainbowWorkflowSectionLabel(
  section: RainbowKontikkiWorkflowSection,
): string {
  if (section === "info") return "Batch info";
  if (section === "layers") return "Moisture and layers";
  if (section === "quench") return "Quenching";
  if (section === "yield") return "Yield & comment";
  if (section === "sample") return "Sample";
  return section;
}

export function rainbowWorkflowSectionSubtitle(
  section: RainbowKontikkiWorkflowSection,
): string {
  if (section === "info") {
    return "Kiln photo, batch number, feedstock, and location";
  }
  if (section === "layers") {
    return "Moisture of each charge, then a photo of that layer. Cotton 10, corn 12, then more if you keep loading.";
  }
  if (section === "quench") {
    return "After the flame curtain. Photos from the start of quenching to the end, or one short video.";
  }
  if (section === "yield") {
    return "Yield percent and optional comment";
  }
  if (section === "sample") {
    return "Sample id is the batch number entered for this kiln run";
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

export type RainbowSectionInput = {
  readings?: MoistureReading[];
  feedstockName?: string | null;
  feedstockClass?: RainbowFeedstockClass | null;
};

function layeringSectionDone(
  loads: RainbowBiomassLoad[],
  proof?: RainbowProcessProof | null,
  input?: RainbowSectionInput | null,
): boolean {
  return isRainbowLayeringComplete(
    input?.readings ?? [],
    loads,
    input?.feedstockName,
    input?.feedstockClass,
    proof,
  );
}

export function isRainbowSectionCompleted(
  flags: RainbowWorkflowFlags,
  loads: RainbowBiomassLoad[],
  section: RainbowKontikkiWorkflowSection,
  proof?: RainbowProcessProof | null,
  input?: RainbowSectionInput | null,
): boolean {
  if (section === "info") return flags.infoCompleted;
  if (section === "layers") return layeringSectionDone(loads, proof, input);
  if (section === "quench") return isRainbowQuenchComplete(proof);
  if (section === "yield") return flags.yieldCompleted;
  if (section === "sample") return flags.sampleCompleted;
  return false;
}

export function isRainbowSectionUnlocked(
  flags: RainbowWorkflowFlags,
  section: RainbowKontikkiWorkflowSection,
  loads: RainbowBiomassLoad[] = [],
  proof?: RainbowProcessProof | null,
  input?: RainbowSectionInput | null,
): boolean {
  if (section === "info") return true;
  if (section === "layers") return flags.infoCompleted;
  if (section === "quench") return layeringSectionDone(loads, proof, input);
  if (section === "yield") {
    return layeringSectionDone(loads, proof, input) && isRainbowQuenchComplete(proof);
  }
  if (section === "sample") return flags.yieldCompleted;
  return false;
}

export function rainbowKontikkiWorkflowProgress(
  flags: RainbowWorkflowFlags,
  loads: RainbowBiomassLoad[],
  proof?: RainbowProcessProof | null,
  input?: RainbowSectionInput | null,
): number {
  let done = 0;
  for (const section of RAINBOW_KONTIKKI_SECTIONS) {
    if (isRainbowSectionCompleted(flags, loads, section, proof, input)) done += 1;
  }
  return Math.round((done / RAINBOW_KONTIKKI_SECTIONS.length) * 100);
}

export function protocolForKontikkiRegistry(
  registry?: string | null,
): PyrolysisProtocol {
  return pyrolysisProtocolForRegistry(registry);
}
