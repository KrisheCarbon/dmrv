"use client";

import { useRouter } from "next/navigation";
import FarmForm from "../../farms/FarmForm";

export default function NewFarmerPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push("/network/farmers")}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to farmers
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          Add farmer
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Register the farmer. Farms, soil samples, and consent can be added from
          the farmer record.
        </p>
      </div>

      <FarmForm
        mode="create"
        onSuccess={(id) => router.push(`/network/farmers/${id}`)}
        onCancel={() => router.push("/network/farmers")}
      />
    </div>
  );
}
