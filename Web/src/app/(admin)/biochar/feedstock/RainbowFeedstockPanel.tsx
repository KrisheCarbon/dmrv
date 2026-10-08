"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  getRainbowFeedstockDesk,
  type RainbowFeedstockDesk,
} from "./actions";
import {
  deleteRainbowMethane,
  saveRainbowEmissions,
  saveRainbowFeedstockLab,
  saveRainbowMethane,
  saveRainbowPollutants,
  saveRainbowSoilTemperature,
} from "@/app/(admin)/verification-reports/rainbow/actions";

const fieldClass = "min-h-12 w-full rounded-xl border bg-white px-3 text-sm";
const labelClass = "text-xs font-medium";
const buttonClass =
  "inline-flex min-h-14 items-center rounded-xl bg-brand-dark px-4 text-sm font-medium text-white disabled:opacity-50";

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

function textOf(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (value == null || value === "") return "—";
  return String(value);
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

function Field({
  name,
  label,
  type = "text",
  step,
  required = true,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  step?: string;
  required?: boolean;
  defaultValue?: string | number;
}) {
  return (
    <label className="space-y-1">
      <span className={labelClass} style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        defaultValue={defaultValue}
        className={fieldClass}
        style={{ borderColor: "var(--border)" }}
      />
    </label>
  );
}

export default function RainbowFeedstockPanel({
  feedstockId,
  readOnly = false,
}: {
  feedstockId: string;
  readOnly?: boolean;
}) {
  const [desk, setDesk] = useState<RainbowFeedstockDesk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [leftOnSoil, setLeftOnSoil] = useState(true);
  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    try {
      setDesk(await getRainbowFeedstockDesk(feedstockId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rainbow records could not be loaded.");
    }
  }, [feedstockId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runSave(action: () => Promise<string | null>) {
    setPending(true);
    const message = await action();
    setPending(false);
    if (message) setError(message);
    else {
      setError(null);
      await load();
    }
  }

  if (!desk) {
    return (
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {error ?? "Loading Rainbow records…"}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Section title="What this feedstock still needs">
        <ul className="space-y-2">
          {desk.notices.map((notice) => (
            <li key={notice} className="text-sm text-brand-dark">
              {notice}
            </li>
          ))}
        </ul>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          One organic-carbon and H/Corg sample covers the next 200 tonnes or 6 months, whichever comes first. A run that starts under 200 tonnes may finish up to 205. Pollutants are once a year. Methane needs three runs on three kilns before credits for that year. Rainy-season pauses are not subtracted from the 6 months.
        </p>
      </Section>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <Section title="Lab sample">
        {readOnly ? null : <form
          className="grid gap-3 md:grid-cols-2"
          action={(formData) =>
            runSave(() =>
              saveRainbowFeedstockLab(feedstockId, {
                organic_carbon_percent: Number(formData.get("organic_carbon_percent")),
                hcorg: Number(formData.get("hcorg")),
                lab_name: String(formData.get("lab_name") ?? ""),
                analyzed_on: String(formData.get("analyzed_on") ?? ""),
                report_url: String(formData.get("report_url") ?? ""),
              }),
            )
          }
        >
          <Field name="organic_carbon_percent" label="Organic carbon %" type="number" step="0.01" />
          <Field name="hcorg" label="H/Corg (under 0.7)" type="number" step="0.0001" />
          <Field name="lab_name" label="Laboratory" />
          <Field name="analyzed_on" label="Analysis date" type="date" />
          <Field name="report_url" label="Report link" required={false} />
          <div className="md:col-span-2">
            <button className={buttonClass} disabled={pending} type="submit">
              {pending ? "Saving…" : "Save lab sample"}
            </button>
          </div>
        </form>}
        <ul className="space-y-2">
          {desk.labSamples.map((row) => (
            <li key={String(row.id)} className="text-sm">
              {textOf(row, "analyzed_on")} · {textOf(row, "organic_carbon_percent")}% carbon · H/Corg{" "}
              {textOf(row, "hcorg")} · {textOf(row, "lab_name")}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Yearly pollutant test">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Lead, cadmium, copper, nickel, mercury, zinc, chromium, and arsenic, in mg/kg. Open kilns do not report PAH.
        </p>
        {readOnly ? null : <form
          className="grid gap-3 md:grid-cols-2"
          action={(formData) =>
            runSave(() =>
              saveRainbowPollutants({
                feedstock_id: feedstockId,
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
              }),
            )
          }
        >
          <Field name="test_year" label="Year" type="number" step="1" defaultValue={year} />
          {metals.map(([name, label]) => (
            <Field key={name} name={name} label={`${label} mg/kg`} type="number" step="0.0001" />
          ))}
          <Field name="lab_name" label="Laboratory" />
          <Field name="tested_on" label="Test date" type="date" />
          <Field name="report_url" label="Report link" required={false} />
          <div className="md:col-span-2">
            <button className={buttonClass} disabled={pending} type="submit">
              {pending ? "Saving…" : "Save pollutant test"}
            </button>
          </div>
        </form>}
        <ul className="space-y-2">
          {desk.pollutants.map((row) => (
            <li key={String(row.id)} className="text-sm">
              {textOf(row, "test_year")} · Pb {textOf(row, "lead_mg_kg")} · Cd {textOf(row, "cadmium_mg_kg")} · Hg{" "}
              {textOf(row, "mercury_mg_kg")} · As {textOf(row, "arsenic_mg_kg")}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Methane measurements">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Kilograms of CH4 per kilogram of biochar. Credits use the mean plus one standard deviation after three runs on three kilns.
        </p>
        {readOnly ? null : <form
          className="grid gap-3 md:grid-cols-2"
          action={(formData) =>
            runSave(() =>
              saveRainbowMethane({
                feedstock_id: feedstockId,
                kontikki_id: String(formData.get("kontikki_id") ?? ""),
                period_year: Number(formData.get("period_year")),
                measured_on: String(formData.get("measured_on") ?? ""),
                kg_ch4_per_kg_biochar: Number(formData.get("kg_ch4_per_kg_biochar")),
                provider_name: String(formData.get("provider_name") ?? ""),
                report_url: String(formData.get("report_url") ?? ""),
              }),
            )
          }
        >
          <label className="space-y-1">
            <span className={labelClass} style={{ color: "var(--text-secondary)" }}>
              Kiln
            </span>
            <select
              name="kontikki_id"
              required
              className={fieldClass}
              style={{ borderColor: "var(--border)" }}
            >
              <option value="">Select a kiln</option>
              {desk.kontikkis.map((kiln) => (
                <option key={kiln.id} value={kiln.id}>
                  {kiln.kontikki_code}
                </option>
              ))}
            </select>
          </label>
          <Field name="period_year" label="Year" type="number" step="1" defaultValue={year} />
          <Field name="kg_ch4_per_kg_biochar" label="kg CH4 / kg biochar" type="number" step="0.000001" />
          <Field name="measured_on" label="Measurement date" type="date" />
          <Field name="provider_name" label="Independent provider" />
          <Field name="report_url" label="Report link" required={false} />
          <div className="md:col-span-2">
            <button className={buttonClass} disabled={pending} type="submit">
              {pending ? "Saving…" : "Save methane run"}
            </button>
          </div>
        </form>}
        <ul className="space-y-2">
          {desk.methane.map((row) => (
            <li key={String(row.id)} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {textOf(row, "period_year")} · {textOf(row, "measured_on")} · {textOf(row, "kg_ch4_per_kg_biochar")} kg/kg
              </span>
              <button
                type="button"
                className="min-h-12 rounded-xl border px-3 text-sm text-brand-dark"
                style={{ borderColor: "var(--border)" }}
                onClick={() => runSave(() => deleteRainbowMethane(String(row.id)))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Leakage, transport, steel, and processing">
        {readOnly ? null : <form
          className="grid gap-3 md:grid-cols-2"
          action={(formData) =>
            runSave(() =>
              saveRainbowEmissions({
                feedstock_id: feedstockId,
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
              }),
            )
          }
        >
          <Field name="period_year" label="Year" type="number" step="1" defaultValue={year} />
          <label className="space-y-1">
            <span className={labelClass} style={{ color: "var(--text-secondary)" }}>
              Would this biomass have stayed on the soil?
            </span>
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
          <Field name="sequestration_rate" label="Sequestration rate (0.005 = 0.5%)" type="number" step="0.0001" />
          {leftOnSoil ? (
            <Field name="biomass_carbon_fraction" label="Feedstock carbon fraction (0–1)" type="number" step="0.0001" />
          ) : null}
          <Field name="transport_tco2e" label="Transport tCO2e" type="number" step="0.0001" />
          <Field name="kiln_steel_tco2e" label="Kiln steel tCO2e" type="number" step="0.0001" />
          <Field name="processing_tco2e" label="Chipping or drying tCO2e" type="number" step="0.0001" />
          <Field name="notes" label="Note" required={false} />
          <div className="md:col-span-2">
            <button className={buttonClass} disabled={pending} type="submit">
              {pending ? "Saving…" : "Save emission inputs"}
            </button>
          </div>
        </form>}
        <ul className="space-y-2">
          {desk.emissions.map((row) => (
            <li key={`${textOf(row, "period_year")}`} className="text-sm">
              {textOf(row, "period_year")} · transport {textOf(row, "transport_tco2e")} · steel{" "}
              {textOf(row, "kiln_steel_tco2e")} · processing {textOf(row, "processing_tco2e")}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Soil temperature at the mixing location">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Permanence uses the soil temperature at the farm where this feedstock was mixed and applied.
        </p>
        {readOnly ? null : <form
          className="grid gap-3 md:grid-cols-2"
          action={(formData) =>
            runSave(() =>
              saveRainbowSoilTemperature({
                mixing_entry_id: String(formData.get("mixing_entry_id") ?? ""),
                soil_temp_c: Number(formData.get("soil_temp_c")),
                source_note: String(formData.get("source_note") ?? ""),
              }),
            )
          }
        >
          <label className="space-y-1 md:col-span-2">
            <span className={labelClass} style={{ color: "var(--text-secondary)" }}>
              Mixing entry
            </span>
            <select
              name="mixing_entry_id"
              required
              className={fieldClass}
              style={{ borderColor: "var(--border)" }}
            >
              <option value="">Select a mixing record</option>
              {desk.mixing.map((entry) => (
                <option key={String(entry.id)} value={String(entry.id)}>
                  {textOf(entry, "farm_name")}
                  {entry.location_lat != null ? ` · ${textOf(entry, "location_lat")}, ${textOf(entry, "location_lng")}` : ""}
                  {entry.soil_temp_c != null ? ` · ${textOf(entry, "soil_temp_c")}°C` : ""}
                </option>
              ))}
            </select>
          </label>
          <Field name="soil_temp_c" label="Soil temperature °C" type="number" step="0.1" />
          <Field name="source_note" label="Source note" required={false} />
          <div className="md:col-span-2">
            <button className={buttonClass} disabled={pending} type="submit">
              {pending ? "Saving…" : "Save soil temperature"}
            </button>
          </div>
        </form>}
      </Section>
    </div>
  );
}
