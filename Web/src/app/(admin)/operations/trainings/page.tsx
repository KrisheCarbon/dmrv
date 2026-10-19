"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DataTable from "@/components/table/DataTable";
import FileDrop from "@/components/FileDrop";
import LocationPicker from "@/components/maps/Locationpicker";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import { supabase } from "@/lib/supabase";
import { canAccessNetwork, type UserRole } from "@/lib/roles";
import type { LocationValue } from "@/types";
import {
  DOC_TYPES,
  PHOTO_TYPES,
  TRAINING_SESSION_BUCKET,
  VIDEO_TYPES,
  acceptFor,
  uploadOpsFiles,
} from "@/lib/uploadOpsFiles";
import {
  createTrainingSession,
  getTrainingSessionOptions,
  listTrainingSessions,
  type OpsFile,
  type OpsProducer,
  type TrainingSession,
} from "./actions";

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

const FILE_LABELS: Record<string, string> = {
  attendance: "Attendance sheet",
  material: "Training material",
  photo: "Photo",
  video: "Video",
  report: "Report",
};

export default function OperationsTrainingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const adding = searchParams.get("new") === "1";
  const [role, setRole] = useState<UserRole | null>(null);
  const [rows, setRows] = useState<TrainingSession[]>([]);
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
      const [sessions, options] = await Promise.all([
        listTrainingSessions(),
        getTrainingSessionOptions(),
      ]);
      setRows(sessions);
      setProducers(options.producers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load trainings.");
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
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Trainings</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            Sessions held for producers, with the attendance sheet, materials, and photos.
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
        <TrainingForm
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
            emptyText="No trainings yet."
            onRowClick={(row) => setSelectedId((current) => (current === row.id ? null : String(row.id)))}
            selectedRowId={selectedId}
            columns={[
              { key: "when", label: "Date and time" },
              { key: "trainer", label: "Trainer", filterable: true },
              { key: "producers", label: "Producers", filterable: true },
              { key: "location", label: "Location", filterable: true },
            ]}
            rows={rows.map((row) => ({
              id: row.id,
              when: formatWhen(row.held_at),
              trainer: row.trainer_name,
              producers: row.producers.map((producer) => producer.name).join(", ") || "—",
              location: row.location_label?.trim() || "Map location",
            }))}
          />
          {selected ? <SessionDetail session={selected} /> : null}
        </>
      )}
    </div>
  );
}

function TrainingForm({
  producers,
  onCancel,
  onSaved,
}: {
  producers: OpsProducer[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [heldAt, setHeldAt] = useState(localNow);
  const [trainer, setTrainer] = useState("");
  const [producerIds, setProducerIds] = useState<string[]>([]);
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [attendance, setAttendance] = useState<File[]>([]);
  const [materials, setMaterials] = useState<File[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!trainer.trim()) {
      setError("Enter the trainer’s name.");
      return;
    }
    if (producerIds.length === 0) {
      setError("Select at least one producer.");
      return;
    }
    if (location == null) {
      setError("Choose the location on the map.");
      return;
    }
    if (attendance.length === 0) {
      setError("Upload at least one attendance sheet.");
      return;
    }
    if (photos.length === 0) {
      setError("Upload at least one photo of the session.");
      return;
    }
    setSaving(true);
    try {
      const files = [
        ...(await uploadOpsFiles(TRAINING_SESSION_BUCKET, "attendance", attendance, DOC_TYPES)),
        ...(await uploadOpsFiles(TRAINING_SESSION_BUCKET, "material", materials, DOC_TYPES)),
        ...(await uploadOpsFiles(TRAINING_SESSION_BUCKET, "photo", photos, PHOTO_TYPES)),
        ...(await uploadOpsFiles(TRAINING_SESSION_BUCKET, "video", videos, VIDEO_TYPES)),
      ];
      await createTrainingSession({
        held_at: new Date(heldAt).toISOString(),
        trainer_name: trainer.trim(),
        producer_ids: producerIds,
        latitude: location.lat,
        longitude: location.lng,
        location_label: location.place_name ?? null,
        files,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the training.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4">
      <h2 className="text-lg font-medium text-neutral-950">New training</h2>
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
        <span className="text-xs font-medium text-neutral-700">Trainer name</span>
        <input
          value={trainer}
          onChange={(event) => setTrainer(event.target.value)}
          className="min-h-12 w-full rounded-xl border border-neutral-300 px-3 text-base"
        />
      </label>
      <MultiSelectDropdown
        label="Producers"
        placeholder="Select producers"
        options={producers.map((producer) => ({ id: producer.id, label: producer.name }))}
        values={producerIds}
        onChange={setProducerIds}
      />
      <div className="space-y-1">
        <span className="text-xs font-medium text-neutral-700">Location</span>
        <LocationPicker value={location} onChange={setLocation} allowClear />
      </div>
      <FileDrop
        label="Attendance sheet"
        hint="PDF or photo. You can add more than one."
        required
        multiple
        accept={acceptFor("doc")}
        files={attendance}
        onChange={setAttendance}
      />
      <FileDrop
        label="Training materials"
        hint="PDF or photo."
        multiple
        accept={acceptFor("doc")}
        files={materials}
        onChange={setMaterials}
      />
      <FileDrop
        label="Photos of the session"
        hint="JPG, PNG, or WEBP. At least one photo."
        required
        multiple
        accept={acceptFor("photo")}
        files={photos}
        onChange={setPhotos}
      />
      <FileDrop
        label="Videos of the session"
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
          {saving ? "Saving…" : "Save training"}
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

function SessionDetail({ session }: { session: TrainingSession }) {
  const maps = `https://www.google.com/maps?q=${session.latitude},${session.longitude}`;
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4">
      <h2 className="text-lg font-medium text-neutral-950">{session.trainer_name}</h2>
      <p className="mt-1 text-sm text-neutral-500">
        {formatWhen(session.held_at)} · {session.producers.map((producer) => producer.name).join(", ")}
      </p>
      <p className="mt-2 text-sm text-neutral-800">
        {session.location_label?.trim() || "Map location"} ·{" "}
        <a href={maps} target="_blank" rel="noreferrer" className="font-medium text-brand-dark hover:underline">
          Open map
        </a>
      </p>
      <FileGroups files={session.files} />
    </section>
  );
}

export function FileGroups({ files }: { files: OpsFile[] }) {
  const kinds = [...new Set(files.map((file) => file.kind))];
  if (kinds.length === 0) return null;
  return (
    <div className="mt-4 space-y-3">
      {kinds.map((kind) => (
        <div key={kind}>
          <h3 className="text-sm font-medium text-neutral-950">{FILE_LABELS[kind] ?? kind}</h3>
          <ul className="mt-1 space-y-1">
            {files
              .filter((file) => file.kind === kind)
              .map((file) => (
                <li key={file.id} className="text-sm">
                  {file.signed_url ? (
                    <a
                      href={file.signed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-brand-dark hover:underline"
                    >
                      {file.file_name}
                    </a>
                  ) : (
                    file.file_name
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
