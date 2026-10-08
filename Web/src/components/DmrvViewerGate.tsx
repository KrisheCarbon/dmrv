"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { dmrvViewerPathAllowed, isDmrvViewer } from "@/lib/roles";

const PortalRoleContext = createContext("");

export function usePortalRole() {
  return useContext(PortalRoleContext);
}

export function useIsDmrvViewer() {
  return isDmrvViewer(usePortalRole());
}

export default function DmrvViewerGate({
  role,
  children,
}: {
  role: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const blocked = isDmrvViewer(role) && !dmrvViewerPathAllowed(pathname);

  useEffect(() => {
    if (blocked) router.replace("/biochar/production");
  }, [blocked, router]);

  if (blocked) return null;
  return <PortalRoleContext.Provider value={role}>{children}</PortalRoleContext.Provider>;
}
