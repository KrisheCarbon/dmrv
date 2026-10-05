import { randomUUID } from 'node:crypto';
import { textPdf } from './pdf';
import { buildXlsx, type CellValue } from './xlsx';
import { zipFiles, type ZipEntry } from './zip';

/** t CO2e per tonne of carbon. */
const CO2_PER_CARBON = 44 / 12;

/**
 * Security margin and methane factor taken from the existing KriSHE CSI export
 * (global_biochar_csink, Jan–Feb 2026): fossil tCO2e = 0.02 × dry tonnes,
 * methane tCH4 = 0.03 × dry tonnes.
 */
const FOSSIL_PER_DRY_TONNE = 0.02;
const METHANE_PER_DRY_TONNE = 0.03;

/** Lab defaults from that same export, used only when a batch has no feedstock analysis. */
export const DEFAULT_CARBON_FRACTION = 0.7099;
export const DEFAULT_HC_RATIO = 0.18;

export interface CsiRegistryConfig {
  projectId: string;
  certificationId: string;
  vvbName: string;
  certificationDate: string;
  certificateUrl: string;
  product: string;
  standard: string;
  matrix: string;
}

export const DEFAULT_CSI_REGISTRY: CsiRegistryConfig = {
  projectId: 'GCSP1159',
  certificationId: 'CC-1044',
  vvbName: 'CERES',
  certificationDate: '01.05.2026',
  certificateUrl:
    'https://storage.googleapis.com/bluelayer-dmrv-public/krishe/csi/certificate_CC-1044.pdf',
  product: 'Biochar',
  standard: 'Global Artisan C-Sink',
  matrix: 'Biological Matrix - Biochar Based Fertilizer',
};

export interface CsiSinkRow {
  unitId: string;
  farmerId: string;
  productionDate: string;
  sinkDate: string;
  dryTonnes: number;
  carbonFraction: number;
  hcRatio: number;
  methaneStrategy: string;
  latitude: number | null;
  longitude: number | null;
  usedDefaultLab: boolean;
}

const SINK_MATRICES: CellValue[][] = [
  ['Matrix of sink', 'Matrix ID', 'Standard'],
  ['Biological Matrix - Compost', 'B-01', 'Global Biochar C-Sink; Global Artisan C-Sink'],
  ['Biological Matrix - Solid Manure', 'B-02', 'Global Biochar C-Sink; Global Artisan C-Sink'],
  ['Biological Matrix - Liquid Manure', 'B-03', 'Global Biochar C-Sink; Global Artisan C-Sink'],
  ['Biological Matrix - Anaerobic Digestate', 'B-04', 'Global Biochar C-Sink; Global Artisan C-Sink'],
  ['Biological Matrix - Biochar Based Fertilizer', 'B-06', 'Global Biochar C-Sink; Global Artisan C-Sink'],
  ['Biological Matrix - Animal feed', 'B-07', 'Global Biochar C-Sink'],
  ['Biological Matrix - Seed coating', 'B-08', 'Global Biochar C-Sink; Global Artisan C-Sink'],
  [
    'Biological Matrix - Potting soil / growing media / substrates for horticulture',
    'B-09',
    'Global Biochar C-Sink; Global Artisan C-Sink',
  ],
  ['Mineral Matrix - Concrete', 'Min-01', 'Global Biochar C-Sink'],
  ['Mineral Matrix - Cement mortar', 'Min-02', 'Global Biochar C-Sink'],
  ['Mineral Matrix - Lime mortar & gypsum', 'Min-03', 'Global Biochar C-Sink'],
  ['Mineral Matrix - Clay plaster, mudbricks and clay drywall', 'Min-04', 'Global Biochar C-Sink'],
  ['Mineral Matrix - Asphalt', 'Min-05', 'Global Biochar C-Sink'],
  ['Materials - Composite', 'Mat-01', 'Global Biochar C-Sink'],
  ['Materials - Plastics', 'Mat-03', 'Global Biochar C-Sink'],
  ['Materials - Textiles', 'Mat-04', 'Global Biochar C-Sink'],
  ['Materials - Paints', 'Mat-05', 'Global Biochar C-Sink'],
  ['Soil - Agricultural soil', 'S-01', 'Global Biochar C-Sink; Global Artisan C-Sink'],
  ['Soil - Urban soil', 'S-02', 'Global Biochar C-Sink; Global Artisan C-Sink'],
  ['Soil - Mine reclamation', 'S-03', 'Global Biochar C-Sink; Global Artisan C-Sink'],
  ['Soil - Wet lands', 'S-04', 'Global Biochar C-Sink; Global Artisan C-Sink'],
  ['Soil - Forest', 'S-05', 'Global Biochar C-Sink; Global Artisan C-Sink'],
  [
    'Soil - Foundation and compacted ground under constructions (e.g. roadbeds)',
    'S-06',
    'Global Biochar C-Sink',
  ],
  ['Soil - Clay subsoil', 'S-07', 'Global Biochar C-Sink; Global Artisan C-Sink'],
  ['Soil - Sediments', 'S-08', 'Global Biochar C-Sink; Global Artisan C-Sink'],
  ['Landfill - Waste disposal', 'LF-01', 'Global Biochar C-Sink'],
  ['Landfill - Ash', 'LF-02', 'Global Biochar C-Sink'],
  ['Waste water treatment / Sewage Sludge', 'W-05', 'Global Biochar C-Sink'],
  ['Geological storage', 'G-01', 'Global Biochar C-Sink'],
];

