import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { canAccessWebPortal } from "@krishecarbon/shared";
import { fetchPortalProfile } from "@/lib/portalRole";
import { getPortalAccessToken } from "@/lib/portalToken";

import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";
import DmrvViewerGate from "@/components/DmrvViewerGate";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const token = await getPortalAccessToken();
  if (!token) redirect("/auth");

  const profile = await fetchPortalProfile();

  if (!profile || !canAccessWebPortal(profile.role)) {
    redirect("/auth");
  }

  const displayName = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ");

  const initials =
    (profile.first_name?.[0] ?? "") + (profile.last_name?.[0] ?? "") ||
    profile.email?.[0]?.toUpperCase() ||
    "U";

  return (
    <div className="flex h-svh min-h-0 flex-col overflow-hidden bg-gray-50 text-gray-900">
      <header className="relative z-20 h-16 flex-shrink-0 border-b border-gray-200 bg-white">
        <Navbar initials={initials.toUpperCase()} displayName={displayName} />
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-64 flex-shrink-0 overflow-y-auto overscroll-y-contain border-r border-gray-200 bg-white">
          <Sidebar role={profile.role} />
        </aside>

        <main
          id="admin-main-scroll"
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-6"
        >
          <DmrvViewerGate role={profile.role}>{children}</DmrvViewerGate>
        </main>
      </div>
    </div>
  );
}
