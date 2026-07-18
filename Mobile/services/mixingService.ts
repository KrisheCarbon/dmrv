import { Q } from "@nozbe/watermelondb";
import type {
  AvailableMixingPyrolysisBatch,
  CreateMixingEntryPayload,
  FieldPhotoMetadata,
  MixingEntryRecord,
  MixingMaterialType,
} from "@krishecarbon/shared";
import { database } from "../database";
import MixingEntry from "../database/models/MixingEntry";
import MixingPyrolysisLink from "../database/models/MixingPyrolysisLink";
import PyrolysisBatch from "../database/models/PyrolysisBatch";
import SyncQueue from "../database/models/SyncQueue";
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
  pyrolysisLinks: MixingPyrolysisLinkView[];
  createdAt: number;
  updatedAt: number;
};

export type SelectablePyrolysisBatch = AvailableMixingPyrolysisBatch & {
  source: "server" | "local";
  localBatchId?: string | null;
};

function entriesCollection() {
  return database.get<MixingEntry>("mixing_entries");
}

function linksCollection() {
  return database.get<MixingPyrolysisLink>("mixing_pyrolysis_links");
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

export async function listMixingEntries(operatorId: string) {
  return entriesCollection()
    .query(Q.where("operator_id", operatorId), Q.sortBy("created_at", Q.desc))
    .fetch();
}

export async function getMixingEntry(entryId: string) {
  return entriesCollection().find(entryId);
}

export async function getMixingEntryLinks(entryId: string) {
  return linksCollection()
    .query(Q.where("mixing_entry_id", entryId))
    .fetch();
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

export async function createMixingEntryLocal(operatorId: string): Promise<string> {
  const now = Date.now();
  const startedAt = getCurrentIST();
  let entryId = "";

  await database.write(async () => {
    const entry = await entriesCollection().create((record) => {
      record.operatorId = operatorId;
      record.startedAt = startedAt;
      record.status = "draft";
      record.farmId = null;
      record.farmName = null;
      record.locationLat = null;
      record.locationLng = null;
      record.locationAddress = null;
      record.materialType = null;
      record.materialToBiocharRatio = null;
      record.comment = null;
      record.biocharPhotoLocalUri = null;
      record.biocharPhotoUrl = null;
      record.biocharPhotoMetadataJson = null;
      record.substratePhotoLocalUri = null;
      record.substratePhotoUrl = null;
      record.substratePhotoMetadataJson = null;
      record.mixingPhotoLocalUri = null;
      record.mixingPhotoUrl = null;
      record.mixingPhotoMetadataJson = null;
      record.uploadStatus = LOCAL_SYNC_STATUS;
      record.syncError = null;
      record.createdAt = now;
      record.updatedAt = now;
    });
    entryId = entry.id;
  });

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
  biocharPhotoMetadata?: FieldPhotoMetadata | null;
  substratePhotoLocalUri?: string | null;
  substratePhotoMetadata?: FieldPhotoMetadata | null;
  mixingPhotoLocalUri?: string | null;
  mixingPhotoMetadata?: FieldPhotoMetadata | null;
};

export async function updateMixingEntryLocal(entryId: string, patch: MixingEntryUpdate) {
  await database.write(async () => {
    const entry = await entriesCollection().find(entryId);
    await entry.update((record) => {
      if (patch.farmId !== undefined) record.farmId = patch.farmId;
      if (patch.farmName !== undefined) record.farmName = patch.farmName;
      if (patch.locationLat !== undefined) record.locationLat = patch.locationLat;
      if (patch.locationLng !== undefined) record.locationLng = patch.locationLng;
      if (patch.locationAddress !== undefined) record.locationAddress = patch.locationAddress;
      if (patch.materialType !== undefined) record.materialType = patch.materialType;
      if (patch.materialToBiocharRatio !== undefined) {
        record.materialToBiocharRatio = patch.materialToBiocharRatio;
      }
      if (patch.comment !== undefined) record.comment = patch.comment;
      if (patch.biocharPhotoLocalUri !== undefined) {
        record.biocharPhotoLocalUri = patch.biocharPhotoLocalUri;
      }
      if (patch.biocharPhotoMetadata !== undefined) {
        record.biocharPhotoMetadataJson = patch.biocharPhotoMetadata
          ? JSON.stringify(patch.biocharPhotoMetadata)
          : null;
      }
      if (patch.substratePhotoLocalUri !== undefined) {
        record.substratePhotoLocalUri = patch.substratePhotoLocalUri;
      }
      if (patch.substratePhotoMetadata !== undefined) {
        record.substratePhotoMetadataJson = patch.substratePhotoMetadata
          ? JSON.stringify(patch.substratePhotoMetadata)
          : null;
      }
      if (patch.mixingPhotoLocalUri !== undefined) {
        record.mixingPhotoLocalUri = patch.mixingPhotoLocalUri;
      }
      if (patch.mixingPhotoMetadata !== undefined) {
        record.mixingPhotoMetadataJson = patch.mixingPhotoMetadata
          ? JSON.stringify(patch.mixingPhotoMetadata)
          : null;
      }
      record.updatedAt = Date.now();
    });
  });
}

export async function setMixingPyrolysisLinks(
  entryId: string,
  selected: SelectablePyrolysisBatch[],
) {
  await database.write(async () => {
    const existing = await linksCollection()
      .query(Q.where("mixing_entry_id", entryId))
      .fetch();

    for (const row of existing) {
      await row.destroyPermanently();
    }

    for (const batch of selected) {
      await linksCollection().create((record) => {
        record.mixingEntryId = entryId;
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
  const entry = await entriesCollection().find(entryId);
  const view = await toMixingEntryView(entry);
  const errors = validateMixingEntry(view);

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
      Q.where("entity_type", "mixing_entry"),
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
        record.entityType = "mixing_entry";
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

  let serverRows: AvailableMixingPyrolysisBatch[] = [];

  try {
    serverRows = await backendFetch<AvailableMixingPyrolysisBatch[]>(
      "/mixing-entries/available-pyrolysis-batches",
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

export async function syncMixingEntry(entry: MixingEntry) {
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

  await database.write(async () => {
    const fresh = await entriesCollection().find(entry.id);
    await fresh.update((record) => {
      record.serverId = created.id;
      record.status = "synced";
      record.uploadStatus = "synced";
      record.syncError = null;
      record.biocharPhotoUrl = uploadedPhotos.biochar_photo_url ?? record.biocharPhotoUrl;
      record.substratePhotoUrl = uploadedPhotos.substrate_photo_url ?? record.substratePhotoUrl;
      record.mixingPhotoUrl = uploadedPhotos.mixing_photo_url ?? record.mixingPhotoUrl;
      record.updatedAt = Date.now();
    });
  });
}
