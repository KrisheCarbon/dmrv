"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { listProducers } from "@/app/(admin)/network/biochar-producers/actions";
import {
  uploadFeedstockAsset,
  type FeedstockAssetType,
} from "@/lib/uploadFeedstockAssets";
import {
  fileNameFromStoragePath,
  ORGANIZATION_DOCUMENT_ACCEPT,
} from "@/lib/privateStorage";
import {
  createFeedstock,
  updateFeedstock,
  type FeedstockUpdatePayload,
} from "./actions";
import {
  LAB_STATUS_OPTIONS,
  METHANE_STRATEGY_OPTIONS,
  type FeedstockSavePayload,
} from "./feedstockLib";
import type {
  BiocharProducerDetail,
  FeedstockDetail,
  FeedstockLabStatus,
  MethaneCompensationStrategy,
} from "@/types";

interface FeedstockFormProps {
  mode: "create" | "edit";
  data?: FeedstockDetail | null;
  onCancel: () => void;
  onSuccess?: (id: string) => void;
}

interface FeedstockFormState {
  biomass_type: string;
  biochar_producer_id: string;
  biochar_bulk_density_kg_m3: string;
  carbon_content_percent: string;
  hc_ratio: string;
  lab_status: FeedstockLabStatus;
  lab_submission_date: string;
  lab_analysis_date: string;
  biomass_preparation_instruction: string;
  methane_compensation_strategy: MethaneCompensationStrategy;
}

const sectionClass =
  "space-y-4 border-t border-neutral-100 pt-6 first:border-t-0 first:pt-0";
const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20";
const labelClass = "text-sm font-medium text-neutral-700";

function toDateInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function feedstockToFormState(feedstock: FeedstockDetail): FeedstockFormState {
  const producer = Array.isArray(feedstock.biochar_producer)
    ? feedstock.biochar_producer[0]
    : feedstock.biochar_producer;

  return {
    biomass_type: feedstock.biomass_type,
    biochar_producer_id: producer?.id ?? feedstock.biochar_producer_id ?? "",
    biochar_bulk_density_kg_m3: String(feedstock.biochar_bulk_density_kg_m3),
    carbon_content_percent: String(feedstock.carbon_content_percent),
    hc_ratio: String(feedstock.hc_ratio),
    lab_status: feedstock.lab_status,
    lab_submission_date: toDateInput(feedstock.lab_submission_date),
    lab_analysis_date: toDateInput(feedstock.lab_analysis_date),
    biomass_preparation_instruction:
      feedstock.biomass_preparation_instruction ?? "",
    methane_compensation_strategy: feedstock.methane_compensation_strategy,
  };
}

function emptyFormState(): FeedstockFormState {
  return {
    biomass_type: "",
    biochar_producer_id: "",
    biochar_bulk_density_kg_m3: "",
    carbon_content_percent: "",
    hc_ratio: "",
    lab_status: "estimated",
    lab_submission_date: "",
    lab_analysis_date: "",
    biomass_preparation_instruction: "",
    methane_compensation_strategy: "offsetting_from_scp_fraction",
  };
}

interface PendingFile {
  clientId: string;
  file: File;
}

interface FileUploadState {
  savedPath: string | null;
  pending: PendingFile | null;
  removeSaved: boolean;
}

function emptyFileUpload(savedPath: string | null = null): FileUploadState {
  return { savedPath, pending: null, removeSaved: false };
}

function fileUploadFromFeedstock(
  docUrl?: string | null,
  imageUrl?: string | null,
): FileUploadState {
  return emptyFileUpload(docUrl ?? imageUrl ?? null);
}

function activeSavedPath(upload: FileUploadState): string | null {
  if (!upload.savedPath || upload.removeSaved || upload.pending) return null;
  return upload.savedPath;
}

