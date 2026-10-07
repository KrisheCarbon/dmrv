import { getModuleBucket } from "./moduleStorage";

export const PYROLYSIS_BUCKET = getModuleBucket("pyrolysis");

export type PyrolysisPhotoKind =
  | "kiln"
  | "feedstock"
  | "feedstock_size"
  | "moisture"
  | "stage"
  | "sample"
  | "sample_spot"
  | "sample_pile"
  | "sample_bag"
  | "biomass_load"
  | "quench"
  | "quench_video";

export function buildPyrolysisPhotoPath(
  batchId: string,
  kind: PyrolysisPhotoKind,
  options?: { index?: number; stage?: string; ext?: string },
): string {
  const ext = options?.ext ?? "jpg";
  const base = `batches/${batchId}`;

  if (kind === "kiln") return `${base}/kiln.${ext}`;
  if (kind === "feedstock") return `${base}/feedstock.${ext}`;
  if (kind === "feedstock_size") return `${base}/feedstock_size.${ext}`;
  if (kind === "moisture") {
    const index = options?.index ?? 1;
    return `${base}/moisture/${index}.${ext}`;
  }
  if (kind === "stage") {
    const stage = options?.stage ?? "initial";
    return `${base}/stages/${stage}.${ext}`;
  }
  if (kind === "sample") return `${base}/sample.${ext}`;
  if (kind === "sample_spot") {
    const index = options?.index ?? 1;
    return `${base}/sample/spot-${index}.${ext}`;
  }
  if (kind === "sample_pile") return `${base}/sample/pile.${ext}`;
  if (kind === "sample_bag") return `${base}/sample/bag.${ext}`;
  if (kind === "biomass_load") {
    const index = options?.index ?? 1;
    return `${base}/biomass_loads/${index}.${ext}`;
  }
  if (kind === "quench") {
    const index = options?.index ?? 1;
    return `${base}/quench/${index}.${ext}`;
  }
  if (kind === "quench_video") return `${base}/quench/video.${ext}`;

  return `${base}/photo_${Date.now()}.${ext}`;
}
