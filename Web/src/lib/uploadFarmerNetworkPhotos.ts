import { extensionFromFile } from "@/lib/privateStorage";
import { supabase } from "@/lib/supabase";
import { FARMER_NETWORK_PHOTOS_BUCKET } from "@krishecarbon/shared";

export const RECEIVE_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

export async function uploadFarmerNetworkPhoto({
  file,
  folder,
}: {
  file: File;
  folder: string;
}): Promise<string> {
  const ext = extensionFromFile(file);
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(FARMER_NETWORK_PHOTOS_BUCKET)
    .upload(path, file, { upsert: true });

  if (error) throw error;
  return path;
}

export async function uploadSoilReceivePhoto({
  file,
  soilTestId,
}: {
  file: File;
  soilTestId: string;
}): Promise<string> {
  return uploadFarmerNetworkPhoto({
    file,
    folder: `${soilTestId}/receive`,
  });
}

export async function uploadFarmerProfilePhoto({
  file,
  farmerId,
}: {
  file: File;
  farmerId: string;
}): Promise<string> {
  const path = await uploadFarmerNetworkPhoto({
    file,
    folder: `farmers/${farmerId}/profile`,
  });
  const { data } = supabase.storage
    .from(FARMER_NETWORK_PHOTOS_BUCKET)
    .getPublicUrl(path);
  return data.publicUrl;
}
