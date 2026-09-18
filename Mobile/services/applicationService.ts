import type {
  ApplicationEntryRecord,
  ApplicationMediaType,
  AvailableApplicationPyrolysisBatch,
  CreateApplicationEntryPayload,
  FieldPhotoMetadata,
} from "@krishecarbon/shared";
import { getDb } from "../database/db";
import { buildInsert, buildUpdate, generateId } from "../database/sqlHelpers";
import {
  applicationEntryToRow,
  applicationPyrolysisLinkToRow,
  rowToApplicationEntry,
  rowToApplicationPyrolysisLink,
  rowToPyrolysisBatch,
  syncQueueItemToRow,
  type ApplicationEntry,
} from "../database/types";
import { backendFetch, fetchMobileNetworkOverview } from "./backendApi";
import { uploadApplicationEntryMedia } from "../utils/applicationMediaUpload";
import { getCurrentIST } from "./trustedtime";

const LOCAL_SYNC_STATUS = "local";

export type ApplicationPyrolysisLinkView = {
  id: string;
  pyrolysisBatchServerId: string;
  pyrolysisBatchLocalId: string | null;
  kontikkiCode: string | null;
  batchNumber: string | null;
  producerName: string | null;
};

export type ApplicationEntryView = {
  id: string;
  serverId: string | null;
  operatorId: string;
  appliedAt: string;
  status: string;
  farmId: string | null;
  farmName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationAddress: string | null;
  comment: string | null;
  mediaType: ApplicationMediaType | null;
  mediaLocalUri: string | null;
  mediaUrl: string | null;
  mediaMetadata: FieldPhotoMetadata | null;
  uploadStatus: string;
  syncError: string | null;
  reviewStatus: string | null;
  reviewerNotes: string | null;
  pyrolysisLinks: ApplicationPyrolysisLinkView[];
  createdAt: number;
  updatedAt: number;
};

export type SelectablePyrolysisBatch = AvailableApplicationPyrolysisBatch & {
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

async function findEntryOrThrow(entryId: string): Promise<ApplicationEntry> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    "SELECT * FROM application_entries WHERE id = ?",
    [entryId],
  );
  if (!row) {
    throw new Error(`Application entry with id ${entryId} not found`);
  }
  return rowToApplicationEntry(row);
}

export async function listApplicationEntries(operatorId: string): Promise<ApplicationEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM application_entries WHERE operator_id = ? ORDER BY created_at DESC",
    [operatorId],
  );
  return rows.map(rowToApplicationEntry);
}

export async function getApplicationEntry(entryId: string): Promise<ApplicationEntry> {
  return findEntryOrThrow(entryId);
}

export async function getApplicationEntryLinks(entryId: string) {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM application_pyrolysis_links WHERE application_entry_id = ?",
    [entryId],
  );
  return rows.map(rowToApplicationPyrolysisLink);
}

