/** Rainbow open-kiln credit maths (RBW distributed biochar, 100-year pathway). */

export const CO2_PER_CARBON = 44 / 12;
/** Biogenic methane, 100-year GWP, from the Rainbow GHG quantification. */
export const BIOGENIC_METHANE_GWP_100 = 27;
export const RAINBOW_BUFFER_SHARE = 0.02;
export const MIN_BIOMASS_SEQUESTRATION = 0.005;
/** Kiln-run lab result. Not the feedstock-catalog H/C limit of 0.4. */
export const RAINBOW_HCORG_MAX = 0.7;
export const METHANE_RUNS_REQUIRED = 3;
export const METHANE_KILNS_REQUIRED = 3;

export function permanenceCoefficients(soilTempC: number): {
  c: number;
  m: number;
  band: string;
} | null {
  if (!Number.isFinite(soilTempC)) return null;
  if (soilTempC < 7.5) return { c: 1.13, m: 0.46, band: "below 7.5°C" };
  if (soilTempC < 12.5) return { c: 1.1, m: 0.59, band: "7.5–12.49°C" };
  if (soilTempC < 17.5) return { c: 1.04, m: 0.64, band: "12.5–17.49°C" };
  if (soilTempC < 22.5) return { c: 1.01, m: 0.65, band: "17.5–22.49°C" };
  return { c: 0.98, m: 0.66, band: "22.5°C and above" };
}

export function fperm100(hcorg: number, soilTempC: number): number | null {
  if (!(hcorg > 0 && hcorg < RAINBOW_HCORG_MAX)) return null;
  const coef = permanenceCoefficients(soilTempC);
  if (!coef) return null;
  const value = coef.c - coef.m * hcorg;
  return value > 0 ? value : null;
}

export function dryBiocharTonnes(
  feedstockKg: number | null,
  yieldPercent: number | null,
): number | null {
  if (feedstockKg == null || yieldPercent == null) return null;
  if (!(feedstockKg > 0) || !(yieldPercent > 0)) return null;
  return (feedstockKg * (yieldPercent / 100)) / 1000;
}

export function sampleStandardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

export function methaneEmissionFactor(kgPerKg: number[]): {
  mean: number;
  standardDeviation: number;
  factor: number;
} | null {
  if (kgPerKg.length < METHANE_RUNS_REQUIRED) return null;
  if (kgPerKg.some((value) => !(value > 0))) return null;
  const mean = kgPerKg.reduce((sum, value) => sum + value, 0) / kgPerKg.length;
  const standardDeviation = sampleStandardDeviation(kgPerKg);
  if (standardDeviation == null) return null;
  return { mean, standardDeviation, factor: mean + standardDeviation };
}

export interface RainbowCreditRun {
  id: string;
  feedstockId: string | null;
  feedstockName: string;
  batchNumber: string;
  feedstockKg: number | null;
  yieldPercent: number | null;
  producedAt: string | null;
  organicCarbonPercent: number | null;
  hcorg: number | null;
}

export interface RainbowCreditDelivery {
  mixingEntryId: string;
  farmName: string;
  appliedAt: string;
  latitude: number | null;
  longitude: number | null;
  soilTempC: number | null;
  runIds: string[];
}

export interface RainbowMethaneSample {
  kontikkiId: string;
  kgCh4PerKgBiochar: number;
}

export interface RainbowYearFactors {
  feedstockId: string;
  year: number;
  pollutantRecorded: boolean;
  methaneSamples: RainbowMethaneSample[];
  biomassLeftOnSoil: boolean | null;
  sequestrationRate: number | null;
  biomassCarbonFraction: number | null;
  transportTco2e: number | null;
  kilnSteelTco2e: number | null;
  processingTco2e: number | null;
}

