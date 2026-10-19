"use client";

import { useRef, type ChangeEvent } from "react";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileDrop({
  label,
  hint,
  required,
  accept,
  multiple,
  files,
  onChange,
}: {
  label: string;
  hint: string;
  required?: boolean;
  accept: string;
  multiple?: boolean;
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    if (picked.length === 0) return;
    onChange(multiple ? [...files, ...picked] : picked.slice(0, 1));
    event.target.value = "";
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-neutral-700">
        {label}
        {required ? "" : " (optional)"}
      </p>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex min-h-28 w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-neutral-300 bg-neutral-100 px-4 py-5 text-center hover:border-brand-dark"
      >
        <span className="text-sm font-medium text-brand-dark">
          {files.length === 0
            ? multiple
              ? "Choose files"
              : "Choose a file"
            : multiple
              ? "Add more files"
              : "Replace file"}
        </span>
        <span className="text-sm text-neutral-500">{hint}</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={pick}
        className="sr-only"
      />
      {files.length > 0 ? (
        <ul className="space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-950">{file.name}</p>
                <p className="text-xs text-neutral-500">{formatSize(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, item) => item !== index))}
                className="min-h-12 shrink-0 px-2 text-sm font-medium text-status-error"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
