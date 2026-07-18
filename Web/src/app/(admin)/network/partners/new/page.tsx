"use client";

import { useRouter } from "next/navigation";
import PartnerForm from "../PartnerForm";

export default function NewPartnerPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push("/network/partners")}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to partners
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          Add Partner
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Onboard a partner organisation with banking and compliance documents.
        </p>
      </div>

      <PartnerForm
        mode="create"
        onSuccess={(id) => router.push(`/network/partners/${id}`)}
        onCancel={() => router.push("/network/partners")}
      />
    </div>
  );
}
