import * as SQLite from "expo-sqlite";
import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from "./schema";

const DB_NAME = "dmrv.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// expo-sqlite runs async calls on a pool of threads, against one connection.
// A write transaction (BEGIN IMMEDIATE) plus any other statement on a second
// thread is rejected as "database is locked". One queue holds the connection
// for a whole transaction, so a screen reading farmers waits instead of failing.
let chain: Promise<void> = Promise.resolve();

const MAX_LOCK_RETRIES = 12;
const LOCK_RETRY_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDatabaseLockedError(err: unknown): boolean {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 6 && current != null; depth += 1) {
    parts.push(current instanceof Error ? current.message : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return /database is locked|SQLITE_BUSY|finalizeAsync/i.test(parts.join("\n"));
}

/**
 * Defense in depth on top of the JS-side queue below: if the native layer
 * still reports "database is locked" (e.g. a transient lock from a device
 * backup process, or a moment where the queue and the native driver
 * disagree about what's in flight), retry a few times with a short
 * backoff instead of surfacing the error straight to the user.
 */
async function withLockRetry<T>(task: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await task();
    } catch (err) {
      attempt += 1;
      if (attempt > MAX_LOCK_RETRIES || !isDatabaseLockedError(err)) {
        throw err;
      }
      await sleep(LOCK_RETRY_DELAY_MS * attempt);
    }
  }
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  // Keep the queue moving even if a task rejects — don't let one failed
  // call jam every call after it.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

const NON_TRANSACTION_METHODS = [
  "execAsync",
  "runAsync",
  "getAllAsync",
  "getFirstAsync",
  "getEachAsync",
] as const;

