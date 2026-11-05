import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  biomassAcresLimitMessage,
  parseBiomassQuantity,
  toPostgresJson,
  type ApplicationFarmerOption,
  type BiomassCollectionRecord,
  type CreateBiomassCollectionPayload,
  type FieldPhotoMetadata,
} from "@krishecarbon/shared";
import { getStoredAuthUser } from "./auth";
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
  type NetworkSite,
} from "./backendApi";
import { uploadBiomassCollectionPhoto } from "../utils/biomassCollectionPhotoUpload";

const OPTIONS_CACHE_PREFIX = "dmrv_biomass_collection_options_v4";
const FARMER_NAMES_CACHE_PREFIX = "dmrv_biomass_farmer_names_v1";
const FARMER_FIELDS_CACHE_PREFIX = "dmrv_biomass_farmer_fields_v1";
const DROP_SITES_CACHE_PREFIX = "dmrv_biomass_drop_sites_v1";
const USED_ACRES_CACHE_KEY = "dmrv_biomass_used_acres_v1";

/** The trip currently on screen. The list must not delete it while it is open. */
let openBiomassCollectionId: string | null = null;

export function setOpenBiomassCollectionId(id: string | null) {
  openBiomassCollectionId = id;
}

export function getOpenBiomassCollectionId() {
  return openBiomassCollectionId;
}

async function optionsCacheKey(): Promise<string> {
  const user = await getStoredAuthUser();
  return user?.id ? `${OPTIONS_CACHE_PREFIX}:${user.id}` : OPTIONS_CACHE_PREFIX;
}

export type BiomassSourceDraft = {
  id: string;
  farmId: string | null;
  farmName: string | null;
  farmFieldId: string | null;
  fieldCode: string | null;
  acresText: string;
  biomassText: string;
};

export type BiomassCollectionView = {
  id: string;
  serverId: string | null;
  operatorId: string;
  status: "draft" | "loaded" | "submitted" | "synced" | string;
  farmId: string | null;
  farmName: string | null;
  farmFieldId: string | null;
  fieldCode: string | null;
  sources: BiomassSourceDraft[];
  producerId: string | null;
  producerSiteId: string | null;
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

export type BiomassFarmerName = {
  id: string;
  farmer_name: string;
  village: string | null;
  cluster_name: string | null;
};

export type BiomassDropSite = {
  id: string;
  siteName: string;
  producerId: string;
  producerName: string | null;
};

export type BiomassCollectionOptions = {
  farmers: ApplicationFarmerOption[];
  producers: NetworkProducer[];
  sites: BiomassDropSite[];
};

function parseMetadata(json: string | null | undefined): FieldPhotoMetadata | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as FieldPhotoMetadata;
  } catch {
    return null;
  }
}

/** True once the operator has entered something, not merely opened a blank trip. */
export function biomassDraftHasContent(item: BiomassCollectionView): boolean {
  const sourceStarted = (item.sources ?? []).some(
    (source) =>
      source.farmId ||
      source.farmFieldId ||
      source.acresText.trim() ||
      source.biomassText.trim(),
  );
  return Boolean(
    sourceStarted ||
      item.farmId ||
      item.farmName?.trim() ||
      item.producerId ||
      item.tractorNumber?.trim() ||
      item.loadedPhotoLocalUri ||
      item.loadedPhotoUrl ||
      item.unloadedPhotoLocalUri ||
      item.unloadedPhotoUrl,
  );
}

export function biomassIsUnfinished(item: BiomassCollectionView): boolean {
  return item.status === "draft" || item.status === "loaded";
}

export function biomassFarmTitle(item: BiomassCollectionView): string {
  const names = (item.sources ?? [])
    .map((source) => source.farmName?.trim())
    .filter((name): name is string => Boolean(name));
  const unique = [...new Set(names)];
  if (unique.length === 0) return item.farmName?.trim() || "Farm not set";
  if (unique.length === 1) return unique[0];
  return `${unique[0]} + ${unique.length - 1} more`;
}

export function biomassDraftSubtitle(item: BiomassCollectionView): string {
  const farmLine = biomassFarmTitle(item);
  if (item.status === "loaded") {
    return [
      farmLine,
      item.producerName ? `Unload at ${item.producerName}` : "Unload at the production site",
    ].join(" · ");
  }
  return [
    farmLine === "Farm not set" ? "Farm not chosen" : farmLine,
    item.tractorNumber?.trim() ? `Tractor ${item.tractorNumber.trim()}` : null,
    item.loadedPhotoLocalUri || item.loadedPhotoUrl ? "Photo taken" : "Still loading",
  ]
    .filter(Boolean)
    .join(" · ");
}

