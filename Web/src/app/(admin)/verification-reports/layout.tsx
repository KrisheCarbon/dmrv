import { redirect } from "next/navigation";
import { fetchPortalProfile } from "@/lib/portalRole";
import { canViewVerificationReports } from "@krishecarbon/shared";
import type { ReactNode } from "react";

export default async function VerificationReportsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profile = await fetchPortalProfile();

  if (!profile || !canViewVerificationReports(profile.role)) {
    redirect("/");
  }

  return children;
}
