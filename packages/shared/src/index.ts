export {
  USER_ROLES,
  ROLE_LABELS,
  PORTAL_ROLES,
  MOBILE_APP_ROLES,
  USER_MANAGEMENT_ROLES,
  isUserRole,
  formatRoleLabel,
  canAccessWebPortal,
  canAccessMobileApp,
  canManageUsers,
  canAccessNetwork,
  NETWORK_ACCESS_ROLES,
  canAccessCarbon,
  CARBON_ACCESS_ROLES,
  canManageProducers,
  PRODUCER_MANAGEMENT_ROLES,
  canReviewPyrolysisBatches,
  canReviewMixingEntries,
  canReviewApplicationEntries,
  PYROLYSIS_APPROVAL_ROLES,
  MIXING_APPROVAL_ROLES,
  APPLICATION_APPROVAL_ROLES,
  getAssignableRoles,
  canAssignRole,
  canEditUser,
  getUserManagementHint,
  assertCanAssignRole,
  assertCanEditUser,
} from "./roles";
export type { UserRole } from "./roles";

export const CROP_OPTIONS = [
  "Cotton",
  "Chilli",
  "Corn Cobs",
  "Maize",
  "Coffee",
  "Paddy",
  "Other",
] as const;

export type CropName = (typeof CROP_OPTIONS)[number];

export const BIOMASS_FACTOR = 2;

export interface FarmerCrop {
  crop_name: string;
  crop_area: number | string;
  sowing_date: string;
  harvest_date: string;
}

export interface FarmerForm {
  id?: string;
  server_id?: string | null;
  farmer_name: string;
  mobile_number?: string;
  latitude?: number | string;
  longitude?: number | string;
  address?: string;
  total_land_size?: number | string;
  crops: FarmerCrop[];
  interested_in_biochar?: boolean;
  prior_biochar_exp?: boolean;
  prior_biochar_acreage?: number | string;
  consent_document_url?: string;
  consent_local_uri?: string;
  estimated_biomass?: number;
  sync_status?: string;
}

export interface LocationValue {
  lat: number;
  lng: number;
  address?: string;
}

export type DbRow = Record<string, unknown>;

export interface Farmer extends DbRow {
  /** Row in the Supabase `farms` table (farmer/farm registration). */
  id: string;
  farmer_name?: string;
  mobile_number?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  total_land_size?: number;
  crops?: FarmCropRecord[];
  interested_in_biochar?: boolean;
  prior_biochar_exp?: boolean;
  prior_biochar_acreage?: number | null;
  consent_document_url?: string | null;
  estimated_biomass?: number;
  created_by?: string;
  assigned_to?: string;
  created_at?: string;
  updated_at?: string;
}

/** Crop row stored in farms.crops JSON (web + mobile portal). */
export interface FarmCropRecord {
  crop: string;
  acreage: number;
  sowing_date: string;
  estimated_harvest_date: string;
}

export interface FarmUpsertPayload {
  farmer_name: string;
  mobile_number: string;
  latitude: number;
  longitude: number;
  address: string;
  total_land_size: number;
  crops: FarmCropRecord[];
  interested_in_biochar: boolean;
  prior_biochar_exp: boolean;
  prior_biochar_acreage: number | null;
  estimated_biomass: number;
  consent_document_url?: string | null;
}

export function calculateEstimatedBiomass(crops: FarmerCrop[]): number {
  if (!Array.isArray(crops) || crops.length === 0) return 0;

  return crops.reduce(
    (sum, crop) => sum + Number(crop.crop_area || 0) * BIOMASS_FACTOR,
    0,
  );
}

export function validateMobileNumber(mobile: string | undefined | null): boolean {
  const cleaned = String(mobile || "").replace(/\D/g, "");
  if (!cleaned) return true;
  return /^[6-9]\d{9}$/.test(cleaned);
}

