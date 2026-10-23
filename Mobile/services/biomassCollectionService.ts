import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  BiomassCollectionRecord,
  BiomassFarmOption,
  CreateBiomassCollectionPayload,
  FieldPhotoMetadata,
} from "@krishecarbon/shared";
import { getDb } from "../database/db";
import { buildInsert, buildUpdate, generateId } from "../database/sqlHelpers";
import {
  rowToBiomassCollection,
  syncQueueItemToRow,
  type BiomassCollection,
} from "../database/types";
import {
  backendFetch,
  fetchMobileNetworkOverview,
  type NetworkProducer,
} from "./backendApi";
import { uploadBiomassCollectionPhoto } from "../utils/biomassCollectionPhotoUpload";

const OPTIONS_CACHE_KEY = "dmrv_biomass_collection_options";

export type BiomassCollectionView = {
  id: string;
  serverId: string | null;
  operatorId: string;
  status: "draft" | "loaded" | "submitted" | "synced" | string;
  farmId: string | null;
  farmName: string | null;
  producerId: string | null;
  producerName: string | null;
  tractorNumber: string | null;
  loadedPhotoLocalUri: string | null;
  loadedPhotoUrl: string | null;
  loadedPhotoMetadata: FieldPhotoMetadata | null;
  loadedSavedAt: string | null;
  unloadedPhotoLocalUri: string | null;
  unloadedPhotoUrl: string | null;
  unloadedPhotoMetadata: FieldPhotoMetadata | null;
  uploadStatus: string;
  syncError: string | null;
  createdAt: number;
  updatedAt: number;
};

export type BiomassCollectionOptions = {
  farms: BiomassFarmOption[];
  producers: NetworkProducer[];
};

function parseMetadata(json: string | null | undefined): FieldPhotoMetadata | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as FieldPhotoMetadata;
  } catch {
    return null;
  }
}

export function toBiomassCollectionView(row: BiomassCollection): BiomassCollectionView {
  return {
    id: row.id,
    serverId: row.serverId,
    operatorId: row.operatorId,
    status: row.status,
    farmId: row.farmId,
    farmName: row.farmName,
    producerId: row.producerId,
    producerName: row.producerName,
    tractorNumber: row.tractorNumber,
    loadedPhotoLocalUri: row.loadedPhotoLocalUri,
    loadedPhotoUrl: row.loadedPhotoUrl,
    loadedPhotoMetadata: parseMetadata(row.loadedPhotoMetadataJson),
    loadedSavedAt: row.loadedSavedAt,
    unloadedPhotoLocalUri: row.unloadedPhotoLocalUri,
    unloadedPhotoUrl: row.unloadedPhotoUrl,
    unloadedPhotoMetadata: parseMetadata(row.unloadedPhotoMetadataJson),
    uploadStatus: row.uploadStatus,
    syncError: row.syncError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function triggerBackgroundSync() {
  const { processSyncQueue } = await import("./syncService");
  void processSyncQueue();
}

function normalizeFarm(farm: Partial<BiomassFarmOption> & { id?: string }): BiomassFarmOption {
  return {
    id: farm.id ?? "",
    farmer_name: farm.farmer_name ?? "Unnamed farm",
    village: farm.village ?? null,
    cluster_name: farm.cluster_name ?? null,
    boundaries: Array.isArray(farm.boundaries) ? farm.boundaries : [],
  };
}

/** Farms with a mapped boundary, and production sites, cached so a trip can be recorded offline. */
export async function loadBiomassCollectionOptions(): Promise<BiomassCollectionOptions> {
  try {
    const [overview, farms] = await Promise.all([
      fetchMobileNetworkOverview(),
      backendFetch<BiomassFarmOption[]>("/biomass-collections/farms"),
    ]);
    const options = {
      farms: (farms ?? []).map(normalizeFarm).filter((farm) => farm.boundaries.length > 0),
      producers: overview.producers ?? [],
    };
    await AsyncStorage.setItem(OPTIONS_CACHE_KEY, JSON.stringify(options));
    return options;
  } catch (err) {
    const cached = await AsyncStorage.getItem(OPTIONS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as BiomassCollectionOptions;
      return {
        farms: (parsed.farms ?? []).map(normalizeFarm).filter((farm) => farm.boundaries.length > 0),
        producers: parsed.producers ?? [],
      };
    }
    throw err;
  }
}

export async function listBiomassCollections(operatorId: string): Promise<BiomassCollection[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM biomass_collections WHERE operator_id = ? ORDER BY created_at DESC",
    [operatorId],
  );
  return rows.map(rowToBiomassCollection);
}

export async function getBiomassCollection(id: string): Promise<BiomassCollection> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>("SELECT * FROM biomass_collections WHERE id = ?", [id]);
  if (!row) throw new Error(`Biomass collection ${id} not found`);
  return rowToBiomassCollection(row);
}

