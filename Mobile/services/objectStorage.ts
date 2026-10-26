import { useEffect, useState } from "react";
import { storageRefFromValue, storedObjectUrl } from "@krishecarbon/shared";
import { backendFetch } from "./backendApi";

export async function uploadStorageObject(
  bucket: string,
  path: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const { uploadUrl } = await backendFetch<{ uploadUrl: string }>("/storage/upload-url", {
    method: "POST",
    body: JSON.stringify({ bucket, path, contentType }),
  });
  const saved = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Blob([body], { type: contentType }),
  });
  if (!saved.ok) {
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
