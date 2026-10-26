import { storageRefFromValue, storedObjectUrl } from "@krishecarbon/shared";
import { getBackendUrl } from "@/lib/env";
import { supabase } from "@/lib/supabase";

export const BIOCHAR_PRODUCER_DOCS_BUCKET = "biochar-producers";
export const PARTNER_DOCS_BUCKET = "partners";
export const FEEDSTOCK_DOCS_BUCKET = "feedstocks";

export const ORGANIZATION_DOCUMENT_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

export const ORGANIZATION_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export function storagePathFromValue(
  value: string,
  defaultBucket?: string,
): { bucket: string; path: string } | null {
  return storageRefFromValue(value, defaultBucket);
}

async function storageApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("You must be signed in.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${getBackendUrl()}${path}`, { ...init, headers });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as { message?: string }) : null;
  if (!response.ok) {
    throw new Error(body?.message || "The file could not be saved.");
  }
  return body as T;
}

export async function uploadStorageObject(
  bucket: string,
  path: string,
  body: Blob,
  contentType: string,
): Promise<void> {
  const { uploadUrl } = await storageApi<{ uploadUrl: string }>("/storage/upload-url", {
    method: "POST",
    body: JSON.stringify({ bucket, path, contentType }),
  });
  const saved = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!saved.ok) {
    throw new Error("The file could not be saved.");
  }
}

export function publicObjectUrl(bucket: string, path: string): string {
  return storedObjectUrl(bucket, path);
}

export async function createSignedStorageUrl(
  bucket: string,
  pathOrValue: string,
  expiresInSeconds = 300,
): Promise<string | null> {
  const ref = storagePathFromValue(pathOrValue, bucket);
  if (!ref) return null;

  try {
    const data = await storageApi<{ url: string | null }>(
      `/storage/sign?bucket=${encodeURIComponent(ref.bucket)}&path=${encodeURIComponent(ref.path)}&expires=${expiresInSeconds}`,
    );
    return data?.url ?? null;
  } catch (error) {
    console.error("Failed to create signed URL:", error);
    return null;
  }
}

export async function deleteStorageObject(
  bucket: string,
  pathOrValue: string,
): Promise<void> {
  const ref = storagePathFromValue(pathOrValue, bucket);
  if (!ref) return;

  await storageApi("/storage/delete", {
    method: "POST",
    body: JSON.stringify({ bucket: ref.bucket, path: ref.path }),
  });
}

export function fileNameFromStoragePath(path: string) {
  const segment = path.split("/").pop() ?? "document";
  return decodeURIComponent(segment.split("?")[0] ?? segment);
}

export function extensionFromFile(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 10) return fromName;

  switch (file.type) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    default:
      return "bin";
  }
}
