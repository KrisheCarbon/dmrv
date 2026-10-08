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
  const ext = localUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
  const contentType =
    ext === "png"
      ? "image/png"
      : ext === "mp4" || ext === "mov" || ext === "m4v"
        ? "video/mp4"
        : "image/jpeg";

  const { error } = await supabase.storage
    .from(PYROLYSIS_BUCKET)
    .upload(storagePath, arrayBuffer, { contentType, upsert: true });

  if (error) {
    // A finished upload locks the object. A retry must keep that file
    // instead of failing the whole batch sync.
    if (/row-level security/i.test(error.message)) {
      const { error: readError } = await supabase.storage
        .from(PYROLYSIS_BUCKET)
        .download(storagePath);
      if (!readError) {
        const { data } = supabase.storage.from(PYROLYSIS_BUCKET).getPublicUrl(storagePath);
        return data.publicUrl;
      }
    }
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

  if (data.kiln_photo_local_uri) {
    next.kiln_photo_url = await uploadLocalPhoto(
      data.kiln_photo_local_uri,
      data.kiln_photo_url,
      buildPyrolysisPhotoPath(serverBatchId, "kiln", {
        ext: photoExt(data.kiln_photo_local_uri),
      }),
    );
  }

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

  if (localBatchId) {
    await applyBatchPayload(localBatchId, next);
  }
  return next;
}

export async function uploadRainbowPhotos(
  serverBatchId: string,
  data: PyrolysisKontikkiData,
  loads: Array<{
    id: string;
    sequence: number;
    photo_local_uri?: string | null;
    photo_url?: string | null;
    photo_metadata?: PyrolysisKontikkiData["feedstock_photo_metadata"];
    captured_at?: string | null;
    note?: string | null;
  }>,
): Promise<{
  data: PyrolysisKontikkiData;
  loads: typeof loads;
}> {
  const next = await uploadPyrolysisBatchPhotos(serverBatchId, "", data);
  const nextLoads = await Promise.all(
    loads.map(async (load, index) => {
      if (!load.photo_local_uri) return load;
      const photoUrl = await uploadLocalPhoto(
        load.photo_local_uri,
        load.photo_url,
        buildPyrolysisPhotoPath(serverBatchId, "biomass_load", {
          index: load.sequence || index + 1,
          ext: photoExt(load.photo_local_uri),
        }),
      );
      return { ...load, photo_url: photoUrl };
    }),
  );
  if (next.flame_curtain_photo_local_uri) {
    next.flame_curtain_photo_url = await uploadLocalPhoto(
      next.flame_curtain_photo_local_uri,
      next.flame_curtain_photo_url,
      buildPyrolysisPhotoPath(serverBatchId, "stage", {
        stage: "flame_curtain",
        ext: photoExt(next.flame_curtain_photo_local_uri),
      }),
    );
  }
  const withQuench = await uploadRainbowQuenchMedia(serverBatchId, next);
  const spots = await Promise.all(
    (withQuench.sample_spots ?? []).map(async (spot) => {
      if (!spot.photo_local_uri) return spot;
      const photoUrl = await uploadLocalPhoto(
        spot.photo_local_uri,
        spot.photo_url,
        buildPyrolysisPhotoPath(serverBatchId, "sample_spot", {
          index: spot.spot,
          ext: photoExt(spot.photo_local_uri),
        }),
      );
      return { ...spot, photo_url: photoUrl };
    }),
  );
  const pileUrl = withQuench.sample_pile_photo_local_uri
    ? await uploadLocalPhoto(
        withQuench.sample_pile_photo_local_uri,
        withQuench.sample_pile_photo_url,
        buildPyrolysisPhotoPath(serverBatchId, "sample_pile", {
          ext: photoExt(withQuench.sample_pile_photo_local_uri),
        }),
      )
    : withQuench.sample_pile_photo_url ?? null;
  const bagUrl = withQuench.sample_bag_photo_local_uri
    ? await uploadLocalPhoto(
        withQuench.sample_bag_photo_local_uri,
        withQuench.sample_bag_photo_url,
        buildPyrolysisPhotoPath(serverBatchId, "sample_bag", {
          ext: photoExt(withQuench.sample_bag_photo_local_uri),
        }),
      )
    : withQuench.sample_bag_photo_url ?? null;
  return {
    data: {
      ...withQuench,
      sample_spots: spots,
      sample_pile_photo_url: pileUrl,
      sample_bag_photo_url: bagUrl,
    },
    loads: nextLoads,
  };
}

export async function uploadRainbowQuenchMedia(
  serverBatchId: string,
  data: PyrolysisKontikkiData,
): Promise<PyrolysisKontikkiData> {
  const photos = await Promise.all(
    (data.quench_photos ?? []).map(async (photo, index) => {
      if (!photo.photo_local_uri) return photo;
      const photoUrl = await uploadLocalPhoto(
        photo.photo_local_uri,
        photo.photo_url,
        buildPyrolysisPhotoPath(serverBatchId, "quench", {
          index: index + 1,
          ext: photoExt(photo.photo_local_uri),
        }),
      );
      return { ...photo, photo_url: photoUrl };
    }),
  );
  const videoUrl = data.quench_video_local_uri
    ? await uploadLocalPhoto(
        data.quench_video_local_uri,
        data.quench_video_url,
        buildPyrolysisPhotoPath(serverBatchId, "quench_video", {
          ext: photoExt(data.quench_video_local_uri),
        }),
      )
    : data.quench_video_url ?? null;
  const first = photos.find((photo) => photo.photo_local_uri || photo.photo_url);
  const last = [...photos].reverse().find((photo) => photo.photo_local_uri || photo.photo_url);
  return {
    ...data,
    quench_photos: photos,
    quench_video_url: videoUrl,
    quench_start_photo_url: photos.length >= 1 ? first?.photo_url ?? null : data.quench_start_photo_url,
    quench_start_photo_metadata: photos.length >= 1 ? first?.photo_metadata ?? null : data.quench_start_photo_metadata,
    quench_end_photo_url: photos.length >= 2 ? last?.photo_url ?? null : data.quench_end_photo_url,
    quench_end_photo_metadata: photos.length >= 2 ? last?.photo_metadata ?? null : data.quench_end_photo_metadata,
  };
}
