"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export default function MultiSelectDropdown({
  label,
  placeholder,
  options,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: { id: string; label: string }[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  const selected = options.filter((option) => values.includes(option.id));
  const summary =
    selected.length === 0
      ? placeholder
      : selected.length <= 2
        ? selected.map((option) => option.label).join(", ")
        : `${selected.length} selected`;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query]);

  function toggle(id: string) {
    onChange(values.includes(id) ? values.filter((item) => item !== id) : [...values, id]);
  }

  return (
    <div ref={root} className="relative max-w-md space-y-1">
      <span className="text-xs font-medium text-neutral-700">{label}</span>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-12 w-full items-center justify-between rounded-xl border border-neutral-300 bg-white px-3 text-left text-base text-neutral-950"
      >
        <span className={selected.length === 0 ? "text-neutral-500" : ""}>{summary}</span>
        <span aria-hidden className="text-sm text-neutral-500">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 shadow-sm">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="mb-2 min-h-12 w-full rounded-xl border border-neutral-300 px-3 text-base"
          />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-2 py-3 text-sm text-neutral-500">Nothing matches.</p>
            ) : (
              visible.map((option) => (
                <label key={option.id} className="flex min-h-12 items-center gap-3 rounded-xl px-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={values.includes(option.id)}
                    onChange={() => toggle(option.id)}
                  />
                  {option.label}
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
