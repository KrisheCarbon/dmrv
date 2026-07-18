/** Canonical user roles across Web, Mobile, and Backend. */
export const USER_ROLES = [
  "admin",
  "manager",
  "supervisor",
  "climapreneur",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manager",
  supervisor: "Supervisor",
  climapreneur: "Climapreneur",
};

/** Roles that can sign in to the web admin portal. */
export const PORTAL_ROLES: readonly UserRole[] = [
  "admin",
  "manager",
  "supervisor",
];

/** Mobile / field app roles (enforced on mobile later). */
export const MOBILE_APP_ROLES: readonly UserRole[] = [
  "admin",
  "manager",
  "supervisor",
  "climapreneur",
];

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export function formatRoleLabel(role: string): string {
  if (isUserRole(role)) return ROLE_LABELS[role];
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function canAccessWebPortal(role: string): boolean {
  return isUserRole(role) && PORTAL_ROLES.includes(role);
}

export function canAccessMobileApp(role: string): boolean {
  return isUserRole(role) && MOBILE_APP_ROLES.includes(role);
}

/** Roles allowed to open the Users page and invite/edit accounts. */
export const USER_MANAGEMENT_ROLES: readonly UserRole[] = [
  "admin",
  "manager",
  "supervisor",
];

export function canManageUsers(role: string): boolean {
  return isUserRole(role) && USER_MANAGEMENT_ROLES.includes(role);
}

/** Roles allowed to open Network (producers, kontikkis, clusters, partners, etc.). */
export const NETWORK_ACCESS_ROLES: readonly UserRole[] = ["admin", "manager"];

export function canAccessNetwork(role: string): boolean {
  return isUserRole(role) && NETWORK_ACCESS_ROLES.includes(role);
}

/** Roles allowed to open Carbon (credits, removals, MRV reporting). */
export const CARBON_ACCESS_ROLES: readonly UserRole[] = ["admin", "manager"];

export function canAccessCarbon(role: string): boolean {
  return isUserRole(role) && CARBON_ACCESS_ROLES.includes(role);
}

/** Roles allowed to create or edit biochar producers and project sites. */
export const PRODUCER_MANAGEMENT_ROLES: readonly UserRole[] = ["admin", "manager"];

export function canManageProducers(role: string): boolean {
  return isUserRole(role) && PRODUCER_MANAGEMENT_ROLES.includes(role);
}

/** Roles allowed to review and approve pyrolysis batches in the web portal. */
export const PYROLYSIS_APPROVAL_ROLES: readonly UserRole[] = [
  "admin",
  "manager",
];

export function canReviewPyrolysisBatches(role: string): boolean {
  return isUserRole(role) && PYROLYSIS_APPROVAL_ROLES.includes(role);
}

export const MIXING_APPROVAL_ROLES: readonly UserRole[] = PYROLYSIS_APPROVAL_ROLES;

export function canReviewMixingEntries(role: string): boolean {
  return canReviewPyrolysisBatches(role);
}

export const APPLICATION_APPROVAL_ROLES: readonly UserRole[] = PYROLYSIS_APPROVAL_ROLES;

export function canReviewApplicationEntries(role: string): boolean {
  return canReviewPyrolysisBatches(role);
}

/** Roles an actor may assign when creating or editing a user. */
export function getAssignableRoles(actorRole: string): readonly UserRole[] {
  if (actorRole === "admin") return USER_ROLES;
  if (actorRole === "manager") return ["supervisor", "climapreneur"];
  if (actorRole === "supervisor") return ["climapreneur"];
  return [];
}

export function canAssignRole(actorRole: string, targetRole: string): boolean {
  if (!isUserRole(targetRole)) return false;
  return getAssignableRoles(actorRole).includes(targetRole);
}

/** Whether an actor may edit an existing user. */
export function canEditUser(actorRole: string, targetUserRole: string): boolean {
  if (actorRole === "admin") return true;
  if (actorRole === "manager") {
    return targetUserRole === "supervisor" || targetUserRole === "climapreneur";
  }
  if (actorRole === "supervisor") return targetUserRole === "climapreneur";
  return false;
}

/** Short UI copy explaining who the actor may invite or manage. */
export function getUserManagementHint(actorRole: string): string | null {
  if (actorRole === "manager") {
    return "Managers can invite and manage supervisors and climapreneurs. They cannot create or edit admins or other managers.";
  }
  if (actorRole === "supervisor") {
    return "Supervisors can only invite and manage climapreneurs.";
  }
  return null;
}

export function assertCanAssignRole(actorRole: string, targetRole: string): void {
  if (!canAssignRole(actorRole, targetRole)) {
    throw new Error("You do not have permission to assign this role.");
  }
}

export function assertCanEditUser(actorRole: string, targetUserRole: string): void {
  if (!canEditUser(actorRole, targetUserRole)) {
    throw new Error("You do not have permission to edit this user.");
  }
}
