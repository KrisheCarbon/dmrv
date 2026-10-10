"use client";

import { useEffect, useId, useRef, useState } from "react";

export function Chevron({
  direction,
  className = "h-4 w-4",
}: {
  direction: "up" | "down" | "left" | "right";
  className?: string;
}) {
  const rotate = { down: 0, left: 90, up: 180, right: 270 }[direction];
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={className}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * "Rows per page" picker: a quiet button that opens a small menu upward
 * (it sits at the bottom of a table), with a check on the current choice.
 * Keyboard: Enter/Space/↓ opens, ↑/↓ moves, Enter picks, Esc closes.
 */
export default function RowsPerPageMenu({
  value,
  options,
  onChange,
}: {
  value: number;
  options: readonly number[];
  onChange: (next: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(Math.max(0, options.indexOf(value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  function openMenu() {
    setActive(Math.max(0, options.indexOf(value)));
    setOpen(true);
  }

  function choose(next: number) {
    setOpen(false);
    buttonRef.current?.focus();
    if (next !== value) onChange(next);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Rows per page: ${value}`}
        className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium text-neutral-900 transition ${
          open
            ? "border-brand-dark bg-white ring-2 ring-brand-dark/10"
            : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
        }`}
      >
        <span className="min-w-[1.5rem] text-left tabular-nums">{value}</span>
        <Chevron direction={open ? "up" : "down"} className="h-4 w-4 text-text-secondary" />
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Rows per page"
          className="absolute bottom-full right-0 z-20 mb-2 min-w-[6.5rem] overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
        >
          {options.map((option, index) => {
            const selected = option === value;
            return (
              <li
                key={option}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm tabular-nums ${
                  index === active ? "bg-neutral-100" : ""
                } ${selected ? "font-semibold text-brand-dark" : "text-neutral-800"}`}
              >
                {option}
                {selected ? (
                  <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 text-brand-dark">
                    <path
                      d="M4.5 10.5 8 14l7.5-8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
