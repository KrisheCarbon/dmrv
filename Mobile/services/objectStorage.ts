import { useEffect, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import { storageRefFromValue, storedObjectUrl } from "@krishecarbon/shared";
import { backendFetch } from "./backendApi";

/** React Native cannot build a Blob from raw bytes, so the file is uploaded from disk. */
function fileUriForUpload(uri: string): string {
  if (
    uri.startsWith("file://") ||
    uri.startsWith("content://") ||
    uri.startsWith("ph://") ||
    uri.startsWith("assets-library://")
  ) {
    return uri;
  }
  if (uri.startsWith("/")) return `file://${uri}`;
  return uri;
}

export async function uploadStorageObject(
  bucket: string,
  path: string,
  fileUri: string,
  contentType: string,
): Promise<void> {
  const { uploadUrl } = await backendFetch<{ uploadUrl: string }>("/storage/upload-url", {
    method: "POST",
    body: JSON.stringify({ bucket, path, contentType }),
  });
  const saved = await FileSystem.uploadAsync(uploadUrl, fileUriForUpload(fileUri), {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
    headers: { "Content-Type": contentType },
  });
  if (saved.status < 200 || saved.status >= 300) {
    throw new Error("The file could not be saved.");
  }
}

export function publicObjectUrl(bucket: string, path: string): string {
  return storedObjectUrl(bucket, path);
}

export async function signStoredFile(
  bucket: string,
  path: string,
  expires = 600,
): Promise<string | null> {
  const data = await backendFetch<{ url: string | null }>(
    `/storage/sign?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}&expires=${expires}`,
  );
  return data?.url ?? null;
}

/** Local files stay as they are. Stored file links open from AWS. */
export async function resolveStoredFileUri(uri: string): Promise<string> {
  const ref = storageRefFromValue(uri);
  if (!ref) return uri;
  try {
    return (await signStoredFile(ref.bucket, ref.path)) || uri;
  } catch {
    return uri;
  }
}

export function useResolvedFileUri(uri?: string | null): string | null {
  const [resolved, setResolved] = useState<string | null>(uri ?? null);

  useEffect(() => {
    if (!uri) {
      setResolved(null);
      return;
    }
    let cancelled = false;
    resolveStoredFileUri(uri).then((next) => {
      if (!cancelled) setResolved(next);
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  return resolved;
}
