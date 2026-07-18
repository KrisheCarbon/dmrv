"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { getNavForRole } from "@/lib/nav-helpers";
import type { NavGroupConfig } from "@/lib/navigation";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";

interface SidebarProps {
  role: UserRole | string;
}

export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const navItems = getNavForRole(role);

  return (
    <nav className="p-4 space-y-1 mt-2">
      <p className="px-4 pb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
        {ROLE_LABELS[role as UserRole] ?? role}
      </p>

      {navItems.map((item) =>
        item.type === "item" ? (
          <SidebarItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            pathname={pathname}
          />
        ) : (
          <SidebarGroup key={item.label} item={item} pathname={pathname} />
        ),
      )}
    </nav>
  );
}

function SidebarGroup({
  item,
  pathname,
}: {
  item: NavGroupConfig;
  pathname: string;
}) {
  const isActive = pathname.startsWith(item.prefix);
  const [open, setOpen] = useState(isActive);
  const [prevIsActive, setPrevIsActive] = useState(isActive);

  if (isActive !== prevIsActive) {
    setPrevIsActive(isActive);
    setOpen(isActive);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex w-full items-center gap-3 px-4 py-2.5 rounded-md text-base transition
          ${
            isActive
              ? "bg-gray-100 text-gray-900 Sbold"
              : "text-gray-600 hover:bg-gray-50 Snormal"
          }`}
      >
        <img src={item.icon} className="h-5 w-5 opacity-80" alt="" />
        <span className="flex-1 text-left">{item.label}</span>
        <span className="text-xs text-gray-400">{open ? "▾" : "▸"}</span>
      </button>

      {open ? (
        <div className="ml-8 mt-1 mb-1 space-y-0.5">
          {item.children.map((child) => (
            <SubItem
              key={child.href}
              href={child.href}
              label={child.label}
              pathname={pathname}
              exact={child.exact}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function SidebarItem({
  href,
  label,
  icon,
  pathname,
}: {
  href: string;
  label: string;
  icon: string;
  pathname: string;
}) {
  const active =
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) ||
    (href !== "/" && pathname === href);

  const isDashboard = href === "/" && pathname === "/";

  return (
    <Link
      href={href}
      className={`relative flex items-center gap-3 px-4 py-2.5 rounded-md text-base transition
        ${active || isDashboard ? "bg-gray-100 text-gray-900 Sbold" : "text-gray-600 hover:bg-gray-50 Snormal"}
      `}
    >
      {(active || isDashboard) && (
        <span className="absolute left-0 top-1 bottom-1 w-1 bg-brand-dark rounded-r" />
      )}
      <img src={icon} className="h-5 w-5 opacity-80" alt="" />
      <span className="tracking-tight">{label}</span>
    </Link>
  );
}

function SubItem({
  href,
  label,
  pathname,
  exact = false,
}: {
  href: string;
  label: string;
  pathname: string;
  exact?: boolean;
}) {
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`block px-3 py-1.5 rounded-md text-sm transition
        ${active ? "bg-gray-50 text-gray-900 Smedium" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50 Snormal"}
      `}
    >
      {label}
    </Link>
  );
}
