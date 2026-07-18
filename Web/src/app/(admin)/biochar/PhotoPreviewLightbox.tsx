"use client";

import { useEffect } from "react";

export default function PhotoPreviewLightbox({
  open,
  onClose,
  src,
  label,
}: {
  open: boolean;
  onClose: () => void;
  src: string;
  label: string;
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${label} photo preview`}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
      >
        Close
      </button>
      <div
        className="flex max-h-[90vh] max-w-full flex-col items-center gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <img src={src} alt={label} className="max-h-[82vh] max-w-full object-contain" />
        <p className="rounded-lg bg-black/50 px-3 py-1 text-sm text-white backdrop-blur-sm">
          {label}
        </p>
      </div>
    </div>
  );
}
