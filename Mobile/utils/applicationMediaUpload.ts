import NetInfo from "@react-native-community/netinfo";
import type { ApplicationMediaType } from "@krishecarbon/shared";
import { publicObjectUrl, uploadStorageObject } from "../services/objectStorage";
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

  const ext = mediaExt(localUri, mediaType);
  const contentType = contentTypeForExt(ext, mediaType);

  try {
    await uploadStorageObject(APPLICATION_BUCKET, storagePath, localUri, contentType);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Media upload failed.";
    const hint = /not found/i.test(message)
      ? " Application media storage is not configured on the server."
      : "";
    throw new Error(`${message}${hint}`);
  }

  return publicObjectUrl(APPLICATION_BUCKET, storagePath);
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
