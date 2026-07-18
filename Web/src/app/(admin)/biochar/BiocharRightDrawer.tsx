"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const BIOCHAR_DRAWER_WIDTH_CLASS = "w-[min(440px,38vw)]";
export const BIOCHAR_DRAWER_OFFSET_CLASS = "mr-[min(440px,38vw)]";

export default function BiocharRightDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <aside
      className={`biochar-right-drawer fixed top-16 right-0 bottom-0 z-30 flex ${BIOCHAR_DRAWER_WIDTH_CLASS} flex-col border-l border-neutral-200 bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.06)]`}
    >
      {children}
    </aside>,
    document.body,
  );
}
