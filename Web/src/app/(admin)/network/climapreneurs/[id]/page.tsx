"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import EditBankAccountModal from "../EditBankAccountModal";
import { getClimapreneur } from "../actions";
import type { Climapreneur } from "@/types";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-neutral-100 py-4 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-8">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

function formatStatus(status?: string | null) {
  if (status === "disabled") return "Disabled";
  if (status === "pending_auth") return "Pending signup";
  if (status === "active") return "Active";
  return status ?? "—";
}

export default function ClimapreneurDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<Climapreneur | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBankModal, setShowBankModal] = useState(false);

  async function fetchClimapreneur() {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const climapreneur = await getClimapreneur(id);
      setData(climapreneur);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load climapreneur",
      );
      setData(null);
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchClimapreneur();
  }, [id]);

  function handleBankFormSuccess() {
    setShowBankModal(false);
    fetchClimapreneur();
  }

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading...</p>;
  }

  if (error && !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">
          Could not load climapreneur: {error}
        </p>
        <button
          type="button"
          onClick={() => router.push("/network/climapreneurs")}
          className="text-sm text-brand-dark hover:underline"
        >
          Back to climapreneurs
        </button>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-red-600">Climapreneur not found.</p>;
  }

  const displayName = data.full_name?.trim() || "Unnamed climapreneur";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push("/network/climapreneurs")}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to climapreneurs
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          {displayName}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">{data.email}</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/40">
        <div className="border-b border-neutral-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">Profile</h2>
        </div>

        <dl className="px-6 py-2">
          <DetailRow label="Full name">{displayName}</DetailRow>
          <DetailRow label="Email">{data.email}</DetailRow>
          <DetailRow label="Phone">{data.phone || "—"}</DetailRow>
          <DetailRow label="Status">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                data.status === "disabled"
                  ? "bg-neutral-100 text-neutral-600"
                  : data.status === "pending_auth"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-brand-green/10 text-brand-dark"
              }`}
            >
              {formatStatus(data.status)}
            </span>
          </DetailRow>
        </dl>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/40">
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">Bank details</h2>
          {data.has_bank_account ? (
            <button
              type="button"
              onClick={() => setShowBankModal(true)}
              className="inline-flex min-h-[38px] items-center justify-center rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
            >
              Edit
            </button>
          ) : null}
        </div>

        {data.has_bank_account && data.bank_account ? (
          <dl className="px-6 py-2">
            <DetailRow label="Account holder name">
              {data.bank_account.account_holder_name}
            </DetailRow>
            <DetailRow label="Account number">
              {data.bank_account.account_number}
            </DetailRow>
            <DetailRow label="IFSC code">{data.bank_account.ifsc_code}</DetailRow>
            <DetailRow label="Bank name">{data.bank_account.bank_name}</DetailRow>
            <DetailRow label="Branch">{data.bank_account.branch}</DetailRow>
            <DetailRow label="Bank address">
              {data.bank_account.bank_address}
            </DetailRow>
            <DetailRow label="UPI ID">
              {data.bank_account.upi_id || "—"}
            </DetailRow>
          </dl>
        ) : (
          <div className="space-y-4 px-6 py-6">
            <p className="text-sm text-neutral-500">
              No bank details on file yet. Add them so payouts can be processed.
            </p>
            <button
              type="button"
              onClick={() => setShowBankModal(true)}
              className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark-hover"
            >
              Add bank details
            </button>
          </div>
        )}
      </section>

      <EditBankAccountModal
        climapreneur={showBankModal ? data : null}
        onClose={() => setShowBankModal(false)}
        onSuccess={handleBankFormSuccess}
      />
    </div>
  );
}
