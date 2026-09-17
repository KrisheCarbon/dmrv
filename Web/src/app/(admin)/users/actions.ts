"use server";

import { createClient } from "@supabase/supabase-js";
import {
  assertCanAssignRole,
  assertCanEditUser,
  canManageUsers,
  isClimapreneurSupervisorSwap,
  isIndianMobileLogin,
  isUserRole,
  toLocalIndianMobile,
  type UserRole,
} from "@krishecarbon/shared";
import { getSignupRedirect, getSiteUrl } from "@/lib/siteUrl";
import { getServiceRoleKey, supabaseUrl } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import type { CreateUserResult, UserFormData } from "@/types";

const admin = createClient(supabaseUrl, getServiceRoleKey());

async function getActorRole(): Promise<UserRole> {
  const supabase = await createServerSupabaseClient();

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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requirePassword(password: string | undefined, label = "Password"): string {
  const value = password?.trim() ?? "";
  if (value.length < 8) {
    throw new Error(`${label} must be at least 8 characters.`);
  }
  return value;
}

function requirePhone(phone: string | undefined): string {
  const value = phone?.trim() ?? "";
  if (!value || !isIndianMobileLogin(value)) {
    throw new Error("Enter a valid 10-digit mobile number (optionally with +91).");
  }
  return toLocalIndianMobile(value);
}

async function assertPhoneAvailable(phone: string, excludeId?: string) {
  const { data, error } = await admin.from("users").select("id, phone");
  if (error) throw new Error(error.message);

  const taken = (data ?? []).some(
    (row) =>
      row.id !== excludeId &&
      row.phone &&
      toLocalIndianMobile(row.phone) === phone,
  );

  if (taken) {
    throw new Error("That mobile number is already used by another account.");
  }
}

export async function createUser(form: UserFormData): Promise<CreateUserResult> {
  const actorRole = await getActorRole();
  assertCanAssignRole(actorRole, form.role);

  const email = normalizeEmail(form.email);
  if (!isValidEmail(email)) {
    throw new Error("Enter a valid email address. Personal inboxes like Gmail are allowed.");
  }

  const phone = requirePhone(form.phone);
  await assertPhoneAvailable(phone);

  const method = form.onboardingMethod === "password" ? "password" : "invite";
  const activateNow = method === "password" ? Boolean(form.activateNow) : false;
  const status = activateNow ? "active" : "pending_auth";

  let authUserId: string | null = null;

  try {
    if (method === "password") {
      const password = requirePassword(form.password);
      const { data: authData, error: authError } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { role: form.role },
        });

      if (authError) throw new Error(authError.message);
      authUserId = authData.user.id;
    } else {
      const { data: authData, error: authError } =
        await admin.auth.admin.inviteUserByEmail(email, {
          data: { role: form.role },
          redirectTo: getSignupRedirect(),
        });

      if (authError) throw new Error(authError.message);
      authUserId = authData.user.id;
    }

    const { error: dbError } = await admin.from("users").insert({
      id: authUserId,
      email,
      phone,
      role: form.role,
      first_name: form.first_name,
      middle_name: form.middle_name || null,
      last_name: form.last_name,
      status,
    });

    if (dbError) throw new Error(dbError.message);
  } catch (err) {
    if (authUserId) {
      await admin.auth.admin.deleteUser(authUserId);
    }
    throw err;
  }

  return {
    email,
    phone,
    signupUrl: `${getSiteUrl()}/signup`,
    emailSent: method === "invite",
    activated: status === "active",
    onboardingMethod: method,
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

export interface RoleChangeNamedItem {
  id: string;
  name: string;
}

export interface RoleChangeKontikkiItem {
  id: string;
  code: string;
  producerId: string | null;
  producerName: string;
}

export interface RoleChangeImpact {
  currentRole: string;
  operatorKontikkis: RoleChangeKontikkiItem[];
  supervisedProducers: RoleChangeNamedItem[];
  pendingSoilSamples: number;
  hasBankAccount: boolean;
  producers: RoleChangeNamedItem[];
  otherSupervisors: RoleChangeNamedItem[];
}

export interface RoleChangePlan {
  keepOperatorAssignments: boolean;
  producerIds: string[];
  reassignSoilSamplesTo: string | null;
}

function asName(
  value: { name?: string } | { name?: string }[] | null | undefined,
): string {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name?.trim() || "Unnamed producer";
}

export async function getUserRoleChangeImpact(
  id: string,
): Promise<RoleChangeImpact> {
  const actorRole = await getActorRole();

  const { data: target } = await admin
    .from("users")
    .select("id, role")
    .eq("id", id)
    .single();

  if (!target) throw new Error("User not found.");
  assertCanEditUser(actorRole, target.role);

  const [
    operatorLinks,
    supervisorLinks,
    soilCount,
    bankAccount,
    producers,
    supervisors,
  ] = await Promise.all([
    admin
      .from("kontikki_operators")
      .select("kontikki_id")
      .eq("operator_id", id),
    admin
      .from("biochar_producer_supervisors")
      .select("biochar_producer_id")
      .eq("supervisor_id", id),
    admin
      .from("soil_tests")
      .select("id", { count: "exact", head: true })
      .eq("submitted_to_supervisor_id", id)
      .in("status", ["submitted", "stored"]),
    admin
      .from("climapreneur_bank_accounts")
      .select("id")
      .eq("user_id", id)
      .maybeSingle(),
    admin
      .from("biochar_producers")
      .select("id, name")
      .order("name"),
    admin
      .from("users")
      .select("id, full_name")
      .eq("role", "supervisor")
      .neq("id", id)
      .order("full_name"),
  ]);

  if (operatorLinks.error) throw new Error(operatorLinks.error.message);
  if (supervisorLinks.error) throw new Error(supervisorLinks.error.message);
  if (soilCount.error) throw new Error(soilCount.error.message);
  if (bankAccount.error) throw new Error(bankAccount.error.message);
  if (producers.error) throw new Error(producers.error.message);
  if (supervisors.error) throw new Error(supervisors.error.message);

  const kontikkiIds = (operatorLinks.data ?? []).map(
    (row) => row.kontikki_id as string,
  );
  let operatorKontikkis: RoleChangeKontikkiItem[] = [];

  if (kontikkiIds.length > 0) {
    const { data: kontikkis, error: kontikkiError } = await admin
      .from("kontikkis")
      .select(
        "id, kontikki_code, biochar_producer_id, biochar_producer:biochar_producers ( id, name )",
      )
      .in("id", kontikkiIds)
      .order("kontikki_code");

    if (kontikkiError) throw new Error(kontikkiError.message);

    operatorKontikkis = (kontikkis ?? []).map((row) => {
      const producer = Array.isArray(row.biochar_producer)
        ? row.biochar_producer[0]
        : row.biochar_producer;
      return {
        id: row.id,
        code: row.kontikki_code,
        producerId: (row.biochar_producer_id as string | null) ?? producer?.id ?? null,
        producerName: asName(producer),
      };
    });
  }

  const producerNameById = new Map(
    (producers.data ?? []).map((row) => [row.id as string, asName(row)]),
  );
  const supervisedProducers = (supervisorLinks.data ?? []).map((row) => {
    const producerId = row.biochar_producer_id as string;
    return {
      id: producerId,
      name: producerNameById.get(producerId) ?? "Unnamed producer",
    };
  });

  return {
    currentRole: target.role,
    operatorKontikkis,
    supervisedProducers,
    pendingSoilSamples: soilCount.count ?? 0,
    hasBankAccount: Boolean(bankAccount.data),
    producers: (producers.data ?? []).map((row) => ({
      id: row.id as string,
      name: asName(row),
    })),
    otherSupervisors: (supervisors.data ?? []).map((row) => ({
      id: row.id as string,
      name: row.full_name?.trim() || "Unnamed supervisor",
    })),
  };
}

async function applyRoleChangePlan(
  userId: string,
  fromRole: string,
  toRole: string,
  plan: RoleChangePlan | undefined,
): Promise<void> {
  if (!isClimapreneurSupervisorSwap(fromRole, toRole)) return;

  const keepOperators = plan?.keepOperatorAssignments ?? true;
  const producerIds = [...new Set(plan?.producerIds ?? [])].filter(Boolean);

  if (toRole === "supervisor") {
    if (producerIds.length === 0) {
      throw new Error(
        "Assign at least one producer. Supervisors belong to a producer site.",
      );
    }

    const { error: deleteError } = await admin
      .from("biochar_producer_supervisors")
      .delete()
      .eq("supervisor_id", userId);
    if (deleteError) throw new Error(deleteError.message);

    const { error: insertError } = await admin
      .from("biochar_producer_supervisors")
      .insert(
        producerIds.map((biochar_producer_id) => ({
          biochar_producer_id,
          supervisor_id: userId,
        })),
      );
    if (insertError) throw new Error(insertError.message);
  }

  if (toRole === "climapreneur") {
    const impact = await getPendingSoilAndSupervisorState(userId);

    if (impact.pendingSoilSamples > 0) {
      const nextSupervisorId = plan?.reassignSoilSamplesTo?.trim() || "";
      if (!nextSupervisorId) {
        throw new Error(
          "Reassign waiting soil samples to another supervisor before this role change.",
        );
      }
      if (nextSupervisorId === userId) {
        throw new Error("Choose a different supervisor for the waiting samples.");
      }

      const { error: soilError } = await admin
        .from("soil_tests")
        .update({ submitted_to_supervisor_id: nextSupervisorId })
        .eq("submitted_to_supervisor_id", userId)
        .in("status", ["submitted", "stored"]);
      if (soilError) throw new Error(soilError.message);
    }

    const { error: unlinkError } = await admin
      .from("biochar_producer_supervisors")
      .delete()
      .eq("supervisor_id", userId);
    if (unlinkError) throw new Error(unlinkError.message);
  }

  if (!keepOperators) {
    const { error: operatorError } = await admin
      .from("kontikki_operators")
      .delete()
      .eq("operator_id", userId);
    if (operatorError) throw new Error(operatorError.message);
  }
}

async function getPendingSoilAndSupervisorState(userId: string) {
  const { count, error } = await admin
    .from("soil_tests")
    .select("id", { count: "exact", head: true })
    .eq("submitted_to_supervisor_id", userId)
    .in("status", ["submitted", "stored"]);
  if (error) throw new Error(error.message);
  return { pendingSoilSamples: count ?? 0 };
}

export async function updateUser(
  id: string,
  form: UserFormData,
  roleChange?: RoleChangePlan,
) {
  const actorRole = await getActorRole();

  const { data: target } = await admin
    .from("users")
    .select("role")
    .eq("id", id)
    .single();

  if (!target) throw new Error("User not found.");

  assertCanEditUser(actorRole, target.role);
  assertCanAssignRole(actorRole, form.role);

  const phone = requirePhone(form.phone);
  await assertPhoneAvailable(phone, id);

  if (isClimapreneurSupervisorSwap(target.role, form.role)) {
    await applyRoleChangePlan(id, target.role, form.role, roleChange);
  }

  const { error } = await admin
    .from("users")
    .update({
      phone,
      role: form.role,
      status: form.status,
      first_name: form.first_name,
      middle_name: form.middle_name || null,
      last_name: form.last_name,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  const authUpdate: {
    user_metadata: { role: string };
    password?: string;
    email_confirm?: boolean;
  } = {
    user_metadata: { role: form.role },
  };

  if (form.newPassword?.trim()) {
    authUpdate.password = requirePassword(form.newPassword, "New password");
    authUpdate.email_confirm = true;
  } else if (form.status === "active") {
    authUpdate.email_confirm = true;
  }

  const { error: authError } = await admin.auth.admin.updateUserById(
    id,
    authUpdate,
  );
  if (authError) throw new Error(authError.message);

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
