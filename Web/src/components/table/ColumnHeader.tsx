"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type SortState = "asc" | "desc" | null;

function SortIcon({ state }: { state: SortState }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4">
      <path
        d="M6.5 8 10 4.5 13.5 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={state === "desc" ? 0.25 : 1}
      />
      <path
        d="M6.5 12 10 15.5 13.5 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={state === "asc" ? 0.25 : 1}
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4">
      <circle cx="9" cy="9" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m13 13 3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4">
      <path
        d="M3.5 5h13l-5 6v4.5l-3 1.5v-6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const iconButton =
  "relative inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark/30";

/**
 * One table heading: the label, then small action icons beside it. Sort
 * cycles A→Z / Z→A; search (or filter, for fixed options) opens a box under
 * the heading. Every heading sits on the same line, whatever it offers.
 */
export default function ColumnHeader({
  label,
  sort,
  filter,
}: {
  label: string;
  sort?: { state: SortState; onToggle: () => void };
  filter?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    options?: Array<{ value: string; label: string }>;
  };
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filterActive = Boolean(filter?.value.trim());

  // The table scrolls sideways, so the panel is placed on the page itself.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const width = 240;
    setPosition({
      top: rect.bottom + 6,
      left: Math.min(Math.max(8, rect.left - 8), window.innerWidth - width - 8),
    });
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !anchorRef.current?.contains(target)) close();
    }
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  function closeAndFocus() {
    setOpen(false);
    anchorRef.current?.focus();
  }

  const sortLabel =
    sort?.state === "asc"
      ? `${label}: sorted A to Z. Sort Z to A`
      : sort?.state === "desc"
        ? `${label}: sorted Z to A. Sort A to Z`
        : `Sort by ${label}`;

  return (
    <div className="flex min-w-[8rem] items-center gap-1 whitespace-nowrap">
      <span className={sort?.state || filterActive ? "text-neutral-900" : undefined}>{label}</span>
      {sort || filter ? (
        <span className="ml-0.5 flex items-center text-neutral-400">
          {sort ? (
            <button
              type="button"
              onClick={sort.onToggle}
              aria-label={sortLabel}
              title={sortLabel}
              className={`${iconButton} ${sort.state ? "text-brand-dark" : ""}`}
            >
              <SortIcon state={sort.state} />
            </button>
          ) : null}
          {filter ? (
            <button
              ref={anchorRef}
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-label={`${filter.options ? "Filter" : "Search"} ${label}`}
              aria-expanded={open}
              title={`${filter.options ? "Filter" : "Search"} ${label}`}
              className={`${iconButton} ${filterActive || open ? "text-brand-dark" : ""} ${open ? "bg-neutral-100" : ""}`}
            >
              {filter.options ? <FilterIcon /> : <SearchIcon />}
              {filterActive ? (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-green ring-2 ring-white" />
              ) : null}
            </button>
          ) : null}
        </span>
      ) : null}

      {open && filter && position ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={`${filter.options ? "Filter" : "Search"} ${label}`}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Enter") {
              event.preventDefault();
              closeAndFocus();
            }
          }}
          style={{ position: "fixed", top: position.top, left: position.left, width: 240 }}
          className="z-40 rounded-xl border border-neutral-200 bg-white p-2 text-sm font-normal text-neutral-800 shadow-lg"
        >
          {filter.options ? (
            <ul className="max-h-64 overflow-auto py-0.5">
              {[{ value: "", label: "All" }, ...filter.options].map((option) => {
                const selected = (filter.value || "") === option.value;
                return (
                  <li key={option.value || "all"}>
                    <button
                      type="button"
                      onClick={() => {
                        filter.onChange(option.value);
                        closeAndFocus();
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-neutral-100 ${
                        selected ? "font-semibold text-brand-dark" : ""
                      }`}
                    >
                      {option.label}
                      {selected ? <span aria-hidden>✓</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-neutral-200 px-2.5 focus-within:border-brand-dark">
              <span className="text-neutral-400">
                <SearchIcon />
              </span>
              <input
                ref={inputRef}
                value={filter.value}
                onChange={(event) => filter.onChange(event.target.value)}
                placeholder={filter.placeholder || `Search ${label.toLowerCase()}`}
                className="min-h-9 w-full bg-transparent text-sm outline-none"
              />
              {filterActive ? (
                <button
                  type="button"
                  onClick={() => {
                    filter.onChange("");
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="text-neutral-400 hover:text-neutral-900"
                >
                  ✕
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