export async function toApplicationEntryView(
  entry: ApplicationEntry,
): Promise<ApplicationEntryView> {
  const links = await getApplicationEntryLinks(entry.id);

  return {
    id: entry.id,
    serverId: entry.serverId,
    operatorId: entry.operatorId,
    appliedAt: entry.appliedAt,
    status: entry.status,
    farmId: entry.farmId,
    farmName: entry.farmName,
    locationLat: entry.locationLat,
    locationLng: entry.locationLng,
    locationAddress: entry.locationAddress,
    comment: entry.comment,
    mediaType: entry.mediaType as ApplicationMediaType | null,
    mediaLocalUri: entry.mediaLocalUri,
    mediaUrl: entry.mediaUrl,
    mediaMetadata: parseMetadata(entry.mediaMetadataJson),
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

export async function refreshApplicationReviewStatuses() {
  const remote = await backendFetch<ApplicationEntryRecord[]>("/application-entries");
  const byServerId = new Map(remote.map((row) => [row.id, row] as const));
  if (byServerId.size === 0) return;

  const db = await getDb();
  const rows = await db.getAllAsync<any>("SELECT * FROM application_entries");

  for (const row of rows) {
    const entry = rowToApplicationEntry(row);
    if (!entry.serverId) continue;
    const next = byServerId.get(entry.serverId);
    if (!next) continue;
    const reviewStatus = next.entry_status?.status ?? "pending_review";
    const reviewerNotes = next.entry_status?.reviewer_notes ?? null;
    if (entry.reviewStatus === reviewStatus && entry.reviewerNotes === reviewerNotes) {
      continue;
    }

    await db.runAsync(
      "UPDATE application_entries SET review_status = ?, reviewer_notes = ? WHERE id = ?",
      [reviewStatus, reviewerNotes, entry.id],
    );
  }
}

export async function createApplicationEntryLocal(operatorId: string): Promise<string> {
  const db = await getDb();
  const now = Date.now();
  const appliedAt = getCurrentIST();
  const entryId = generateId();

  const row = applicationEntryToRow({
    serverId: null,
    operatorId,
    appliedAt,
    status: "draft",
    farmId: null,
    farmName: null,
    locationLat: null,
    locationLng: null,
    locationAddress: null,
    comment: null,
    mediaType: null,
    mediaLocalUri: null,
    mediaUrl: null,
    mediaMetadataJson: null,
    reviewStatus: null,
    reviewerNotes: null,
    uploadStatus: LOCAL_SYNC_STATUS,
    syncError: null,
    createdAt: now,
    updatedAt: now,
  });

  const { sql, args } = buildInsert("application_entries", { id: entryId, ...row });
  await db.runAsync(sql, args);

  return entryId;
}

export type ApplicationEntryUpdate = {
  farmId?: string | null;
  farmName?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationAddress?: string | null;
  comment?: string | null;
  mediaType?: ApplicationMediaType | null;
  mediaLocalUri?: string | null;
  mediaUrl?: string | null;
  mediaMetadata?: FieldPhotoMetadata | null;
};

export async function updateApplicationEntryLocal(
  entryId: string,
  patch: ApplicationEntryUpdate,
) {
  const db = await getDb();
  const columns: Record<string, unknown> = {};

  if (patch.farmId !== undefined) columns.farm_id = patch.farmId;
  if (patch.farmName !== undefined) columns.farm_name = patch.farmName;
  if (patch.locationLat !== undefined) columns.location_lat = patch.locationLat;
  if (patch.locationLng !== undefined) columns.location_lng = patch.locationLng;
  if (patch.locationAddress !== undefined) columns.location_address = patch.locationAddress;
  if (patch.comment !== undefined) columns.comment = patch.comment;
  if (patch.mediaType !== undefined) columns.media_type = patch.mediaType;
  if (patch.mediaLocalUri !== undefined) columns.media_local_uri = patch.mediaLocalUri;
  if (patch.mediaUrl !== undefined) columns.media_url = patch.mediaUrl;
  if (patch.mediaMetadata !== undefined) {
    columns.media_metadata_json = patch.mediaMetadata
      ? JSON.stringify(patch.mediaMetadata)
      : null;
  }
  columns.updated_at = Date.now();

  const { sql, args } = buildUpdate("application_entries", columns, "id = ?", [entryId]);
  await db.runAsync(sql, args);
}

export async function setApplicationPyrolysisLinks(
  entryId: string,
  selected: SelectablePyrolysisBatch[],
) {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM application_pyrolysis_links WHERE application_entry_id = ?", [
      entryId,
    ]);

    for (const batch of selected) {
      const row = applicationPyrolysisLinkToRow({
        applicationEntryId: entryId,
        pyrolysisBatchServerId: batch.id,
        pyrolysisBatchLocalId: batch.localBatchId ?? null,
        kontikkiCode: batch.kontikki_code ?? null,
        batchNumber: batch.batch_number ?? null,
        producerName: batch.producer_name ?? null,
      });
      const { sql, args } = buildInsert("application_pyrolysis_links", {
        id: generateId(),
        ...row,
      });
      await db.runAsync(sql, args);
    }

    await db.runAsync("UPDATE application_entries SET updated_at = ? WHERE id = ?", [
      Date.now(),
      entryId,
    ]);
  });
}

