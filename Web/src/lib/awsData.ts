import { createAwsDataClient } from "@/lib/awsDataClient";
import { getPortalAccessToken } from "@/lib/portalToken";

export async function serverData() {
  const token = await getPortalAccessToken();
  if (!token) {
    throw new Error("You must be signed in.");
  }
  return createAwsDataClient(token);
}
