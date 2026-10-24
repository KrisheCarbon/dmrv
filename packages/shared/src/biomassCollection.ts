import {
  distanceMeters,
  nearestBoundaryDistanceMeters,
  type GeoPoint,
} from "./farmersNetwork";
import type { FieldPhotoMetadata } from "./pyrolysis";

/** Shown beside both photos in the app and on the portal. */
export const BIOMASS_COLLECTION_TRACTOR_NOTICE =
  "The tractor number must be clearly visible in this photo.";

/**
 * Ideal distance from the loaded-photo GPS to the farm polygon.
 * Farther than this is flagged on the admin dashboard. It does not block collection.
 */
export const BIOMASS_COLLECTION_MAX_DISTANCE_M = 1000;

/** Onboarded farm the biomass module can select. Only farms with a mapped plot. */
export interface BiomassFarmOption {
  id: string;
  farmer_name: string;
  village?: string | null;
  cluster_name?: string | null;
  boundaries: GeoPoint[][];
}

export interface FarmPhotoDistance {
  short: string;
  detail: string;
  outsideLimit: boolean;
  distanceM: number | null;
}

export const BIOMASS_COLLECTION_STATUSES = ["submitted"] as const;

export type BiomassCollectionStatus = (typeof BIOMASS_COLLECTION_STATUSES)[number];

export interface BiomassCollectionRecord {
  id: string;
  operator_id: string;
  operator_name?: string | null;
  farm_id?: string | null;
  farm_name?: string | null;
  farm_field_id?: string | null;
  field_code?: string | null;
  /** Acres of the selected farm plot, from its mapped polygon. */
  farm_area_acres?: number | null;
  producer_id?: string | null;
  producer_name?: string | null;
  tractor_number?: string | null;
  loaded_at: string;
  loaded_photo_url: string;
  loaded_photo_metadata?: FieldPhotoMetadata | null;
  unloaded_at: string;
  unloaded_photo_url: string;
  unloaded_photo_metadata?: FieldPhotoMetadata | null;
  /** Metres from the loaded-photo GPS to the nearest edge of the farm polygon. 0 is inside. */
  loaded_distance_from_farm_m?: number | null;
  /** False when the selected farm has no active mapped plot. */
  farm_has_mapped_boundary?: boolean;
  status: BiomassCollectionStatus;
  created_at?: string;
  updated_at?: string;
}

export interface CreateBiomassCollectionPayload {
  farm_id: string;
  farm_name?: string | null;
  farm_field_id: string;
  field_code?: string | null;
  producer_id: string;
  producer_name?: string | null;
  tractor_number?: string | null;
  loaded_at: string;
  loaded_photo_url: string;
  loaded_photo_metadata?: FieldPhotoMetadata | null;
  unloaded_at: string;
  unloaded_photo_url: string;
  unloaded_photo_metadata?: FieldPhotoMetadata | null;
}

function finiteCoord(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatMetres(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km.toFixed(km >= 10 ? 0 : 1)} km`;
}

/** Words for the dashboard and the field alert. Distance comes from the photo GPS. */
export function describeFarmPhotoDistance(
  distanceM: number | null | undefined,
  options?: { hasBoundary?: boolean; hasGps?: boolean },
): FarmPhotoDistance {
  if (options?.hasGps === false) {
    return {
      short: "No GPS",
      detail: "The loaded photo has no GPS location.",
      outsideLimit: false,
      distanceM: null,
    };
  }
  if (options?.hasBoundary === false) {
    return {
      short: "No boundary",
      detail: "This farm has no mapped boundary, so the distance cannot be checked.",
      outsideLimit: false,
      distanceM: null,
    };
  }
  if (distanceM == null || !Number.isFinite(distanceM)) {
    return {
      short: "Unknown",
      detail: "Distance from the farm could not be calculated.",
      outsideLimit: false,
      distanceM: null,
    };
  }
  if (distanceM === 0) {
    return {
      short: "Inside farm",
      detail: "Collected inside the farm polygon.",
      outsideLimit: false,
      distanceM: 0,
    };
  }
  const place = formatMetres(distanceM);
  const outsideLimit = distanceM > BIOMASS_COLLECTION_MAX_DISTANCE_M;
  return {
    short: outsideLimit ? `${place} · outside 1 km` : place,
    detail: `Collected ${place} from the farm polygon.`,
    outsideLimit,
    distanceM,
  };
}

export interface BiomassTravelDistance {
  short: string;
  detail: string;
  distanceM: number | null;
}

/** Straight-line distance from the loaded-photo GPS to the unloaded-photo GPS. */
export function biomassTravelSummary(input: {
  loaded?: FieldPhotoMetadata | null;
  unloaded?: FieldPhotoMetadata | null;
}): BiomassTravelDistance {
  const fromLat = finiteCoord(input.loaded?.latitude);
  const fromLng = finiteCoord(input.loaded?.longitude);
  const toLat = finiteCoord(input.unloaded?.latitude);
  const toLng = finiteCoord(input.unloaded?.longitude);
  if (fromLat == null || fromLng == null || toLat == null || toLng == null) {
    return {
      short: "—",
      detail: "Both photos need a GPS location before the distance travelled can be measured.",
      distanceM: null,
    };
  }
  const distanceM = distanceMeters(
    { latitude: fromLat, longitude: fromLng },
    { latitude: toLat, longitude: toLng },
  );
  const place = formatMetres(distanceM);
  return {
    short: place,
    detail: `The tractor travelled ${place} in a straight line from the loaded photo to the unloaded photo.`,
    distanceM,
  };
}

export type LoadedPhotoFarmCheck =
  | { ok: true; distanceM: number }
  | { ok: false; title: string; message: string };

/**
 * Whether a loaded photo has a GPS fix and a mapped farm polygon.
 * Distance beyond 1 km is allowed; the admin dashboard flags it.
 */
export function checkLoadedPhotoNearFarm(input: {
  farmName?: string | null;
  boundaries: GeoPoint[][];
  latitude?: number | null;
  longitude?: number | null;
}): LoadedPhotoFarmCheck {
  const latitude = finiteCoord(input.latitude);
  const longitude = finiteCoord(input.longitude);
  if (latitude == null || longitude == null) {
    return {
      ok: false,
      title: "Location required",
      message: "The loaded photo has no GPS location. Turn location on and take it again.",
    };
  }
  if (input.boundaries.length === 0) {
    return {
      ok: false,
      title: "Farm boundary missing",
      message:
        "This farm has no mapped boundary. Select an onboarded farm whose plot has been drawn.",
    };
  }
  const distanceM = nearestBoundaryDistanceMeters({ latitude, longitude }, input.boundaries);
  if (distanceM == null) {
    return {
      ok: false,
      title: "Farm boundary missing",
      message:
        "This farm has no mapped boundary. Select an onboarded farm whose plot has been drawn.",
    };
  }
  return { ok: true, distanceM };
}
