import {
  DASHBOARD_SECTIONS,
  MAIN_NAV,
  type NavEntry,
  type NavGroupConfig,
  type NavLink,
} from "@/lib/navigation";
import {
  canAccessCarbon,
  canAccessFarmersNetworkPortal,
  canAccessNetwork,
  dmrvViewerPathAllowed,
  isDmrvViewer,
} from "@/lib/roles";

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
  if (isDmrvViewer(role)) {
    // Same allow-list the page gate uses, so the menu never offers a page that bounces.
    return MAIN_NAV.flatMap((entry): NavEntry[] => {
      if (entry.type === "item") return dmrvViewerPathAllowed(entry.href) ? [entry] : [];
      const children = entry.children.filter((link) => dmrvViewerPathAllowed(link.href));
      return children.length ? [{ ...entry, children }] : [];
    });
  }

  return MAIN_NAV.filter((entry) => {
    if (entry.type === "group" && entry.prefix === "/network") {
      if (canAccessNetwork(role)) return true;
      if (!canAccessFarmersNetworkPortal(role)) return false;
      return true;
    }
    if (
      entry.type === "item" &&
      (entry.href === "/carbon" || entry.href === "/verification-reports")
    ) {
      return canAccessCarbon(role);
    }
    return true;
  }).map((entry) => {
    if (
      entry.type === "group" &&
      entry.prefix === "/network" &&
      !canAccessNetwork(role) &&
      canAccessFarmersNetworkPortal(role)
    ) {
      return {
        ...entry,
        children: entry.children.filter((link) =>
          ["/network", "/network/farmers"].includes(
            link.href,
          ),
        ),
      };
    }
    return entry;
  });
}

/** Dashboard module cards visible for the given role. */
export function getDashboardSectionsForRole(role: string) {
  if (isDmrvViewer(role)) {
    const nav = getNavForRole(role);
    return DASHBOARD_SECTIONS.filter((section) =>
      nav.some((entry) =>
        entry.type === "group"
          ? entry.prefix === `/${section.key}`
          : entry.href === section.href,
      ),
    ).map((section) => {
      const group = nav.find(
        (entry): entry is NavGroupConfig =>
          entry.type === "group" && entry.prefix === `/${section.key}`,
      );
      return group
        ? {
            ...section,
            title: group.label,
            links: group.children,
            description:
              section.key === "network"
                ? "Producers, kontikkis, clusters, partners, and farmers' basic details."
                : section.key === "operations"
                  ? "Training records."
                  : section.description,
          }
        : section;
    });
  }

  return DASHBOARD_SECTIONS.filter((section) => {
    if (section.key === "network") {
      return canAccessNetwork(role) || canAccessFarmersNetworkPortal(role);
    }
    if (section.key === "carbon" || section.key === "verification-reports") {
      return canAccessCarbon(role);
    }
    return true;
  });
}
