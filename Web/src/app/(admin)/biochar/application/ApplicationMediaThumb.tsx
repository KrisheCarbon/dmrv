"use client";

import { useState } from "react";
import PhotoPreviewLightbox from "../PhotoPreviewLightbox";

export default function ApplicationMediaThumb({
  url,
  mediaType,
  label = "Application media",
  size = "drawer",
}: {
  url?: string | null;
  mediaType: "photo" | "video";
  label?: string;
  size?: "drawer" | "page";
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const heightClass =
    size === "drawer" ? "aspect-[4/3] min-h-[11rem]" : "aspect-[4/3] min-h-[9rem]";
  const emptyClass = size === "drawer" ? "min-h-[11rem] py-8" : "min-h-[9rem] py-6";

  if (!url) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-3 text-center text-xs text-neutral-400 ${emptyClass}`}
      >
        No media
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className={`group relative block w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 ${heightClass}`}
        aria-label={`View ${label}`}
      >
        {mediaType === "video" ? (
          <video
            src={url}
            className="h-full w-full object-contain"
            muted
            playsInline
          />
        ) : (
          <img src={url} alt={label} className="h-full w-full object-contain" />
        )}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition duration-200 group-hover:bg-black/35">
          <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-neutral-900 opacity-0 shadow-sm transition duration-200 group-hover:opacity-100">
            View
          </span>
        </span>
      </button>

      {previewOpen ? (
        mediaType === "video" ? (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
            onClick={() => setPreviewOpen(false)}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="absolute right-4 top-4 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm"
            >
              Close
            </button>
            <video
              src={url}
              controls
              autoPlay
              className="max-h-[90vh] max-w-full"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        ) : (
          <PhotoPreviewLightbox
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            src={url}
            label={label}
          />
        )
      ) : null}
    </>
  );
}
