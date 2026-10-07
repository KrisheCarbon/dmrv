"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  deleteRainbowMethane,
  saveRainbowEmissions,
  saveRainbowLabSample,
  saveRainbowMethane,
  saveRainbowPollutants,
  saveRainbowSoilTemperature,
} from "./actions";

const fieldClass =
  "min-h-12 w-full rounded-xl border bg-white px-3 text-sm text-brand-dark";
const labelClass = "text-xs font-medium text-brand-dark";
const buttonClass =
  "min-h-12 rounded-xl bg-brand-dark px-4 text-sm font-medium text-white disabled:opacity-50";

export interface RainbowCreditInputs {
  feedstocks: {
    id: string;
    biomass_type: string;
    biochar_producer?: { name?: string } | { name?: string }[] | null;
  }[];
  batches: {
    id: string;
    batch_number: string | null;
    feedstock_name: string | null;
    created_at: string;
  }[];
  mixing: {
    id: string;
    farm_name: string | null;
    started_at: string;
    location_lat: number | null;
    location_lng: number | null;
  }[];
  kontikkis: { id: string; kontikki_code: string }[];
  labSamples: Record<string, unknown>[];
  pollutants: Record<string, unknown>[];
  methane: Record<string, unknown>[];
  emissions: Record<string, unknown>[];
  soilTemps: Record<string, unknown>[];
}

function producerName(
  row: RainbowCreditInputs["feedstocks"][number],
): string {
  const value = row.biochar_producer;
  const one = Array.isArray(value) ? value[0] : value;
  return one?.name ? ` · ${one.name}` : "";
}

function feedstockLabel(inputs: RainbowCreditInputs, id: unknown): string {
  const row = inputs.feedstocks.find((item) => item.id === id);
  return row ? `${row.biomass_type}${producerName(row)}` : String(id ?? "—");
}

function textOf(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return value == null || value === "" ? "—" : String(value);
}

export default function RainbowCreditDesk({
  inputs,
}: {
  inputs: RainbowCreditInputs;
}) {
  return (
    <div className="space-y-6">
      <DownloadCard />
      <LabSampleForm inputs={inputs} />
      <PollutantForm inputs={inputs} />
      <MethaneForm inputs={inputs} />
      <EmissionForm inputs={inputs} />
      <SoilForm inputs={inputs} />
    </div>
  );
}

function DownloadCard() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/verification-reports/rainbow/download");
      if (!response.ok) {
        throw new Error((await response.text()).trim() || "Download failed.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = match?.[1] ?? "rainbow_open_kiln_credits.zip";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="space-y-3 rounded-2xl border bg-white p-6"
      style={{ borderColor: "var(--border)" }}
    >
      <h2 className="text-lg font-medium text-brand-dark">Rainbow credit package</h2>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Builds the submission from kiln-run lab samples, the yearly pollutant test,
        methane mean plus one standard deviation, soil temperature, leakage, transport,
        kiln steel, and processing energy. A row stays blocked until those records exist.
      </p>
      <button type="button" className="min-h-14 rounded-xl bg-brand-dark px-4 text-sm font-medium text-white disabled:opacity-50" onClick={download} disabled={pending}>
        {pending ? "Preparing download…" : "Download Rainbow credit package"}
      </button>
      {error ? <p className="text-sm text-brand-dark">{error}</p> : null}
    </section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      className="space-y-4 rounded-2xl border bg-white p-6"
      style={{ borderColor: "var(--border)" }}
    >
      <h2 className="text-lg font-medium text-brand-dark">{title}</h2>
      {children}
    </section>
  );
}