function serializeDbMethods(db: SQLite.SQLiteDatabase): SQLite.SQLiteDatabase {
  type AnyDb = Record<string, (...args: unknown[]) => Promise<unknown>>;
  const anyDb = db as unknown as AnyDb;

  // Unwrapped driver methods. Public calls go through the queue below.
  const original: AnyDb = {};
  for (const method of [...NON_TRANSACTION_METHODS, "withTransactionAsync"]) {
    const fn = anyDb[method];
    if (typeof fn === "function") original[method] = fn.bind(db);
  }

  // txnDepth > 0 while this connection is inside BEGIN/COMMIT.
  // `inline` is true only for the transaction's own next statement, so a
  // farmer-list read from another screen waits until COMMIT.
  let txnDepth = 0;
  let inline = false;

  const runStatement = <T>(task: () => Promise<T>): Promise<T> => {
    if (txnDepth > 0 && inline) {
      inline = false;
      return withLockRetry(task).finally(() => {
        inline = true;
      });
    }
    return enqueue(() => withLockRetry(task));
  };

  for (const method of NON_TRANSACTION_METHODS) {
    if (!original[method]) continue;
    anyDb[method] = (...args: unknown[]) =>
      runStatement(() => original[method](...args) as Promise<unknown>);
  }

  if (original.withTransactionAsync) {
    anyDb.withTransactionAsync = (callback: () => Promise<void>) => {
      if (txnDepth > 0) return callback();

      return enqueue(async () => {
        txnDepth += 1;
        inline = false;
        try {
          await withLockRetry(() => original.execAsync("BEGIN IMMEDIATE"));
          inline = true;
          try {
            // callback() runs until its first await and starts that statement
            // while `inline` is still true. Then other screens queue behind us.
            const pending = callback();
            inline = false;
            await pending;
            await withLockRetry(() => original.execAsync("COMMIT"));
          } catch (err) {
            await withLockRetry(() => original.execAsync("ROLLBACK")).catch(() => undefined);
            throw err;
          }
        } finally {
          txnDepth -= 1;
          inline = false;
        }
      });
    };
  }

  return db;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  // Set the wait before any other statement. Migration runs before the
  // queue above exists, so a lock here used to fail the open forever.
  await withLockRetry(() => db.execAsync("PRAGMA busy_timeout = 10000;"));
  await withLockRetry(() => db.execAsync("PRAGMA journal_mode = WAL;"));
  await withLockRetry(() => db.execAsync("PRAGMA foreign_keys = ON;"));

  const versionRow = await withLockRetry(() =>
    db.getFirstAsync<{ user_version: number }>("PRAGMA user_version"),
  );
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion < SCHEMA_VERSION) {
    await withLockRetry(() => db.execAsync("BEGIN IMMEDIATE"));
    try {
      for (const statement of SCHEMA_STATEMENTS) {
        await withLockRetry(() => db.execAsync(statement));
      }
      await withLockRetry(() => db.execAsync("COMMIT"));
    } catch (err) {
      await withLockRetry(() => db.execAsync("ROLLBACK")).catch(() => undefined);
      throw err;
    }
    await withLockRetry(() => db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`));
  }

  // `CREATE TABLE IF NOT EXISTS` above is a no-op for tables that already
  // exist on a device, so new columns added to an existing table need an
  // explicit ALTER here. Guarded with a column-existence check so this is
  // safe to run on every launch, on both old and fresh installs.
  await addColumnIfMissing(db, "pyrolysis_batches", "submission_status", "TEXT NOT NULL DEFAULT 'draft'");
  await addColumnIfMissing(db, "application_entries", "location_lat", "REAL");
  await addColumnIfMissing(db, "application_entries", "location_lng", "REAL");
  await addColumnIfMissing(db, "application_entries", "location_address", "TEXT");
  await addColumnIfMissing(db, "application_entries", "farm_field_id", "TEXT");
  await addColumnIfMissing(db, "application_entries", "field_code", "TEXT");
  await addColumnIfMissing(db, "biomass_collections", "farm_field_id", "TEXT");
  await addColumnIfMissing(db, "biomass_collections", "field_code", "TEXT");

  // Farmers Network profile fields (v3) — safe on devices that already have farmers.
  await addColumnIfMissing(db, "farmers", "farmer_code", "TEXT");
  await addColumnIfMissing(db, "farmers", "father_spouse_name", "TEXT");
  await addColumnIfMissing(db, "farmers", "agri_id", "TEXT");
  await addColumnIfMissing(db, "farmers", "village", "TEXT");
  await addColumnIfMissing(db, "farmers", "mandal", "TEXT");
  await addColumnIfMissing(db, "farmers", "district", "TEXT");
  await addColumnIfMissing(db, "farmers", "state", "TEXT");
  await addColumnIfMissing(db, "farmers", "owned_land_size", "REAL");
  await addColumnIfMissing(db, "farmers", "leased_land_size", "REAL");
  await addColumnIfMissing(db, "farmers", "farmer_photo_uri", "TEXT");
  await addColumnIfMissing(db, "farmers", "farmer_photo_url", "TEXT");
  await addColumnIfMissing(db, "farmers", "cluster_id", "TEXT");
  await addColumnIfMissing(db, "farmers", "cluster_village_id", "TEXT");
  await addColumnIfMissing(db, "farmers", "cluster_name", "TEXT");

  await addColumnIfMissing(db, "farm_fields", "crop_name", "TEXT");
  await addColumnIfMissing(db, "farm_fields", "season", "TEXT");
  await addColumnIfMissing(db, "farm_fields", "sowing_date", "TEXT");
  await addColumnIfMissing(db, "farm_fields", "harvest_date", "TEXT");
  await addColumnIfMissing(db, "farm_fields", "crop_photos_json", "TEXT");
  await addColumnIfMissing(db, "farm_fields", "server_id", "TEXT");
  await addColumnIfMissing(db, "farm_fields", "sync_status", "TEXT");
  await addColumnIfMissing(db, "farm_fields", "sync_error", "TEXT");

  await addColumnIfMissing(db, "farmer_consents", "photos_json", "TEXT");
  await addColumnIfMissing(db, "farmer_consents", "server_id", "TEXT");
  await addColumnIfMissing(db, "farmer_consents", "sync_status", "TEXT");
  await addColumnIfMissing(db, "farmer_consents", "sync_error", "TEXT");

  await addColumnIfMissing(db, "soil_tests", "field_ids_json", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "sample_photo_uri", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "sample_photo_url", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "sample_sites_json", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "receive_photo_uri", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "receive_photo_url", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "submitted_to_supervisor_id", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "submitted_to_supervisor_name", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "collected_by", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "collected_by_role", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "status", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "received_at", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "received_by", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "received_by_name", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "server_id", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "sync_status", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "sync_error", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "sample_code", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "farmer_name", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "farmer_village", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "collected_by_name", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "info_sheet_photo_uri", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "info_sheet_photo_url", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "last_crop", "TEXT");
  await addColumnIfMissing(db, "soil_tests", "next_crop", "TEXT");

  await addColumnIfMissing(db, "soil_reports", "document_url", "TEXT");
  await addColumnIfMissing(db, "soil_reports", "server_id", "TEXT");

  await addColumnIfMissing(db, "farmers", "credit_rights_acknowledged", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "cluster_villages", "producer_registry", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "kiln_photo_local_uri", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "kiln_photo_url", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "kiln_photo_metadata_json", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "feedstock_class", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "last_layer_confirmed", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "flame_curtain_photo_local_uri", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "flame_curtain_photo_url", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "flame_curtain_photo_metadata_json", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "quench_start_photo_local_uri", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "quench_start_photo_url", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "quench_start_photo_metadata_json", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "quench_end_photo_local_uri", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "quench_end_photo_url", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "quench_end_photo_metadata_json", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "quench_photos_json", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "quench_video_local_uri", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "quench_video_url", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "quench_video_metadata_json", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "quench_video_duration_seconds", "REAL");
  await addColumnIfMissing(db, "pyrolysis_batches", "generated_batch_code", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "generated_batch_code", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "sample_spots_json", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "sample_pile_photo_local_uri", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "sample_pile_photo_url", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "sample_pile_photo_metadata_json", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "sample_bag_code", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "sample_bag_photo_local_uri", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "sample_bag_photo_url", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "sample_bag_photo_metadata_json", "TEXT");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "sample_bag_not_used", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "rainbow_pyrolysis_batches", "sample_collected_at", "TEXT");

  return serializeDbMethods(db);
}

async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
) {
  const columns = await withLockRetry(() =>
    db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`),
  );
  if (columns.some((row) => row.name === column)) return;
  await withLockRetry(() =>
    db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`),
  );
}

/** Singleton db handle. Every service calls this before touching SQLite. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}
