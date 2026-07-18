"use client";

import { useParams, useRouter } from "next/navigation";
import PyrolysisBatchReviewPanel from "../PyrolysisBatchReviewPanel";

export default function PyrolysisBatchViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  if (!id) return null;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => router.push("/biochar/production")}
        className="text-sm text-neutral-500 hover:text-brand-dark"
      >
        ← Production
      </button>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <PyrolysisBatchReviewPanel batchId={id} fullPage />
      </div>
    </div>
  );
}