function LabSampleForm({ inputs }: { inputs: RainbowCreditInputs }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const message = await saveRainbowLabSample({
      pyrolysis_batch_id: String(formData.get("pyrolysis_batch_id") ?? ""),
      organic_carbon_percent: Number(formData.get("organic_carbon_percent")),
      hcorg: Number(formData.get("hcorg")),
      lab_name: String(formData.get("lab_name") ?? ""),
      analyzed_on: String(formData.get("analyzed_on") ?? ""),
      report_url: String(formData.get("report_url") ?? ""),
    });
    setPending(false);
    if (message) setError(message);
    else router.refresh();
  }

  return (
    <Section title="Lab sample per kiln run">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Organic carbon and H/Corg from one representative sample. Rainbow accepts H/Corg under 0.7.
        This is not the feedstock catalog H/C.
      </p>
      <form action={onSubmit} className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 md:col-span-2">
          <span className={labelClass}>Kiln run</span>
          <select name="pyrolysis_batch_id" required className={fieldClass} style={{ borderColor: "var(--border)" }}>
            <option value="">Select an uploaded run</option>
            {inputs.batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.batch_number || batch.id} · {batch.feedstock_name || "No feedstock"}
              </option>
            ))}
          </select>
        </label>
        <NumberField name="organic_carbon_percent" label="Organic carbon %" step="0.01" />
        <NumberField name="hcorg" label="H/Corg (under 0.7)" step="0.0001" />
        <TextField name="lab_name" label="Laboratory" />
        <TextField name="analyzed_on" label="Analysis date" type="date" />
        <TextField name="report_url" label="Report link" required={false} />
        <div className="md:col-span-2">
          <button className={buttonClass} disabled={pending} type="submit">
            {pending ? "Saving…" : "Save lab sample"}
          </button>
        </div>
      </form>
      {error ? <p className="text-sm text-brand-dark">{error}</p> : null}
      <RecordTable
        rows={inputs.labSamples}
        columns={[
          ["pyrolysis_batch_id", "Kiln run"],
          ["organic_carbon_percent", "Organic carbon %"],
          ["hcorg", "H/Corg"],
          ["lab_name", "Laboratory"],
          ["analyzed_on", "Date"],
        ]}
      />
    </Section>
  );
}

function PollutantForm({ inputs }: { inputs: RainbowCreditInputs }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const metals = [
    ["lead_mg_kg", "Lead"],
    ["cadmium_mg_kg", "Cadmium"],
    ["copper_mg_kg", "Copper"],
    ["nickel_mg_kg", "Nickel"],
    ["mercury_mg_kg", "Mercury"],
    ["zinc_mg_kg", "Zinc"],
    ["chromium_mg_kg", "Chromium"],
    ["arsenic_mg_kg", "Arsenic"],
  ] as const;

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const message = await saveRainbowPollutants({
      feedstock_id: String(formData.get("feedstock_id") ?? ""),
      test_year: Number(formData.get("test_year")),
      lead_mg_kg: Number(formData.get("lead_mg_kg")),
      cadmium_mg_kg: Number(formData.get("cadmium_mg_kg")),
      copper_mg_kg: Number(formData.get("copper_mg_kg")),
      nickel_mg_kg: Number(formData.get("nickel_mg_kg")),
      mercury_mg_kg: Number(formData.get("mercury_mg_kg")),
      zinc_mg_kg: Number(formData.get("zinc_mg_kg")),
      chromium_mg_kg: Number(formData.get("chromium_mg_kg")),
      arsenic_mg_kg: Number(formData.get("arsenic_mg_kg")),
      tested_on: String(formData.get("tested_on") ?? ""),
      lab_name: String(formData.get("lab_name") ?? ""),
      report_url: String(formData.get("report_url") ?? ""),
    });
    setPending(false);
    if (message) setError(message);
    else router.refresh();
  }

  return (
    <Section title="Yearly pollutant test">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Lead, cadmium, copper, nickel, mercury, zinc, chromium, and arsenic, in mg/kg.
        Open kilns do not report PAH.
      </p>
      <form action={onSubmit} className="grid gap-3 md:grid-cols-2">
        <FeedstockSelect inputs={inputs} />
        <NumberField name="test_year" label="Year" step="1" />
        {metals.map(([name, label]) => (
          <NumberField key={name} name={name} label={`${label} mg/kg`} step="0.0001" />
        ))}
        <TextField name="lab_name" label="Laboratory" />
        <TextField name="tested_on" label="Test date" type="date" />
        <TextField name="report_url" label="Report link" required={false} />
        <div className="md:col-span-2">
          <button className={buttonClass} disabled={pending} type="submit">
            {pending ? "Saving…" : "Save pollutant test"}
          </button>
        </div>
      </form>
      {error ? <p className="text-sm text-brand-dark">{error}</p> : null}
      <RecordTable
        rows={inputs.pollutants}
        columns={[
          ["test_year", "Year"],
          ["feedstock_id", "Feedstock"],
          ["lead_mg_kg", "Pb"],
          ["cadmium_mg_kg", "Cd"],
          ["mercury_mg_kg", "Hg"],
          ["arsenic_mg_kg", "As"],
        ]}
        feedstockLookup={inputs}
      />
    </Section>
  );
}