export function validateFarmerForm(form: FarmerForm): string[] {
  const errors: string[] = [];

  if (!form.farmer_name?.trim()) {
    errors.push("Farmer name is required.");
  }

  const mobileDigits = String(form.mobile_number || "").replace(/\D/g, "");
  if (mobileDigits && !validateMobileNumber(form.mobile_number)) {
    errors.push("Enter a valid 10-digit mobile number, or leave blank.");
  }

  if (!form.latitude || !form.longitude) {
    errors.push("Farm location (GPS) is required.");
  }

  if (!form.address?.trim()) {
    errors.push("Address could not be resolved. Refresh location.");
  }

  const landSize = Number(form.total_land_size);
  if (!form.total_land_size || isNaN(landSize) || landSize <= 0) {
    errors.push("Total land size (acres) is required.");
  }

  if (!Array.isArray(form.crops) || form.crops.length === 0) {
    errors.push("Add at least one crop.");
  } else {
    form.crops.forEach((crop, i) => {
      const label = `Crop ${i + 1}`;
      if (!crop.crop_name?.trim()) {
        errors.push(`${label}: crop name is required.`);
      }
      const area = Number(crop.crop_area);
      if (!crop.crop_area || isNaN(area) || area <= 0) {
        errors.push(`${label}: crop area is required.`);
      }
      if (!crop.sowing_date) {
        errors.push(`${label}: estimated sowing date is required.`);
      }
      if (!crop.harvest_date) {
        errors.push(`${label}: estimated harvest date is required.`);
      }
      if (
        crop.sowing_date &&
        crop.harvest_date &&
        new Date(crop.harvest_date) <= new Date(crop.sowing_date)
      ) {
        errors.push(`${label}: harvest date must be after sowing date.`);
      }
    });
  }

  if (form.prior_biochar_exp) {
    const priorArea = Number(form.prior_biochar_acreage);
    if (
      !form.prior_biochar_acreage ||
      isNaN(priorArea) ||
      priorArea <= 0
    ) {
      errors.push(
        "Prior biochar creation area is required when experience is Yes.",
      );
    }
  }

  return errors;
}

export function normalizeMobileNumber(mobile: string | undefined | null): string {
  return String(mobile || "").replace(/\D/g, "");
}

