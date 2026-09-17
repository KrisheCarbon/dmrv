"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import Modal from "@/components/Modal";
import SignedStorageLink from "@/components/SignedStorageLink";
import DataTable from "@/components/table/DataTable";
import { unwrapQuery } from "@/lib/queryResult";
import { soilTestStatusLabel, SOIL_REPORTS_BUCKET } from "@krishecarbon/shared";
import type { SoilTestRecord } from "@krishecarbon/shared";
import {
  SOIL_REPORT_ACCEPT,
  uploadSoilReportPdf,
} from "@/lib/uploadSoilReports";
import { attachSoilReport, listSoilTests, receiveSoilTest } from "./actions";

interface SoilTableRow {
  id: string;
  farmer: string;
  date: string;
  status: string;
  supervisor: string;
  fields: string;
  raw: SoilTestRecord;
  [key: string]: unknown;
}

function mapRow(record: SoilTestRecord): SoilTableRow {
  return {
    id: record.id,
    farmer: record.farm?.farmer_name || "—",
    date: record.sample_date,
    status: soilTestStatusLabel(record.status),
    supervisor:
      record.submitted_to_supervisor?.full_name?.trim() ||
      record.collected_by_user?.full_name?.trim() ||
      "—",
    fields:
      record.fields?.map((field) => field.field_code).filter(Boolean).join(", ") ||
      "—",
    raw: record,
  };
}

export default function NetworkSoilTestsPage() {
  const [rows, setRows] = useState<SoilTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<SoilTestRecord | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tests = unwrapQuery(
        await listSoilTests(),
        "Failed to load soil tests",
      );
      setRows(tests.map(mapRow));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load soil tests");
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleReceive(record: SoilTestRecord) {
    try {
      await receiveSoilTest(record.id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark received");
    }
  }

  async function handleUpload() {
    if (!selected) return;
    if (!pdfFile) {
      setFormError("Choose a PDF to upload.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const path = await uploadSoilReportPdf({
        file: pdfFile,
        soilTestId: selected.id,
      });
      await attachSoilReport(selected.id, {
        document_url: path,
        source: "Lab report",
      });
      setModalOpen(false);
      setSelected(null);
      setPdfFile(null);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  const latestReport = selected?.reports?.[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Soil tests
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Receive climapreneur samples and upload the lab PDF. Climapreneurs see reports on the farmer record.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <DataTable
        loading={loading}
        columns={[
          { key: "farmer", label: "Farmer" },
          { key: "fields", label: "Fields" },
          { key: "date", label: "Sample date" },
          { key: "supervisor", label: "Supervisor" },
          { key: "status", label: "Status" },
        ]}
        rows={rows}
        actions={(row) => (
          <div className="flex justify-end gap-3">
            {row.raw.status === "submitted" ? (
              <button
                type="button"
                onClick={() => handleReceive(row.raw)}
                className="text-sm font-medium text-brand-dark hover:underline"
              >
                Mark received
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setSelected(row.raw);
                setPdfFile(null);
                setFormError(null);
                setModalOpen(true);
              }}
              className="text-sm font-medium text-brand-dark hover:underline"
            >
              Upload PDF
            </button>
          </div>
        )}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Upload soil report"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              disabled={saving}
              className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={saving}
              className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Uploading..." : "Save report"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Farmer: {selected?.farm?.farmer_name || "—"} · Sample {selected?.sample_date}
          </p>
          {latestReport?.document_url ? (
            <p className="text-sm text-neutral-600">
              Current file:{" "}
              <SignedStorageLink
                bucket={SOIL_REPORTS_BUCKET}
                path={latestReport.document_url}
                className="font-medium text-brand-dark hover:underline"
              >
                View PDF
              </SignedStorageLink>
            </p>
          ) : null}
          <input
            type="file"
            accept={SOIL_REPORT_ACCEPT}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setPdfFile(e.target.files?.[0] ?? null)
            }
            className="block w-full text-sm text-neutral-700 file:mr-4 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-4 file:py-2 file:text-sm file:font-medium"
          />
          {formError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
