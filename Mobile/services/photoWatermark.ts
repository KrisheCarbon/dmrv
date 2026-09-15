import type { FieldPhotoMetadata } from "@krishecarbon/shared";
import type { PhotoWatermarkHandle } from "../components/PhotoWatermarkProcessor";
import { persistPyrolysisPhoto } from "../utils/pyrolysisLocalPhotos";
import { savePhotoToGallery } from "./permissions";
import { captureFieldPhotoFromCamera } from "./fieldPhoto";

let watermarkHandle: PhotoWatermarkHandle | null = null;

export function registerPhotoWatermarkHandle(handle: PhotoWatermarkHandle | null) {
  watermarkHandle = handle;
}

export async function watermarkFieldPhotoForReview(
  sourceUri: string,
  metadata: FieldPhotoMetadata,
): Promise<string> {
  if (!watermarkHandle) {
    throw new Error("Photo watermark is not ready. Reopen this screen and try again.");
  }

  return watermarkHandle.watermark(sourceUri, metadata);
}

export async function watermarkAndPersistFieldPhoto(
  sourceUri: string,
  metadata: FieldPhotoMetadata,
): Promise<string> {
  const watermarkedUri = await watermarkFieldPhotoForReview(sourceUri, metadata);
  return persistPyrolysisPhoto(watermarkedUri);
}

export async function persistAcceptedFieldPhoto(sourceUri: string): Promise<string> {
  const persistedUri = await persistPyrolysisPhoto(sourceUri);
  // Fire-and-forget: the watermarked photo (with GPS/time overlay) should
  // also land in the phone's own Gallery, not just the app's private
  // storage, so field staff can find/share it like any other photo.
  void savePhotoToGallery(persistedUri);
  return persistedUri;
}

export type CapturedAndWatermarkedPhoto = {
  uri: string;
  metadata: FieldPhotoMetadata;
};

/**
 * One-shot capture flow: opens the camera, waits for the GPS/time
 * watermark to be baked into the photo, then saves the *watermarked*
 * photo to the app's local storage and the phone's Gallery. There is no
 * separate accept/reject or preview step — the user only interacts with
 * the native camera UI and, on success, sees the finished photo.
 *
 * Returns `null` if the user cancelled the native camera. Throws if
 * permissions are missing or the location/time watermark could not be
 * resolved (see `LocationUnavailableError` in `./fieldPhoto`).
 */
export async function captureAndSaveFieldPhoto(): Promise<CapturedAndWatermarkedPhoto | null> {
  const raw = await captureFieldPhotoFromCamera();
  if (!raw) return null;

  const watermarkedUri = await watermarkFieldPhotoForReview(raw.uri, raw.metadata);
  const persistedUri = await persistAcceptedFieldPhoto(watermarkedUri);

  return { uri: persistedUri, metadata: raw.metadata };
}
