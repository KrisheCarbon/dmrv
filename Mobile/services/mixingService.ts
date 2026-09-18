import type {
  AvailableMixingPyrolysisBatch,
  FieldPhotoMetadata,
  MixingEntryRecord,
  MixingMaterialType,
} from "@krishecarbon/shared";
import type { CreateMixingEntryPayload } from "@krishecarbon/shared";
import { getDb } from "../database/db";
import { buildInsert, buildUpdate, generateId } from "../database/sqlHelpers";
import {
  mixingEntryToRow,
  mixingPyrolysisLinkToRow,
  rowToMixingEntry,
  rowToMixingPyrolysisLink,
  rowToPyrolysisBatch,
  syncQueueItemToRow,
  type MixingEntry,
} from "../database/types";
import { backendFetch, fetchMobileNetworkOverview } from "./backendApi";
import { uploadMixingEntryPhotos } from "../utils/mixingPhotoUpload";
import { getCurrentIST } from "./trustedtime";

const LOCAL_SYNC_STATUS = "local";

export type MixingPyrolysisLinkView = {
  id: string;
  pyrolysisBatchServerId: string;
  pyrolysisBatchLocalId: string | null;
  kontikkiCode: string | null;
  batchNumber: string | null;
  producerName: string | null;
};

export type MixingEntryView = {
  id: string;
  serverId: string | null;
  operatorId: string;
  startedAt: string;
  status: string;
  farmId: string | null;
  farmName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationAddress: string | null;
  materialType: MixingMaterialType | null;
  materialToBiocharRatio: number | null;
  comment: string | null;
  biocharPhotoLocalUri: string | null;
  biocharPhotoUrl: string | null;
  biocharPhotoMetadata: FieldPhotoMetadata | null;
  substratePhotoLocalUri: string | null;
  substratePhotoUrl: string | null;
  substratePhotoMetadata: FieldPhotoMetadata | null;
  mixingPhotoLocalUri: string | null;
  mixingPhotoUrl: string | null;
  mixingPhotoMetadata: FieldPhotoMetadata | null;
  uploadStatus: string;
  syncError: string | null;
  reviewStatus: string | null;
  reviewerNotes: string | null;
  pyrolysisLinks: MixingPyrolysisLinkView[];
  createdAt: number;
  updatedAt: number;
};

export type SelectablePyrolysisBatch = AvailableMixingPyrolysisBatch & {
  source: "server" | "local";
  localBatchId?: string | null;
};

function parseMetadata(json: string | null | undefined): FieldPhotoMetadata | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as FieldPhotoMetadata;
  } catch {
    return null;
  }
}

async function triggerBackgroundSync() {
  const { processSyncQueue } = await import("./syncService");
  void processSyncQueue();
}

async function findEntryOrThrow(entryId: string): Promise<MixingEntry> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>("SELECT * FROM mixing_entries WHERE id = ?", [entryId]);
  if (!row) {
    throw new Error(`Mixing entry with id ${entryId} not found`);
  }
  return rowToMixingEntry(row);
}

export async function listMixingEntries(operatorId: string): Promise<MixingEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM mixing_entries WHERE operator_id = ? ORDER BY created_at DESC",
    [operatorId],
  );
  return rows.map(rowToMixingEntry);
}

export async function getMixingEntry(entryId: string): Promise<MixingEntry> {
  return findEntryOrThrow(entryId);
}

export async function getMixingEntryLinks(entryId: string) {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM mixing_pyrolysis_links WHERE mixing_entry_id = ?",
    [entryId],
  );
  return rows.map(rowToMixingPyrolysisLink);
}