function DocumentUploadSection({
  title,
  hint,
  upload,
  onAddFiles,
  onRemoveSaved,
  onRemovePending,
}: {
  title: string;
  hint: string;
  upload: FileUploadState;
  onAddFiles: (files: FileList | null) => void;
  onRemoveSaved: () => void;
  onRemovePending: () => void;
}) {
  const savedPath = activeSavedPath(upload);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-neutral-800">{title}</p>
        <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>
      </div>

      <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-600">
            Take a photo or drag and drop files here.
          </p>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50">
              Upload
              <input
                type="file"
                accept={ORGANIZATION_DOCUMENT_ACCEPT}
                className="hidden"
                onChange={(e) => onAddFiles(e.target.files)}
              />
            </label>
          </div>
        </div>
      </div>

      {savedPath || upload.pending ? (
        <ul className="space-y-2">
          {savedPath ? (
            <li className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2">
              <span className="truncate text-sm text-neutral-700">
                {fileNameFromStoragePath(savedPath)}
              </span>
              <button
                type="button"
                onClick={onRemoveSaved}
                className="text-sm text-red-600 transition hover:text-red-700"
              >
                Delete
              </button>
            </li>
          ) : null}
          {upload.pending ? (
            <li className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2">
              <span className="truncate text-sm text-neutral-700">
                {upload.pending.file.name}
              </span>
              <button
                type="button"
                onClick={onRemovePending}
                className="text-sm text-red-600 transition hover:text-red-700"
              >
                Delete
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function hasLabReport(upload: FileUploadState): boolean {
  return Boolean(activeSavedPath(upload) || upload.pending);
}

function applyFileUploadToPayload(
  upload: FileUploadState,
  docKey: "lab_report_doc_url" | "ghg_avoidance_approval_doc_url",
  imageKey: "lab_report_image_url" | "ghg_avoidance_approval_image_url",
  target: FeedstockUpdatePayload,
): File | null {
  if (upload.pending) {
    return upload.pending.file;
  }

  if (upload.removeSaved) {
    target[docKey] = null;
    target[imageKey] = null;
  }

  return null;
}

export default function FeedstockForm({
  mode,
  data = null,
  onCancel,
  onSuccess,
}: FeedstockFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [producers, setProducers] = useState<BiocharProducerDetail[]>([]);
  const [producersLoading, setProducersLoading] = useState(true);
  const [labReportUpload, setLabReportUpload] = useState<FileUploadState>(() =>
    fileUploadFromFeedstock(
      data?.lab_report_doc_url,
      data?.lab_report_image_url,
    ),
  );
  const [ghgApprovalUpload, setGhgApprovalUpload] = useState<FileUploadState>(
    () =>
      fileUploadFromFeedstock(
        data?.ghg_avoidance_approval_doc_url,
        data?.ghg_avoidance_approval_image_url,
      ),
  );
  const [form, setForm] = useState<FeedstockFormState>(() =>
    data ? feedstockToFormState(data) : emptyFormState(),
  );

  useEffect(() => {
    async function loadProducers() {
      setProducersLoading(true);
      try {
        const rows = await listProducers();
        setProducers(rows);
      } catch {
        setProducers([]);
      } finally {
        setProducersLoading(false);
      }
    }

    loadProducers();
  }, []);

  function updateField<K extends keyof FeedstockFormState>(
    key: K,
    value: FeedstockFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildPayload(): FeedstockSavePayload | null {
    if (!form.biomass_type.trim()) {
      setError("Biomass type is required.");
      return null;
    }

    if (!form.biochar_producer_id) {
      setError("Producer is required.");
      return null;
    }

    const bulkDensity = Number(form.biochar_bulk_density_kg_m3);
    if (
      !form.biochar_bulk_density_kg_m3 ||
      Number.isNaN(bulkDensity) ||
      bulkDensity < 100 ||
      bulkDensity > 700
    ) {
      setError("Biochar bulk density must be between 100 and 700 kg/m³.");
      return null;
    }

    const carbonContent = Number(form.carbon_content_percent);
    if (
      !form.carbon_content_percent ||
      Number.isNaN(carbonContent) ||
      carbonContent <= 0 ||
      carbonContent > 100
    ) {
      setError("Carbon content must be between 0 and 100%.");
      return null;
    }

    const hcRatio = Number(form.hc_ratio);
    if (!form.hc_ratio || Number.isNaN(hcRatio) || hcRatio >= 0.4) {
      setError("H/C ratio must be less than 0.4.");
      return null;
    }

    if (!form.lab_submission_date) {
      setError("Lab submission date is required.");
      return null;
    }

    if (!form.lab_analysis_date) {
      setError("Lab analysis date is required.");
      return null;
    }

    return {
      biomass_type: form.biomass_type.trim(),
      biochar_producer_id: form.biochar_producer_id,
      biochar_bulk_density_kg_m3: bulkDensity,
      carbon_content_percent: carbonContent,
      hc_ratio: hcRatio,
      lab_status: form.lab_status,
      lab_submission_date: form.lab_submission_date,
      lab_analysis_date: form.lab_analysis_date,
      biomass_preparation_instruction:
        form.biomass_preparation_instruction.trim() || null,
      methane_compensation_strategy: form.methane_compensation_strategy,
    };
  }

  function addFile(
    files: FileList | null,
    setUpload: Dispatch<SetStateAction<FileUploadState>>,
  ) {
    const file = files?.[0];
    if (!file) return;

    setUpload((prev) => ({
      ...prev,
      pending: { clientId: crypto.randomUUID(), file },
      removeSaved: false,
    }));
  }

  function removeSavedFile(
    setUpload: Dispatch<SetStateAction<FileUploadState>>,
  ) {
    setUpload((prev) => ({ ...prev, removeSaved: true }));
  }

  function removePendingFile(
    setUpload: Dispatch<SetStateAction<FileUploadState>>,
  ) {
    setUpload((prev) => ({ ...prev, pending: null }));
  }

  async function uploadFileIfNeeded(
    feedstockId: string,
    file: File | null,
    type: FeedstockAssetType,
    docKey: "lab_report_doc_url" | "ghg_avoidance_approval_doc_url",
    imageKey: "lab_report_image_url" | "ghg_avoidance_approval_image_url",
    target: FeedstockUpdatePayload,
  ) {
    if (!file) return;

    target[docKey] = await uploadFeedstockAsset({
      file,
      feedstockId,
      type,
    });
    target[imageKey] = null;
  }

  async function applyFileUploads(
    feedstockId: string,
    target: FeedstockUpdatePayload,
  ) {
    const labReportFile = applyFileUploadToPayload(
      labReportUpload,
      "lab_report_doc_url",
      "lab_report_image_url",
      target,
    );
    const ghgFile = applyFileUploadToPayload(
      ghgApprovalUpload,
      "ghg_avoidance_approval_doc_url",
      "ghg_avoidance_approval_image_url",
      target,
    );

    await uploadFileIfNeeded(
      feedstockId,
      labReportFile,
      "lab_report",
      "lab_report_doc_url",
      "lab_report_image_url",
      target,
    );
    await uploadFileIfNeeded(
      feedstockId,
      ghgFile,
      "ghg_avoidance_approval",
      "ghg_avoidance_approval_doc_url",
      "ghg_avoidance_approval_image_url",
      target,
    );
  }

  async function handleSubmit() {
    setError(null);

    const payload = buildPayload();
    if (!payload) return;

    if (!hasLabReport(labReportUpload)) {
      setError("Lab report is required.");
      return;
    }

    setLoading(true);

    try {
      if (isEdit && data) {
        const updatePayload: FeedstockUpdatePayload = { ...payload };
        await applyFileUploads(data.id, updatePayload);
        await updateFeedstock(data.id, updatePayload);

        if (onSuccess) {
          onSuccess(data.id);
        } else {
          router.push(`/biochar/feedstock/${data.id}`);
        }
        return;
      }

      const feedstock = await createFeedstock(payload);
      const filePayload: FeedstockUpdatePayload = {};
      await applyFileUploads(feedstock.id, filePayload);
      await updateFeedstock(feedstock.id, filePayload);

      if (onSuccess) {
        onSuccess(feedstock.id);
      } else {
        router.push(`/biochar/feedstock/${feedstock.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save feedstock");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-200/40">
      <section className={sectionClass}>
        <h3 className="text-lg font-semibold text-neutral-950">
          Feedstock details
        </h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className={labelClass}>Biomass type *</label>
            <input
              className={inputClass}
              value={form.biomass_type}
              onChange={(e) => updateField("biomass_type", e.target.value)}
              placeholder="e.g. Rice husk"
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Producer *</label>
            <select
              className={inputClass}
              value={form.biochar_producer_id}
              onChange={(e) =>
                updateField("biochar_producer_id", e.target.value)
              }
              disabled={producersLoading}
            >
              <option value="">
                {producersLoading ? "Loading producers..." : "Select producer"}
              </option>
              {producers.map((producer) => (
                <option key={producer.id} value={producer.id}>
                  {producer.name}
                  {producer.producer_code ? ` (${producer.producer_code})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <h3 className="text-lg font-semibold text-neutral-950">
          Biochar characteristics
        </h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <label className={labelClass}>
              Biochar bulk density (kg/m³) *
            </label>
            <input
              type="number"
              min={100}
              max={700}
              step="0.01"
              className={inputClass}
              value={form.biochar_bulk_density_kg_m3}
              onChange={(e) =>
                updateField("biochar_bulk_density_kg_m3", e.target.value)
              }
              placeholder="100–700"
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Carbon content (%) *</label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              className={inputClass}
              value={form.carbon_content_percent}
              onChange={(e) =>
                updateField("carbon_content_percent", e.target.value)
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>H/C ratio (&lt; 0.4) *</label>
            <input
              type="number"
              min={0}
              max={0.3999}
              step="0.0001"
              className={inputClass}
              value={form.hc_ratio}
              onChange={(e) => updateField("hc_ratio", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <h3 className="text-lg font-semibold text-neutral-950">
          Lab status and dates
        </h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <label className={labelClass}>Lab status *</label>
            <select
              className={inputClass}
              value={form.lab_status}
              onChange={(e) =>
                updateField(
                  "lab_status",
                  e.target.value as FeedstockLabStatus,
                )
              }
            >
              {LAB_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Lab submission date *</label>
            <input
              type="date"
              className={inputClass}
              value={form.lab_submission_date}
              onChange={(e) =>
                updateField("lab_submission_date", e.target.value)
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Lab analysis date *</label>
            <input
              type="date"
              className={inputClass}
              value={form.lab_analysis_date}
              onChange={(e) => updateField("lab_analysis_date", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <h3 className="text-lg font-semibold text-neutral-950">
          Preparation and methane compensation
        </h3>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-1.5">
            <label className={labelClass}>
              Biomass preparation instruction
            </label>
            <textarea
              rows={3}
              className={inputClass}
              value={form.biomass_preparation_instruction}
              onChange={(e) =>
                updateField("biomass_preparation_instruction", e.target.value)
              }
              placeholder="Optional notes on drying, sizing, or pre-treatment."
            />
          </div>
          <div className="space-y-1.5 md:max-w-xl">
            <label className={labelClass}>
              Methane compensation strategy *
            </label>
            <select
              className={inputClass}
              value={form.methane_compensation_strategy}
              onChange={(e) =>
                updateField(
                  "methane_compensation_strategy",
                  e.target.value as MethaneCompensationStrategy,
                )
              }
            >
              {METHANE_STRATEGY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <h3 className="text-lg font-semibold text-neutral-950">
          Lab report and GHG approval
        </h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <DocumentUploadSection
            title="Lab report *"
            hint="Upload the lab report as a PDF or image."
            upload={labReportUpload}
            onAddFiles={(files) => addFile(files, setLabReportUpload)}
            onRemoveSaved={() => removeSavedFile(setLabReportUpload)}
            onRemovePending={() => removePendingFile(setLabReportUpload)}
          />
          <DocumentUploadSection
            title="GHG avoidance approval - Optional"
            hint="Upload approval as a PDF or image."
            upload={ghgApprovalUpload}
            onAddFiles={(files) => addFile(files, setGhgApprovalUpload)}
            onRemoveSaved={() => removeSavedFile(setGhgApprovalUpload)}
            onRemovePending={() => removePendingFile(setGhgApprovalUpload)}
          />
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={handleSubmit}
          className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark-hover disabled:opacity-50"
        >
          {loading
            ? "Saving..."
            : isEdit
              ? "Save changes"
              : "Create feedstock"}
        </button>
      </div>
    </div>
  );
}
