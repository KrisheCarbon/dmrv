"use server";

import { backendFetch } from "@/lib/backendApi";

/** Ask the API for a signed file URL from the server, so the browser does not call it cross-origin. */
export async function signStorageUrl(
  bucket: string,
  path: string,
  expiresInSeconds: number,
): Promise<string | null> {
  const data = await backendFetch<{ url: string | null }>(
    `/storage/sign?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}&expires=${expiresInSeconds}`,
  );
  return data?.url ?? null;
}
