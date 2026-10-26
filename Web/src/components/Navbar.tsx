"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import NotificationMenu from "@/components/NotificationMenu";

interface NavbarProps {
  initials: string;
  displayName?: string;
}

export default function Navbar({ initials, displayName }: NavbarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth");
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="h-full flex items-center justify-between px-6">
      <div className="flex items-center">
        <img
          src="/icons/logo-horizontal.png"
          alt="KriSHE Carbon"
          className="h-11 w-auto"
        />
      </div>

      <div className="flex items-center gap-4">
        <NotificationMenu />

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-dark text-sm font-medium text-white"
            title={displayName}
          >
            {initials}
          </button>

          {open && (
            <div className="absolute right-0 z-50 mt-2 w-48 rounded-2xl border border-[var(--border)] bg-white shadow-lg">
              {displayName && (
                <div className="border-b border-[var(--border)] px-4 py-3">
                  <p className="truncate text-sm font-medium text-brand-dark">
                    {displayName}
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="min-h-12 w-full px-4 text-left text-sm text-status-error hover:bg-status-error-bg"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