function sourceFromRow(row: {
  id: string;
  farm_id: string | null;
  farm_name: string | null;
  farm_field_id: string | null;
  field_code: string | null;
  acres: number | null;
  biomass_tonnes: number | null;
}): BiomassSourceDraft {
  return {
    id: row.id,
    farmId: row.farm_id,
    farmName: row.farm_name,
    farmFieldId: row.farm_field_id,
    fieldCode: row.field_code,
    acresText: row.acres != null && row.acres > 0 ? String(row.acres) : "",
    biomassText:
      row.biomass_tonnes != null && row.biomass_tonnes > 0 ? String(row.biomass_tonnes) : "",
  };
}

async function sourcesForCollections(collectionIds: string[]): Promise<Map<string, BiomassSourceDraft[]>> {
  const grouped = new Map<string, BiomassSourceDraft[]>();
  if (collectionIds.length === 0) return grouped;
  const db = await getDb();
  const placeholders = collectionIds.map(() => "?").join(", ");
  const rows = await db.getAllAsync<{
    id: string;
    collection_id: string;
    farm_id: string | null;
    farm_name: string | null;
    farm_field_id: string | null;
    field_code: string | null;
    acres: number | null;
    biomass_tonnes: number | null;
  }>(
    `SELECT * FROM biomass_collection_sources
     WHERE collection_id IN (${placeholders})
     ORDER BY sort_order ASC, id ASC`,
    collectionIds,
  );
  for (const row of rows) {
    const list = grouped.get(row.collection_id) ?? [];
    list.push(sourceFromRow(row));
    grouped.set(row.collection_id, list);
  }
  return grouped;
}

export function toBiomassCollectionView(
  row: BiomassCollection,
  sources: BiomassSourceDraft[] = [],
): BiomassCollectionView {
  const first = sources.find((source) => source.farmId) ?? null;
  return {
    id: row.id,
    serverId: row.serverId,
    operatorId: row.operatorId,
    status: row.status,
    farmId: first?.farmId ?? row.farmId,
    farmName: first?.farmName ?? row.farmName,
    farmFieldId: first?.farmFieldId ?? row.farmFieldId,
    fieldCode: first?.fieldCode ?? row.fieldCode,
    sources,
    producerId: row.producerId,
    producerSiteId: row.producerSiteId,
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

function normalizeDropSite(site: Partial<NetworkSite> & { id?: string }): BiomassDropSite {
  return {
    id: site.id ?? "",
    siteName: site.site_name?.trim() || "Dropping site",
    producerId: site.biochar_producer_id ?? "",
    producerName: site.producer_name?.trim() || null,
  };
}

function normalizeFarmer(farmer: Partial<ApplicationFarmerOption> & { id?: string }): ApplicationFarmerOption {
  return {
    id: farmer.id ?? "",
    farmer_name: farmer.farmer_name ?? "Unnamed farmer",
    village: farmer.village ?? null,
    cluster_name: farmer.cluster_name ?? null,
    fields: Array.isArray(farmer.fields)
      ? farmer.fields.filter((field) => Array.isArray(field.boundary) && field.boundary.length >= 3)
      : [],
  };
}

/** Dropping sites for this person's clusters. Farmer maps are not included. */
export async function loadBiomassDropSites(): Promise<BiomassDropSite[]> {
  const user = await getStoredAuthUser();
  const cacheKey = user?.id ? `${DROP_SITES_CACHE_PREFIX}:${user.id}` : DROP_SITES_CACHE_PREFIX;
  try {
    const sites = await backendFetch<NetworkSite[]>("/biomass-collections/drop-sites");
    const list = (sites ?? []).map(normalizeDropSite).filter((site) => site.id && site.producerId);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(list));
    return list;
  } catch (err) {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached) as BiomassDropSite[];
    throw err;
  }
}

/** Names already stored on this phone, so the dropdown can open before the network answers. */
export async function readCachedBiomassFarmerNames(): Promise<BiomassFarmerName[]> {
  const cacheKey = await farmerNamesCacheKey();
  const cached = await AsyncStorage.getItem(cacheKey);
  if (!cached) return [];
  try {
    const list = JSON.parse(cached) as BiomassFarmerName[];
    return list.filter((farmer) => farmer.id && farmer.farmer_name);
  } catch {
    return [];
  }
}

