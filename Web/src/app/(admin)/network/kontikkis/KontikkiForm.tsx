"use client";

import { useEffect, useMemo, useState } from "react";
import KontikkiProducerOperatorFields from "./KontikkiProducerOperatorFields";
import { createKontikki, updateKontikki } from "./actions";
import { extractOperatorIds } from "./kontikkiOperators";
import SignedStorageLink from "@/components/SignedStorageLink";
import {
  deleteKontikkiAsset,
  fileNameFromKontikkiAssetPath,
  KONTIKKI_ASSETS_BUCKET,
  normalizeKontikkiPhotoPaths,
  uploadKontikkiDesignDoc,
  uploadKontikkiPhoto,
  type KontikkiPhotoType,
} from "@/lib/uploadKontikkiAssets";
import { getErrorMessage } from "@/lib/errors";
import { calcKontikkiCapacityLiters } from "./kontikkiLib";
import type { KontikkiDetail, KontikkiStatus } from "@/types";

interface KontikkiFormProps {
  mode: "create" | "edit";
  data?: KontikkiDetail | null;
  defaultProducerId?: string;
  onSuccess: (id: string) => void;
  onCancel: () => void;
}

interface PendingPhoto {
  clientId: string;
  file: File;
  previewUrl: string;
}

interface PhotoGalleryState {
  savedPaths: string[];
  pending: PendingPhoto[];
  removedPaths: string[];
}

interface KontikkiFormState {
  kontikki_code: string;
  module_id: string;
  producer_id: string;
  operator_ids: string[];
  status: KontikkiStatus;
  top_diameter_cm: string;
  bottom_diameter_cm: string;
  depth_cm: string;
  topPhotos: PhotoGalleryState;
  bottomPhotos: PhotoGalleryState;
  designDocPath: string | null;
  designDocFile: File | null;
  removeDesignDoc: boolean;
}

const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-brand-green focus:ring-2 focus:ring-brand-green/20";

function emptyGallery(savedPaths: string[] = []): PhotoGalleryState {
  return { savedPaths, pending: [], removedPaths: [] };
}

function toFormState(
  data: KontikkiDetail | null | undefined,
  defaultProducerId?: string,
): KontikkiFormState {
  return {
    kontikki_code: data?.kontikki_code ?? "",
    module_id: data?.module_id ?? "",
    producer_id:
      data?.biochar_producer_id ??
      (Array.isArray(data?.biochar_producer)
        ? data?.biochar_producer[0]?.id
        : data?.biochar_producer?.id) ??
      defaultProducerId ??
      "",
    operator_ids: extractOperatorIds(data?.kontikki_operators),
    status: (data?.status as KontikkiStatus) ?? "active",
    top_diameter_cm: String(data?.top_diameter_cm ?? ""),
    bottom_diameter_cm: String(data?.bottom_diameter_cm ?? ""),
    depth_cm: String(data?.depth_cm ?? ""),
    topPhotos: emptyGallery(
      normalizeKontikkiPhotoPaths(data?.top_photo_urls, data?.top_photo_url),
    ),
    bottomPhotos: emptyGallery(
      normalizeKontikkiPhotoPaths(
        data?.bottom_photo_urls,
        data?.side_photo_url,
      ),
    ),
    designDocPath: data?.plan_pdf_url ?? null,
    designDocFile: null,
    removeDesignDoc: false,
  };
}

function activeSavedPaths(gallery: PhotoGalleryState): string[] {
  return gallery.savedPaths.filter((path) => !gallery.removedPaths.includes(path));
}

function totalPhotoCount(gallery: PhotoGalleryState): number {
  return activeSavedPaths(gallery).length + gallery.pending.length;
}

