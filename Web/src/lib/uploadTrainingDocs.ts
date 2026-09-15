import {
  deleteStorageObject,
  extensionFromFile,
  fileNameFromStoragePath,
} from "@/lib/privateStorage";
import { supabase } from "@/lib/supabase";

export const TRAINING_DOCS_BUCKET = "trainings";

export const TRAINING_CERTIFICATE_ACCEPT = "application/pdf";

export function buildTrainingCertificatePath(
  trainingId: string,
  ext: string,
): string {
  return `${trainingId}/certificate.${ext}`;
}

export { fileNameFromStoragePath as fileNameFromTrainingDocPath };

export async function uploadTrainingCertificate({
  file,
  trainingId,
}: {
  file: File;
  trainingId: string;
}): Promise<string> {
  const ext = extensionFromFile(file);
  const path = buildTrainingCertificatePath(trainingId, ext);

  const { error } = await supabase.storage
    .from(TRAINING_DOCS_BUCKET)
    .upload(path, file, { upsert: true });

  if (error) {
    throw error;
  }

  return path;
}

export async function deleteTrainingCertificate({
  path,
}: {
  path: string;
}): Promise<void> {
  await deleteStorageObject(TRAINING_DOCS_BUCKET, path);
}
