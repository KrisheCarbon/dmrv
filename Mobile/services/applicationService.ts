import { Q } from "@nozbe/watermelondb";
import type {
  ApplicationEntryRecord,
  ApplicationMediaType,
  AvailableApplicationPyrolysisBatch,
  CreateApplicationEntryPayload,
  FieldPhotoMetadata,
} from "@krishecarbon/shared";
import { database } from "../database";
import ApplicationEntry from "../database/models/ApplicationEntry";
import ApplicationPyrolysisLink from "../database/models/ApplicationPyrolysisLink";
import PyrolysisBatch from "../database/models/PyrolysisBatch";
import SyncQueue from "../database/models/SyncQueue";
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
  comment: string | null;
  mediaType: ApplicationMediaType | null;
  mediaLocalUri: string | null;
  mediaUrl: string | null;
  mediaMetadata: FieldPhotoMetadata | null;
  uploadStatus: string;
  syncError: string | null;
  pyrolysisLinks: ApplicationPyrolysisLinkView[];
  createdAt: number;
  updatedAt: number;
};

export type SelectablePyrolysisBatch = AvailableApplicationPyrolysisBatch & {
  source: "server" | "local";
  localBatchId?: string | null;
};

function entriesCollection() {
  return database.get<ApplicationEntry>("application_entries");
}

function linksCollection() {
  return database.get<ApplicationPyrolysisLink>("application_pyrolysis_links");
}

function batchesCollection() {
  return database.get<PyrolysisBatch>("pyrolysis_batches");
}

function syncQueueCollection() {
  return database.get<SyncQueue>("sync_queue");
}

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

export async function listApplicationEntries(operatorId: string) {
  return entriesCollection()
    .query(Q.where("operator_id", operatorId), Q.sortBy("created_at", Q.desc))
    .fetch();
}

export async function getApplicationEntry(entryId: string) {
  return entriesCollection().find(entryId);
}

export async function getApplicationEntryLinks(entryId: string) {
  return linksCollection()
    .query(Q.where("application_entry_id", entryId))
    .fetch();
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
    comment: entry.comment,
    mediaType: entry.mediaType as ApplicationMediaType | null,
    mediaLocalUri: entry.mediaLocalUri,
    mediaUrl: entry.mediaUrl,
    mediaMetadata: parseMetadata(entry.mediaMetadataJson),
    uploadStatus: entry.uploadStatus,
    syncError: entry.syncError,
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

export async function createApplicationEntryLocal(operatorId: string): Promise<string> {
  const now = Date.now();
  const appliedAt = getCurrentIST();
  let entryId = "";

  await database.write(async () => {
    const entry = await entriesCollection().create((record) => {
      record.operatorId = operatorId;
      record.appliedAt = appliedAt;
      record.status = "draft";
      record.farmId = null;
      record.farmName = null;
      record.comment = null;
      record.mediaType = null;
      record.mediaLocalUri = null;
      record.mediaUrl = null;
      record.mediaMetadataJson = null;
      record.uploadStatus = LOCAL_SYNC_STATUS;
      record.syncError = null;
      record.createdAt = now;
      record.updatedAt = now;
    });
    entryId = entry.id;
  });

  return entryId;
}

export type ApplicationEntryUpdate = {
  farmId?: string | null;
  farmName?: string | null;
  comment?: string | null;
  mediaType?: ApplicationMediaType | null;
  mediaLocalUri?: string | null;
  mediaMetadata?: FieldPhotoMetadata | null;
};

export async function updateApplicationEntryLocal(
  entryId: string,
  patch: ApplicationEntryUpdate,
) {
  await database.write(async () => {
    const entry = await entriesCollection().find(entryId);
    await entry.update((record) => {
      if (patch.farmId !== undefined) record.farmId = patch.farmId;
      if (patch.farmName !== undefined) record.farmName = patch.farmName;
      if (patch.comment !== undefined) record.comment = patch.comment;
      if (patch.mediaType !== undefined) record.mediaType = patch.mediaType;
      if (patch.mediaLocalUri !== undefined) record.mediaLocalUri = patch.mediaLocalUri;
      if (patch.mediaMetadata !== undefined) {
        record.mediaMetadataJson = patch.mediaMetadata
          ? JSON.stringify(patch.mediaMetadata)
          : null;
      }
      record.updatedAt = Date.now();
    });
  });
}

export async function setApplicationPyrolysisLinks(
  entryId: string,
  selected: SelectablePyrolysisBatch[],
) {
  await database.write(async () => {
    const existing = await linksCollection()
      .query(Q.where("application_entry_id", entryId))
      .fetch();

    for (const row of existing) {
      await row.destroyPermanently();
    }

    for (const batch of selected) {
      await linksCollection().create((record) => {
        record.applicationEntryId = entryId;
        record.pyrolysisBatchServerId = batch.id;
        record.pyrolysisBatchLocalId = batch.localBatchId ?? null;
        record.kontikkiCode = batch.kontikki_code ?? null;
        record.batchNumber = batch.batch_number ?? null;
        record.producerName = batch.producer_name ?? null;
      });
    }

    const entry = await entriesCollection().find(entryId);
    await entry.update((record) => {
      record.updatedAt = Date.now();
    });
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
  const entry = await entriesCollection().find(entryId);
  const view = await toApplicationEntryView(entry);
  const errors = validateApplicationEntry(view);

  if (errors.length) {
    throw new Error(errors.join("\n"));
  }

  await database.write(async () => {
    await entry.update((record) => {
      record.status = "submitted";
      record.uploadStatus = "pending";
      record.syncError = null;
      record.updatedAt = Date.now();
    });
  });

  const existing = await syncQueueCollection()
    .query(
      Q.where("entity_type", "application_entry"),
      Q.where("entity_local_id", entryId),
    )
    .fetch();

  const failed = existing.find((item) => item.status === "failed");

  if (failed) {
    await database.write(async () => {
      await failed.update((record) => {
        record.status = "pending";
        record.retries = 0;
        record.errorMessage = null;
      });
    });
  } else if (existing.length === 0) {
    await database.write(async () => {
      await syncQueueCollection().create((record) => {
        record.entityType = "application_entry";
        record.entityLocalId = entryId;
        record.operation = "create";
        record.status = "pending";
        record.retries = 0;
        record.createdAt = Date.now();
      });
    });
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

  const localRows = await batchesCollection()
    .query(Q.where("pyrolysis_completed", true))
    .fetch();

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

  await database.write(async () => {
    const fresh = await entriesCollection().find(entry.id);
    await fresh.update((record) => {
      record.serverId = created.id;
      record.status = "synced";
      record.uploadStatus = "synced";
      record.syncError = null;
      record.mediaUrl = uploadedMedia.media_url ?? record.mediaUrl;
      record.updatedAt = Date.now();
    });
  });
}
