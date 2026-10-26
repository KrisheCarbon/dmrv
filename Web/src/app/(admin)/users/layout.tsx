import { redirect } from "next/navigation";
import { fetchPortalProfile } from "@/lib/portalRole";
import { canManageUsers } from "@krishecarbon/shared";
import type { ReactNode } from "react";

export default async function UsersLayout({ children }: { children: ReactNode }) {
  const profile = await fetchPortalProfile();

  if (!profile || !canManageUsers(profile.role)) {
    redirect("/");
  }

  return children;
}