export function validateApplicationEntry(view: ApplicationEntryView): string[] {
  const errors: string[] = [];

  if (!view.farmId) errors.push("Select a farm.");
  if (view.pyrolysisLinks.length === 0) {
    errors.push("Link at least one pyrolysis batch.");
  }
  if (!view.mediaLocalUri || !view.mediaType) {
    errors.push("Capture a photo or video.");
  }

  return errors;
}

export async function submitApplicationEntry(entryId: string) {
  const db = await getDb();
  const entry = await findEntryOrThrow(entryId);
  const view = await toApplicationEntryView(entry);
  const errors = validateApplicationEntry(view);

  if (errors.length) {
    throw new Error(errors.join("\n"));
  }

  await db.runAsync(
    "UPDATE application_entries SET status = ?, sync_status = ?, sync_error = NULL, updated_at = ? WHERE id = ?",
    ["submitted", "pending", Date.now(), entryId],
  );

  const existing = await db.getAllAsync<any>(
    "SELECT * FROM sync_queue WHERE entity_type = ? AND entity_local_id = ?",
    ["application_entry", entryId],
  );

  const failed = existing.find((item) => item.status === "failed");

  if (failed) {
    await db.runAsync(
      "UPDATE sync_queue SET status = ?, retries = ?, error_message = NULL WHERE id = ?",
      ["pending", 0, failed.id],
    );
  } else if (existing.length === 0) {
    const row = syncQueueItemToRow({
      entityType: "application_entry",
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

  let serverRows: AvailableApplicationPyrolysisBatch[] = [];

  try {
    serverRows = await backendFetch<AvailableApplicationPyrolysisBatch[]>(
      "/application-entries/available-pyrolysis-batches",
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

export async function syncApplicationEntry(entry: ApplicationEntry) {
  const db = await getDb();
  const view = await toApplicationEntryView(entry);

  if (view.serverId) {
    return;
  }

  if (!view.mediaType) {
    throw new Error("Media type is required before sync.");
  }

  if (view.pyrolysisLinks.length === 0) {
    throw new Error("At least one pyrolysis batch must be linked before sync.");
  }

  const uploadedMedia = await uploadApplicationEntryMedia(entry.id, {
    media_type: view.mediaType,
    media_local_uri: view.mediaLocalUri,
    media_url: view.mediaUrl,
  });

  const payload: CreateApplicationEntryPayload = {
    applied_at: view.appliedAt,
    farm_id: view.farmId,
    farm_name: view.farmName,
    location_lat: view.locationLat,
    location_lng: view.locationLng,
    location_address: view.locationAddress,
    comment: view.comment,
    media_type: view.mediaType,
    media_url: uploadedMedia.media_url,
    media_metadata: view.mediaMetadata,
    pyrolysis_batch_ids: view.pyrolysisLinks.map((link) => link.pyrolysisBatchServerId),
  };

  const created = await backendFetch<ApplicationEntryRecord>("/application-entries", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const fresh = await findEntryOrThrow(entry.id);

  await db.runAsync(
    `UPDATE application_entries SET
      server_id = ?, status = ?, sync_status = ?, sync_error = NULL,
      review_status = ?, reviewer_notes = ?, media_url = ?, updated_at = ?
     WHERE id = ?`,
    [
      created.id,
      "synced",
      "synced",
      created.entry_status?.status ?? "pending_review",
      created.entry_status?.reviewer_notes ?? null,
      uploadedMedia.media_url ?? fresh.mediaUrl,
      Date.now(),
      entry.id,
    ],
  );
}
