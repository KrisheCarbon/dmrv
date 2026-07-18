import {
  MOISTURE_READING_COUNT,
  isPyrolysisStageKey,
  type PyrolysisKontikkiData,
  type PyrolysisKontikkiWorkflowSection,
  type PyrolysisStageKey,
  type PyrolysisStagePhotos,
  type MoistureReading,
} from "@krishecarbon/shared";

export function isInfoSectionComplete(data: PyrolysisKontikkiData): boolean {
  if (!data.batch_number?.trim()) return false;
  if (!data.farm_id && !data.farm_name?.trim()) return false;
  if (!data.feedstock_id && !data.feedstock_name?.trim()) return false;
  return Boolean(data.feedstock_photo_local_uri || data.feedstock_photo_url);
}

export function isMoistureSectionComplete(readings: MoistureReading[]): boolean {
  if (readings.length !== MOISTURE_READING_COUNT) return false;

  return readings.every(
    (item) =>
      item.reading != null &&
      !Number.isNaN(item.reading) &&
      Boolean(item.photo_local_uri || item.photo_url),
  );
}

export function isStageSectionComplete(
  stage: PyrolysisStageKey,
  stagePhotos: PyrolysisStagePhotos,
): boolean {
  const photo = stagePhotos[stage];
  return Boolean(photo?.local_uri || photo?.url);
}

export function isYieldSectionComplete(data: PyrolysisKontikkiData): boolean {
  return data.yield_percent != null && !Number.isNaN(data.yield_percent);
}

export function isSampleSectionComplete(data: PyrolysisKontikkiData): boolean {
  return (
    Boolean(data.sample_id?.trim()) &&
    Boolean(data.sample_photo_local_uri || data.sample_photo_url)
  );
}

export function sectionCompletionPayload(
  section: PyrolysisKontikkiWorkflowSection,
  data: PyrolysisKontikkiData,
  savedAt: string,
): Partial<PyrolysisKontikkiData> {
  if (section === "info" && isInfoSectionComplete(data)) {
    return { info_saved_at: data.info_saved_at ?? savedAt };
  }

  if (section === "moisture" && isMoistureSectionComplete(data.moisture_readings ?? [])) {
    return { moisture_saved_at: data.moisture_saved_at ?? savedAt };
  }

  if (isPyrolysisStageKey(section) && isStageSectionComplete(section, data.stage_photos ?? {})) {
    return {
      stage_saved_at: {
        ...(data.stage_saved_at ?? {}),
        [section]: data.stage_saved_at?.[section] ?? savedAt,
      },
    };
  }

  if (section === "yield" && isYieldSectionComplete(data)) {
    return {
      yield_saved_at: data.yield_saved_at ?? savedAt,
      pyrolysis_saved_at: data.pyrolysis_saved_at ?? savedAt,
    };
  }

  if (section === "sample" && isSampleSectionComplete(data)) {
    return {
      sample_saved_at: data.sample_saved_at ?? savedAt,
    };
  }

  return {};
}