function MethaneForm({ inputs }: { inputs: RainbowCreditInputs }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const message = await saveRainbowMethane({
      feedstock_id: String(formData.get("feedstock_id") ?? ""),
      kontikki_id: String(formData.get("kontikki_id") ?? ""),
      period_year: Number(formData.get("period_year")),
      measured_on: String(formData.get("measured_on") ?? ""),
      kg_ch4_per_kg_biochar: Number(formData.get("kg_ch4_per_kg_biochar")),
      provider_name: String(formData.get("provider_name") ?? ""),
      report_url: String(formData.get("report_url") ?? ""),
    });
    setPending(false);
    if (message) setError(message);
    else router.refresh();
  }

  return (
    <Section title="Methane measurements">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Carbon mass balance, in kilograms of CH4 per kilogram of biochar. Credits use the mean
        plus one standard deviation after three runs on three kilns. Until then, the year cannot be issued.
      </p>
      <form action={onSubmit} className="grid gap-3 md:grid-cols-2">
        <FeedstockSelect inputs={inputs} />
        <label className="space-y-1">
          <span className={labelClass}>Kiln</span>
          <select name="kontikki_id" required className={fieldClass} style={{ borderColor: "var(--border)" }}>
            <option value="">Select a kiln</option>
            {inputs.kontikkis.map((kiln) => (
              <option key={kiln.id} value={kiln.id}>
                {kiln.kontikki_code}
              </option>
            ))}
          </select>
        </label>
        <NumberField name="period_year" label="Year" step="1" />
        <NumberField name="kg_ch4_per_kg_biochar" label="kg CH4 / kg biochar" step="0.000001" />
        <TextField name="measured_on" label="Measurement date" type="date" />
        <TextField name="provider_name" label="Independent provider" />
        <TextField name="report_url" label="Report link" required={false} />
        <div className="md:col-span-2">
          <button className={buttonClass} disabled={pending} type="submit">
            {pending ? "Saving…" : "Save methane run"}
          </button>
        </div>
      </form>
      {error ? <p className="text-sm text-brand-dark">{error}</p> : null}
      <ul className="space-y-2">
        {inputs.methane.map((row) => (
          <li key={String(row.id)} className="flex items-center justify-between gap-3 text-sm">
            <span>
              {feedstockLabel(inputs, row.feedstock_id)} · {textOf(row, "period_year")} ·{" "}
              {textOf(row, "kg_ch4_per_kg_biochar")} kg/kg
            </span>
            <button
              type="button"
              className="min-h-12 rounded-xl border px-3 text-sm text-brand-dark"
              style={{ borderColor: "var(--border)" }}
              onClick={async () => {
                const message = await deleteRainbowMethane(String(row.id));
                if (message) setError(message);
                else router.refresh();
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function EmissionForm({ inputs }: { inputs: RainbowCreditInputs }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [leftOnSoil, setLeftOnSoil] = useState(true);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const message = await saveRainbowEmissions({
      feedstock_id: String(formData.get("feedstock_id") ?? ""),
      period_year: Number(formData.get("period_year")),
      biomass_left_on_soil: formData.get("biomass_left_on_soil") === "yes",
      sequestration_rate: Number(formData.get("sequestration_rate") || 0.005),
      biomass_carbon_fraction:
        formData.get("biomass_left_on_soil") === "yes"
          ? Number(formData.get("biomass_carbon_fraction"))
          : null,
      transport_tco2e: Number(formData.get("transport_tco2e")),
      kiln_steel_tco2e: Number(formData.get("kiln_steel_tco2e")),
      processing_tco2e: Number(formData.get("processing_tco2e")),
      notes: String(formData.get("notes") ?? ""),
    });
    setPending(false);
    if (message) setError(message);
    else router.refresh();
  }

  return (
    <Section title="Leakage, transport, steel, and processing">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        When biomass would have stayed on the soil, leakage is at least 0.5% of feedstock carbon.
        Transport, kiln steel, and chipping or drying energy must be entered. Use zero only when that step did not happen.
      </p>
      <form action={onSubmit} className="grid gap-3 md:grid-cols-2">
        <FeedstockSelect inputs={inputs} />
        <NumberField name="period_year" label="Year" step="1" />
        <label className="space-y-1">
          <span className={labelClass}>Would this biomass have stayed on the soil?</span>
          <select
            name="biomass_left_on_soil"
            className={fieldClass}
            style={{ borderColor: "var(--border)" }}
            value={leftOnSoil ? "yes" : "no"}
            onChange={(event) => setLeftOnSoil(event.target.value === "yes")}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <NumberField name="sequestration_rate" label="Sequestration rate (0.005 = 0.5%)" step="0.0001" />
        {leftOnSoil ? (
          <NumberField name="biomass_carbon_fraction" label="Feedstock carbon fraction (0–1)" step="0.0001" />
        ) : null}
        <NumberField name="transport_tco2e" label="Transport tCO2e" step="0.0001" />
        <NumberField name="kiln_steel_tco2e" label="Kiln steel tCO2e" step="0.0001" />
        <NumberField name="processing_tco2e" label="Chipping or drying tCO2e" step="0.0001" />
        <TextField name="notes" label="Note" required={false} />
        <div className="md:col-span-2">
          <button className={buttonClass} disabled={pending} type="submit">
            {pending ? "Saving…" : "Save emission inputs"}
          </button>
        </div>
      </form>
      {error ? <p className="text-sm text-brand-dark">{error}</p> : null}
      <RecordTable
        rows={inputs.emissions}
        columns={[
          ["period_year", "Year"],
          ["feedstock_id", "Feedstock"],
          ["biomass_left_on_soil", "Left on soil"],
          ["transport_tco2e", "Transport"],
          ["kiln_steel_tco2e", "Steel"],
          ["processing_tco2e", "Processing"],
        ]}
        feedstockLookup={inputs}
      />
    </Section>
  );
}

function SoilForm({ inputs }: { inputs: RainbowCreditInputs }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const message = await saveRainbowSoilTemperature({
      mixing_entry_id: String(formData.get("mixing_entry_id") ?? ""),
      soil_temp_c: Number(formData.get("soil_temp_c")),
      source_note: String(formData.get("source_note") ?? ""),
    });
    setPending(false);
    if (message) setError(message);
    else router.refresh();
  }

  return (
    <Section title="Soil temperature at the mixing GPS">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Mean annual soil temperature for the end-use location. Permanence is Fperm = c − m × H/Corg
        from that temperature. Two percent of the verified removal then goes to the buffer pool.
      </p>
      <form action={onSubmit} className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 md:col-span-2">
          <span className={labelClass}>Mixing entry</span>
          <select name="mixing_entry_id" required className={fieldClass} style={{ borderColor: "var(--border)" }}>
            <option value="">Select a mixing record</option>
            {inputs.mixing.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.farm_name || entry.id}
                {entry.location_lat != null ? ` · ${entry.location_lat}, ${entry.location_lng}` : ""}
              </option>
            ))}
          </select>
        </label>
        <NumberField name="soil_temp_c" label="Soil temperature °C" step="0.1" />
        <TextField name="source_note" label="Source note" required={false} />
        <div className="md:col-span-2">
          <button className={buttonClass} disabled={pending} type="submit">
            {pending ? "Saving…" : "Save soil temperature"}
          </button>
        </div>
      </form>
      {error ? <p className="text-sm text-brand-dark">{error}</p> : null}
      <RecordTable
        rows={inputs.soilTemps}
        columns={[
          ["mixing_entry_id", "Mixing entry"],
          ["soil_temp_c", "°C"],
          ["source_note", "Source"],
        ]}
      />
    </Section>
  );
}

function FeedstockSelect({ inputs }: { inputs: RainbowCreditInputs }) {
  return (
    <label className="space-y-1">
      <span className={labelClass}>Feedstock</span>
      <select name="feedstock_id" required className={fieldClass} style={{ borderColor: "var(--border)" }}>
        <option value="">Select a feedstock</option>
        {inputs.feedstocks.map((row) => (
          <option key={row.id} value={row.id}>
            {row.biomass_type}
            {producerName(row)}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  name,
  label,
  type = "text",
  required = true,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className={labelClass}>{label}</span>
      <input name={name} type={type} required={required} className={fieldClass} style={{ borderColor: "var(--border)" }} />
    </label>
  );
}

function NumberField({ name, label, step }: { name: string; label: string; step: string }) {
  return (
    <label className="space-y-1">
      <span className={labelClass}>{label}</span>
      <input
        name={name}
        type="number"
        step={step}
        required
        className={fieldClass}
        style={{ borderColor: "var(--border)" }}
      />
    </label>
  );
}

function RecordTable({
  rows,
  columns,
  feedstockLookup,
}: {
  rows: Record<string, unknown>[];
  columns: [string, string][];
  feedstockLookup?: RainbowCreditInputs;
}) {
  if (!rows.length) return <p className="text-sm" style={{ color: "var(--text-secondary)" }}>None saved yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {columns.map(([, label]) => (
              <th key={label} className="px-2 py-2 text-xs font-medium text-brand-dark">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? row.pyrolysis_batch_id ?? row.mixing_entry_id ?? index)}>
              {columns.map(([key]) => (
                <td key={key} className="px-2 py-2">
                  {key === "feedstock_id" && feedstockLookup
                    ? feedstockLabel(feedstockLookup, row.feedstock_id)
                    : textOf(row, key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