export interface CsiPackage {
  filename: string;
  buffer: Buffer;
  rowCount: number;
}

function grossCo2e(dryTonnes: number, carbonFraction: number): number {
  return dryTonnes * carbonFraction * CO2_PER_CARBON;
}

function annexRows(rows: CsiSinkRow[], config: CsiRegistryConfig): CellValue[][] {
  const header: CellValue[] = [
    'Product ',
    'Standard',
    'Product Quantity (DM) ',
    'Unit Product Quantity',
    'Date of Production  (dd.mm.yyyy)',
    'Gross amount of CO2e [t CO2e] ',
    'C-content of the product in %',
    'H/Corg ratio',
    'Fossil GHG emissions  [t CO2e] ',
    'Methane emissions [t CH4] ',
    'Methane compensation strategy',
    'Matrix of sink',
    'Sink date (dd.mm.yyyy)',
    'GPS-Location  of sink (latidude)',
    'GPS-Location of sink (longitude)',
    'Transport emissions  [t CO2e]',
    'Other emissions  [t CO2e]',
  ];

  return [
    [],
    ['STOCK', null, null, null, null, null, null, null, null, null, null, 'SINK'],
    header,
    ...rows.map((row) => [
      config.product,
      config.standard,
      row.dryTonnes,
      'tonnes (metric tonnes)',
      row.productionDate,
      grossCo2e(row.dryTonnes, row.carbonFraction),
      row.carbonFraction,
      row.hcRatio,
      row.dryTonnes * FOSSIL_PER_DRY_TONNE,
      row.dryTonnes * METHANE_PER_DRY_TONNE,
      row.methaneStrategy,
      config.matrix,
      row.sinkDate,
      row.latitude,
      row.longitude,
      0,
      0,
    ]),
  ];
}

function bulkRows(rows: CsiSinkRow[], config: CsiRegistryConfig): CellValue[][] {
  const stockLabel = 'STOCK - "Add certified product"';
  const sinkLabel = 'SINK: "Sink Stock" Transaction';
  const header: CellValue[] = [
    'Product   [mandatory]',
    'Standard  [mandatory]',
    'Product Quantity (DM)   [mandatory]',
    'Unit Product Quantity  [mandatory]',
    'C-Sink Unit ID  external ID from dMRV   [mandatory]',
    'Farmer ID (if any)  for internal reference  [if any]',
    'Project ID of producer  from Global C-Sink Tool/Registry  [mandatory]',
    'Date of Production  (dd.mm.yyyy)  [mandatory]',
    'Gross amount of CO2e [t CO2e]   no deduction of persistence curve and emissions  [mandatory]',
    'C-content of the product (%)  dry matter, from laboratory analysis  [mandatory]',
    'H/Corg ratio  from laboratory analysis  [mandatory]',
    'Fossil GHG emissions  [t CO2e]   security margin for Global Artisan C-Sink  [mandatory]',
    'Methane emissions [t CH4]   at factory gate  [mandatory]',
    'Methane emissions compensation strategy   relevant only for Global Artisan C-Sink  [mandatory]',
    'Certification ID  from attestation  [mandatory]',
    'Name of Validation and Verification Body (VVB)    [mandatory]',
    'Certification date  (dd.mm.yyyy)  from attestation  [mandatory]',
    'Certificate/Attestation from VVB  URL',
    'Project ID of processor  [mandatory]',
    'Matrix of sink  see dropdown options  [mandatory]',
    'Sink date  (dd.mm.yyyy)  [mandatory]',
    'GPS-Location  of sink  latidude  [mandatory]',
    'GPS-Location of sink  longitude  [mandatory]',
    'Transport emissions  [t CO2e]  from factory gate till sink  [if any]',
    'Transport Kilometers  [if any]',
    'Transport emissions note  [optional]',
    'Other emissions  [t CO2e]  from factory gate till sink  [if any]',
    'Other emissions note  [optional]',
    'I hereby declare that the certified C-Sink is not sold under other certification schemes.  Yes or No  [mandatory]',
    'Do you want to disclose the sink GPS location coordinates in the Global C-Sink Registry.  Yes or No  [mandatory]',
    'Do you want to disclose your name in the Global C-Sink Registry.  Yes or No  [mandatory]',
    'File  Monitoring report  [mandatory]',
    'File  Annex to monitoring report  [mandatory]',
    'Link dMRV  [mandatory]',
  ];

  return [
    ['Global C-Sink Tool: Stock- and Sink transaction'],
    [stockLabel, ...Array(17).fill(null), sinkLabel],
    header,
    ...rows.map((row) => [
      config.product,
      config.standard,
      row.dryTonnes,
      'tonnes (metric tonnes)',
      row.unitId,
      row.farmerId,
      config.projectId,
      row.productionDate,
      grossCo2e(row.dryTonnes, row.carbonFraction),
      row.carbonFraction,
      row.hcRatio,
      row.dryTonnes * FOSSIL_PER_DRY_TONNE,
      row.dryTonnes * METHANE_PER_DRY_TONNE,
      row.methaneStrategy,
      config.certificationId,
      config.vvbName,
      config.certificationDate,
      config.certificateUrl,
      config.projectId,
      config.matrix,
      row.sinkDate,
      row.latitude,
      row.longitude,
      0,
      0,
      null,
      0,
      null,
      'Yes',
      'Yes',
      'Yes',
      null,
      null,
      null,
    ]),
  ];
}

