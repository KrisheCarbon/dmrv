"use client";

import { useRouter } from "next/navigation";
import FeedstockForm from "../FeedstockForm";

export default function NewFeedstockPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push("/biochar/feedstock")}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to feedstock
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          Add Feedstock
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Register a biomass feedstock with lab characteristics and supporting
          documents.
        </p>
      </div>

      <FeedstockForm
        mode="create"
        onSuccess={(id) => router.push(`/biochar/feedstock/${id}`)}
        onCancel={() => router.push("/biochar/feedstock")}
      />
    </div>
  );
}