/** Farmer names in this person's clusters. Plot maps are loaded later, one farmer at a time. */
export async function loadBiomassFarmerNames(): Promise<BiomassFarmerName[]> {
  const cacheKey = await farmerNamesCacheKey();
  try {
    const names = await backendFetch<BiomassFarmerName[]>("/biomass-collections/farmer-names");
    const list = (names ?? []).filter((farmer) => farmer.id && farmer.farmer_name);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(list));
    return list;
  } catch (err) {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached) as BiomassFarmerName[];
    throw err;
  }
}

/** Mapped farms for one farmer, after that farmer is selected. */
export async function loadBiomassFarmerFields(
  farmId: string,
): Promise<ApplicationFarmerOption["fields"]> {
  const cacheKey = await farmerFieldsCacheKey(farmId);
  try {
    const fields = await backendFetch<ApplicationFarmerOption["fields"]>(
      `/biomass-collections/farmer-fields/${encodeURIComponent(farmId)}`,
    );
    const list = (fields ?? []).filter((field) => field.id && field.boundary?.length >= 3);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(list));
    return list;
  } catch (err) {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached) as ApplicationFarmerOption["fields"];
    throw err;
  }
}

/** Farmers already on this trip, with their farms, for checks and the trip list. */
export async function loadFarmersForCollection(
  view: Pick<BiomassCollectionView, "sources" | "farmId" | "farmName" | "farmFieldId" | "fieldCode">,
): Promise<ApplicationFarmerOption[]> {
  const ids = [
    ...new Set(
      [...view.sources.map((source) => source.farmId), view.farmId].filter((id): id is string =>
        Boolean(id),
      ),
    ),
  ];
  const farmers: ApplicationFarmerOption[] = [];
  for (const id of ids) {
    const source = view.sources.find((item) => item.farmId === id);
    const fields = await loadBiomassFarmerFields(id).catch(
      () => [] as ApplicationFarmerOption["fields"],
    );
    farmers.push({
      id,
      farmer_name: source?.farmName ?? view.farmName ?? "Farmer",
      village: null,
      cluster_name: null,
      fields,
    });
  }
  return farmers;
}

async function farmerNamesCacheKey(): Promise<string> {
  const user = await getStoredAuthUser();
  return user?.id ? `${FARMER_NAMES_CACHE_PREFIX}:${user.id}` : FARMER_NAMES_CACHE_PREFIX;
}

async function farmerFieldsCacheKey(farmId: string): Promise<string> {
  const user = await getStoredAuthUser();
  const prefix = user?.id ? `${FARMER_FIELDS_CACHE_PREFIX}:${user.id}` : FARMER_FIELDS_CACHE_PREFIX;
  return `${prefix}:${farmId}`;
}

/** Farmers with a mapped plot, and production sites, cached so a trip can be recorded offline. */
export async function loadBiomassCollectionOptions(): Promise<BiomassCollectionOptions> {
  try {
    const [overview, farmers] = await Promise.all([
      fetchMobileNetworkOverview(),
      backendFetch<ApplicationFarmerOption[]>("/biomass-collections/farms"),
    ]);
    const options = {
      farmers: (farmers ?? []).map(normalizeFarmer).filter((farmer) => farmer.fields.length > 0),
      producers: overview.producers ?? [],
      sites: (overview.sites ?? []).map(normalizeDropSite),
    };
    await AsyncStorage.setItem(await optionsCacheKey(), JSON.stringify(options));
    return options;
  } catch (err) {
    const cached = await AsyncStorage.getItem(await optionsCacheKey());
    if (cached) {
      const parsed = JSON.parse(cached) as BiomassCollectionOptions;
      return {
        farmers: (parsed.farmers ?? []).map(normalizeFarmer).filter((farmer) => farmer.fields.length > 0),
        producers: parsed.producers ?? [],
        sites: (parsed.sites ?? []).map(normalizeDropSite),
      };
    }
    throw err;
  }
}

export async function listBiomassCollectionViews(operatorId: string): Promise<BiomassCollectionView[]> {
  const rows = await listBiomassCollections(operatorId);
  const sources = await sourcesForCollections(rows.map((row) => row.id));
  return rows.map((row) => toBiomassCollectionView(row, sources.get(row.id) ?? []));
}

export async function getBiomassCollectionView(id: string): Promise<BiomassCollectionView> {
  const row = await getBiomassCollection(id);
  const sources = await sourcesForCollections([id]);
  return toBiomassCollectionView(row, sources.get(id) ?? []);
}

