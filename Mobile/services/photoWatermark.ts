import type { FieldPhotoMetadata } from "@krishecarbon/shared";
import type { PhotoWatermarkHandle } from "../components/PhotoWatermarkProcessor";
import { persistPyrolysisPhoto } from "../utils/pyrolysisLocalPhotos";

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
  return persistPyrolysisPhoto(sourceUri);
}
