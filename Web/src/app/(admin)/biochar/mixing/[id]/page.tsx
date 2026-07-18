"use client";

import { useParams, useRouter } from "next/navigation";
import MixingEntryReviewPanel from "../MixingEntryReviewPanel";

export default function MixingEntryViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  if (!id) return null;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => router.push("/biochar/mixing")}
        className="text-sm text-neutral-500 hover:text-brand-dark"
      >
        ← Mixing
      </button>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <MixingEntryReviewPanel entryId={id} fullPage />
      </div>
    </div>
  );
}