export interface RainbowCreditLine {
  mixingEntryId: string;
  feedstockId: string;
  feedstockName: string;
  year: number;
  farmName: string;
  latitude: number | null;
  longitude: number | null;
  soilTempC: number | null;
  hcorg: number | null;
  organicCarbonFraction: number | null;
  permanenceC: number | null;
  permanenceM: number | null;
  fperm: number | null;
  dryBiocharTonnes: number;
  biomassTonnes: number;
  grossRemovalTco2e: number | null;
  leakageTco2e: number | null;
  methaneTco2e: number | null;
  methaneFactorKgPerKg: number | null;
  transportTco2e: number | null;
  kilnSteelTco2e: number | null;
  processingTco2e: number | null;
  netRemovalTco2e: number | null;
  bufferTco2e: number | null;
  issuableTco2e: number | null;
  status: "issuable" | "blocked";
  reasons: string[];
}

export function creditYear(iso: string | null): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const year = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(date);
  const parsed = Number(year);
  return Number.isInteger(parsed) ? parsed : null;
}

function yearKey(feedstockId: string, year: number): string {
  return `${feedstockId}:${year}`;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function assessRainbowCredits(input: {
  runs: RainbowCreditRun[];
  deliveries: RainbowCreditDelivery[];
  years: RainbowYearFactors[];
}): RainbowCreditLine[] {
  const runs = new Map(input.runs.map((run) => [run.id, run]));
  const factors = new Map(
    input.years.map((year) => [yearKey(year.feedstockId, year.year), year]),
  );

  const producedByKey = new Map<string, number>();
  for (const run of input.runs) {
    if (!run.feedstockId) continue;
    const year = creditYear(run.producedAt);
    const dry = dryBiocharTonnes(run.feedstockKg, run.yieldPercent);
    if (year == null || dry == null) continue;
    const key = yearKey(run.feedstockId, year);
    producedByKey.set(key, (producedByKey.get(key) ?? 0) + dry);
  }

  const lines: RainbowCreditLine[] = [];

  for (const delivery of input.deliveries) {
    const groups = new Map<string, RainbowCreditRun[]>();
    const orphans: RainbowCreditRun[] = [];

    for (const runId of delivery.runIds) {
      const run = runs.get(runId);
      if (!run) continue;
      const year = creditYear(run.producedAt) ?? creditYear(delivery.appliedAt);
      if (!run.feedstockId || year == null) {
        orphans.push(run);
        continue;
      }
      const key = yearKey(run.feedstockId, year);
      const list = groups.get(key) ?? [];
      list.push(run);
      groups.set(key, list);
    }

    for (const run of orphans) {
      lines.push(
        blockedLine(delivery, run.feedstockId ?? "", run.feedstockName, creditYear(delivery.appliedAt) ?? 0, [
          `${run.batchNumber || run.id} has no feedstock or production date.`,
        ]),
      );
    }

    for (const [key, group] of groups) {
      const [feedstockId, yearText] = key.split(":");
      const year = Number(yearText);
      lines.push(
        lineForGroup(
          delivery,
          feedstockId,
          year,
          group,
          factors.get(key),
          producedByKey.get(key) ?? 0,
        ),
      );
    }
  }

  return lines;
}

function blockedLine(
  delivery: RainbowCreditDelivery,
  feedstockId: string,
  feedstockName: string,
  year: number,
  reasons: string[],
): RainbowCreditLine {
  return {
    mixingEntryId: delivery.mixingEntryId,
    feedstockId,
    feedstockName,
    year,
    farmName: delivery.farmName,
    latitude: delivery.latitude,
    longitude: delivery.longitude,
    soilTempC: delivery.soilTempC,
    hcorg: null,
    organicCarbonFraction: null,
    permanenceC: null,
    permanenceM: null,
    fperm: null,
    dryBiocharTonnes: 0,
    biomassTonnes: 0,
    grossRemovalTco2e: null,
    leakageTco2e: null,
    methaneTco2e: null,
    methaneFactorKgPerKg: null,
    transportTco2e: null,
    kilnSteelTco2e: null,
    processingTco2e: null,
    netRemovalTco2e: null,
    bufferTco2e: null,
    issuableTco2e: null,
    status: "blocked",
    reasons,
  };
}

function lineForGroup(
  delivery: RainbowCreditDelivery,
  feedstockId: string,
  year: number,
  group: RainbowCreditRun[],
  yearFactors: RainbowYearFactors | undefined,
  producedDry: number,
): RainbowCreditLine {
  const reasons: string[] = [];
  const feedstockName = group.find((run) => run.feedstockName)?.feedstockName || feedstockId;
  let dry = 0;
  let biomass = 0;
  let carbonWeighted = 0;
  let hcWeighted = 0;
  let gross = 0;
  let weighedRuns = 0;

  const soilTemp = delivery.soilTempC;
  const coef = soilTemp == null ? null : permanenceCoefficients(soilTemp);
  if (soilTemp == null || coef == null) {
    reasons.push("Soil temperature at the mixing GPS is missing.");
  }

  for (const run of group) {
    const label = run.batchNumber || run.id;
    const runDry = dryBiocharTonnes(run.feedstockKg, run.yieldPercent);
    if (runDry == null) {
      reasons.push(`${label} has no feedstock quantity and yield, so dry biochar mass is unknown.`);
      continue;
    }
    dry += runDry;
    biomass += (run.feedstockKg ?? 0) / 1000;
    weighedRuns += 1;

    const carbon = run.organicCarbonPercent;
    const hcorg = run.hcorg;
    if (carbon == null || !(carbon > 0 && carbon <= 100)) {
      reasons.push(`${label} has no organic-carbon lab result.`);
    }
    if (hcorg == null) {
      reasons.push(`${label} has no H/Corg lab result.`);
    } else if (!(hcorg > 0 && hcorg < RAINBOW_HCORG_MAX)) {
      reasons.push(`${label} H/Corg is ${hcorg}. Rainbow requires it under 0.7.`);
    }

    if (
      carbon != null &&
      carbon > 0 &&
      carbon <= 100 &&
      hcorg != null &&
      coef != null
    ) {
      const permanent = fperm100(hcorg, soilTemp as number);
      if (permanent == null) {
        reasons.push(`${label} has no durable fraction at this soil temperature.`);
      } else {
        gross += permanent * (carbon / 100) * runDry * CO2_PER_CARBON;
        carbonWeighted += (carbon / 100) * runDry;
        hcWeighted += hcorg * runDry;
      }
    }
  }

  if (weighedRuns === 0) {
    return blockedLine(delivery, feedstockId, feedstockName, year, reasons);
  }

  const organicCarbonFraction = carbonWeighted > 0 ? carbonWeighted / dry : null;
  const hcorg = hcWeighted > 0 ? hcWeighted / dry : null;
  const fperm =
    organicCarbonFraction != null && organicCarbonFraction > 0 && gross > 0
      ? gross / (organicCarbonFraction * dry * CO2_PER_CARBON)
      : null;

  let methaneFactor: number | null = null;
  if (!yearFactors) {
    reasons.push(
      `${feedstockName} ${year} has no pollutant test, methane campaign, or emission record.`,
    );
  } else {
    if (!yearFactors.pollutantRecorded) {
      reasons.push(`${feedstockName} ${year} has no yearly pollutant test.`);
    }
    const samples = yearFactors.methaneSamples.filter(
      (sample) => sample.kgCh4PerKgBiochar > 0 && sample.kontikkiId,
    );
    const kilns = new Set(samples.map((sample) => sample.kontikkiId));
    if (samples.length < METHANE_RUNS_REQUIRED || kilns.size < METHANE_KILNS_REQUIRED) {
      reasons.push(
        `${feedstockName} ${year} needs methane on three runs across three kilns. Recorded ${samples.length} run(s) on ${kilns.size} kiln(s).`,
      );
    } else {
      methaneFactor = methaneEmissionFactor(
        samples.map((sample) => sample.kgCh4PerKgBiochar),
      )?.factor ?? null;
      if (methaneFactor == null) {
        reasons.push(`${feedstockName} ${year} methane results cannot be combined.`);
      }
    }
    if (yearFactors.biomassLeftOnSoil == null) {
      reasons.push(`${feedstockName} ${year} does not say whether feedstock carbon would have stayed in the soil.`);
    } else if (yearFactors.biomassLeftOnSoil) {
      if (
        yearFactors.sequestrationRate == null ||
        yearFactors.sequestrationRate < MIN_BIOMASS_SEQUESTRATION
      ) {
        reasons.push("Leakage sequestration must be at least 0.5% when biomass would have stayed on the soil.");
      }
      if (
        yearFactors.biomassCarbonFraction == null ||
        !(yearFactors.biomassCarbonFraction > 0 && yearFactors.biomassCarbonFraction <= 1)
      ) {
        reasons.push("Feedstock carbon fraction is required for the leakage deduction.");
      }
    }
    if (
      yearFactors.transportTco2e == null ||
      yearFactors.kilnSteelTco2e == null ||
      yearFactors.processingTco2e == null
    ) {
      reasons.push(
        "Transport, kiln steel, and chipping or drying energy must be entered for the year, even when the figure is zero.",
      );
    }
  }

  const share = producedDry > 0 ? dry / producedDry : null;
  if (share == null) reasons.push("Produced biochar mass for this feedstock and year is zero.");

  const leakage =
    yearFactors?.biomassLeftOnSoil &&
    yearFactors.sequestrationRate != null &&
    yearFactors.biomassCarbonFraction != null
      ? biomass *
        yearFactors.biomassCarbonFraction *
        yearFactors.sequestrationRate *
        CO2_PER_CARBON
      : yearFactors?.biomassLeftOnSoil === false
        ? 0
        : null;

  const methane =
    methaneFactor != null ? dry * methaneFactor * BIOGENIC_METHANE_GWP_100 : null;
  const transport =
    share != null && yearFactors?.transportTco2e != null
      ? yearFactors.transportTco2e * share
      : null;
  const steel =
    share != null && yearFactors?.kilnSteelTco2e != null
      ? yearFactors.kilnSteelTco2e * share
      : null;
  const processing =
    share != null && yearFactors?.processingTco2e != null
      ? yearFactors.processingTco2e * share
      : null;

  const deductions = [leakage, methane, transport, steel, processing];
  const net =
    reasons.length === 0 && deductions.every((value) => value != null)
      ? gross - (deductions as number[]).reduce((sum, value) => sum + value, 0)
      : null;

  if (net != null && net <= 0) {
    reasons.push("Net removal is not positive after deductions.");
  }

  const issuable = net != null && net > 0 ? net * (1 - RAINBOW_BUFFER_SHARE) : null;
  const buffer = issuable != null && net != null ? net - issuable : null;
  const status = reasons.length === 0 && issuable != null && issuable > 0 ? "issuable" : "blocked";

  return {
    mixingEntryId: delivery.mixingEntryId,
    feedstockId,
    feedstockName,
    year,
    farmName: delivery.farmName,
    latitude: delivery.latitude,
    longitude: delivery.longitude,
    soilTempC: soilTemp,
    hcorg,
    organicCarbonFraction,
    permanenceC: coef?.c ?? null,
    permanenceM: coef?.m ?? null,
    fperm,
    dryBiocharTonnes: round6(dry),
    biomassTonnes: round6(biomass),
    grossRemovalTco2e: reasons.length === 0 ? round6(gross) : gross > 0 ? round6(gross) : null,
    leakageTco2e: leakage == null ? null : round6(leakage),
    methaneTco2e: methane == null ? null : round6(methane),
    methaneFactorKgPerKg: methaneFactor,
    transportTco2e: transport == null ? null : round6(transport),
    kilnSteelTco2e: steel == null ? null : round6(steel),
    processingTco2e: processing == null ? null : round6(processing),
    netRemovalTco2e: net == null ? null : round6(net),
    bufferTco2e: buffer == null ? null : round6(buffer),
    issuableTco2e: issuable == null ? null : round6(issuable),
    status,
    reasons,
  };
}