/** Acres already collected on each plot: server totals plus trips still only on this phone. */
export async function loadCollectedAcres(excludeCollectionId?: string): Promise<Record<string, number>> {
  let server: { farm_field_id: string; used_acres: number }[] = [];
  try {
    server = await backendFetch<{ farm_field_id: string; used_acres: number }[]>(
      "/biomass-collections/used-acres",
    );
    await AsyncStorage.setItem(USED_ACRES_CACHE_KEY, JSON.stringify(server ?? []));
  } catch {
    const cached = await AsyncStorage.getItem(USED_ACRES_CACHE_KEY);
    server = cached ? (JSON.parse(cached) as { farm_field_id: string; used_acres: number }[]) : [];
  }

  const totals: Record<string, number> = {};
  for (const row of server) {
    const acres = Number(row.used_acres);
    if (!row.farm_field_id || !Number.isFinite(acres)) continue;
    totals[row.farm_field_id] = (totals[row.farm_field_id] ?? 0) + acres;
  }

  const db = await getDb();
  const local = await db.getAllAsync<{ farm_field_id: string | null; acres: number | null }>(
    `SELECT s.farm_field_id, s.acres
     FROM biomass_collection_sources s
     JOIN biomass_collections c ON c.id = s.collection_id
     WHERE c.server_id IS NULL AND c.id != ?`,
    [excludeCollectionId ?? ""],
  );
  for (const row of local) {
    const acres = Number(row.acres);
    if (!row.farm_field_id || !Number.isFinite(acres) || acres <= 0) continue;
    totals[row.farm_field_id] = (totals[row.farm_field_id] ?? 0) + acres;
  }
  return totals;
}

export function newBiomassSourceDraft(): BiomassSourceDraft {
  return {
    id: generateId(),
    farmId: null,
    farmName: null,
    farmFieldId: null,
    fieldCode: null,
    acresText: "",
    biomassText: "",
  };
}

function sourceLineStarted(source: BiomassSourceDraft): boolean {
  return Boolean(
    source.farmId || source.farmFieldId || source.acresText.trim() || source.biomassText.trim(),
  );
}

/** One write at a time. Choosing a farmer, leaving the screen, and blurring a field all save the same lines. */
let biomassSourceWriteChain: Promise<void> = Promise.resolve();

function readableBiomassSaveError(err: unknown): Error {
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
  const text = `${err instanceof Error ? err.message : String(err)}\n${cause}`;
  if (/UNIQUE constraint failed/i.test(text)) {
    return new Error("This farm was already saved on this phone. Choose the farmer again.");
  }
  if (/database is locked|SQLITE_BUSY|SQLITE_LOCKED|database is busy/i.test(text)) {
    return new Error("The phone's records are busy. Wait a moment and try again.");
  }
  if (err instanceof Error && !/finalizeAsync|has been rejected/i.test(err.message)) return err;
  if (cause && !/finalizeAsync|has been rejected/i.test(cause)) return new Error(cause);
  return new Error("Could not save this farm on this phone.");
}

async function writeBiomassSources(collectionId: string, sources: BiomassSourceDraft[]) {
  const db = await getDb();
  const seen = new Set<string>();
  const rows: Array<{ source: BiomassSourceDraft; sortOrder: number }> = [];
  for (const [index, source] of sources.entries()) {
    if (!sourceLineStarted(source)) continue;
    let id = source.id?.trim() || generateId();
    if (seen.has(id)) id = generateId();
    seen.add(id);
    rows.push({
      source: id === source.id ? source : { ...source, id },
      sortOrder: index,
    });
  }

  try {
    // Delete-then-insert must be one transaction. Two overlapping saves used to
    // insert the same line id twice and SQLite rejected the second one.
    await db.withTransactionAsync(async () => {
      await db.runAsync("DELETE FROM biomass_collection_sources WHERE collection_id = ?", [
        collectionId,
      ]);
      for (const { source, sortOrder } of rows) {
        const { sql, args } = buildInsert("biomass_collection_sources", {
          id: source.id,
          collection_id: collectionId,
          farm_id: source.farmId,
          farm_name: source.farmName,
          farm_field_id: source.farmFieldId,
          field_code: source.fieldCode,
          acres: parseBiomassQuantity(source.acresText),
          biomass_tonnes: parseBiomassQuantity(source.biomassText),
          sort_order: sortOrder,
        });
        await db.runAsync(sql.replace(/^INSERT INTO /, "INSERT OR REPLACE INTO "), args);
      }
    });
  } catch (err) {
    throw readableBiomassSaveError(err);
  }

  const first = sources.find((source) => source.farmId) ?? null;
  try {
    await updateBiomassCollectionLocal(collectionId, {
      farmId: first?.farmId ?? null,
      farmName: first?.farmName ?? null,
      farmFieldId: first?.farmFieldId ?? null,
      fieldCode: first?.fieldCode ?? null,
    });
  } catch (err) {
    throw readableBiomassSaveError(err);
  }
}

