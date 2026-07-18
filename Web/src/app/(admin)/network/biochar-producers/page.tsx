"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DataTable from "@/components/table/DataTable";
import { listProducers } from "./actions";
import { formatProducerClass, formatSiteModel } from "./producerLib";

interface ProducerRow extends Record<string, unknown> {
  id: string;
  name: string;
  contact: string;
  producerClass: string;
  model: string;
  sites: number;
  status: string;
}

export default function BiocharProducersPage() {
  const [producers, setProducers] = useState<ProducerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchProducers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listProducers();
      setProducers(
        data.map((p) => ({
          id: p.id,
          name: p.name ?? "—",
          contact: p.contact_name ?? "—",
          producerClass: formatProducerClass(p.producer_class),
          model: p.operation_model ? formatSiteModel(p.operation_model) : "—",
          sites: p.producer_sites?.length ?? 0,
          status:
            p.status === "inactive"
              ? "Inactive"
              : p.status === "active"
                ? "Active"
                : "—",
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load producers");
      setProducers([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProducers();
  }, [fetchProducers]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
            Biochar Producers
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Manage biochar producers across your network.
          </p>
        </div>
        <Link
          href="/network/biochar-producers/new"
          className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark-hover"
        >
          + Add producer
        </Link>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load producers: {error}
        </div>
      ) : null}

      <DataTable
        loading={loading}
        columns={[
          { key: "name", label: "Name" },
          { key: "contact", label: "Contact" },
          { key: "producerClass", label: "Class" },
          { key: "model", label: "Model" },
          { key: "sites", label: "Sites" },
          { key: "status", label: "Status" },
        ]}
        rows={producers}
        actions={(row) => (
          <button
            type="button"
            onClick={() => router.push(`/network/biochar-producers/${row.id}`)}
            className="text-sm font-medium text-brand-dark hover:underline"
          >
            Open
          </button>
        )}
      />
    </div>
  );
}
