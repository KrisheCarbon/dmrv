import type { ApplicationEntryStatusRecord } from "./applicationEntryStatus";
import {
  boundaryPointsToGeojson,
  distanceToPolygonMeters,
  isPointInPolygon,
  parseBoundaryGeojson,
  polygonAreaAcres,
  type GeoPoint,
} from "./farmersNetwork";
import type { FieldPhotoMetadata } from "./pyrolysis";

/** A photo may sit just outside the drawn farm edge because of GPS error. */
export const APPLICATION_FARM_EDGE_TOLERANCE_M = 30;

/** The photo does not have to be inside the applied area, but it must be this close. */
export const APPLICATION_PHOTO_NEAR_APPLIED_M = 100;

export const APPLICATION_MEDIA_TYPES = ["photo", "video"] as const;

export type ApplicationMediaType = (typeof APPLICATION_MEDIA_TYPES)[number];

export const APPLICATION_ENTRY_SUBMISSION_STATUS = ["submitted"] as const;

export type ApplicationEntrySubmissionStatus =
  (typeof APPLICATION_ENTRY_SUBMISSION_STATUS)[number];

export interface ApplicationPyrolysisLinkRecord {
  pyrolysis_batch_id: string;
  kontikki_code?: string | null;
  batch_number?: string | null;
  producer_name?: string | null;
}

/** One mapped plot on an onboarded farmer. */
export interface ApplicationFarmFieldOption {
  id: string;
  field_code: string;
  boundary: GeoPoint[];
  area_acres: number;
}

/** Onboarded farmer, with the plots whose boundaries have been drawn. */
export interface ApplicationFarmerOption {
  id: string;
  farmer_name: string;
  village?: string | null;
  cluster_name?: string | null;
  fields: ApplicationFarmFieldOption[];
}

export interface ApplicationEntryRecord {
  id: string;
  operator_id: string;
  applied_at: string;
  farm_id?: string | null;
  farm_name?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_address?: string | null;
  farm_field_id?: string | null;
  field_code?: string | null;
  application_boundary?: GeoPoint[] | null;
  farm_area_acres?: number | null;
  application_area_acres?: number | null;
  photo_inside_farm?: boolean | null;
  photo_distance_from_applied_m?: number | null;
  comment?: string | null;
  media_type: ApplicationMediaType;
  media_url?: string | null;
  media_metadata?: FieldPhotoMetadata | null;
  status: ApplicationEntrySubmissionStatus;
  entry_status?: ApplicationEntryStatusRecord | null;
  pyrolysis_links: ApplicationPyrolysisLinkRecord[];
  created_at?: string;
  updated_at?: string;
}

export interface AvailableApplicationPyrolysisBatch {
  id: string;
  batch_number?: string | null;
  kontikki_id: string;
  kontikki_code: string;
  producer_id?: string | null;
  producer_name?: string | null;
  session_completed_at?: string | null;
  yield_percent?: number | null;
}

export interface CreateApplicationEntryPayload {
  applied_at: string;
  farm_id?: string | null;
  farm_name?: string | null;
  farm_field_id?: string | null;
  field_code?: string | null;
  application_boundary?: GeoPoint[] | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_address?: string | null;
  comment?: string | null;
  media_type: ApplicationMediaType;
  media_url?: string | null;
  media_metadata?: FieldPhotoMetadata | null;
  pyrolysis_batch_ids: string[];
}

export function applicationMediaTypeLabel(type: ApplicationMediaType | string): string {
  return type === "video" ? "Video" : "Photo";
}

export function formatApplicationAcres(acres?: number | null): string {
  if (acres == null || !Number.isFinite(acres) || acres <= 0) return "—";
  return `${acres.toFixed(2)} acres`;
}