export async function toMixingEntryView(entry: MixingEntry): Promise<MixingEntryView> {
  const links = await getMixingEntryLinks(entry.id);

  return {
    id: entry.id,
    serverId: entry.serverId,
    operatorId: entry.operatorId,
    startedAt: entry.startedAt,
    status: entry.status,
    farmId: entry.farmId,
    farmName: entry.farmName,
    locationLat: entry.locationLat,
    locationLng: entry.locationLng,
    locationAddress: entry.locationAddress,
    materialType: entry.materialType as MixingMaterialType | null,
    materialToBiocharRatio: entry.materialToBiocharRatio,
    comment: entry.comment,
    biocharPhotoLocalUri: entry.biocharPhotoLocalUri,
    biocharPhotoUrl: entry.biocharPhotoUrl,
    biocharPhotoMetadata: parseMetadata(entry.biocharPhotoMetadataJson),
    substratePhotoLocalUri: entry.substratePhotoLocalUri,
    substratePhotoUrl: entry.substratePhotoUrl,
    substratePhotoMetadata: parseMetadata(entry.substratePhotoMetadataJson),
    mixingPhotoLocalUri: entry.mixingPhotoLocalUri,
    mixingPhotoUrl: entry.mixingPhotoUrl,
    mixingPhotoMetadata: parseMetadata(entry.mixingPhotoMetadataJson),
    uploadStatus: entry.uploadStatus,
    syncError: entry.syncError,
    reviewStatus: entry.reviewStatus,
    reviewerNotes: entry.reviewerNotes,
    pyrolysisLinks: links.map((link) => ({
      id: link.id,
      pyrolysisBatchServerId: link.pyrolysisBatchServerId,
      pyrolysisBatchLocalId: link.pyrolysisBatchLocalId,
      kontikkiCode: link.kontikkiCode,
      batchNumber: link.batchNumber,
      producerName: link.producerName,
    })),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export async function refreshMixingReviewStatuses() {
  const remote = await backendFetch<MixingEntryRecord[]>("/mixing-entries");
  const byServerId = new Map(remote.map((row) => [row.id, row] as const));
  if (byServerId.size === 0) return;

  const db = await getDb();
  const rows = await db.getAllAsync<any>("SELECT * FROM mixing_entries");

  for (const row of rows) {
    const entry = rowToMixingEntry(row);
    if (!entry.serverId) continue;
    const next = byServerId.get(entry.serverId);
    if (!next) continue;
    const reviewStatus = next.entry_status?.status ?? "pending_review";
    const reviewerNotes = next.entry_status?.reviewer_notes ?? null;
    if (entry.reviewStatus === reviewStatus && entry.reviewerNotes === reviewerNotes) {
      continue;
    }

    await db.runAsync(
      "UPDATE mixing_entries SET review_status = ?, reviewer_notes = ? WHERE id = ?",
      [reviewStatus, reviewerNotes, entry.id],
    );
  }
}

export async function createMixingEntryLocal(operatorId: string): Promise<string> {
  const db = await getDb();
  const now = Date.now();
  const startedAt = getCurrentIST();
  const entryId = generateId();

  const row = mixingEntryToRow({
    serverId: null,
    operatorId,
    startedAt,
    status: "draft",
    farmId: null,
    farmName: null,
    locationLat: null,
    locationLng: null,
    locationAddress: null,
    materialType: null,
    materialToBiocharRatio: null,
    comment: null,
    biocharPhotoLocalUri: null,
    biocharPhotoUrl: null,
    biocharPhotoMetadataJson: null,
    substratePhotoLocalUri: null,
    substratePhotoUrl: null,
    substratePhotoMetadataJson: null,
    mixingPhotoLocalUri: null,
    mixingPhotoUrl: null,
    mixingPhotoMetadataJson: null,
    reviewStatus: null,
    reviewerNotes: null,
    uploadStatus: LOCAL_SYNC_STATUS,
    syncError: null,
    createdAt: now,
    updatedAt: now,
  });

  const { sql, args } = buildInsert("mixing_entries", { id: entryId, ...row });
  await db.runAsync(sql, args);

  return entryId;
}

export type MixingEntryUpdate = {
  farmId?: string | null;
  farmName?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationAddress?: string | null;
  materialType?: MixingMaterialType | null;
  materialToBiocharRatio?: number | null;
  comment?: string | null;
  biocharPhotoLocalUri?: string | null;
  biocharPhotoUrl?: string | null;
  biocharPhotoMetadata?: FieldPhotoMetadata | null;
  substratePhotoLocalUri?: string | null;
  substratePhotoUrl?: string | null;
  substratePhotoMetadata?: FieldPhotoMetadata | null;
  mixingPhotoLocalUri?: string | null;
  mixingPhotoUrl?: string | null;
  mixingPhotoMetadata?: FieldPhotoMetadata | null;
};

export async function updateMixingEntryLocal(entryId: string, patch: MixingEntryUpdate) {
  const db = await getDb();
  const columns: Record<string, unknown> = {};

  if (patch.farmId !== undefined) columns.farm_id = patch.farmId;
  if (patch.farmName !== undefined) columns.farm_name = patch.farmName;
  if (patch.locationLat !== undefined) columns.location_lat = patch.locationLat;
  if (patch.locationLng !== undefined) columns.location_lng = patch.locationLng;
  if (patch.locationAddress !== undefined) columns.location_address = patch.locationAddress;
  if (patch.materialType !== undefined) columns.material_type = patch.materialType;
  if (patch.materialToBiocharRatio !== undefined) {
    columns.material_to_biochar_ratio = patch.materialToBiocharRatio;
  }
  if (patch.comment !== undefined) columns.comment = patch.comment;
  if (patch.biocharPhotoLocalUri !== undefined) {
    columns.biochar_photo_local_uri = patch.biocharPhotoLocalUri;
  }
  if (patch.biocharPhotoUrl !== undefined) {
    columns.biochar_photo_url = patch.biocharPhotoUrl;
  }
  if (patch.biocharPhotoMetadata !== undefined) {
    columns.biochar_photo_metadata_json = patch.biocharPhotoMetadata
      ? JSON.stringify(patch.biocharPhotoMetadata)
      : null;
  }
  if (patch.substratePhotoLocalUri !== undefined) {
    columns.substrate_photo_local_uri = patch.substratePhotoLocalUri;
  }
  if (patch.substratePhotoUrl !== undefined) {
    columns.substrate_photo_url = patch.substratePhotoUrl;
  }
  if (patch.substratePhotoMetadata !== undefined) {
    columns.substrate_photo_metadata_json = patch.substratePhotoMetadata
      ? JSON.stringify(patch.substratePhotoMetadata)
      : null;
  }
  if (patch.mixingPhotoLocalUri !== undefined) {
    columns.mixing_photo_local_uri = patch.mixingPhotoLocalUri;
  }
  if (patch.mixingPhotoUrl !== undefined) {
    columns.mixing_photo_url = patch.mixingPhotoUrl;
  }
  if (patch.mixingPhotoMetadata !== undefined) {
    columns.mixing_photo_metadata_json = patch.mixingPhotoMetadata
      ? JSON.stringify(patch.mixingPhotoMetadata)
      : null;
  }
  columns.updated_at = Date.now();

  const { sql, args } = buildUpdate("mixing_entries", columns, "id = ?", [entryId]);
  await db.runAsync(sql, args);
}

export async function setMixingPyrolysisLinks(
  entryId: string,
  selected: SelectablePyrolysisBatch[],
) {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM mixing_pyrolysis_links WHERE mixing_entry_id = ?", [entryId]);

    for (const batch of selected) {
      const row = mixingPyrolysisLinkToRow({
        mixingEntryId: entryId,
        pyrolysisBatchServerId: batch.id,
        pyrolysisBatchLocalId: batch.localBatchId ?? null,
        kontikkiCode: batch.kontikki_code ?? null,
        batchNumber: batch.batch_number ?? null,
        producerName: batch.producer_name ?? null,
      });
      const { sql, args } = buildInsert("mixing_pyrolysis_links", { id: generateId(), ...row });
      await db.runAsync(sql, args);
    }

    await db.runAsync("UPDATE mixing_entries SET updated_at = ? WHERE id = ?", [
      Date.now(),
      entryId,
    ]);
  });
}

