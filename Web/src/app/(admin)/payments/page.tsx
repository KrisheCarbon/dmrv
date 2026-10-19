"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DataTable from "@/components/table/DataTable";
import { formatRoleLabel } from "@/lib/roles";
import RateCardForm from "./RateCardForm";
import RecordPaymentModal from "./RecordPaymentModal";
import {
  archiveRateCard,
  getPaymentOptions,
  getPaymentStatement,
  listRateCards,
  restoreRateCard,
} from "./actions";
import {
  FARM_BASIS_LABELS,
  SCOPE_LABELS,
  formatDisplayDate,
  formatInr,
  type PaymentOptions,
  type PaymentStatement,
  type RateCard,
  type StatementPerson,
} from "./paymentsLib";

type Tab = "payable" | "rates" | "history";

export default function PaymentsPage() {
  const [tab, setTab] = useState<Tab>("payable");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [statement, setStatement] = useState<PaymentStatement | null>(null);
  const [cards, setCards] = useState<RateCard[]>([]);
  const [options, setOptions] = useState<PaymentOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<RateCard | null | "new">(null);
  const [paying, setPaying] = useState<{ id: string | null; balance: number | null } | null>(null);
  const [payKey, setPayKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextStatement = await getPaymentStatement({
        from: appliedFrom || undefined,
        to: appliedTo || undefined,
      });
      setStatement(nextStatement);
      if (nextStatement.viewer.can_manage) {
        const [nextCards, nextOptions] = await Promise.all([
          listRateCards(),
          getPaymentOptions(),
        ]);
        setCards(nextCards);
        setOptions(nextOptions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load payments.");
    } finally {
      setLoading(false);
    }
  }, [appliedFrom, appliedTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = statement?.people.find((person) => person.id === selectedId) ?? null;
  const canManage = statement?.viewer.can_manage ?? false;

  function openPayment(person?: StatementPerson) {
    setPayKey((value) => value + 1);
    setPaying({ id: person?.id ?? null, balance: person?.balance ?? null });
  }

  async function changeCardStatus(card: RateCard, next: "archive" | "restore") {
    const verb = next === "archive" ? "Archive" : "Restore";
    const warning =
      next === "archive"
        ? "Archive this rate card? Work inside its dates will stop counting toward what people are owed."
        : "Restore this rate card so it applies again?";
    if (!window.confirm(`${verb} “${card.name}”?\n\n${warning}`)) return;
    try {
      if (next === "archive") await archiveRateCard(card.id);
      else await restoreRateCard(card.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the rate card.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Payments</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            Set what a climapreneur or supervisor earns for each kind of entry, then record the
            money paid to them with a proof file. The same rates can cover every site, selected
            sites, or selected villages, and they can change by date.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => openPayment()}
            className="min-h-14 rounded-xl bg-brand-dark px-4 text-sm font-medium text-white"
          >
            Record a payment
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2.5">
        <TabButton active={tab === "payable"} onClick={() => setTab("payable")}>
          Payable
        </TabButton>
        {canManage ? (
          <TabButton active={tab === "rates"} onClick={() => setTab("rates")}>
            Rate cards
          </TabButton>
        ) : null}
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>
          Payment history
        </TabButton>
      </div>

      {error ? (
        <div className="rounded-xl border border-status-error/30 bg-status-error-bg px-4 py-3 text-sm text-status-error">
          {error}
        </div>
      ) : null}

      {tab === "payable" ? (
        <StatementPanel
          loading={loading}
          statement={statement}
          from={from}
          to={to}
          selected={selected}
          onFrom={setFrom}
          onTo={setTo}
          onApply={() => {
            setAppliedFrom(from);
            setAppliedTo(to);
          }}
          onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
          onPay={canManage ? openPayment : undefined}
        />
      ) : tab === "history" ? (
        <PaymentHistory
          loading={loading}
          statement={statement}
          from={from}
          to={to}
          onFrom={setFrom}
          onTo={setTo}
          onApply={() => {
            setAppliedFrom(from);
            setAppliedTo(to);
          }}
        />
      ) : (
        <div className="space-y-4">
          {editing && options ? (
            <RateCardForm
              options={options}
              card={editing === "new" ? null : editing}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                void load();
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="min-h-14 rounded-xl bg-brand-dark px-4 text-sm font-medium text-white"
            >
              New rate card
            </button>
          )}
          <RateCardList
            cards={cards.filter((card) => card.status === "active")}
            options={options}
            onEdit={setEditing}
            onArchive={(card) => void changeCardStatus(card, "archive")}
          />
          {cards.some((card) => card.status === "archived") ? (
            <div className="space-y-2">
              <h2 className="text-lg font-medium text-neutral-950">Archived</h2>
              <RateCardList
                cards={cards.filter((card) => card.status === "archived")}
                options={options}
                onRestore={(card) => void changeCardStatus(card, "restore")}
              />
            </div>
          ) : null}
        </div>
      )}

      {paying ? (
        <RecordPaymentModal
          key={payKey}
          open
          options={options}
          payeeId={paying.id}
          balance={paying.balance}
          onClose={() => setPaying(null)}
          onSaved={() => {
            setPaying(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-12 rounded-xl px-4 text-sm font-medium ${
        active ? "bg-brand-dark text-white" : "border border-neutral-300 text-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

function StatementPanel({
  loading,
  statement,
  from,
  to,
  selected,
  onFrom,
  onTo,
  onApply,
  onSelect,
  onPay,
}: {
  loading: boolean;
  statement: PaymentStatement | null;
  from: string;
  to: string;
  selected: StatementPerson | null;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onApply: () => void;
  onSelect: (id: string) => void;
  onPay?: (person: StatementPerson) => void;
}) {
  const totals = statement?.totals;
  return (
    <div className="space-y-4">
      <DateFilter from={from} to={to} onFrom={onFrom} onTo={onTo} onApply={onApply} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Owed"
          value={totals ? formatInr(totals.owed) : "—"}
          hint={
            statement && !statement.rates_active
              ? "₹0 until a rate card prices these entries"
              : "From entries and rate cards"
          }
        />
        <Stat label="Paid" value={totals ? formatInr(totals.paid) : "—"} hint="Recorded with proof" />
        <Stat
          label="Still to pay"
          value={totals ? formatInr(totals.balance) : "—"}
          hint={totals ? `${totals.entry_count} entries` : undefined}
        />
      </div>

      {statement && !statement.rates_active && statement.people.length > 0 ? (
        <p className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800">
          These are the farmers, farms, and other records already entered by climapreneurs and
          supervisors. Amounts stay at ₹0 until you save a rate card — for example ₹25 per farmer
          and ₹40 for any farm entered.
        </p>
      ) : null}

      {totals && totals.unattributed > 0 ? (
        <p className="text-sm text-neutral-500">
          {totals.unattributed} entries were recorded by someone other than a climapreneur or
          supervisor, so they are not added to anyone’s balance.
        </p>
      ) : null}

      {statement && statement.by_activity.length > 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <h2 className="text-lg font-medium text-neutral-950">By activity</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {statement.by_activity.map((row) => (
              <div key={row.activity} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-neutral-800">
                    {row.label}
                    <span className="text-neutral-500"> · {row.count}</span>
                  </span>
                  <span className="font-medium text-neutral-950">{formatInr(row.amount_inr)}</span>
                </div>
                {row.how ? <p className="mt-1 text-sm text-neutral-500">{row.how}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <DataTable
        loading={loading}
        emptyText="No climapreneur or supervisor has a farmer, farm, or other record on file yet."
        onRowClick={(row) => onSelect(String(row.id))}
        selectedRowId={selected?.id ?? null}
        columns={[
          {
            key: "name",
            label: "Name",
            filterable: true,
            render: (value) => (
              <span className="font-medium text-brand-dark underline">{String(value ?? "")}</span>
            ),
          },
          { key: "role", label: "Role", filterable: true },
          {
            key: "owed",
            label: "Owed",
            sortValue: (row) => Number(row.owed_value),
          },
          {
            key: "paid",
            label: "Paid",
            sortValue: (row) => Number(row.paid_value),
          },
          {
            key: "balance",
            label: "Still to pay",
            sortValue: (row) => Number(row.balance_value),
          },
        ]}
        rows={(statement?.people ?? []).map((person) => ({
          id: person.id,
          name: person.name,
          role: formatRoleLabel(person.role),
          owed: formatInr(person.owed),
          paid: formatInr(person.paid),
          balance: formatInr(person.balance),
          owed_value: person.owed,
          paid_value: person.paid,
          balance_value: person.balance,
        }))}
        actions={
          onPay
            ? (row) => (
                <button
                  type="button"
                  className="text-sm font-medium text-brand-dark hover:underline"
                  onClick={() => {
                    const person = statement?.people.find((item) => item.id === row.id);
                    if (person) onPay(person);
                  }}
                >
                  Record payment
                </button>
              )
            : undefined
        }
      />

      {selected ? (
        <PersonDetail person={selected} />
      ) : (
        <p className="text-sm text-neutral-500">
          Select a name to see how that amount is made up — farmers, farms, pyrolysis, and the
          other entries.
        </p>
      )}
    </div>
  );
}

function DateFilter({
  from,
  to,
  onFrom,
  onTo,
  onApply,
}: {
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onApply: () => void;
}) {
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onApply();
      }}
    >
      <label className="space-y-1">
        <span className="text-xs font-medium text-neutral-700">From</span>
        <input
          type="date"
          value={from}
          onChange={(event) => onFrom(event.target.value)}
          className="min-h-12 rounded-xl border border-neutral-300 px-3 text-base"
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium text-neutral-700">To</span>
        <input
          type="date"
          value={to}
          onChange={(event) => onTo(event.target.value)}
          className="min-h-12 rounded-xl border border-neutral-300 px-3 text-base"
        />
      </label>
      <button
        type="submit"
        className="min-h-12 rounded-xl border border-neutral-300 px-4 text-sm font-medium"
      >
        Apply dates
      </button>
    </form>
  );
}

function PaymentHistory({
  loading,
  statement,
  from,
  to,
  onFrom,
  onTo,
  onApply,
}: {
  loading: boolean;
  statement: PaymentStatement | null;
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onApply: () => void;
}) {
  const paid = statement?.totals.paid;
  return (
    <div className="space-y-4">
      <DateFilter from={from} to={to} onFrom={onFrom} onTo={onTo} onApply={onApply} />
      <Stat
        label="Paid in these dates"
        value={paid != null ? formatInr(paid) : "—"}
        hint="Each row is one payment, with its proof"
      />
      <DataTable
        loading={loading}
        emptyText="No payments recorded in these dates."
        columns={[
          { key: "paid_on", label: "Date" },
          { key: "name", label: "Paid to", filterable: true },
          { key: "role", label: "Role" },
          {
            key: "amount",
            label: "Amount",
            sortValue: (row) => Number(row.amount_value),
          },
          { key: "note", label: "Note" },
          {
            key: "proof",
            label: "Proof",
            render: (_value, row) => {
              const href = typeof row.proof_url === "string" ? row.proof_url : "";
              return href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-brand-dark hover:underline"
                >
                  {String(row.proof_name || "Open")}
                </a>
              ) : (
                "—"
              );
            },
          },
        ]}
        rows={(statement?.disbursements ?? []).map((row) => ({
          id: row.id,
          paid_on: formatDisplayDate(row.paid_on),
          name: row.payee_name,
          role: formatRoleLabel(row.payee_role),
          amount: formatInr(row.amount_inr),
          amount_value: row.amount_inr,
          note: row.note?.trim() || "—",
          proof_name: row.proof_name ?? "Proof",
          proof_url: row.signed_url ?? "",
        }))}
      />
    </div>
  );
}

function PersonDetail({ person }: { person: StatementPerson }) {
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [person.id]);

  const groups = person.by_activity
    .map((row) => ({
      row,
      lines: person.recent.filter((line) => line.activity === row.activity),
    }))
    .filter((group) => group.row.count > 0 || group.row.amount_inr > 0);

  return (
    <section ref={panel} className="rounded-2xl border border-neutral-200 bg-white p-4">
      <h2 className="text-lg font-medium text-neutral-950">
        How {person.name}&apos;s amount is made up
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        {formatRoleLabel(person.role)} · owed {formatInr(person.owed)} · paid{" "}
        {formatInr(person.paid)} · still to pay {formatInr(person.balance)}
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-neutral-500">
              <th className="py-2 pr-3">Activity</th>
              <th className="py-2 pr-3">Entries</th>
              <th className="py-2 pr-3">How this adds up</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ row }) => (
              <tr key={row.activity} className="border-t border-neutral-200">
                <td className="py-3 pr-3 text-neutral-950">{row.label}</td>
                <td className="py-3 pr-3">{row.count}</td>
                <td className="py-3 pr-3 text-neutral-800">{row.how || "—"}</td>
                <td className="py-3 text-right font-medium text-neutral-950">
                  {formatInr(row.amount_inr)}
                </td>
              </tr>
            ))}
            <tr className="border-t border-neutral-200">
              <td className="py-3 pr-3 font-medium text-neutral-950" colSpan={3}>
                Total owed
              </td>
              <td className="py-3 text-right font-medium text-neutral-950">
                {formatInr(person.owed)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {groups.some((group) => group.lines.length > 0) ? (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-medium text-neutral-950">The entries</h3>
          {groups
            .filter((group) => group.lines.length > 0)
            .map((group) => (
              <details key={group.row.activity} className="rounded-xl border border-neutral-200">
                <summary className="min-h-12 cursor-pointer px-3 py-3 text-sm font-medium text-neutral-950">
                  {group.row.label} · {group.lines.length}
                </summary>
                <div className="overflow-x-auto px-3 pb-3">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-xs font-medium text-neutral-500">
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 pr-3">Entry</th>
                        <th className="py-2 pr-3">Place</th>
                        <th className="py-2 pr-3">Rate card</th>
                        <th className="py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.lines.map((line) => (
                        <tr key={line.id} className="border-t border-neutral-200">
                          <td className="py-2 pr-3">{formatDisplayDate(line.occurred_on)}</td>
                          <td className="py-2 pr-3">{line.label}</td>
                          <td className="py-2 pr-3">{line.place}</td>
                          <td className="py-2 pr-3">{line.rate_card_name}</td>
                          <td className="py-2 text-right">{formatInr(line.amount_inr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-medium text-neutral-950">{value}</p>
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}

function RateCardList({
  cards,
  options,
  onEdit,
  onArchive,
  onRestore,
}: {
  cards: RateCard[];
  options: PaymentOptions | null;
  onEdit?: (card: RateCard) => void;
  onArchive?: (card: RateCard) => void;
  onRestore?: (card: RateCard) => void;
}) {
  if (cards.length === 0) {
    return <p className="text-sm text-neutral-500">No rate cards in this list.</p>;
  }
  const producerName = new Map((options?.producers ?? []).map((item) => [item.id, item.name]));
  const villageName = new Map((options?.villages ?? []).map((item) => [item.id, item.name]));
  const activityLabel = new Map(
    (options?.activities ?? []).map((item) => [item.activity, item.label]),
  );

  return (
    <div className="space-y-3">
      {cards.map((card) => {
        const places = [
          ...card.producer_ids.map((id) => producerName.get(id) ?? "Site"),
          ...card.village_ids.map((id) => villageName.get(id) ?? "Village"),
        ];
        const where =
          card.scope === "all_producers"
            ? SCOPE_LABELS.all_producers
            : places.join(", ") || SCOPE_LABELS[card.scope];
        return (
          <article key={card.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-medium text-neutral-950">{card.name}</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  {card.scope === "all_producers"
                    ? SCOPE_LABELS.all_producers
                    : card.producer_ids.length > 0 && card.village_ids.length > 0
                      ? "Producers and villages"
                      : SCOPE_LABELS[card.scope]}
                  {card.scope === "all_producers" ? "" : where ? ` · ${where}` : ""} · {formatDisplayDate(card.effective_from)}
                  {card.effective_to ? ` to ${formatDisplayDate(card.effective_to)}` : " onward"}
                </p>
              </div>
              <div className="flex gap-3">
                {onEdit ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-brand-dark hover:underline"
                    onClick={() => onEdit(card)}
                  >
                    Edit
                  </button>
                ) : null}
                {onArchive ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-neutral-700 hover:underline"
                    onClick={() => onArchive(card)}
                  >
                    Archive
                  </button>
                ) : null}
                {onRestore ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-brand-dark hover:underline"
                    onClick={() => onRestore(card)}
                  >
                    Restore
                  </button>
                ) : null}
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-neutral-800">
              {card.rates.map((rate) => (
                <li key={rate.activity}>
                  {activityLabel.get(rate.activity) ?? rate.activity}: {formatInr(rate.amount_inr)}
                  {rate.farm_basis ? ` · ${FARM_BASIS_LABELS[rate.farm_basis]}` : ""}
                </li>
              ))}
            </ul>
            {card.notes ? <p className="mt-2 text-sm text-neutral-500">{card.notes}</p> : null}
          </article>
        );
      })}
    </div>
  );
}