function formatMetres(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km.toFixed(km >= 10 ? 0 : 1)} km`;
}

function pointWithinFarm(point: GeoPoint, farm: GeoPoint[], toleranceM: number): boolean {
  if (farm.length < 3) return false;
  if (isPointInPolygon(point, farm)) return true;
  const distance = distanceToPolygonMeters(point, farm);
  return distance != null && distance <= toleranceM;
}

/** True when the drawn applied area stays inside the farm plot. */
export function applicationPolygonInsideFarm(
  applied: GeoPoint[],
  farm: GeoPoint[],
  toleranceM = APPLICATION_FARM_EDGE_TOLERANCE_M,
): boolean {
  if (applied.length < 3 || farm.length < 3) return false;
  const samples = applied.slice();
  for (let i = 0; i < applied.length; i += 1) {
    const start = applied[i];
    const end = applied[(i + 1) % applied.length];
    samples.push({
      latitude: (start.latitude + end.latitude) / 2,
      longitude: (start.longitude + end.longitude) / 2,
    });
  }
  return samples.every((point) => pointWithinFarm(point, farm, toleranceM));
}

export function applicationBoundaryGeojson(points: GeoPoint[]): string | null {
  return boundaryPointsToGeojson(points);
}

export function applicationBoundaryPoints(
  value: string | Record<string, unknown> | null | undefined,
): GeoPoint[] {
  return parseBoundaryGeojson(value);
}

export function applicationAreaAcres(points: GeoPoint[]): number | null {
  if (points.length < 3) return null;
  const acres = polygonAreaAcres(points);
  return acres > 0 ? acres : null;
}

export type ApplicationPhotoCheck =
  | { ok: true; appliedDistanceM: number; insideFarm: true }
  | { ok: false; title: string; message: string; insideFarm: boolean; appliedDistanceM: number | null };

/** Photo GPS must be inside the farm and within 100 m of the applied area. */
export function checkApplicationPhoto(input: {
  farmBoundary: GeoPoint[];
  appliedBoundary: GeoPoint[];
  latitude?: number | null;
  longitude?: number | null;
}): ApplicationPhotoCheck {
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      ok: false,
      title: "Location required",
      message: "This photo has no GPS location. Turn location on and take it again inside the farm.",
      insideFarm: false,
      appliedDistanceM: null,
    };
  }
  if (input.farmBoundary.length < 3) {
    return {
      ok: false,
      title: "Farm boundary missing",
      message: "This farm has no mapped boundary. Select a farm whose plot has been drawn.",
      insideFarm: false,
      appliedDistanceM: null,
    };
  }
  if (input.appliedBoundary.length < 3) {
    return {
      ok: false,
      title: "Draw the applied area",
      message: "Draw where the biochar was applied before taking the photo.",
      insideFarm: false,
      appliedDistanceM: null,
    };
  }

  const point = { latitude, longitude };
  if (!pointWithinFarm(point, input.farmBoundary, APPLICATION_FARM_EDGE_TOLERANCE_M)) {
    const distance = distanceToPolygonMeters(point, input.farmBoundary);
    const place = distance == null ? "outside the farm" : `${formatMetres(distance)} outside the farm`;
    return {
      ok: false,
      title: "Outside the farm",
      message: `This photo is ${place}. Take it inside the farm boundary.`,
      insideFarm: false,
      appliedDistanceM: null,
    };
  }

  const appliedDistance = distanceToPolygonMeters(point, input.appliedBoundary);
  if (appliedDistance == null || appliedDistance > APPLICATION_PHOTO_NEAR_APPLIED_M) {
    const place =
      appliedDistance == null ? "away from the applied area" : `${formatMetres(appliedDistance)} from the applied area`;
    return {
      ok: false,
      title: "Too far from the applied area",
      message: `This photo is ${place}. It must be inside the farm and within 100 m of where the biochar was applied.`,
      insideFarm: true,
      appliedDistanceM: appliedDistance ?? null,
    };
  }

  return { ok: true, appliedDistanceM: appliedDistance, insideFarm: true };
}

export function describeApplicationPhoto(input: {
  insideFarm?: boolean | null;
  distanceM?: number | null;
  hasBoundary?: boolean;
  hasGps?: boolean;
}): { short: string; detail: string } {
  if (input.hasGps === false) {
    return { short: "No GPS", detail: "The application photo has no GPS location." };
  }
  if (input.hasBoundary === false) {
    return {
      short: "No area drawn",
      detail: "No applied area was drawn for this entry.",
    };
  }
  if (input.insideFarm === false) {
    return {
      short: "Outside farm",
      detail: "The photo was taken outside the farm boundary.",
    };
  }
  if (input.distanceM == null || !Number.isFinite(input.distanceM)) {
    return { short: "Unknown", detail: "Distance from the applied area could not be calculated." };
  }
  if (input.distanceM === 0) {
    return {
      short: "Inside applied area",
      detail: "The photo was taken inside the farm and inside the area where biochar was applied.",
    };
  }
  const place = formatMetres(input.distanceM);
  const near = input.distanceM <= APPLICATION_PHOTO_NEAR_APPLIED_M;
  return {
    short: near ? `${place} from applied area` : `${place} · outside 100 m`,
    detail: near
      ? `The photo was taken inside the farm, ${place} from the area where biochar was applied.`
      : `The photo was taken ${place} from the applied area, farther than the 100 m limit.`,
  };
}