export function saveBiomassSources(
  collectionId: string,
  sources: BiomassSourceDraft[],
): Promise<void> {
  const run = biomassSourceWriteChain.then(() => writeBiomassSources(collectionId, sources));
  biomassSourceWriteChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
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
  if (!row) {
    throw new Error("This trip is no longer on this phone. Go back and open it again.");
  }
  return rowToBiomassCollection(row);
}

/** Removes a biomass trip that has not been submitted. */
export async function deleteBiomassDraft(id: string) {
  const row = await getBiomassCollection(id);
  if (!biomassIsUnfinished(toBiomassCollectionView(row)) || row.serverId) {
    throw new Error("This trip has already been submitted.");
  }
  if (row.uploadStatus === "pending" || row.uploadStatus === "syncing" || row.uploadStatus === "synced") {
    throw new Error("This trip has already been submitted.");
  }
  const db = await getDb();
  await db.runAsync(
    "DELETE FROM sync_queue WHERE entity_type = ? AND entity_local_id = ?",
    ["biomass_collection", id],
  );
  await db.runAsync("DELETE FROM biomass_collection_sources WHERE collection_id = ?", [id]);
  await db.runAsync("DELETE FROM biomass_collections WHERE id = ?", [id]);
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
    farm_field_id: null,
    field_code: null,
    producer_id: null,
    producer_site_id: null,
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
  farmFieldId?: string | null;
  fieldCode?: string | null;
  producerId?: string | null;
  producerSiteId?: string | null;
  producerName?: string | null;
  tractorNumber?: string | null;
  loadedPhotoLocalUri?: string | null;
  loadedPhotoMetadata?: FieldPhotoMetadata | null;
  unloadedPhotoLocalUri?: string | null;
  unloadedPhotoMetadata?: FieldPhotoMetadata | null;
};

