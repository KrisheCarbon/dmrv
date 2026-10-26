"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import RoleSelect from "@/components/RoleSelect";
import { formatRoleLabel } from "@/lib/roles";
import { searchUpdateRecipients, sendUpdate } from "./actions";
import type { SentUpdate, UpdateAudience, UpdateRecipient } from "./types";

const AUDIENCES: { id: UpdateAudience; label: string; hint: string }[] = [
  {
    id: "all",
    label: "Everyone",
    hint: "Every person who can sign in to the portal or the field app.",
  },
  {
    id: "role",
    label: "One role",
    hint: "Only people with the role you pick.",
  },
  {
    id: "user",
    label: "One person",
    hint: "Only the person you pick.",
  },
];

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

function personDetail(person: UpdateRecipient): string {
  const role = formatRoleLabel(person.role);
  const contact = person.phone || person.email;
  return contact ? `${role} · ${contact}` : role;
}

export default function UpdatesDesk({
  canSend,
  sent,
  loadError,
}: {
  canSend: boolean;
  sent: SentUpdate[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<UpdateAudience>("all");
  const [role, setRole] = useState("climapreneur");
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<UpdateRecipient[]>([]);
  const [selected, setSelected] = useState<UpdateRecipient | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [extra, setExtra] = useState<SentUpdate[]>([]);

  useEffect(() => {
    if (!canSend || audience !== "user" || selected) return;
    const handle = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        const result = await searchUpdateRecipients(query);
        setPeople(result.people);
        setSearchError(result.error);
        setSearching(false);
      })();
    }, 250);
    return () => window.clearTimeout(handle);
  }, [audience, canSend, query, selected]);

  const known = new Set(sent.map((item) => item.id));
  const rows = [...extra.filter((item) => !known.has(item.id)), ...sent];
  const audienceHint = AUDIENCES.find((item) => item.id === audience)?.hint;
  const ready =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (audience !== "user" || selected != null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!ready || sending) return;
    setSending(true);
    setFormError(null);
    setSentNote(null);
    const result = await sendUpdate({
      title: title.trim(),
      body: body.trim(),
      audience,
      target_role: audience === "role" ? role : undefined,
      target_user_id: audience === "user" ? selected?.id : undefined,
    });
    setSending(false);
    if (result.error || !result.update) {
      setFormError(result.error ?? "Could not send the update.");
      return;
    }
    setExtra((current) => [result.update as SentUpdate, ...current]);
    setTitle("");
    setBody("");
    setSentNote(`Sent to ${result.update.audience_label}.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {canSend ? (
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-white p-6"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm Smedium text-brand-dark">Title</span>
            <input
              value={title}
              maxLength={120}
              onChange={(event) => {
                setTitle(event.target.value);
                setSentNote(null);
              }}
              className="min-h-12 rounded-xl border border-[var(--border)] bg-white px-3 text-base text-brand-dark"
              placeholder="Short line they will see first"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm Smedium text-brand-dark">Message</span>
            <textarea
              value={body}
              maxLength={2000}
              rows={5}
              onChange={(event) => {
                setBody(event.target.value);
                setSentNote(null);
              }}
              className="min-h-32 rounded-xl border border-[var(--border)] bg-white px-3 py-3 text-base text-brand-dark"
              placeholder="Write the update in plain language."
            />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm Smedium text-brand-dark">Send to</legend>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {AUDIENCES.map((item) => {
                const active = audience === item.id;
                return (
                  <label
                    key={item.id}
                    className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm Smedium ${
                      active
                        ? "border-brand-dark bg-brand-green text-brand-dark"
                        : "border-[var(--border)] bg-white text-brand-dark"
                    }`}
                  >
                    <input
                      type="radio"
                      name="audience"
                      value={item.id}
                      checked={active}
                      onChange={() => {
                        setAudience(item.id);
                        setSentNote(null);
                        if (item.id === "user") setSearching(true);
                      }}
                      className="sr-only"
                    />
                    {item.label}
                  </label>
                );
              })}
            </div>
            {audienceHint ? (
              <p className="text-sm text-[var(--text-secondary)]">{audienceHint}</p>
            ) : null}
          </fieldset>

          {audience === "role" ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm Smedium text-brand-dark">Role</span>
              <RoleSelect
                value={role}
                onChange={setRole}
                className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-base text-brand-dark"
              />
            </label>
          ) : null}

          {audience === "user" ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm Smedium text-brand-dark">Person</span>
              {selected ? (
                <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white px-3 py-2">
                  <div>
                    <p className="text-base text-brand-dark">{selected.full_name}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {personDetail(selected)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="min-h-12 rounded-xl px-3 text-sm Smedium text-brand-dark"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    autoComplete="off"
                    placeholder="Search by name, phone, or email"
                    className="min-h-12 rounded-xl border border-[var(--border)] bg-white px-3 text-base text-brand-dark"
                  />
                  {searching ? (
                    <p className="text-sm text-[var(--text-secondary)]">Searching…</p>
                  ) : null}
                  {searchError ? (
                    <p className="text-sm text-status-error">{searchError}</p>
                  ) : null}
                  {!searching && !searchError && people.length === 0 ? (
                    <p className="text-sm text-[var(--text-secondary)]">
                      No one matches that search.
                    </p>
                  ) : null}
                  {people.length > 0 ? (
                    <ul className="overflow-hidden rounded-xl border border-[var(--border)]">
                      {people.map((person) => (
                        <li key={person.id} className="border-b border-[var(--border)] last:border-b-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSelected(person);
                              setPeople([]);
                              setQuery("");
                            }}
                            className="flex min-h-12 w-full flex-col items-start justify-center px-3 py-2 text-left hover:bg-brand-cream"
                          >
                            <span className="text-base text-brand-dark">{person.full_name}</span>
                            <span className="text-xs text-[var(--text-secondary)]">
                              {personDetail(person)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {formError ? <p className="text-sm text-status-error">{formError}</p> : null}
          {sentNote ? <p className="text-sm text-status-success">{sentNote}</p> : null}

          <button
            type="submit"
            disabled={!ready || sending}
            className="min-h-14 rounded-xl bg-brand-dark px-6 text-base Smedium text-white disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send update"}
          </button>
        </form>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">
          You can read updates from the bell at the top right. Sending is limited to
          admins, managers, and supervisors.
        </p>
      )}

      {canSend ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg Smedium text-brand-dark">Sent</h2>
          {loadError ? <p className="text-sm text-status-error">{loadError}</p> : null}
          {!loadError && rows.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Nothing sent yet.</p>
          ) : null}
          {rows.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-[var(--border)] bg-white p-4"
            >
              <h3 className="text-base Smedium text-brand-dark">{item.title}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-brand-dark">{item.body}</p>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                To {item.audience_label}
                {item.author_name ? ` · ${item.author_name}` : ""}
                {formatWhen(item.created_at) ? ` · ${formatWhen(item.created_at)}` : ""}
              </p>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
