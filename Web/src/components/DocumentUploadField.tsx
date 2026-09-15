"use client";

import { useRef, type ChangeEvent } from "react";
import SignedStorageLink from "@/components/SignedStorageLink";
import { ORGANIZATION_DOCUMENT_ACCEPT } from "@/lib/privateStorage";

export type DocumentUploadState = {
  pendingFile: File | null;
  existingUrl: string | null;
  removed: boolean;
};

export function createDocumentUploadState(
  existingPath?: string | null,
): DocumentUploadState {
  return {
    pendingFile: null,
    existingUrl: existingPath ?? null,
    removed: false,
  };
}

interface DocumentUploadFieldProps {
  label: string;
  bucket: string;
  doc: DocumentUploadState;
  fileNameFromPath?: (path: string) => string;
  onFileChange: (file: File | null) => void;
  onRemove: () => void;
  disabled?: boolean;
}

export default function DocumentUploadField({
  label,
  bucket,
  doc,
  fileNameFromPath = (path) => path.split("/").pop() ?? "document",
  onFileChange,
  onRemove,
  disabled = false,
}: DocumentUploadFieldProps) {
  const inputKey = useRef(0);
  const hasAttachment =
    !doc.removed && Boolean(doc.pendingFile || doc.existingUrl);
  const displayName = doc.pendingFile
    ? doc.pendingFile.name
    : doc.existingUrl
      ? fileNameFromPath(doc.existingUrl)
      : null;

  function handleRemove() {
    inputKey.current += 1;
    onRemove();
  }

  return (
    <div>
      <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600">
        {label}
      </label>
      {hasAttachment ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3">
          <div className="min-w-0">
            {doc.pendingFile ? (
              <p className="truncate text-sm font-medium text-neutral-900">
                {displayName}
              </p>
            ) : doc.existingUrl ? (
              <SignedStorageLink
                bucket={bucket}
                path={doc.existingUrl}
                className="truncate text-sm font-medium text-brand-dark hover:underline"
              >
                {displayName}
              </SignedStorageLink>
            ) : null}
            <p className="mt-1 text-xs text-neutral-500">
              {doc.pendingFile ? "Ready to upload on save" : "Saved document"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ) : null}
      <label
        className={`group flex min-h-28 items-center justify-between gap-4 rounded-xl border border-dashed border-neutral-300 bg-white px-5 py-4 transition ${
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:border-neutral-500 hover:bg-neutral-50"
        }`}
      >
        <span className="min-w-0 text-left">
          <span className="block text-sm font-medium text-neutral-800">
            {hasAttachment ? "Replace document" : "Select file or drag and drop here"}
          </span>
          <span className="mt-1 block text-xs text-neutral-500">
            PDF or image (JPG, PNG, WEBP)
          </span>
        </span>
        <span className="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-800 shadow-sm">
          Upload
        </span>
        <input
          key={inputKey.current}
          type="file"
          accept={ORGANIZATION_DOCUMENT_ACCEPT}
          disabled={disabled}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onFileChange(e.target.files?.[0] ?? null)
          }
          className="hidden"
        />
      </label>
    </div>
  );
}