async function ensureBiomassCollectionExists(id: string) {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM biomass_collections WHERE id = ?",
    [id],
  );
  if (row) return;
  const user = await getStoredAuthUser();
  if (!user) throw new Error("Sign in again to save this trip.");
  const now = Date.now();
  const { sql, args } = buildInsert("biomass_collections", {
    id,
    server_id: null,
    operator_id: user.id,
    status: "draft",
    farm_id: null,
    farm_name: null,
    farm_field_id: null,
    field_code: null,
    producer_id: null,
    producer_site_id: null,
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
}

export async function updateBiomassCollectionLocal(id: string, patch: BiomassCollectionUpdate) {
  await ensureBiomassCollectionExists(id);
  const db = await getDb();
  const columns: Record<string, unknown> = {};

  if (patch.farmId !== undefined) columns.farm_id = patch.farmId;
  if (patch.farmName !== undefined) columns.farm_name = patch.farmName;
  if (patch.farmFieldId !== undefined) columns.farm_field_id = patch.farmFieldId;
  if (patch.fieldCode !== undefined) columns.field_code = patch.fieldCode;
  if (patch.producerId !== undefined) columns.producer_id = patch.producerId;
  if (patch.producerSiteId !== undefined) columns.producer_site_id = patch.producerSiteId;
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

export function validateLoadedStep(
  view: BiomassCollectionView,
  farmers: ApplicationFarmerOption[] = [],
  usedAcres: Record<string, number> = {},
): string[] {
  const errors: string[] = [];
  const started = view.sources.filter(
    (source) =>
      source.farmId || source.farmFieldId || source.acresText.trim() || source.biomassText.trim(),
  );
  if (started.length === 0) errors.push("Add a farm.");
  const seen = new Set<string>();
  const added: Record<string, number> = {};
  for (const source of started) {
    const farmer = farmers.find((item) => item.id === source.farmId);
    const field = farmer?.fields.find((item) => item.id === source.farmFieldId);
    if (!source.farmId) {
      errors.push("Select the farmer.");
      continue;
    }
    if (!source.farmFieldId) {
      errors.push(
        source.farmName ? `Select the farm plot for ${source.farmName}.` : "Select the farm plot.",
      );
      continue;
    }
    if (seen.has(source.farmFieldId)) {
      errors.push(
        `${source.farmName ?? "This farm"} is already in this trip. Increase the acres on that line.`,
      );
      continue;
    }
    seen.add(source.farmFieldId);
    if (farmers.length > 0 && !farmer) {
      errors.push("Select a farmer that is on this phone.");
      continue;
    }
    if (farmers.length > 0 && farmer && !field) {
      errors.push(`Select the farm plot for ${farmer.farmer_name}.`);
      continue;
    }
    const acres = parseBiomassQuantity(source.acresText);
    const label = field
      ? `${farmer?.farmer_name ?? source.farmName ?? "Farm"} (${field.field_code})`
      : `${source.farmName ?? "Farm"} (${source.fieldCode ?? "plot"})`;
    if (acres == null) errors.push(`Enter how many acres were collected from ${label}.`);
    if (acres != null && field) {
      const message = biomassAcresLimitMessage({
        farmLabel: label,
        areaAcres: field.area_acres,
        alreadyUsedAcres: (usedAcres[field.id] ?? 0) + (added[field.id] ?? 0),
        nextAcres: acres,
      });
      if (message) errors.push(message);
      added[field.id] = (added[field.id] ?? 0) + acres;
    }
  }
  if (!view.loadedPhotoLocalUri && !view.loadedPhotoUrl) {
    errors.push("Take the photo of the loaded tractor.");
  }
  return errors;
}

export function validateUnloadedStep(view: BiomassCollectionView): string[] {
  const errors: string[] = [];
  if (!view.producerSiteId) errors.push("Select the dropping site.");
  if (!view.unloadedPhotoLocalUri && !view.unloadedPhotoUrl) {
    errors.push("Take the photo of the unloaded biomass.");
  }
  return errors;
}

/** Saves the farm side of the trip on the device. The unloading step opens after this. */
export async function saveLoadedStep(id: string) {
  const view = await getBiomassCollectionView(id);
  const farmers = await loadFarmersForCollection(view);
  const used = await loadCollectedAcres(id);
  const errors = validateLoadedStep(view, farmers, used);
  if (errors.length) throw new Error(errors.join("\n"));

  const db = await getDb();
  await db.runAsync(
    "UPDATE biomass_collections SET status = ?, loaded_saved_at = ?, updated_at = ? WHERE id = ?",
    ["loaded", view.loadedPhotoMetadata?.captured_at ?? new Date().toISOString(), Date.now(), id],
  );
}

export async function submitBiomassCollection(id: string) {
  const view = await getBiomassCollectionView(id);
  const farmers = await loadFarmersForCollection(view);
  const used = await loadCollectedAcres(id);
  const errors = [...validateLoadedStep(view, farmers, used), ...validateUnloadedStep(view)];
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
  const view = await getBiomassCollectionView(row.id);
  const farmers = await loadFarmersForCollection(view);
  const used = await loadCollectedAcres(row.id);
  const sourceErrors = validateLoadedStep(view, farmers, used);
  if (sourceErrors.length) throw new Error(sourceErrors.join("\n"));

  if (!view.farmId || !view.farmFieldId || !view.producerId || !view.producerSiteId) {
    throw new Error("Farmer, farm plot, and dropping site are required before sync.");
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

  const sources = view.sources
    .map((source) => ({
      farm_id: source.farmId ?? "",
      farm_name: source.farmName,
      farm_field_id: source.farmFieldId ?? "",
      field_code: source.fieldCode,
      acres: parseBiomassQuantity(source.acresText) ?? 0,
      biomass_tonnes: parseBiomassQuantity(source.biomassText),
    }))
    .filter((source) => source.farm_id && source.farm_field_id);

  const payload: CreateBiomassCollectionPayload = {
    farm_id: view.farmId,
    farm_name: view.farmName,
    farm_field_id: view.farmFieldId,
    field_code: view.fieldCode,
    sources,
    producer_id: view.producerId,
    producer_site_id: view.producerSiteId,
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
    body: JSON.stringify(toPostgresJson(payload)),
  });

  await db.runAsync(
    `UPDATE biomass_collections SET
      server_id = ?, status = ?, sync_status = ?, sync_error = NULL, updated_at = ?
     WHERE id = ?`,
    [created.id, "synced", "synced", Date.now(), row.id],
  );
}
