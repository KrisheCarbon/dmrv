import { redirect } from "next/navigation";
import { fetchPortalProfile } from "@/lib/portalRole";
import { canAccessFarmersNetworkPortal, isDmrvViewer } from "@/lib/roles";
import type { ReactNode } from "react";

export default async function NetworkLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profile = await fetchPortalProfile();

  if (!profile) redirect("/auth");

  if (
    !profile ||
    (!canAccessFarmersNetworkPortal(profile.role) && !isDmrvViewer(profile.role))
  ) {
    redirect("/");
  }

  return children;
}
