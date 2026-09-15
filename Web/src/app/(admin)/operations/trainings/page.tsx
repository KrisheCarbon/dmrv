"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import Modal from "@/components/Modal";
import SignedStorageLink from "@/components/SignedStorageLink";
import DataTable from "@/components/table/DataTable";
import { supabase } from "@/lib/supabase";
import { canAccessNetwork, type UserRole } from "@/lib/roles";
import {
  deleteTrainingCertificate,
  TRAINING_CERTIFICATE_ACCEPT,
  TRAINING_DOCS_BUCKET,
  uploadTrainingCertificate,
} from "@/lib/uploadTrainingDocs";
import {
  createTraining,
  deleteTraining,
  getTrainingFormOptions,
  listTrainings,
  updateTraining,
} from "./actions";
import type {
  TrainingFormOptions,
  TrainingRecord,
  TrainingTableRow,
} from "@/types/entities";

function formatLocation(record: TrainingRecord): string {
  if (record.producer_site?.site_name) {
    const producerName = record.biochar_producer?.name;
    return producerName
      ? `${record.producer_site.site_name} (${producerName})`
      : record.producer_site.site_name;
  }
  return record.biochar_producer?.name ?? "—";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function mapTrainingRow(record: TrainingRecord): TrainingTableRow {
  return {
    id: record.id,
    supervisor: record.supervisor?.full_name?.trim() || "—",
    location: formatLocation(record),
    date: formatDate(record.created_at),
    raw: record,
  };
}

function locationValue(record: TrainingRecord): string {
  if (record.producer_site_id) {
    return `site:${record.producer_site_id}`;
  }
  if (record.biochar_producer_id) {
    return `producer:${record.biochar_producer_id}`;
  }
  return "";
}

function parseLocationValue(value: string): {
  location_type: "producer" | "site";
  location_id: string;
} | null {
  const [type, id] = value.split(":");
  if ((type !== "producer" && type !== "site") || !id) return null;
  return { location_type: type, location_id: id };
}

export default function OperationsTrainingsPage() {
  const [actorRole, setActorRole] = useState<UserRole | null>(null);
  const [rows, setRows] = useState<TrainingTableRow[]>([]);
  const [options, setOptions] = useState<TrainingFormOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingRecord | null>(null);
  const [supervisorId, setSupervisorId] = useState("");
  const [locationValueState, setLocationValueState] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canManage = actorRole ? canAccessNetwork(actorRole) : false;

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [trainings, formOptions] = await Promise.all([
        listTrainings(),
        getTrainingFormOptions(),
      ]);
      setRows(trainings.map(mapTrainingRow));
      setOptions(formOptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trainings");
      setRows([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profile?.role) {
          setActorRole(profile.role as UserRole);
        }
      }

      await loadData();
    }

    init();
  }, []);

  function resetForm() {
    setEditing(null);
    setSupervisorId("");
    setLocationValueState("");
    setPdfFile(null);
    setFormError(null);
  }

  function openCreateModal() {
    resetForm();
    setModalOpen(true);
  }

  function openEditModal(record: TrainingRecord) {
    setEditing(record);
    setSupervisorId(record.supervisor_id);
    setLocationValueState(locationValue(record));
    setPdfFile(null);
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    resetForm();
  }

  async function handleSave() {
    setFormError(null);

    if (!supervisorId) {
      setFormError("Select the supervisor who conducted the training.");
      return;
    }

    const location = parseLocationValue(locationValueState);
    if (!location) {
      setFormError("Select where the training took place.");
      return;
    }

    if (!editing && !pdfFile) {
      setFormError("Upload the training certificate PDF.");
      return;
    }

    setSaving(true);

    try {
      if (editing) {
        const patch: {
          supervisor_id: string;
          location_type: "producer" | "site";
          location_id: string;
          certificate_url?: string;
        } = {
          supervisor_id: supervisorId,
          ...location,
        };

        if (pdfFile) {
          if (editing.certificate_url) {
            await deleteTrainingCertificate({
              path: editing.certificate_url,
            }).catch(() => undefined);
          }
          patch.certificate_url = await uploadTrainingCertificate({
            file: pdfFile,
            trainingId: editing.id,
          });
        }

        await updateTraining(editing.id, patch);
      } else {
        const trainingId = crypto.randomUUID();
        const certificateUrl = await uploadTrainingCertificate({
          file: pdfFile!,
          trainingId,
        });

        await createTraining({
          id: trainingId,
          supervisor_id: supervisorId,
          ...location,
          certificate_url: certificateUrl,
        });
      }

      closeModal();
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save training");
    }

    setSaving(false);
  }

  async function handleDelete(record: TrainingRecord) {
    const confirmed = window.confirm(
      "Delete this training record? This cannot be undone.",
    );
    if (!confirmed) return;

    try {
      if (record.certificate_url) {
        await deleteTrainingCertificate({
          path: record.certificate_url,
        }).catch(() => undefined);
      }
      await deleteTraining(record.id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete training");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
            Trainings
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Track field training sessions, supervisors, locations, and certificates.
          </p>
          {!canManage ? (
            <p className="mt-2 text-sm text-neutral-500">
              Only admins and managers can add or edit training records.
            </p>
          ) : null}
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark-hover"
          >
            + Add training
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <DataTable
        loading={loading}
        columns={[
          { key: "supervisor", label: "Supervisor" },
          { key: "location", label: "Site / Producer" },
          { key: "date", label: "Recorded" },
          {
            key: "certificate",
            label: "Certificate",
            render: (_, row) =>
              row.raw.certificate_url ? (
                <SignedStorageLink
                  bucket={TRAINING_DOCS_BUCKET}
                  path={row.raw.certificate_url}
                  className="text-sm font-medium text-brand-dark hover:underline"
                >
                  View PDF
                </SignedStorageLink>
              ) : (
                "—"
              ),
          },
        ]}
        rows={rows}
        actions={
          canManage
            ? (row) => (
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => openEditModal(row.raw)}
                    className="text-sm font-medium text-brand-dark hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(row.raw)}
                    className="text-sm font-medium text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              )
            : undefined
        }
      />

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "Edit training record" : "Add training record"}
        footer={
          <>
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
              className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : editing ? "Save changes" : "Create record"}
            </button>
          </>
        }
      >
        <form className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-800">
              Supervisor *
            </label>
            <select
              value={supervisorId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setSupervisorId(e.target.value)
              }
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
            >
              <option value="">Select supervisor</option>
              {options?.supervisors.map((supervisor) => (
                <option key={supervisor.id} value={supervisor.id}>
                  {supervisor.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-800">
              Site / Producer *
            </label>
            <select
              value={locationValueState}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setLocationValueState(e.target.value)
              }
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
            >
              <option value="">Select site or producer</option>
              {options?.locations.map((location) => (
                <option
                  key={`${location.type}:${location.id}`}
                  value={`${location.type}:${location.id}`}
                >
                  {location.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-800">
              Training certificate (PDF){editing ? "" : " *"}
            </label>
            {editing?.certificate_url && !pdfFile ? (
              <p className="mb-2 text-sm text-neutral-600">
                Current file:{" "}
                <SignedStorageLink
                  bucket={TRAINING_DOCS_BUCKET}
                  path={editing.certificate_url}
                  className="font-medium text-brand-dark hover:underline"
                >
                  View PDF
                </SignedStorageLink>
              </p>
            ) : null}
            <input
              type="file"
              accept={TRAINING_CERTIFICATE_ACCEPT}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setPdfFile(e.target.files?.[0] ?? null)
              }
              className="block w-full text-sm text-neutral-700 file:mr-4 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-4 file:py-2 file:text-sm file:font-medium"
            />
            {pdfFile ? (
              <p className="mt-2 text-xs text-neutral-500">{pdfFile.name}</p>
            ) : null}
          </div>

          {formError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
