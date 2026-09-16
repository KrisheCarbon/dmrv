/** Farmers Network — fields, soil samples, consent, and land helpers. */

/** 1 hectare = 2.47105 acres. Field area is always entered in acres. */
export const ACRES_PER_HECTARE = 2.47105;

export function acresToHectares(acres: number): number {
  if (!Number.isFinite(acres) || acres <= 0) return 0;
  return acres / ACRES_PER_HECTARE;
}

export function hectaresToAcres(hectares: number): number {
  if (!Number.isFinite(hectares) || hectares <= 0) return 0;
  return hectares * ACRES_PER_HECTARE;
}

/** True when plot area is strictly more than 1 hectare. */
export function isOverOneHectare(acres: number): boolean {
  return Number(acres) > ACRES_PER_HECTARE;
}

export function formatHectaresFromAcres(acres: number, digits = 2): string {
  return acresToHectares(acres).toFixed(digits);
}

export const FIELD_OWNERSHIP_TYPES = ["Owned", "Leased"] as const;
export type FieldOwnershipType = (typeof FIELD_OWNERSHIP_TYPES)[number];

export const FIELD_STATUS_VALUES = ["active", "inactive"] as const;
export type FieldStatusValue = (typeof FIELD_STATUS_VALUES)[number];

export const FIELD_SEASONS = ["Kharif", "Rabi", "Zaid", "Annual"] as const;
export type FieldSeason = (typeof FIELD_SEASONS)[number];

export const FIELD_WATER_SOURCES = [
  "Borewell",
  "Canal",
  "Rainfed",
  "Tank / pond",
  "River",
  "Other",
] as const;

export const SOIL_TEST_STATUS_VALUES = [
  "collected",
  "submitted",
  "stored",
  "accepted",
  "rejected",
  "received",
  "reported",
] as const;
export type SoilTestStatus = (typeof SOIL_TEST_STATUS_VALUES)[number];

export type SoilSampleTone = "none" | "collected" | "rejected" | "accepted";

export function soilTestStatusLabel(status: string | null | undefined): string {
  if (status === "reported") return "Report ready";
  if (status === "accepted" || status === "received") return "Accepted";
  if (status === "rejected") return "Rejected";
  if (status === "stored") return "Stored";
  if (status === "submitted") return "Submitted to supervisor";
  if (status === "collected") return "Collected";
  return "Not started";
}

/** Farmers-list color: yellow = collected/pending, red = rejected, green = accepted. */
export function soilSampleToneFromStatuses(
  statuses: Array<string | null | undefined>,
): SoilSampleTone {
  const list = statuses.filter((status): status is string => Boolean(status));
  if (list.length === 0) return "none";
  if (list.includes("rejected")) return "rejected";
  if (list.some((status) => status === "collected")) return "collected";
  if (list.some((status) => status === "submitted" || status === "stored")) {
    return "collected";
  }
  if (
    list.some(
      (status) =>
        status === "accepted" ||
        status === "received" ||
        status === "reported",
    )
  ) {
    return "accepted";
  }
  return "none";
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export function parseBoundaryGeojson(
  value: string | Record<string, unknown> | null | undefined,
): GeoPoint[] {
  if (!value) return [];
  try {
    const parsed =
      typeof value === "string" ? (JSON.parse(value) as Record<string, unknown>) : value;
    const coordinates = parsed?.coordinates as unknown;
    const ring = Array.isArray(coordinates) ? coordinates[0] : null;
    if (!Array.isArray(ring)) return [];
    const points: GeoPoint[] = [];
    for (const pair of ring) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const longitude = Number(pair[0]);
      const latitude = Number(pair[1]);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      points.push({ latitude, longitude });
    }
    if (points.length >= 2) {
      const first = points[0];
      const last = points[points.length - 1];
      if (first.latitude === last.latitude && first.longitude === last.longitude) {
        points.pop();
      }
    }
    return points;
  } catch {
    return [];
  }
}

export function boundaryPointsToGeojson(points: GeoPoint[]): string | null {
  if (points.length < 3) return null;
  const ring = points.map((point) => [point.longitude, point.latitude]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([...first]);
  }
  return JSON.stringify({
    type: "Polygon",
    coordinates: [ring],
  });
}

export interface FarmFieldRecord {
  id: string;
  farm_id: string;
  field_code: string;
  ownership_type: FieldOwnershipType | string;
  land_reference?: string | null;
  lease_start?: string | null;
  lease_end?: string | null;
  status: FieldStatusValue | string;
  latitude?: number | null;
  longitude?: number | null;
  boundary_geojson?: string | Record<string, unknown> | null;
  calculated_area?: number | null;
  water_source?: string | null;
  photos?: string[];
  notes?: string | null;
  crop_name?: string | null;
  season?: string | null;
  sowing_date?: string | null;
  harvest_date?: string | null;
  crop_photos?: string[];
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  farm?: {
    id: string;
    farmer_name?: string | null;
    total_land_size?: number | null;
  } | null;
}