export function validateMixingEntry(view: MixingEntryView): string[] {
  const errors: string[] = [];

  if (!view.farmId) errors.push("Select a farm.");
  if (view.locationLat == null || view.locationLng == null) {
    errors.push("Capture mixing location (GPS or map).");
  }
  if (view.pyrolysisLinks.length === 0) {
    errors.push("Link at least one pyrolysis batch.");
  }
  if (!view.biocharPhotoLocalUri) errors.push("Biochar photo is required.");
  if (!view.materialType) errors.push("Select mixing material.");
  if (view.materialToBiocharRatio == null || Number.isNaN(view.materialToBiocharRatio)) {
    errors.push("Enter material-to-biochar ratio.");
  }
  if (!view.substratePhotoLocalUri) errors.push("Substrate material photo is required.");
  if (!view.mixingPhotoLocalUri) errors.push("Mixing photo is required.");

  return errors;
}

export async function submitMixingEntry(entryId: string) {
  const db = await getDb();
  const entry = await findEntryOrThrow(entryId);
  const view = await toMixingEntryView(entry);
  const errors = validateMixingEntry(view);

  if (errors.length) {
    throw new Error(errors.join("\n"));
  }

  await db.runAsync(
    "UPDATE mixing_entries SET status = ?, sync_status = ?, sync_error = NULL, updated_at = ? WHERE id = ?",
    ["submitted", "pending", Date.now(), entryId],
  );

  const existing = await db.getAllAsync<any>(
    "SELECT * FROM sync_queue WHERE entity_type = ? AND entity_local_id = ?",
    ["mixing_entry", entryId],
  );

  const failed = existing.find((item) => item.status === "failed");

  if (failed) {
    await db.runAsync(
      "UPDATE sync_queue SET status = ?, retries = ?, error_message = NULL WHERE id = ?",
      ["pending", 0, failed.id],
    );
  } else if (existing.length === 0) {
    const row = syncQueueItemToRow({
      entityType: "mixing_entry",
      entityLocalId: entryId,
      operation: "create",
      status: "pending",
      retries: 0,
      errorMessage: null,
      createdAt: Date.now(),
    });
    const { sql, args } = buildInsert("sync_queue", { id: generateId(), ...row });
    await db.runAsync(sql, args);
  }

  void triggerBackgroundSync();
}

