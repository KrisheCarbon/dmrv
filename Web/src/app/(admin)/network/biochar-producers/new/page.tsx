"use client";

import { useRouter } from "next/navigation";
import BiocharProducerForm from "../BiocharProducerForm";

export default function NewBiocharProducerPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push("/network/biochar-producers")}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to producers
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          Add Biochar Producer
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Register a new producer, assign supervisors, and upload documents.
        </p>
      </div>

      <BiocharProducerForm
        mode="create"
        onCancel={() => router.push("/network/biochar-producers")}
      />
    </div>
  );
}