export {
  PYROLYSIS_SESSION_STATUS,
  PYROLYSIS_STEPS,
  PYROLYSIS_STAGE_KEYS,
  PYROLYSIS_KONTIKKI_SECTIONS,
  MOISTURE_READING_COUNT,
  emptyMoistureReadings,
  emptyPyrolysisKontikkiData,
  isPyrolysisStageKey,
  normalizeStagePhotos,
  normalizeStageSavedAt,
  pyrolysisStepLabel,
  pyrolysisStageLabel,
  pyrolysisWorkflowSectionLabel,
  pyrolysisWorkflowSectionSubtitle,
  PYROLYSIS_KONTIKKI_SECTION_COUNT,
  isKontikkiWorkflowSectionCompleted,
  isKontikkiWorkflowSectionUnlocked,
  kontikkiWorkflowProgress,
} from "./pyrolysis";
export {
  kontikkiDataToFlatRow,
  flatRowToKontikkiData,
  moistureReadingKey,
  moisturePhotoUrlKey,
  moisturePhotoMetadataKey,
  moisturePhotoLocalUriKey,
  stagePhotoUrlKey,
  stagePhotoLocalUriKey,
  stageCapturedAtKey,
  stageSavedAtKey,
  stagePhotoMetadataKey,
} from "./pyrolysisBatchFlat";
export type {
  MoistureSlot,
  PyrolysisBatchFlatRow,
  PyrolysisBatchLocalRow,
} from "./pyrolysisBatchFlat";
export type {
  PyrolysisSessionStatus,
  PyrolysisStep,
  PyrolysisStageKey,
  PyrolysisKontikkiWorkflowSection,
  FieldPhotoMetadata,
  MoistureReading,
  PyrolysisStagePhoto,
  PyrolysisStagePhotos,
  PyrolysisKontikkiData,
  PyrolysisKontikkiOption,
  PyrolysisBatchRecord,
  StartPyrolysisSessionPayload,
  PyrolysisSessionRecord,
  PyrolysisSessionKontikkiRecord,
} from "./pyrolysis";
export {
  PYROLYSIS_BATCH_STATUS_VALUES,
  PYROLYSIS_BATCH_STATUS_FLAG_VALUES,
  PYROLYSIS_BATCH_STATUS_TARGET_TYPES,
  PYROLYSIS_BATCH_STATUS_SECTION_KEYS,
  PYROLYSIS_BATCH_STATUS_PHOTO_KEYS,
  isPyrolysisBatchStatusSectionKey,
  isPyrolysisBatchStatusPhotoKey,
  pyrolysisBatchStatusPhotoLabel,
  pyrolysisBatchStatusSectionLabel,
  pyrolysisBatchStatusValueLabel,
  pyrolysisBatchStatusFlagValueLabel,
  photosForBatchStatusSection,
} from "./pyrolysisBatchStatus";
export type {
  PyrolysisBatchStatusValue,
  PyrolysisBatchStatusFlagValue,
  PyrolysisBatchStatusTargetType,
  PyrolysisBatchStatusSectionKey,
  PyrolysisBatchStatusPhotoKey,
  PyrolysisBatchStatusFlag,
  PyrolysisBatchStatusRecord,
  SubmitPyrolysisBatchStatusPayload,
  UpdatePyrolysisBatchYieldPayload,
} from "./pyrolysisBatchStatus";
export {
  MIXING_MATERIAL_TYPES,
  MIXING_MATERIAL_LABELS,
  MIXING_ENTRY_SUBMISSION_STATUS,
  mixingMaterialLabel,
} from "./mixing";
export type {
  MixingMaterialType,
  MixingEntrySubmissionStatus,
  MixingPyrolysisLinkRecord,
  MixingEntryRecord,
  AvailableMixingPyrolysisBatch,
  PyrolysisBatchMixingEntrySummary,
  CreateMixingEntryPayload,
} from "./mixing";
export {
  MIXING_ENTRY_REVIEW_STATUS_VALUES,
  MIXING_ENTRY_REVIEW_DECISION_VALUES,
  MIXING_ENTRY_PHOTO_KEYS,
  mixingEntryReviewStatusLabel,
  mixingEntryPhotoLabel,
  isMixingEntryPhotoKey,
} from "./mixingEntryStatus";
export type {
  MixingEntryReviewStatus,
  MixingEntryReviewDecision,
  MixingEntryPhotoKey,
  MixingEntryPhotoFlag,
  MixingEntryStatusRecord,
  SubmitMixingEntryStatusPayload,
} from "./mixingEntryStatus";
export {
  APPLICATION_MEDIA_TYPES,
  applicationMediaTypeLabel,
} from "./application";
export type {
  ApplicationMediaType,
  ApplicationEntrySubmissionStatus,
  ApplicationPyrolysisLinkRecord,
  ApplicationEntryRecord,
  AvailableApplicationPyrolysisBatch,
  CreateApplicationEntryPayload,
} from "./application";
export {
  APPLICATION_ENTRY_REVIEW_STATUS_VALUES,
  APPLICATION_ENTRY_REVIEW_DECISION_VALUES,
  APPLICATION_ENTRY_MEDIA_KEYS,
  applicationEntryReviewStatusLabel,
  isApplicationEntryMediaKey,
} from "./applicationEntryStatus";
export type {
  ApplicationEntryReviewStatus,
  ApplicationEntryReviewDecision,
  ApplicationEntryMediaKey,
  ApplicationEntryMediaFlag,
  ApplicationEntryStatusRecord,
  SubmitApplicationEntryStatusPayload,
} from "./applicationEntryStatus";
