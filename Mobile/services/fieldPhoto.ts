import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import type { FieldPhotoMetadata, LocationValue } from "@krishecarbon/shared";
import {
  getLocationForPhotoCapture,
  startLocationCache,
} from "./locationCache";
import { getCurrentIST } from "./trustedtime";
import { savePhotoToGallery } from "./permissions";

const APPLICATION_VIDEO_DIR = `${FileSystem.documentDirectory}application-videos/`;

export type CapturedFieldPhoto = {
  uri: string;
  metadata: FieldPhotoMetadata;
};

export type CapturedApplicationVideo = {
  uri: string;
  metadata: FieldPhotoMetadata;
};

function normalizeMediaUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  if (
    uri.startsWith("file://") ||
    uri.startsWith("content://") ||
    uri.startsWith("http://") ||
    uri.startsWith("https://")
  ) {
    return uri;
  }
  return `file://${uri}`;
}

async function persistApplicationVideo(localUri: string): Promise<string> {
  const normalized = normalizeMediaUri(localUri);
  if (!normalized) {
    throw new Error("Invalid video path.");
  }

  if (normalized.startsWith(APPLICATION_VIDEO_DIR)) {
    return normalized;
  }

  await FileSystem.makeDirectoryAsync(APPLICATION_VIDEO_DIR, { intermediates: true });

  const ext = normalized.split(".").pop()?.split("?")[0] || "mp4";
  const destination = `${APPLICATION_VIDEO_DIR}video_${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: normalized, to: destination });

  return destination;
}

function currentTimestamp(): string {
  try {
    return getCurrentIST();
  } catch {
    return new Date().toISOString();
  }
}

export function formatWatermarkTime(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} IST`;
}

export function formatWatermarkGps(latitude: number, longitude: number): string {
  if (!latitude && !longitude) return "GPS unavailable";
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

/** Thrown when GPS could not be resolved in time for a photo watermark. */
export class LocationUnavailableError extends Error {
  constructor() {
    super(
      "Could not get your location. Make sure GPS/location is turned on, then try again.",
    );
    this.name = "LocationUnavailableError";
  }
}

const LOCATION_WAIT_TIMEOUT_MS = 12000;
const LOCATION_POLL_INTERVAL_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolves the device's current location, waiting (polling the location
 * cache / requesting a fresh fix) for up to `LOCATION_WAIT_TIMEOUT_MS`
 * before giving up. This is used so a captured photo's watermark always
 * has a real GPS fix instead of silently falling back to "0,0".
 */
async function locationForCapture(): Promise<LocationValue | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return null;

  const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => false);
  if (!servicesEnabled) return null;

  void startLocationCache();

  const cached = getLocationForPhotoCapture();
  if (cached) return cached;

  const deadline = Date.now() + LOCATION_WAIT_TIMEOUT_MS;

  const freshFix = Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  })
    .then((position) => ({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    }))
    .catch(() => null);

  while (Date.now() < deadline) {
    const fromCache = getLocationForPhotoCapture();
    if (fromCache) return fromCache;

    const remaining = deadline - Date.now();
    const race = await Promise.race([
      freshFix,
      sleep(Math.min(LOCATION_POLL_INTERVAL_MS, Math.max(remaining, 0))).then(() => "poll" as const),
    ]);

    if (race && race !== "poll") return race;
  }

  return getLocationForPhotoCapture();
}

export async function captureFieldPhotoFromCamera(): Promise<CapturedFieldPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error(
      "Camera permission is required. Open Settings and allow camera access for KC.",
    );
  }

  // Warm up the GPS fix before opening the camera so it's likely ready by
  // the time the user snaps the photo.
  void locationForCapture();

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.85,
    exif: true,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const location = getLocationForPhotoCapture() ?? (await locationForCapture());

  if (!location) {
    throw new LocationUnavailableError();
  }

  const capturedAt = currentTimestamp();

  const metadata: FieldPhotoMetadata = {
    captured_at: capturedAt,
    latitude: location.lat,
    longitude: location.lng,
    address: location.address ?? null,
    device_time_iso: new Date().toISOString(),
    exif: (asset.exif as Record<string, unknown> | undefined) ?? null,
  };

  return { uri: asset.uri, metadata };
}

export async function captureApplicationVideo(): Promise<CapturedApplicationVideo | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error(
      "Camera permission is required. Open Settings and allow camera access for KC.",
    );
  }

  await locationForCapture();

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["videos"],
    quality: 0.85,
    videoMaxDuration: 120,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const location = getLocationForPhotoCapture() ?? (await locationForCapture());
  const capturedAt = currentTimestamp();

  const metadata: FieldPhotoMetadata = {
    captured_at: capturedAt,
    latitude: location?.lat ?? 0,
    longitude: location?.lng ?? 0,
    address: location?.address ?? null,
    device_time_iso: new Date().toISOString(),
    exif: null,
  };

  const persistedUri = await persistApplicationVideo(asset.uri);
  // Best-effort: also drop a copy in the phone's Gallery/Videos app.
  void savePhotoToGallery(persistedUri);
  return { uri: persistedUri, metadata };
}
