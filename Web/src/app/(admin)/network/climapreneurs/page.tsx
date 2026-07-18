"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable from "@/components/table/DataTable";
import EditBankAccountModal from "./EditBankAccountModal";
import { listClimapreneurs } from "./actions";
import type { Climapreneur, ClimapreneurTableRow } from "@/types";

function formatStatus(status?: string | null) {
  if (status === "disabled") return "Disabled";
  if (status === "pending_auth") return "Pending signup";
  if (status === "active") return "Active";
  return status ?? "—";
}

function formatBankDetails(climapreneur: Climapreneur) {
  if (!climapreneur.has_bank_account || !climapreneur.bank_account) {
    return "Not added";
  }

  const { bank_name, ifsc_code, account_number } = climapreneur.bank_account;
  const maskedAccount =
    account_number.length > 4
      ? `****${account_number.slice(-4)}`
      : account_number;

  return `${bank_name} · ${ifsc_code} · ${maskedAccount}`;
}

function mapClimapreneurRow(climapreneur: Climapreneur): ClimapreneurTableRow {
  return {
    id: climapreneur.id,
    name: climapreneur.full_name?.trim() || "Unnamed climapreneur",
    email: climapreneur.email,
    phone: climapreneur.phone ?? "—",
    status: formatStatus(climapreneur.status),
    bankDetails: formatBankDetails(climapreneur),
    raw: climapreneur,
  };
}

export default function ClimapreneursPage() {
  const [rows, setRows] = useState<ClimapreneurTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingBank, setEditingBank] = useState<Climapreneur | null>(null);
  const router = useRouter();

  const fetchClimapreneurs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listClimapreneurs();
      setRows(data.map(mapClimapreneurRow));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load climapreneurs",
      );
      setRows([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchClimapreneurs();
  }, [fetchClimapreneurs]);

  function handleBankSaved() {
    setEditingBank(null);
    fetchClimapreneurs();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
            Climapreneurs
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Manage climapreneur accounts and bank details for payouts.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load climapreneurs: {error}
        </div>
      ) : null}

      <DataTable
        loading={loading}
        emptyText="No climapreneurs found. Create climapreneur users under Users first."
        columns={[
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "status", label: "Status" },
          {
            key: "bankDetails",
            label: "Bank details",
            render: (value, row) => {
              const hasBank = row.raw.has_bank_account;
              return (
                <span className={hasBank ? "text-neutral-900" : "text-amber-700"}>
                  {String(value ?? "—")}
                </span>
              );
            },
          },
        ]}
        rows={rows}
        actions={(row) => (
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setEditingBank(row.raw)}
              className="text-sm font-medium text-brand-dark hover:underline"
            >
              {row.raw.has_bank_account ? "Edit bank" : "Add bank"}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/network/climapreneurs/${row.id}`)}
              className="text-sm font-medium text-brand-dark hover:underline"
            >
              Open
            </button>
          </div>
        )}
      />

      <EditBankAccountModal
        climapreneur={editingBank}
        onClose={() => setEditingBank(null)}
        onSuccess={handleBankSaved}
      />
    </div>
  );
}