export async function createBiomassCollectionLocal(operatorId: string): Promise<string> {
  const db = await getDb();
  const now = Date.now();
  const id = generateId();
  const { sql, args } = buildInsert("biomass_collections", {
    id,
    server_id: null,
    operator_id: operatorId,
    status: "draft",
    farm_id: null,
    farm_name: null,
    producer_id: null,
    producer_name: null,
    tractor_number: null,
    loaded_photo_local_uri: null,
    loaded_photo_url: null,
    loaded_photo_metadata_json: null,
    loaded_saved_at: null,
    unloaded_photo_local_uri: null,
    unloaded_photo_url: null,
    unloaded_photo_metadata_json: null,
    sync_status: "local",
    sync_error: null,
    created_at: now,
    updated_at: now,
  });
  await db.runAsync(sql, args);
  return id;
}

export type BiomassCollectionUpdate = {
  farmId?: string | null;
  farmName?: string | null;
  producerId?: string | null;
  producerName?: string | null;
  tractorNumber?: string | null;
  loadedPhotoLocalUri?: string | null;
  loadedPhotoMetadata?: FieldPhotoMetadata | null;
  unloadedPhotoLocalUri?: string | null;
  unloadedPhotoMetadata?: FieldPhotoMetadata | null;
};

export async function updateBiomassCollectionLocal(id: string, patch: BiomassCollectionUpdate) {
  const db = await getDb();
  const columns: Record<string, unknown> = {};

  if (patch.farmId !== undefined) columns.farm_id = patch.farmId;
  if (patch.farmName !== undefined) columns.farm_name = patch.farmName;
  if (patch.producerId !== undefined) columns.producer_id = patch.producerId;
  if (patch.producerName !== undefined) columns.producer_name = patch.producerName;
  if (patch.tractorNumber !== undefined) columns.tractor_number = patch.tractorNumber;
  if (patch.loadedPhotoLocalUri !== undefined) {
    columns.loaded_photo_local_uri = patch.loadedPhotoLocalUri;
    columns.loaded_photo_url = null;
  }
  if (patch.loadedPhotoMetadata !== undefined) {
    columns.loaded_photo_metadata_json = patch.loadedPhotoMetadata
      ? JSON.stringify(patch.loadedPhotoMetadata)
      : null;
  }
  if (patch.unloadedPhotoLocalUri !== undefined) {
    columns.unloaded_photo_local_uri = patch.unloadedPhotoLocalUri;
    columns.unloaded_photo_url = null;
  }
  if (patch.unloadedPhotoMetadata !== undefined) {
    columns.unloaded_photo_metadata_json = patch.unloadedPhotoMetadata
      ? JSON.stringify(patch.unloadedPhotoMetadata)
      : null;
  }
  columns.updated_at = Date.now();

  const { sql, args } = buildUpdate("biomass_collections", columns, "id = ?", [id]);
  await db.runAsync(sql, args);
}

export function validateLoadedStep(view: BiomassCollectionView): string[] {
  const errors: string[] = [];
  if (!view.farmId) errors.push("Select the farm the biomass is coming from.");
  if (!view.loadedPhotoLocalUri && !view.loadedPhotoUrl) {
    errors.push("Take the photo of the loaded tractor.");
  }
  return errors;
}

