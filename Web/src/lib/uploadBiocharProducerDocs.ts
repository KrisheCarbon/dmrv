import {
  BIOCHAR_PRODUCER_DOCS_BUCKET,
  deleteStorageObject,
  extensionFromFile,
  fileNameFromStoragePath,
} from "@/lib/privateStorage";
import { supabase } from "@/lib/supabase";

export type BiocharProducerDocType =
  | "contract"
  | "training_cert"
  | "other_document";

export { BIOCHAR_PRODUCER_DOCS_BUCKET };

const DOC_FILENAMES: Record<BiocharProducerDocType, string> = {
  contract: "contract",
  training_cert: "training-cert",
  other_document: "other",
};

export function buildBiocharProducerDocPath(
  producerId: string,
  type: BiocharProducerDocType,
  ext: string,
): string {
  return `${producerId}/documents/${DOC_FILENAMES[type]}.${ext}`;
}

export { fileNameFromStoragePath as fileNameFromBiocharProducerDocPath };

export function buildBiocharProducerOtherDocPath(
  producerId: string,
  file: File,
): string {
  const ext = extensionFromFile(file);
  return `${producerId}/documents/other/${crypto.randomUUID()}.${ext}`;
}

export async function uploadBiocharProducerOtherDoc({
  file,
  producerId,
}: {
  file: File;
  producerId: string;
}): Promise<string> {
  const path = buildBiocharProducerOtherDocPath(producerId, file);

  const { error } = await supabase.storage
    .from(BIOCHAR_PRODUCER_DOCS_BUCKET)
    .upload(path, file, { upsert: false });

  if (error) {
    throw error;
  }

  return path;
}

export async function uploadBiocharProducerDoc({
  file,
  producerId,
  type,
}: {
  file: File;
  producerId: string;
  type: BiocharProducerDocType;
}): Promise<string> {
  const ext = extensionFromFile(file);
  const path = buildBiocharProducerDocPath(producerId, type, ext);

  const { error } = await supabase.storage
    .from(BIOCHAR_PRODUCER_DOCS_BUCKET)
    .upload(path, file, { upsert: true });

  if (error) {
    throw error;
  }

  return path;
}

export async function deleteBiocharProducerDoc({
  path,
}: {
  path: string;
}): Promise<void> {
  await deleteStorageObject(BIOCHAR_PRODUCER_DOCS_BUCKET, path);
}
