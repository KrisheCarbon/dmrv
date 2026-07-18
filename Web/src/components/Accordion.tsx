"use client";

import { useState } from "react";
import type { AccordionItem } from "@/types";

interface AccordionProps {
  items?: AccordionItem[];
  defaultOpenKey?: string;
}

export default function Accordion({
  items = [],
  defaultOpenKey,
}: AccordionProps) {
  const [openKey, setOpenKey] = useState<string | null>(
    defaultOpenKey ?? items[0]?.key ?? null
  );

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isOpen = openKey === item.key;
        return (
          <div
            key={item.key}
            className="rounded-lg border border-gray-200 bg-white shadow-sm"
          >
            <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
              <span className="text-base font-semibold">{item.title}</span>
              <div className="ml-auto flex items-center gap-3">
                {item.actions ? (
                  <div className="flex items-center gap-2">{item.actions}</div>
                ) : null}
                <button
                  type="button"
                  aria-label="Toggle"
                  onClick={() => setOpenKey(isOpen ? null : item.key)}
                  className="p-1 rounded hover:bg-gray-100"
                >
                  <img
                    src="/icons/chevron-down.svg"
                    alt="toggle"
                    className={
                      (isOpen ? "rotate-180" : "rotate-0") +
                      " h-5 w-5 transition-transform duration-200"
                    }
                  />
                </button>
              </div>
            </div>
            {isOpen ? (
              <div className="border-t border-gray-200 px-4 py-4">
                {item.content}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
