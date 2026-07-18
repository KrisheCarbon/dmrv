"use client";

import { useParams, useRouter } from "next/navigation";
import ApplicationEntryReviewPanel from "../ApplicationEntryReviewPanel";

export default function ApplicationEntryViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  if (!id) return null;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => router.push("/biochar/application")}
        className="text-sm text-neutral-500 hover:text-brand-dark"
      >
        ← Application
      </button>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <ApplicationEntryReviewPanel entryId={id} fullPage />
      </div>
    </div>
  );
}