function PhotoUploadSection({
  title,
  hint,
  gallery,
  onAddFiles,
  onRemoveSaved,
  onRemovePending,
}: {
  title: string;
  hint: string;
  gallery: PhotoGalleryState;
  onAddFiles: (files: FileList | null) => void;
  onRemoveSaved: (path: string) => void;
  onRemovePending: (clientId: string) => void;
}) {
  const saved = activeSavedPaths(gallery);

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
                accept="image/*"
                className="hidden"
                multiple
                onChange={(e) => onAddFiles(e.target.files)}
              />
            </label>
          </div>
        </div>
      </div>

      {saved.length > 0 || gallery.pending.length > 0 ? (
        <ul className="space-y-2">
          {saved.map((path) => (
            <li
              key={path}
              className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2"
            >
              <span className="truncate text-sm text-neutral-700">
                {fileNameFromKontikkiAssetPath(path)}
              </span>
              <button
                type="button"
                onClick={() => onRemoveSaved(path)}
                className="text-sm text-red-600 transition hover:text-red-700"
              >
                Delete
              </button>
            </li>
          ))}
          {gallery.pending.map((photo) => (
            <li
              key={photo.clientId}
              className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2"
            >
              <span className="truncate text-sm text-neutral-700">
                {photo.file.name}
              </span>
              <button
                type="button"
                onClick={() => onRemovePending(photo.clientId)}
                className="text-sm text-red-600 transition hover:text-red-700"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function KontikkiForm({
  mode,
  data,
  defaultProducerId,
  onSuccess,
  onCancel,
}: KontikkiFormProps) {
  const isEdit = mode === "edit";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<KontikkiFormState>(() =>
    toFormState(data, defaultProducerId),
  );

  const pendingPreviewUrls = useMemo(
    () => [
      ...form.topPhotos.pending.map((p) => p.previewUrl),
      ...form.bottomPhotos.pending.map((p) => p.previewUrl),
    ],
    [form.topPhotos.pending, form.bottomPhotos.pending],
  );

  useEffect(() => {
    return () => {
      pendingPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [pendingPreviewUrls]);

  function addPhotos(type: KontikkiPhotoType, files: FileList | null) {
    if (!files?.length) return;

    const nextPending = Array.from(files).map((file) => ({
      clientId: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setForm((prev) => {
      const key = type === "top" ? "topPhotos" : "bottomPhotos";
      return {
        ...prev,
        [key]: {
          ...prev[key],
          pending: [...prev[key].pending, ...nextPending],
        },
      };
    });
  }

  function removeSavedPhoto(type: KontikkiPhotoType, path: string) {
    setForm((prev) => {
      const key = type === "top" ? "topPhotos" : "bottomPhotos";
      return {
        ...prev,
        [key]: {
          ...prev[key],
          removedPaths: [...prev[key].removedPaths, path],
        },
      };
    });
  }

  function removePendingPhoto(type: KontikkiPhotoType, clientId: string) {
    setForm((prev) => {
      const key = type === "top" ? "topPhotos" : "bottomPhotos";
      const pending = prev[key].pending.filter((photo) => {
        if (photo.clientId === clientId) {
          URL.revokeObjectURL(photo.previewUrl);
          return false;
        }
        return true;
      });
      return {
        ...prev,
        [key]: { ...prev[key], pending },
      };
    });
  }

  async function uploadGalleryPhotos(
    kontikkiId: string,
    type: KontikkiPhotoType,
    gallery: PhotoGalleryState,
  ): Promise<string[]> {
    const kept = activeSavedPaths(gallery);
    const uploaded = await Promise.all(
      gallery.pending.map((photo) =>
        uploadKontikkiPhoto({ kontikkiId, type, file: photo.file }),
      ),
    );

    for (const path of gallery.removedPaths) {
      await deleteKontikkiAsset({ path }).catch(() => undefined);
    }

    return [...kept, ...uploaded];
  }

  async function handleSubmit() {
    setError(null);

    if (
      !form.kontikki_code.trim() ||
      !form.producer_id ||
      form.operator_ids.length === 0 ||
      !form.top_diameter_cm ||
      !form.bottom_diameter_cm ||
      !form.depth_cm
    ) {
      setError(
        "Please fill all mandatory fields and assign at least one operator.",
      );
      return;
    }

    if (totalPhotoCount(form.topPhotos) === 0) {
      setError("At least one top view picture is required.");
      return;
    }

    if (totalPhotoCount(form.bottomPhotos) === 0) {
      setError("At least one bottom view picture is required.");
      return;
    }

    const hasDesignDoc =
      Boolean(form.designDocFile) ||
      (Boolean(form.designDocPath) && !form.removeDesignDoc);

    if (!hasDesignDoc) {
      setError("Design document is required.");
      return;
    }

    setLoading(true);

    try {
      const capacity = calcKontikkiCapacityLiters(
        Number(form.top_diameter_cm),
        Number(form.bottom_diameter_cm),
        Number(form.depth_cm),
      );

      if (capacity == null) {
        setError("Could not calculate capacity from dimensions.");
        setLoading(false);
        return;
      }

      const baseRow = {
        kontikki_code: form.kontikki_code.trim(),
        module_id: form.module_id.trim() || null,
        biochar_producer_id: form.producer_id,
        status: form.status,
        top_diameter_cm: Number(form.top_diameter_cm),
        bottom_diameter_cm: Number(form.bottom_diameter_cm),
        depth_cm: Number(form.depth_cm),
        capacity,
      };

      if (isEdit && data?.id) {
        let designDocPath = form.designDocPath;

        if (form.removeDesignDoc && form.designDocPath) {
          await deleteKontikkiAsset({ path: form.designDocPath }).catch(
            () => undefined,
          );
          designDocPath = null;
        }

        if (form.designDocFile) {
          if (designDocPath) {
            await deleteKontikkiAsset({ path: designDocPath }).catch(
              () => undefined,
            );
          }
          designDocPath = await uploadKontikkiDesignDoc({
            kontikkiId: data.id,
            file: form.designDocFile,
          });
        }

        const topPhotoUrls = await uploadGalleryPhotos(
          data.id,
          "top",
          form.topPhotos,
        );
        const bottomPhotoUrls = await uploadGalleryPhotos(
          data.id,
          "bottom",
          form.bottomPhotos,
        );

        await updateKontikki(data.id, {
          ...baseRow,
          plan_pdf_url: designDocPath,
          operator_ids: form.operator_ids,
          top_photo_urls: topPhotoUrls,
          bottom_photo_urls: bottomPhotoUrls,
        });
        onSuccess(data.id);
        return;
      }

      const created = await createKontikki({
        ...baseRow,
        operator_ids: form.operator_ids,
      });

      const topPhotoUrls = await uploadGalleryPhotos(
        created.id,
        "top",
        form.topPhotos,
      );
      const bottomPhotoUrls = await uploadGalleryPhotos(
        created.id,
        "bottom",
        form.bottomPhotos,
      );
      const designDocPath = await uploadKontikkiDesignDoc({
        kontikkiId: created.id,
        file: form.designDocFile!,
      });

      await updateKontikki(created.id, {
        plan_pdf_url: designDocPath,
        top_photo_urls: topPhotoUrls,
        bottom_photo_urls: bottomPhotoUrls,
      });
      onSuccess(created.id);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save kontikki"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-200/40">
      <KontikkiProducerOperatorFields
        kontikkiName={form.kontikki_code}
        producerId={form.producer_id}
        operatorIds={form.operator_ids}
        onKontikkiNameChange={(kontikki_code) =>
          setForm((prev) => ({ ...prev, kontikki_code }))
        }
        onProducerChange={(producer_id) =>
          setForm((prev) => ({ ...prev, producer_id }))
        }
        onOperatorIdsChange={(operator_ids) =>
          setForm((prev) => ({ ...prev, operator_ids }))
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700">Status *</label>
          <select
            className={inputClass}
            value={form.status}
            onChange={(e) =>
              setForm({
                ...form,
                status: e.target.value as KontikkiStatus,
              })
            }
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700">
            Hardware module ID
          </label>
          <input
            className={inputClass}
            value={form.module_id}
            onChange={(e) =>
              setForm({ ...form, module_id: e.target.value })
            }
            placeholder="e.g. Kiln-ESP32"
          />
          <p className="text-xs text-neutral-500">
            Must match the ESP32 KILN_ID value. Mobile users with access to this
            kontikki can connect to the sensor using this ID.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-500">
            KP-Number
          </label>
          <input
            className="w-full cursor-not-allowed rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-400"
            value={data?.kp_number ?? ""}
            placeholder="Coming soon"
            disabled
            readOnly
          />
          <p className="text-xs text-neutral-500">
            KP-Number registration will be enabled in a future release.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700">
            Top diameter *
          </label>
          <div className="relative">
            <input
              type="number"
              className={`${inputClass} pr-12`}
              value={form.top_diameter_cm}
              onChange={(e) =>
                setForm({ ...form, top_diameter_cm: e.target.value })
              }
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
              cm
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700">
            Bottom diameter *
          </label>
          <div className="relative">
            <input
              type="number"
              className={`${inputClass} pr-12`}
              value={form.bottom_diameter_cm}
              onChange={(e) =>
                setForm({ ...form, bottom_diameter_cm: e.target.value })
              }
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
              cm
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700">Depth *</label>
          <div className="relative">
            <input
              type="number"
              className={`${inputClass} pr-12`}
              value={form.depth_cm}
              onChange={(e) => setForm({ ...form, depth_cm: e.target.value })}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
              cm
            </span>
          </div>
        </div>
      </div>

      <PhotoUploadSection
        title="Top view picture *"
        hint="A measurement of the diameter must be visible in the picture."
        gallery={form.topPhotos}
        onAddFiles={(files) => addPhotos("top", files)}
        onRemoveSaved={(path) => removeSavedPhoto("top", path)}
        onRemovePending={(clientId) => removePendingPhoto("top", clientId)}
      />

      <PhotoUploadSection
        title="Bottom view picture *"
        hint="Upload clear bottom or side view photos of the kontikki."
        gallery={form.bottomPhotos}
        onAddFiles={(files) => addPhotos("bottom", files)}
        onRemoveSaved={(path) => removeSavedPhoto("bottom", path)}
        onRemovePending={(clientId) => removePendingPhoto("bottom", clientId)}
      />

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-neutral-800">
            Design document *
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Upload the kontikki design file (PDF, image, CAD, or any document).
          </p>
        </div>

        {form.designDocPath && !form.removeDesignDoc && !form.designDocFile ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2">
            <SignedStorageLink
              bucket={KONTIKKI_ASSETS_BUCKET}
              path={form.designDocPath}
              className="truncate text-sm text-brand-dark hover:underline"
            >
              {fileNameFromKontikkiAssetPath(form.designDocPath)}
            </SignedStorageLink>
            <button
              type="button"
              onClick={() =>
                setForm((prev) => ({ ...prev, removeDesignDoc: true }))
              }
              className="text-sm text-red-600 transition hover:text-red-700"
            >
              Delete
            </button>
          </div>
        ) : null}

        {form.designDocFile ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2">
            <span className="truncate text-sm text-neutral-700">
              {form.designDocFile.name}
            </span>
            <button
              type="button"
              onClick={() =>
                setForm((prev) => ({ ...prev, designDocFile: null }))
              }
              className="text-sm text-red-600 transition hover:text-red-700"
            >
              Delete
            </button>
          </div>
        ) : null}

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50/60 px-4 py-6 text-sm text-neutral-600 transition hover:bg-neutral-50">
          {form.designDocPath && !form.removeDesignDoc
            ? "Replace design document"
            : "Upload design document"}
          <input
            type="file"
            className="hidden"
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                designDocFile: e.target.files?.[0] ?? null,
                removeDesignDoc: false,
              }))
            }
          />
        </label>
      </div>

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
          className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark-hover"
        >
          {loading ? "Saving..." : isEdit ? "Save changes" : "Create kontikki"}
        </button>
      </div>
    </div>
  );
}
