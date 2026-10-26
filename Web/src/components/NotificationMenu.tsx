"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listUpdateInbox,
  markAllUpdatesRead,
  markUpdateRead,
} from "@/app/(admin)/operations/updates/actions";
import type { UpdateMessage } from "@/app/(admin)/operations/updates/types";

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "Just now";
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} hr ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<UpdateMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const result = await listUpdateInbox();
    if (result.inbox) {
      setMessages(result.inbox.messages);
      setUnread(result.inbox.unread_count);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 45_000);
    function onFocus() {
      void load();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function openMessage(message: UpdateMessage) {
    setExpandedId((current) => (current === message.id ? null : message.id));
    if (message.read) return;
    setMessages((current) =>
      current.map((item) => (item.id === message.id ? { ...item, read: true } : item)),
    );
    setUnread((count) => Math.max(0, count - 1));
    const result = await markUpdateRead(message.id);
    if (result.error) {
      setError(result.error);
      void load();
    }
  }

  async function markAll() {
    if (unread === 0 || markingAll) return;
    setMarkingAll(true);
    const result = await markAllUpdatesRead();
    setMarkingAll(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessages((current) => current.map((item) => ({ ...item, read: true })));
    setUnread(0);
  }

  const label =
    unread > 0
      ? `Updates, ${unread} unread`
      : "Updates, no unread messages";

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void load();
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
        className="relative flex h-12 w-12 items-center justify-center rounded-xl hover:bg-brand-cream"
      >
        <img src="/icons/notifications.svg" alt="" className="h-5 w-5" />
        {unread > 0 ? (
          <span
            className="pointer-events-none absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-status-success ring-2 ring-white"
            aria-hidden="true"
          />
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Updates"
          className="absolute right-0 z-50 mt-2 flex max-h-[28rem] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-lg"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <p className="text-base Smedium text-brand-dark">Updates</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void markAll()}
                disabled={markingAll}
                className="min-h-12 rounded-xl px-2 text-sm Smedium text-brand-dark disabled:opacity-60"
              >
                {markingAll ? "Marking…" : "Mark all read"}
              </button>
            ) : null}
          </div>

          <div className="overflow-y-auto">
            {loading && messages.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[var(--text-secondary)]">Loading updates…</p>
            ) : null}
            {error ? <p className="px-4 py-3 text-sm text-status-error">{error}</p> : null}
            {!loading && !error && messages.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[var(--text-secondary)]">No updates yet.</p>
            ) : null}
            <ul>
              {messages.map((message) => {
                const expanded = expandedId === message.id;
                return (
                  <li key={message.id} className="border-b border-[var(--border)] last:border-b-0">
                    <button
                      type="button"
                      onClick={() => void openMessage(message)}
                      className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left ${
                        message.read ? "bg-white" : "bg-status-success-bg"
                      }`}
                    >
                      <span className="flex w-full items-center justify-between gap-3">
                        <span className="text-sm Smedium text-brand-dark">{message.title}</span>
                        {message.read ? null : (
                          <span className="shrink-0 text-xs Smedium text-status-success">New</span>
                        )}
                      </span>
                      <span
                        className={`whitespace-pre-wrap text-sm text-brand-dark ${
                          expanded ? "" : "line-clamp-2"
                        }`}
                      >
                        {message.body}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {message.author_name ? `${message.author_name} · ` : ""}
                        {formatWhen(message.created_at)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