function periodStamp(start: Date, end: Date): string {
  const day = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);

  return `${day(start)}_00_00_00_${day(end)}_23_59_59.999999`;
}

function parseDdMmYyyy(value: string): Date | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
}

export function buildCsiPackage(input: {
  rows: CsiSinkRow[];
  notes: string[];
  config?: CsiRegistryConfig;
  reportId?: string;
}): CsiPackage {
  const config = input.config ?? DEFAULT_CSI_REGISTRY;
  const reportId = input.reportId ?? randomUUID();
  const dates = input.rows.flatMap((row) => {
    const production = parseDdMmYyyy(row.productionDate);
    const sink = parseDdMmYyyy(row.sinkDate);
    return [production, sink].filter((date): date is Date => date != null);
  });
  const now = new Date();
  const start = dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : now;
  const end = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : now;
  const filename = `global_biochar_csink_${periodStamp(start, end)}.zip`;

  const dryTotal = input.rows.reduce((sum, row) => sum + row.dryTonnes, 0);
  const grossTotal = input.rows.reduce(
    (sum, row) => sum + grossCo2e(row.dryTonnes, row.carbonFraction),
    0,
  );
  const defaultLabCount = input.rows.filter((row) => row.usedDefaultLab).length;

  const summary = [
    `Report ${reportId}`,
    `Standard: ${config.standard}`,
    `Project: ${config.projectId}`,
    `Certificate: ${config.certificationId} (${config.vvbName}, ${config.certificationDate})`,
    `Sink rows: ${input.rows.length}`,
    `Dry biochar: ${dryTotal.toFixed(4)} t`,
    `Gross CO2e: ${grossTotal.toFixed(4)} t`,
    `Rows using default lab values: ${defaultLabCount}`,
    'Quantities come from submitted application records.',
  ];

  const notes = [
    'KriSHE dMRV — CSI verification package',
    '',
    ...summary,
    '',
    'How each row is calculated',
    '- One row per submitted application (the sink).',
    '- Dry tonnes = sum of linked pyrolysis batches: feedstock kg x yield percent / 100 / 1000.',
    '- Gross tCO2e = dry tonnes x carbon fraction x 44/12. No persistence deduction.',
    `- Fossil GHG tCO2e = dry tonnes x ${FOSSIL_PER_DRY_TONNE} (security margin from the existing CSI export).`,
    `- Methane tCH4 = dry tonnes x ${METHANE_PER_DRY_TONNE} (same export).`,
    '- Carbon fraction = feedstock carbon_content_percent / 100.',
    `- If a batch has no lab result, carbon ${DEFAULT_CARBON_FRACTION} and H/Corg ${DEFAULT_HC_RATIO} are used.`,
    `- Sink matrix: ${config.matrix}.`,
    '- Monitoring-report and annex file URLs are left blank until the package is published.',
    '',
    ...input.notes,
  ];

  const entries: ZipEntry[] = [
    {
      name: `Bulk Upload_${reportId}:1.xlsx`,
      data: buildXlsx([
        { name: '<operator_number>', rows: bulkRows(input.rows, config) },
        { name: 'Helper', rows: SINK_MATRICES },
      ]),
    },
    {
      name: `Annex 1_${reportId}:1.xlsx`,
      data: buildXlsx([
        { name: 'Annex monitoring report', rows: annexRows(input.rows, config) },
        { name: 'Helper', rows: SINK_MATRICES },
      ]),
    },
    {
      name: `Monitoring Report_${reportId}:1.pdf`,
      data: textPdf('CSI monitoring summary', summary),
    },
    {
      name: 'dmrv-notes.txt',
      data: Buffer.from(`${notes.join('\n')}\n`, 'utf8'),
    },
  ];

  return {
    filename,
    buffer: zipFiles(entries),
    rowCount: input.rows.length,
  };
}
