import {
  deleteStorageObject,
  extensionFromFile,
  PARTNER_DOCS_BUCKET,
} from "@/lib/privateStorage";
import { supabase } from "@/lib/supabase";

export type PartnerDocType = "pan" | "mou";

export { PARTNER_DOCS_BUCKET };

const DOC_FILENAMES: Record<PartnerDocType, string> = {
  pan: "pan",
  mou: "mou",
};

export function buildPartnerDocPath(
  partnerId: string,
  type: PartnerDocType,
  ext: string,
): string {
  return `${partnerId}/documents/${DOC_FILENAMES[type]}.${ext}`;
}

export async function uploadPartnerDoc({
  file,
  partnerId,
  type,
}: {
  file: File;
  partnerId: string;
  type: PartnerDocType;
}): Promise<string> {
  if (!file) {
    throw new Error(`${type.toUpperCase()} file missing`);
  }

  const ext = extensionFromFile(file);
  const path = buildPartnerDocPath(partnerId, type, ext);

  const { error } = await supabase.storage
    .from(PARTNER_DOCS_BUCKET)
    .upload(path, file, { upsert: true });

  if (error) {
    console.error("STORAGE UPLOAD ERROR:", error);
    throw error;
  }

  return path;
}

export async function deletePartnerDoc({
  path,
}: {
  path: string;
}): Promise<void> {
  await deleteStorageObject(PARTNER_DOCS_BUCKET, path);
}
