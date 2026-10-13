"use client";

import { useParams, useRouter } from "next/navigation";
import BiomassCollectionPanel from "../BiomassCollectionPanel";

export default function BiomassCollectionViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  if (!id) return null;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => router.push("/biochar/biomass-collection")}
        className="text-sm text-neutral-500 hover:text-brand-dark"
      >
        ← Biomass collection
      </button>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <BiomassCollectionPanel collectionId={id} fullPage />
      </div>
    </div>
  );
}
