"use client";

import { useRouter } from "next/navigation";
import FarmForm from "../FarmForm";

export default function NewFarmPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push("/network/farms")}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to farms
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          Add Farm
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Register a new farm, capture crop details, and track biochar interest.
        </p>
      </div>

      <FarmForm
        mode="create"
        onSuccess={(id) => router.push(`/network/farms/${id}`)}
        onCancel={() => router.push("/network/farms")}
      />
    </div>
  );
}
