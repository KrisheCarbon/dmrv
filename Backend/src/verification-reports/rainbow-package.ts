import { randomUUID } from 'node:crypto';
import type { RainbowCreditLine } from '@krishecarbon/shared';
import { textPdf } from './pdf';
import { buildXlsx, type CellValue } from './xlsx';
import { zipFiles, type ZipEntry } from './zip';

export interface RainbowPackage {
  filename: string;
  buffer: Buffer;
  issuableCount: number;
  blockedCount: number;
}

function num(value: number | null): CellValue {
  return value == null ? null : value;
}

function creditRows(lines: RainbowCreditLine[]): CellValue[][] {
  const header: CellValue[] = [
    'Status',
    'Mixing entry',
    'Farm',
    'Feedstock',
    'Year',
    'Latitude',
    'Longitude',
    'Soil temperature °C',
    'H/Corg',
    'Organic carbon fraction',
    'Permanence c',
    'Permanence m',
    'Fperm',
    'Dry biochar t',
    'Feedstock biomass t',
    'Gross removal tCO2e',
    'Leakage tCO2e',
    'Methane factor kg CH4/kg biochar',
    'Methane tCO2e',
    'Transport tCO2e',
    'Kiln steel tCO2e',
    'Processing tCO2e',
    'Net removal tCO2e',
    'Buffer pool 2% tCO2e',
    'Issuable removal RCCs tCO2e',
    'Why blocked',
  ];

  return [
    header,
    ...lines.map((line) => [
      line.status,
      line.mixingEntryId,
      line.farmName,
      line.feedstockName,
      line.year,
      line.latitude,
      line.longitude,
      num(line.soilTempC),
      num(line.hcorg),
      num(line.organicCarbonFraction),
      num(line.permanenceC),
      num(line.permanenceM),
      num(line.fperm),
      line.dryBiocharTonnes,
      line.biomassTonnes,
      num(line.grossRemovalTco2e),
      num(line.leakageTco2e),
      num(line.methaneFactorKgPerKg),
      num(line.methaneTco2e),
      num(line.transportTco2e),
      num(line.kilnSteelTco2e),
      num(line.processingTco2e),
      num(line.netRemovalTco2e),
      num(line.bufferTco2e),
      num(line.issuableTco2e),
      line.reasons.join(' '),
    ]),
  ];
}

export function buildRainbowPackage(input: {
  lines: RainbowCreditLine[];
  notes: string[];
  reportId?: string;
}): RainbowPackage {
  const reportId = input.reportId ?? randomUUID();
  const issuable = input.lines.filter((line) => line.status === 'issuable');
  const blocked = input.lines.filter((line) => line.status === 'blocked');
  const issued = issuable.reduce((sum, line) => sum + (line.issuableTco2e ?? 0), 0);
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const filename = `rainbow_open_kiln_credits_${day}.zip`;

  const summary = [
    `Report ${reportId}`,
    'Standard: Rainbow distributed open-kiln biochar, 100-year pathway',
    `Issuable rows: ${issuable.length}`,
    `Blocked rows: ${blocked.length}`,
    `Issuable removal RCCs: ${issued.toFixed(4)} tCO2e`,
    'Credits are not issued for a year until methane, pollutants, lab H/Corg, and emission inputs exist.',
  ];

  const method = [
    'KriSHE dMRV — Rainbow credit package',
    '',
    ...summary,
    '',
    'How a row is calculated',
    '- One row per mixing end use, feedstock, and production year.',
    '- Dry biochar tonnes = feedstock kg x yield percent / 100 / 1000.',
    '- Organic carbon and H/Corg come from the kiln-run lab sample, not the feedstock catalog.',
    '- Rainbow limit: H/Corg under 0.7. Catalog H/C under 0.4 is a different test and is not used.',
    '- Fperm = c - m x H/Corg. c and m follow soil temperature at the mixing GPS (Woolf et al. 2021).',
    '- Gross removal tCO2e = Fperm x organic carbon fraction x dry biochar tonnes x 44/12.',
    '- Methane factor = mean kg CH4 per kg biochar plus one sample standard deviation.',
    '- Methane tCO2e = dry biochar tonnes x factor x 27. The fixed 0.03 factor is not used.',
    '- Three runs on three kilns are required before any credit in that feedstock year.',
    '- Leakage applies when biomass would have stayed on the soil: biomass t x carbon fraction x at least 0.5% x 44/12.',
    '- Transport, kiln steel, and chipping or drying energy are allocated by this row’s share of the year’s dry biochar.',
    '- Net = gross - leakage - methane - transport - kiln steel - processing.',
    '- 2% of positive net removal is placed in the buffer pool. Issuable RCCs = net x 0.98.',
    '- Open kilns do not report PAH. The yearly test stores lead, cadmium, copper, nickel, mercury, zinc, chromium, and arsenic.',
    '- A blocked row is not ready to submit for issuance.',
    '',
    ...input.notes,
  ];

  const entries: ZipEntry[] = [
    {
      name: `Rainbow credits_${reportId}.xlsx`,
      data: buildXlsx([
        { name: 'Credits', rows: creditRows(issuable) },
        { name: 'Blocked', rows: creditRows(blocked) },
      ]),
    },
    {
      name: `Rainbow credit summary_${reportId}.pdf`,
      data: textPdf('Rainbow credit summary', summary),
    },
    {
      name: 'rainbow-credit-notes.txt',
      data: Buffer.from(`${method.join('\n')}\n`, 'utf8'),
    },
  ];

  return {
    filename,
    buffer: zipFiles(entries),
    issuableCount: issuable.length,
    blockedCount: blocked.length,
  };
}