export function validateUnloadedStep(view: BiomassCollectionView): string[] {
  const errors: string[] = [];
  if (!view.producerId) errors.push("Select the production site.");
  if (!view.unloadedPhotoLocalUri && !view.unloadedPhotoUrl) {
    errors.push("Take the photo of the unloaded biomass.");
  }
  return errors;
}

/** Saves the farm side of the trip on the device. The unloading step opens after this. */
export async function saveLoadedStep(id: string) {
  const view = toBiomassCollectionView(await getBiomassCollection(id));
  const errors = validateLoadedStep(view);
  if (errors.length) throw new Error(errors.join("\n"));

  const db = await getDb();
  await db.runAsync(
    "UPDATE biomass_collections SET status = ?, loaded_saved_at = ?, updated_at = ? WHERE id = ?",
    ["loaded", view.loadedPhotoMetadata?.captured_at ?? new Date().toISOString(), Date.now(), id],
  );
}

export async function submitBiomassCollection(id: string) {
  const view = toBiomassCollectionView(await getBiomassCollection(id));
  const errors = [...validateLoadedStep(view), ...validateUnloadedStep(view)];
  if (errors.length) throw new Error(errors.join("\n"));

  const db = await getDb();
  await db.runAsync(
    "UPDATE biomass_collections SET status = ?, sync_status = ?, sync_error = NULL, updated_at = ? WHERE id = ?",
    ["submitted", "pending", Date.now(), id],
  );

  const existing = await db.getAllAsync<any>(
    "SELECT * FROM sync_queue WHERE entity_type = ? AND entity_local_id = ?",
    ["biomass_collection", id],
  );
  const failed = existing.find((item) => item.status === "failed");

  if (failed) {
    await db.runAsync(
      "UPDATE sync_queue SET status = ?, retries = ?, error_message = NULL WHERE id = ?",
      ["pending", 0, failed.id],
    );
  } else if (existing.length === 0) {
    const row = syncQueueItemToRow({
      entityType: "biomass_collection",
      entityLocalId: id,
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

export async function syncBiomassCollection(row: BiomassCollection) {
  if (row.serverId) return;
  const db = await getDb();
  const view = toBiomassCollectionView(row);

  if (!view.farmId || !view.producerId) {
    throw new Error("Farm and production site are required before sync.");
  }
  if (!view.loadedPhotoMetadata || !view.unloadedPhotoMetadata) {
    throw new Error("Both photos need their time and GPS before sync.");
  }

  const loadedUrl = await uploadBiomassCollectionPhoto(
    row.id,
    "loaded",
    view.loadedPhotoLocalUri,
    view.loadedPhotoUrl,
  );
  await db.runAsync("UPDATE biomass_collections SET loaded_photo_url = ? WHERE id = ?", [
    loadedUrl,
    row.id,
  ]);

  const unloadedUrl = await uploadBiomassCollectionPhoto(
    row.id,
    "unloaded",
    view.unloadedPhotoLocalUri,
    view.unloadedPhotoUrl,
  );
  await db.runAsync("UPDATE biomass_collections SET unloaded_photo_url = ? WHERE id = ?", [
    unloadedUrl,
    row.id,
  ]);

  const payload: CreateBiomassCollectionPayload = {
    farm_id: view.farmId,
    farm_name: view.farmName,
    producer_id: view.producerId,
    producer_name: view.producerName,
    tractor_number: view.tractorNumber,
    loaded_at: view.loadedPhotoMetadata.captured_at,
    loaded_photo_url: loadedUrl,
    loaded_photo_metadata: view.loadedPhotoMetadata,
    unloaded_at: view.unloadedPhotoMetadata.captured_at,
    unloaded_photo_url: unloadedUrl,
    unloaded_photo_metadata: view.unloadedPhotoMetadata,
  };

  const created = await backendFetch<BiomassCollectionRecord>("/biomass-collections", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  await db.runAsync(
    `UPDATE biomass_collections SET
      server_id = ?, status = ?, sync_status = ?, sync_error = NULL, updated_at = ?
     WHERE id = ?`,
    [created.id, "synced", "synced", Date.now(), row.id],
  );
}
