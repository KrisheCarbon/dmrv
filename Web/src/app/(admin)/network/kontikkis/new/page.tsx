"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import KontikkiForm from "../KontikkiForm";

function NewKontikkiContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const producerId = searchParams.get("producerId") ?? undefined;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push("/network/kontikkis")}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to kontikkis
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          Add Pyrolysis Unit (Kon-Tiki)
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Register a new kontikki, assign operators, and upload photos and design
          documents.
        </p>
      </div>

      <KontikkiForm
        mode="create"
        defaultProducerId={producerId}
        onSuccess={(id) => router.push(`/network/kontikkis/${id}`)}
        onCancel={() => router.push("/network/kontikkis")}
      />
    </div>
  );
}

export default function NewKontikkiPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Loading...</p>}>
      <NewKontikkiContent />
    </Suspense>
  );
}
