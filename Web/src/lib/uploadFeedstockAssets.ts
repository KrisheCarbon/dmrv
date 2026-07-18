import {
  deleteStorageObject,
  extensionFromFile,
  FEEDSTOCK_DOCS_BUCKET,
} from "@/lib/privateStorage";
import { supabase } from "@/lib/supabase";

export type FeedstockAssetType = "lab_report" | "ghg_avoidance_approval";

export { FEEDSTOCK_DOCS_BUCKET };

const ASSET_FILENAMES: Record<FeedstockAssetType, string> = {
  lab_report: "lab-report",
  ghg_avoidance_approval: "ghg-avoidance-approval",
};

export function buildFeedstockAssetPath(
  feedstockId: string,
  type: FeedstockAssetType,
  ext: string,
): string {
  return `${feedstockId}/documents/${ASSET_FILENAMES[type]}.${ext}`;
}

export async function uploadFeedstockAsset({
  file,
  feedstockId,
  type,
}: {
  file: File;
  feedstockId: string;
  type: FeedstockAssetType;
}): Promise<string> {
  if (!file) {
    throw new Error("File missing");
  }

  const ext = extensionFromFile(file);
  const path = buildFeedstockAssetPath(feedstockId, type, ext);

  const { error } = await supabase.storage
    .from(FEEDSTOCK_DOCS_BUCKET)
    .upload(path, file, { upsert: true });

  if (error) {
    console.error("STORAGE UPLOAD ERROR:", error);
    throw error;
  }

  return path;
}

export async function deleteFeedstockAsset({
  path,
}: {
  path: string;
}): Promise<void> {
  await deleteStorageObject(FEEDSTOCK_DOCS_BUCKET, path);
}
