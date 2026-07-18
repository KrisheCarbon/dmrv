import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import type { FieldPhotoMetadata } from "@krishecarbon/shared";
import { getLocationForPhotoCapture } from "./locationCache";
import { getCurrentIST } from "./trustedtime";

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

export async function captureFieldPhotoFromCamera(): Promise<CapturedFieldPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error(
      "Camera permission is required. Open Settings and allow camera access for KC.",
    );
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.85,
    exif: true,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const location = getLocationForPhotoCapture();

  const capturedAt = currentTimestamp();

  const metadata: FieldPhotoMetadata = {
    captured_at: capturedAt,
    latitude: location?.lat ?? 0,
    longitude: location?.lng ?? 0,
    address: location?.address ?? null,
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

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["videos"],
    quality: 0.85,
    videoMaxDuration: 120,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const location = getLocationForPhotoCapture();
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
  return { uri: persistedUri, metadata };
}
