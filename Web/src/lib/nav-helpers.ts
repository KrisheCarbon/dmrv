import {
  DASHBOARD_SECTIONS,
  MAIN_NAV,
  type NavEntry,
  type NavGroupConfig,
  type NavLink,
} from "@/lib/navigation";
import { canAccessCarbon, canAccessNetwork } from "@/lib/roles";

export function getNavGroup(label: string): NavGroupConfig | undefined {
  return MAIN_NAV.find(
    (entry): entry is NavGroupConfig =>
      entry.type === "group" && entry.label === label,
  );
}

export function getSubsectionLinks(section: string): NavLink[] {
  return (
    getNavGroup(section)?.children.filter((link) => link.label !== "Overview") ??
    []
  );
}

export function getSectionLinks(section: string): NavLink[] {
  return getSubsectionLinks(section);
}

/** Sidebar nav entries visible for the given role. */
export function getNavForRole(role: string): NavEntry[] {
  return MAIN_NAV.filter((entry) => {
    if (entry.type === "group" && entry.prefix === "/network") {
      return canAccessNetwork(role);
    }
    if (entry.type === "item" && entry.href === "/carbon") {
      return canAccessCarbon(role);
    }
    return true;
  });
}

/** Dashboard module cards visible for the given role. */
export function getDashboardSectionsForRole(role: string) {
  return DASHBOARD_SECTIONS.filter((section) => {
    if (section.key === "network") {
      return canAccessNetwork(role);
    }
    if (section.key === "carbon") {
      return canAccessCarbon(role);
    }
    return true;
  });
}