export interface FarmFieldUpsertPayload {
  id?: string;
  farm_id: string;
  field_code?: string;
  ownership_type: FieldOwnershipType | string;
  land_reference?: string | null;
  lease_start?: string | null;
  lease_end?: string | null;
  status?: FieldStatusValue | string;
  latitude?: number | null;
  longitude?: number | null;
  boundary_geojson?: string | Record<string, unknown> | null;
  calculated_area?: number | null;
  water_source?: string | null;
  photos?: string[];
  notes?: string | null;
  crop_name?: string | null;
  season?: string | null;
  sowing_date?: string | null;
  harvest_date?: string | null;
  crop_photos?: string[];
}

export interface FarmerConsentRecord {
  id: string;
  farm_id: string;
  agreement_type: string;
  consent_status: string;
  consent_date: string;
  valid_from?: string | null;
  valid_to: string;
  agreement_reference?: string | null;
  photos?: string[];
  evidence_notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  farm?: {
    id: string;
    farmer_name?: string | null;
  } | null;
}

export interface FarmerConsentUpsertPayload {
  id?: string;
  farm_id: string;
  agreement_type?: string;
  consent_status?: string;
  consent_date?: string;
  valid_from?: string | null;
  valid_to: string;
  agreement_reference?: string | null;
  photos?: string[];
  evidence_notes?: string | null;
}

export interface SoilReportRecord {
  id: string;
  farm_id: string;
  soil_test_id?: string | null;
  report_date: string;
  source?: string | null;
  results_summary?: string | null;
  document_url?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SoilTestRecord {
  id: string;
  farm_id: string;
  field_ids: string[];
  sample_date: string;
  sample_lat?: number | null;
  sample_lng?: number | null;
  sample_photo_url?: string | null;
  receive_photo_url?: string | null;
  submitted_to_supervisor_id?: string | null;
  collected_by?: string | null;
  collected_by_role?: string | null;
  status: SoilTestStatus | string;
  received_at?: string | null;
  received_by?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  farm?: {
    id: string;
    farmer_name?: string | null;
    village?: string | null;
  } | null;
  fields?: Array<{
    id: string;
    field_code?: string | null;
    calculated_area?: number | null;
  }>;
  submitted_to_supervisor?: {
    id: string;
    full_name?: string | null;
  } | null;
  collected_by_user?: {
    id: string;
    full_name?: string | null;
  } | null;
  received_by_user?: {
    id: string;
    full_name?: string | null;
  } | null;
  reports?: SoilReportRecord[];
}

export interface SoilTestUpsertPayload {
  id?: string;
  farm_id: string;
  field_ids: string[];
  sample_date?: string;
  sample_lat?: number | null;
  sample_lng?: number | null;
  sample_photo_url?: string | null;
  submitted_to_supervisor_id?: string | null;
  status?: string;
}

export interface SoilTestReviewPayload {
  decision: "accept" | "reject" | "store";
  receive_photo_url?: string | null;
}

export interface SoilTestSubmitPayload {
  submitted_to_supervisor_id: string;
}

export interface SoilTestReportPayload {
  document_url: string;
  report_date?: string;
  source?: string | null;
  results_summary?: string | null;
}

export interface SoilTestFormOptions {
  farms: Array<{
    id: string;
    farmer_name: string;
    village?: string | null;
  }>;
  supervisors: Array<{
    id: string;
    full_name: string;
  }>;
}

export const FARMER_NETWORK_PHOTOS_BUCKET = "farmer-network-photos";
export const SOIL_REPORTS_BUCKET = "soil-reports";

/** New-format profile: name, mobile, and a cluster village. */
export function isFarmerProfileComplete(farmer: {
  farmer_name?: string | null;
  farmerName?: string | null;
  mobile_number?: string | null;
  mobileNumber?: string | null;
  address?: string | null;
  village?: string | null;
  cluster_village_id?: string | null;
  clusterVillageId?: string | null;
}): boolean {
  const name = (farmer.farmer_name ?? farmer.farmerName ?? "").trim();
  const mobile = String(farmer.mobile_number ?? farmer.mobileNumber ?? "").trim();
  const clusterVillage = String(
    farmer.cluster_village_id ?? farmer.clusterVillageId ?? "",
  ).trim();
  return Boolean(name && mobile && clusterVillage);
}
