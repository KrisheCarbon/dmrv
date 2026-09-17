import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { canAccessFarmersNetworkPortal } from "@/lib/roles";
import type { ReactNode } from "react";

export default async function NetworkLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !canAccessFarmersNetworkPortal(profile.role)) {
    redirect("/");
  }

  return children;
}
