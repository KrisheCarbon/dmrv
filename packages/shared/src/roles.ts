/** Canonical user roles across Web, Mobile, and Backend. */
export const USER_ROLES = [
  "admin",
  "manager",
  "supervisor",
  "climapreneur",
  "dmrv_viewer",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manager",
  supervisor: "Supervisor",
  climapreneur: "Climapreneur",
  dmrv_viewer: "dMRV viewer",
};

/** Roles that can sign in to the web portal. */
export const PORTAL_ROLES: readonly UserRole[] = [
  "admin",
  "manager",
  "supervisor",
  "dmrv_viewer",
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

/** Rainbow or CSI reviewer. Web dashboard only, and only to look. */
export function isDmrvViewer(role: string): boolean {
  return role === "dmrv_viewer";
}

/**
 * Portal sections a dMRV viewer may open. Everything else stays hidden:
 * Users, Supervisors, Climapreneurs, Stats (people breakdowns and farm GPS),
 * farm polygons, soil samples, and website intents.
 */
export const DMRV_VIEWER_PATHS: readonly string[] = [
  "/network/biochar-producers",
  "/network/kontikkis",
  "/network/clusters",
  "/network/partners",
  "/network/farmers",
  "/biochar",
  "/operations/trainings",
  "/operations/inspections",
  "/operations/queries",
  "/operations/updates",
  "/carbon",
  "/verification-reports",
];

export function dmrvViewerPathAllowed(pathname: string): boolean {
  if (/\/(new|edit)(\/|$)/.test(pathname)) return false;
  if (pathname === "/" || pathname === "/network" || pathname === "/operations") return true;
  return DMRV_VIEWER_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Verification packages and Rainbow lab records: carbon roles, plus dMRV viewers to read. */
export function canViewVerificationReports(role: string): boolean {
  return canAccessCarbon(role) || isDmrvViewer(role);
}

/** Producers, kontikkis, clusters and partners: network roles, plus dMRV viewers to read. */
export function canViewNetwork(role: string): boolean {
  return canAccessNetwork(role) || isDmrvViewer(role);
}

/** Farmer columns a dMRV viewer may see: identity, place and acreage. No phone, address, IDs, GPS or photos. */
const DMRV_VIEWER_FARM_KEYS = [
  "id",
  "farmer_code",
  "farmer_name",
  "village",
  "mandal",
  "district",
  "state",
  "cluster_id",
  "cluster",
  "total_land_size",
  "owned_land_size",
  "leased_land_size",
  "crops",
  "interested_in_biochar",
  "prior_biochar_exp",
  "prior_biochar_acreage",
  "estimated_biomass",
  "status",
  "created_at",
  "updated_at",
] as const;

/** Farm (plot) columns a dMRV viewer may see. No boundary polygon, GPS or photos. */
const DMRV_VIEWER_FIELD_KEYS = [
  "id",
  "farm_id",
  "field_code",
  "ownership_type",
  "calculated_area",
  "declared_area",
  "crop_name",
  "season",
  "sowing_date",
  "harvest_date",
  "status",
  "created_at",
  "updated_at",
] as const;

function pickKeys<T extends object>(row: T, keys: readonly string[]): T {
  const source = row as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in source) picked[key] = source[key];
  }
  return picked as T;
}

export function toDmrvViewerFarm<T extends object>(farm: T): T {
  return pickKeys(farm, DMRV_VIEWER_FARM_KEYS);
}

export function toDmrvViewerField<T extends object>(field: T): T {
  return pickKeys(field, DMRV_VIEWER_FIELD_KEYS);
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

/** Roles that can write an operational update and choose who receives it. */
export const UPDATE_SEND_ROLES: readonly UserRole[] = [
  "admin",
  "manager",
  "supervisor",
];

export function canSendUpdates(role: string): boolean {
  return isUserRole(role) && UPDATE_SEND_ROLES.includes(role);
}

/** Roles allowed to open Network (producers, kontikkis, clusters, partners, etc.). */
export const NETWORK_ACCESS_ROLES: readonly UserRole[] = ["admin", "manager"];

export function canAccessNetwork(role: string): boolean {
  return isUserRole(role) && NETWORK_ACCESS_ROLES.includes(role);
}

/** Roles allowed to open farmer fields and soil tests in the portal. */
export const FARMERS_NETWORK_PORTAL_ROLES: readonly UserRole[] = [
  "admin",
  "manager",
  "supervisor",
];

export function canAccessFarmersNetworkPortal(role: string): boolean {
  return isUserRole(role) && FARMERS_NETWORK_PORTAL_ROLES.includes(role);
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

/** Climapreneurs and site supervisors may operate kontikkis. */
export function canOperateKontikkis(role: string): boolean {
  return role === "climapreneur" || role === "supervisor";
}

/** Role swaps that have producer, operator, and soil-sample side effects. */
export function isClimapreneurSupervisorSwap(
  fromRole: string,
  toRole: string,
): boolean {
  return (
    (fromRole === "climapreneur" && toRole === "supervisor") ||
    (fromRole === "supervisor" && toRole === "climapreneur")
  );
}

/** Keys that list supervisors, climapreneurs or operators by name. Hidden from dMRV viewers. */
const DMRV_VIEWER_PEOPLE_KEYS = new Set([
  "supervisors",
  "climapreneurs",
  "operators",
  "kontikki_operators",
  "biochar_producer_supervisors",
  "supervisor_ids",
  "climapreneur_ids",
]);

/** Deep copy without people assignments, for network records shown to dMRV viewers. */
export function withoutPeopleForDmrvViewer<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => withoutPeopleForDmrvViewer(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (DMRV_VIEWER_PEOPLE_KEYS.has(key)) continue;
      out[key] = withoutPeopleForDmrvViewer(item);
    }
    return out as T;
  }
  return value;
}
