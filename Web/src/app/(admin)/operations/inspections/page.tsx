"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DataTable from "@/components/table/DataTable";
import FileDrop from "@/components/FileDrop";
import { supabase } from "@/lib/supabase";
import { canAccessNetwork, type UserRole } from "@/lib/roles";
import {
  DOC_TYPES,
  INSPECTION_BUCKET,
  PHOTO_TYPES,
  VIDEO_TYPES,
  acceptFor,
  uploadOpsFiles,
} from "@/lib/uploadOpsFiles";
import { FileGroups } from "../trainings/page";
import {
  createInspection,
  getInspectionOptions,
  listInspections,
  type InspectionRecord,
} from "./actions";
import type { OpsProducer } from "../trainings/actions";

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function localNow(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function OperationsInspectionsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const adding = searchParams.get("new") === "1";
  const [role, setRole] = useState<UserRole | null>(null);
  const [rows, setRows] = useState<InspectionRecord[]>([]);
  const [producers, setProducers] = useState<OpsProducer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canManage = role ? canAccessNetwork(role) : false;
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [inspections, options] = await Promise.all([
        listInspections(),
        getInspectionOptions(),
      ]);
      setRows(inspections);
      setProducers(options.producers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load inspections.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from("users").select("role").eq("id", user.id).single();
        if (data?.role) setRole(data.role as UserRole);
      }
      await load();
    }
    void init();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Inspections</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            One producer per visit, with the report and photos.
          </p>
        </div>
        {canManage && !adding ? (
          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
              router.push(`${pathname}?new=1`);
            }}
            className="min-h-14 rounded-xl bg-brand-dark px-4 text-sm font-medium text-white"
          >
            Add entry
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-status-error/30 bg-status-error-bg px-4 py-3 text-sm text-status-error">
          {error}
        </div>
      ) : null}

      {adding ? (
        <InspectionForm
          producers={producers}
          onCancel={() => router.back()}
          onSaved={() => {
            router.back();
            void load();
          }}
        />
      ) : (
        <>
          <DataTable
            loading={loading}
            emptyText="No inspections yet."
            onRowClick={(row) => setSelectedId((current) => (current === row.id ? null : String(row.id)))}
            selectedRowId={selectedId}
            columns={[
              { key: "when", label: "Date and time" },
              { key: "inspector", label: "Inspector", filterable: true },
              { key: "producer", label: "Producer", filterable: true },
            ]}
            rows={rows.map((row) => ({
              id: row.id,
              when: formatWhen(row.held_at),
              inspector: row.inspector_name,
              producer: row.producer.name,
            }))}
          />
          {selected ? (
            <section className="rounded-2xl border border-neutral-200 bg-white p-4">
              <h2 className="text-lg font-medium text-neutral-950">{selected.inspector_name}</h2>
              <p className="mt-1 text-sm text-neutral-500">
                {formatWhen(selected.held_at)} · {selected.producer.name}
              </p>
              <FileGroups files={selected.files} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function InspectionForm({
  producers,
  onCancel,
  onSaved,
}: {
  producers: OpsProducer[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [heldAt, setHeldAt] = useState(localNow);
  const [inspector, setInspector] = useState("");
  const [producerId, setProducerId] = useState("");
  const [report, setReport] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!inspector.trim()) {
      setError("Enter the inspector’s name.");
      return;
    }
    if (!producerId) {
      setError("Select one producer.");
      return;
    }
    if (!report) {
      setError("Upload the inspection report.");
      return;
    }
    if (photos.length === 0) {
      setError("Upload at least one photo.");
      return;
    }
    setSaving(true);
    try {
      const files = [
        ...(await uploadOpsFiles(INSPECTION_BUCKET, "report", [report], DOC_TYPES)),
        ...(await uploadOpsFiles(INSPECTION_BUCKET, "photo", photos, PHOTO_TYPES)),
        ...(await uploadOpsFiles(INSPECTION_BUCKET, "video", videos, VIDEO_TYPES)),
      ];
      await createInspection({
        held_at: new Date(heldAt).toISOString(),
        inspector_name: inspector.trim(),
        producer_id: producerId,
        files,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the inspection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4">
      <h2 className="text-lg font-medium text-neutral-950">New inspection</h2>
      <label className="flex max-w-md flex-col gap-2.5">
        <span className="text-xs font-medium text-neutral-700">Date and time</span>
        <input
          type="datetime-local"
          value={heldAt}
          onChange={(event) => setHeldAt(event.target.value)}
          className="min-h-12 w-full rounded-xl border border-neutral-300 px-3 text-base"
        />
      </label>
      <label className="block max-w-md space-y-1">
        <span className="text-xs font-medium text-neutral-700">Producer</span>
        <select
          value={producerId}
          onChange={(event) => setProducerId(event.target.value)}
          className="min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base"
        >
          <option value="">Select one producer</option>
          {producers.map((producer) => (
            <option key={producer.id} value={producer.id}>
              {producer.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block max-w-md space-y-1">
        <span className="text-xs font-medium text-neutral-700">Inspector name</span>
        <input
          value={inspector}
          onChange={(event) => setInspector(event.target.value)}
          className="min-h-12 w-full rounded-xl border border-neutral-300 px-3 text-base"
        />
      </label>
      <FileDrop
        label="Report"
        hint="One PDF or photo."
        required
        accept={acceptFor("doc")}
        files={report ? [report] : []}
        onChange={(next) => setReport(next[0] ?? null)}
      />
      <FileDrop
        label="Photos"
        hint="JPG, PNG, or WEBP. At least one photo."
        required
        multiple
        accept={acceptFor("photo")}
        files={photos}
        onChange={setPhotos}
      />
      <FileDrop
        label="Videos"
        hint="MP4, MOV, or WEBM."
        multiple
        accept={acceptFor("video")}
        files={videos}
        onChange={setVideos}
      />
      {error ? <p className="text-sm text-status-error">{error}</p> : null}
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="min-h-14 rounded-xl bg-brand-dark px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save inspection"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-14 rounded-xl border border-neutral-300 px-4 text-sm font-medium"
        >
          Back to list
        </button>
      </div>
    </div>
  );
}