export async function fetchAvailablePyrolysisBatches(): Promise<SelectablePyrolysisBatch[]> {
  const overview = await fetchMobileNetworkOverview();
  const allowedKontikkiIds = new Set(overview.kontikkis.map((row) => row.id));

  let serverRows: AvailableMixingPyrolysisBatch[] = [];

  try {
    serverRows = await backendFetch<AvailableMixingPyrolysisBatch[]>(
      "/mixing-entries/available-pyrolysis-batches",
    );
  } catch {
    serverRows = [];
  }

  const db = await getDb();
  const localBatchRows = await db.getAllAsync<any>(
    "SELECT * FROM pyrolysis_batches WHERE pyrolysis_completed = 1",
  );
  const localRows = localBatchRows.map(rowToPyrolysisBatch);

  const byServerId = new Map<string, SelectablePyrolysisBatch>();

  for (const row of serverRows) {
    if (!allowedKontikkiIds.has(row.kontikki_id)) continue;
    byServerId.set(row.id, { ...row, source: "server" });
  }

  for (const row of localRows) {
    if (!row.serverId || !allowedKontikkiIds.has(row.kontikkiId)) continue;
    if (byServerId.has(row.serverId)) {
      const existing = byServerId.get(row.serverId)!;
      existing.localBatchId = row.id;
      continue;
    }

    byServerId.set(row.serverId, {
      id: row.serverId,
      batch_number: row.batchNumber ?? null,
      kontikki_id: row.kontikkiId,
      kontikki_code: row.kontikkiCode,
      producer_name: row.producerName ?? null,
      yield_percent: row.yieldPercent ?? null,
      source: "local",
      localBatchId: row.id,
    });
  }

  return Array.from(byServerId.values()).sort((a, b) =>
    (b.batch_number ?? b.kontikki_code).localeCompare(a.batch_number ?? a.kontikki_code),
  );
}

export async function syncMixingEntry(entry: MixingEntry) {
  const db = await getDb();
  const view = await toMixingEntryView(entry);

  if (view.serverId) {
    return;
  }

  if (!view.materialType) {
    throw new Error("Material type is required before sync.");
  }

  if (view.pyrolysisLinks.length === 0) {
    throw new Error("At least one pyrolysis batch must be linked before sync.");
  }

  const uploadedPhotos = await uploadMixingEntryPhotos(entry.id, {
    biochar_photo_local_uri: view.biocharPhotoLocalUri,
    biochar_photo_url: view.biocharPhotoUrl,
    substrate_photo_local_uri: view.substratePhotoLocalUri,
    substrate_photo_url: view.substratePhotoUrl,
    mixing_photo_local_uri: view.mixingPhotoLocalUri,
    mixing_photo_url: view.mixingPhotoUrl,
  });

  const payload: CreateMixingEntryPayload = {
    started_at: view.startedAt,
    farm_id: view.farmId,
    farm_name: view.farmName,
    location_lat: view.locationLat,
    location_lng: view.locationLng,
    location_address: view.locationAddress,
    material_type: view.materialType,
    material_to_biochar_ratio: view.materialToBiocharRatio,
    comment: view.comment,
    biochar_photo_url: uploadedPhotos.biochar_photo_url,
    biochar_photo_metadata: view.biocharPhotoMetadata,
    substrate_photo_url: uploadedPhotos.substrate_photo_url,
    substrate_photo_metadata: view.substratePhotoMetadata,
    mixing_photo_url: uploadedPhotos.mixing_photo_url,
    mixing_photo_metadata: view.mixingPhotoMetadata,
    pyrolysis_batch_ids: view.pyrolysisLinks.map((link) => link.pyrolysisBatchServerId),
  };

  const created = await backendFetch<MixingEntryRecord>("/mixing-entries", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const fresh = await findEntryOrThrow(entry.id);

  await db.runAsync(
    `UPDATE mixing_entries SET
      server_id = ?, status = ?, sync_status = ?, sync_error = NULL,
      review_status = ?, reviewer_notes = ?,
      biochar_photo_url = ?, substrate_photo_url = ?, mixing_photo_url = ?,
      updated_at = ?
     WHERE id = ?`,
    [
      created.id,
      "synced",
      "synced",
      created.entry_status?.status ?? "pending_review",
      created.entry_status?.reviewer_notes ?? null,
      uploadedPhotos.biochar_photo_url ?? fresh.biocharPhotoUrl,
      uploadedPhotos.substrate_photo_url ?? fresh.substratePhotoUrl,
      uploadedPhotos.mixing_photo_url ?? fresh.mixingPhotoUrl,
      Date.now(),
      entry.id,
    ],
  );
}
