import NetInfo from "@react-native-community/netinfo";
import type { ApplicationMediaType } from "@krishecarbon/shared";
import { supabase } from "../services/supabase";
import { canUploadToCloud } from "../services/syncService";
import {
  APPLICATION_BUCKET,
  buildApplicationMediaPath,
} from "./applicationStorage";

function mediaExt(localUri: string | null | undefined, mediaType: ApplicationMediaType | null): string {
  if (localUri) {
    const ext = localUri.split(".").pop()?.split("?")[0];
    if (ext) return ext;
  }
  return mediaType === "video" ? "mp4" : "jpg";
}

function contentTypeForExt(ext: string, mediaType: ApplicationMediaType | null): string {
  if (mediaType === "video") {
    if (ext === "mov") return "video/quicktime";
    return "video/mp4";
  }
  return ext === "png" ? "image/png" : "image/jpeg";
}

async function uploadLocalMedia(
  localUri: string | null | undefined,
  existingUrl: string | null | undefined,
  storagePath: string,
  mediaType: ApplicationMediaType | null,
): Promise<string | null> {
  if (!localUri) return existingUrl ?? null;
  if (localUri.startsWith("http://") || localUri.startsWith("https://")) {
    return localUri;
  }

  const net = await NetInfo.fetch();
  if (!canUploadToCloud(net)) {
    throw new Error(
      "Internet required to upload application media. Connect to Wi‑Fi or mobile data.",
    );
  }

  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();
  const ext = mediaExt(localUri, mediaType);
  const contentType = contentTypeForExt(ext, mediaType);

  const { error } = await supabase.storage
    .from(APPLICATION_BUCKET)
    .upload(storagePath, arrayBuffer, { contentType, upsert: true });

  if (error) {
    const hint =
      error.message?.includes("Bucket not found") ||
      error.message?.includes("not found")
        ? " Application media storage is not configured on the server."
        : "";
    throw new Error(`${error.message}${hint}`);
  }

  const { data } = supabase.storage.from(APPLICATION_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export type ApplicationMediaFields = {
  media_type?: ApplicationMediaType | null;
  media_local_uri?: string | null;
  media_url?: string | null;
};

export async function uploadApplicationEntryMedia(
  entryId: string,
  media: ApplicationMediaFields,
): Promise<{ media_url: string | null }> {
  const mediaType = media.media_type ?? null;
  const ext = mediaExt(media.media_local_uri, mediaType);

  const mediaUrl = await uploadLocalMedia(
    media.media_local_uri,
    media.media_url,
    buildApplicationMediaPath(entryId, { ext }),
    mediaType,
  );

  return { media_url: mediaUrl };
}
