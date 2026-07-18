"use server";

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import {
  assertCanAssignRole,
  assertCanEditUser,
  canManageUsers,
  isUserRole,
  type UserRole,
} from "@krishecarbon/shared";
import { getSignupRedirect, getSiteUrl } from "@/lib/siteUrl";
import { getServiceRoleKey, supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { CreateUserResult, UserFormData } from "@/types";

const admin = createClient(supabaseUrl, getServiceRoleKey());

async function getActorRole(): Promise<UserRole> {
  const cookieStore = await cookies();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get: (name) => cookieStore.get(name)?.value,
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role || !canManageUsers(profile.role) || !isUserRole(profile.role)) {
    throw new Error("You do not have permission to manage users.");
  }

  return profile.role;
}

export async function createUser(form: UserFormData): Promise<CreateUserResult> {
  const actorRole = await getActorRole();
  assertCanAssignRole(actorRole, form.role);

  const redirectTo = getSignupRedirect();

  const { data: authData, error: authError } =
    await admin.auth.admin.inviteUserByEmail(form.email, {
      data: { role: form.role },
      redirectTo,
    });

  if (authError) throw new Error(authError.message);

  const { error: dbError } = await admin.from("users").insert({
    id: authData.user.id,
    email: form.email,
    phone: form.phone,
    role: form.role,
    first_name: form.first_name,
    middle_name: form.middle_name || null,
    last_name: form.last_name,
    status: "pending_auth",
  });

  if (dbError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    throw new Error(dbError.message);
  }

  return {
    email: form.email,
    signupUrl: `${getSiteUrl()}/signup`,
    emailSent: true,
  };
}

export async function resendSignupEmail(id: string, email: string) {
  const actorRole = await getActorRole();

  const { data: target } = await admin
    .from("users")
    .select("role")
    .eq("id", id)
    .single();

  if (!target) throw new Error("User not found.");
  assertCanEditUser(actorRole, target.role);

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: getSignupRedirect(),
  });

  if (error) throw new Error(error.message);

  await admin.from("users").update({ status: "pending_auth" }).eq("id", id);

  return { emailSent: true };
}

export async function updateUser(id: string, form: UserFormData) {
  const actorRole = await getActorRole();

  const { data: target } = await admin
    .from("users")
    .select("role")
    .eq("id", id)
    .single();

  if (!target) throw new Error("User not found.");

  assertCanEditUser(actorRole, target.role);
  assertCanAssignRole(actorRole, form.role);

  const { error } = await admin
    .from("users")
    .update({
      phone: form.phone,
      role: form.role,
      status: form.status,
      first_name: form.first_name,
      middle_name: form.middle_name || null,
      last_name: form.last_name,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  return true;
}

export async function disableUser(id: string) {
  const actorRole = await getActorRole();

  const { data: target } = await admin
    .from("users")
    .select("role")
    .eq("id", id)
    .single();

  if (!target) throw new Error("User not found.");
  assertCanEditUser(actorRole, target.role);

  const { error: authError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: "87600h",
  });
  if (authError) throw new Error(authError.message);

  const { error: dbError } = await admin
    .from("users")
    .update({ status: "disabled" })
    .eq("id", id);

  if (dbError) throw new Error(dbError.message);
  return true;
}
