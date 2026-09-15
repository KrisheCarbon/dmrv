import { getModuleBucket } from "./moduleStorage";

export const MIXING_BUCKET = getModuleBucket("mixing");

export type MixingPhotoKind = "biochar" | "substrate" | "mixing";

export function buildMixingPhotoPath(
  entryId: string,
  kind: MixingPhotoKind,
  options?: { ext?: string },
): string {
  const ext = options?.ext ?? "jpg";
  return `entries/${entryId}/${kind}.${ext}`;
}
