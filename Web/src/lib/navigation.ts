export interface NavLink {
  href: string;
  label: string;
  /** Match only the exact path — used for section overview routes. */
  exact?: boolean;
}

export interface NavGroupConfig {
  type: "group";
  label: string;
  icon: string;
  prefix: string;
  children: NavLink[];
}

export interface NavItemConfig {
  type: "item";
  href: string;
  label: string;
  icon: string;
}

export type NavEntry = NavItemConfig | NavGroupConfig;

export const MAIN_NAV: NavEntry[] = [
  {
    type: "item",
    href: "/",
    label: "Dashboard",
    icon: "/icons/overview.svg",
  },
  {
    type: "group",
    label: "Network",
    icon: "/icons/network.svg",
    prefix: "/network",
    children: [
      { href: "/network", label: "Overview", exact: true },
      { href: "/network/biochar-producers", label: "Producers" },
      { href: "/network/kontikkis", label: "Kontikkis" },
      { href: "/network/clusters", label: "Clusters" },
      { href: "/network/partners", label: "Partners" },
      { href: "/network/supervisors", label: "Supervisors" },
      { href: "/network/climapreneurs", label: "Climapreneurs" },
      { href: "/network/farms", label: "Farms" },
      { href: "/network/sensor-data", label: "Sensor data" },
    ],
  },
  {
    type: "group",
    label: "Biochar",
    icon: "/icons/biochar.svg",
    prefix: "/biochar",
    children: [
      { href: "/biochar", label: "Overview", exact: true },
      { href: "/biochar/production", label: "Production" },
      { href: "/biochar/mixing", label: "Mixing" },
      { href: "/biochar/application", label: "Application" },
      { href: "/biochar/fuel", label: "Fuel" },
      { href: "/biochar/farms", label: "Farms" },
      { href: "/biochar/feedstock", label: "Feedstock" },
    ],
  },
  {
    type: "group",
    label: "Operations",
    icon: "/icons/intents.svg",
    prefix: "/operations",
    children: [
      { href: "/operations", label: "Overview", exact: true },
      { href: "/operations/trainings", label: "Trainings" },
      { href: "/operations/inspections", label: "Inspections" },
      { href: "/operations/intents", label: "Intents" },
      { href: "/operations/queries", label: "Queries" },
      { href: "/operations/updates", label: "Updates" },
    ],
  },
  {
    type: "item",
    href: "/carbon",
    label: "Carbon",
    icon: "/icons/reports.svg",
  },
  {
    type: "item",
    href: "/users",
    label: "Users",
    icon: "/icons/users.svg",
  },
];

/** Flat list of all module links — useful for dashboard cards. */
export const DASHBOARD_SECTIONS = [
  {
    key: "network",
    title: "Network",
    description: "Producers, partners, clusters, farms, and field teams.",
    href: "/network",
    links: MAIN_NAV.find(
      (n): n is NavGroupConfig => n.type === "group" && n.label === "Network",
    )!.children,
  },
  {
    key: "biochar",
    title: "Biochar",
    description: "Production runs, mixing, application, and feedstock.",
    href: "/biochar",
    links: MAIN_NAV.find(
      (n): n is NavGroupConfig => n.type === "group" && n.label === "Biochar",
    )!.children,
  },
  {
    key: "operations",
    title: "Operations",
    description: "Trainings, inspections, intents, and field updates.",
    href: "/operations",
    links: MAIN_NAV.find(
      (n): n is NavGroupConfig =>
        n.type === "group" && n.label === "Operations",
    )!.children,
  },
  {
    key: "carbon",
    title: "Carbon",
    description: "Credits, removals, and MRV reporting.",
    href: "/carbon",
    links: [{ href: "/carbon", label: "Overview" }],
  },
  {
    key: "users",
    title: "Users",
    description: "Admins, managers, supervisors, and climapreneur accounts.",
    href: "/users",
    links: [{ href: "/users", label: "Manage users" }],
  },
] as const;
