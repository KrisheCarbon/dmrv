import { getModuleBucket } from "./consentStorage";

export const APPLICATION_BUCKET = getModuleBucket("application");

export function buildApplicationMediaPath(
  entryId: string,
  options?: { ext?: string },
): string {
  const ext = options?.ext ?? "jpg";
  return `entries/${entryId}/media.${ext}`;
}
