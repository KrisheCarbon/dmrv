import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { ReactNode } from "react";
import { canAccessWebPortal } from "@krishecarbon/shared";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get: (name) => cookieStore.get(name)?.value,
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const { data: profile, error } = await supabase
    .from("users")
    .select("role, first_name, last_name, status")
    .eq("id", user.id)
    .single();

  if (error || !profile || !canAccessWebPortal(profile.role)) {
    redirect("/auth");
  }

  const displayName = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ");

  const initials =
    (profile.first_name?.[0] ?? "") + (profile.last_name?.[0] ?? "") ||
    user.email?.[0]?.toUpperCase() ||
    "U";

  return (
    <div className="flex h-svh min-h-0 flex-col overflow-hidden bg-gray-50 text-gray-900">
      <header className="h-16 flex-shrink-0 border-b border-gray-200 bg-white">
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
          {children}
        </main>
      </div>
    </div>
  );
}
