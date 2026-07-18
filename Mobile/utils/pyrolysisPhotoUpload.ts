import NetInfo from "@react-native-community/netinfo";
import type { PyrolysisKontikkiData } from "@krishecarbon/shared";
import { PYROLYSIS_STAGE_KEYS } from "@krishecarbon/shared";
import { supabase } from "../services/supabase";
import { canUploadToCloud } from "../services/syncService";
import { applyBatchPayload, assembleBatchPayload } from "../services/batchData";
import { PYROLYSIS_BUCKET, buildPyrolysisPhotoPath } from "./pyrolysisStorage";

async function uploadLocalPhoto(
  localUri: string | null | undefined,
  existingUrl: string | null | undefined,
  storagePath: string,
): Promise<string | null> {
  if (!localUri) return existingUrl ?? null;
  if (localUri.startsWith("http://") || localUri.startsWith("https://")) {
    return localUri;
  }

  const net = await NetInfo.fetch();
  if (!canUploadToCloud(net)) {
    throw new Error(
      "Internet required to upload pyrolysis photos. Connect to Wi‑Fi or mobile data.",
    );
  }

  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();
  const ext = localUri.split(".").pop()?.split("?")[0] || "jpg";
  const contentType = ext === "png" ? "image/png" : "image/jpeg";

  const { error } = await supabase.storage
    .from(PYROLYSIS_BUCKET)
    .upload(storagePath, arrayBuffer, { contentType, upsert: true });

  if (error) {
    const hint =
      error.message?.includes("Bucket not found") ||
      error.message?.includes("not found")
        ? " Pyrolysis photo storage is not configured on the server."
        : "";
    throw new Error(`${error.message}${hint}`);
  }

  const { data } = supabase.storage.from(PYROLYSIS_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

function photoExt(localUri: string | null | undefined): string {
  if (!localUri) return "jpg";
  return localUri.split(".").pop()?.split("?")[0] || "jpg";
}

export async function uploadPyrolysisBatchPhotos(
  serverBatchId: string,
  localBatchId: string,
  data: PyrolysisKontikkiData,
): Promise<PyrolysisKontikkiData> {
  const next: PyrolysisKontikkiData = { ...data };

  if (data.feedstock_photo_local_uri) {
    next.feedstock_photo_url = await uploadLocalPhoto(
      data.feedstock_photo_local_uri,
      data.feedstock_photo_url,
      buildPyrolysisPhotoPath(serverBatchId, "feedstock", {
        ext: photoExt(data.feedstock_photo_local_uri),
      }),
    );
  }

  if (data.feedstock_size_photo_local_uri) {
    next.feedstock_size_photo_url = await uploadLocalPhoto(
      data.feedstock_size_photo_local_uri,
      data.feedstock_size_photo_url,
      buildPyrolysisPhotoPath(serverBatchId, "feedstock_size", {
        ext: photoExt(data.feedstock_size_photo_local_uri),
      }),
    );
  }

  if (data.moisture_readings?.length) {
    next.moisture_readings = await Promise.all(
      data.moisture_readings.map(async (reading, index) => {
        if (!reading.photo_local_uri) return reading;

        const photoUrl = await uploadLocalPhoto(
          reading.photo_local_uri,
          reading.photo_url,
          buildPyrolysisPhotoPath(serverBatchId, "moisture", {
            index: index + 1,
            ext: photoExt(reading.photo_local_uri),
          }),
        );

        return { ...reading, photo_url: photoUrl };
      }),
    );
  }

  if (data.stage_photos) {
    const stagePhotos = { ...data.stage_photos };

    for (const stage of PYROLYSIS_STAGE_KEYS) {
      const photo = stagePhotos[stage];
      if (!photo?.local_uri) continue;

      stagePhotos[stage] = {
        ...photo,
        url: await uploadLocalPhoto(
          photo.local_uri,
          photo.url,
          buildPyrolysisPhotoPath(serverBatchId, "stage", {
            stage,
            ext: photoExt(photo.local_uri),
          }),
        ),
      };
    }

    next.stage_photos = stagePhotos;
  }

  if (data.sample_photo_local_uri) {
    next.sample_photo_url = await uploadLocalPhoto(
      data.sample_photo_local_uri,
      data.sample_photo_url,
      buildPyrolysisPhotoPath(serverBatchId, "sample", {
        ext: photoExt(data.sample_photo_local_uri),
      }),
    );
  }

  await applyBatchPayload(localBatchId, next);
  return next;
}
