import * as SQLite from "expo-sqlite";
import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from "./schema";

const DB_NAME = "dmrv.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// expo-sqlite exposes a single native connection. Firing multiple
// statements at it concurrently (e.g. an auto-save triggered while a photo
// capture is also writing, or a delete firing while a section auto-saves)
// makes the native layer reject in-flight statements with "database is
// locked" when it tries to finalize them. Every statement-executing method
// is routed through this queue so calls from anywhere in the app run one
// at a time, in the order they were called.
let writeQueue: Promise<unknown> = Promise.resolve();

const MAX_LOCK_RETRIES = 4;
const LOCK_RETRY_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDatabaseLockedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /database is locked|SQLITE_BUSY/i.test(message);
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

function runSerialized<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(
    () => withLockRetry(task),
    () => withLockRetry(task),
  );
  // Keep the queue moving even if a task rejects — don't let one failed
  // call jam every call after it.
  writeQueue = run.then(
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

  // Capture the *unwrapped* originals up front so nested calls made from
  // inside a transaction's callback (see below) always hit the real driver
  // directly, never the queued wrapper — that would deadlock, since the
  // transaction itself is already occupying the one queue slot it would
  // be waiting behind.
  const original: AnyDb = {};
  for (const method of [...NON_TRANSACTION_METHODS, "withTransactionAsync"]) {
    const fn = anyDb[method];
    if (typeof fn === "function") original[method] = fn.bind(db);
  }

  // True only for the exact duration of the single active transaction
  // this queue is currently running. Because `runSerialized` guarantees at
  // most one task executes at a time, this can never be true while some
  // unrelated concurrent call (e.g. a delete fired from another screen)
  // is the one actually running — those still queue normally.
  let insideActiveTransaction = false;

  for (const method of NON_TRANSACTION_METHODS) {
    if (!original[method]) continue;
    anyDb[method] = (...args: unknown[]) => {
      if (insideActiveTransaction) return original[method](...args);
      return runSerialized(() => original[method](...args));
    };
  }

  if (original.withTransactionAsync) {
    anyDb.withTransactionAsync = (callback: () => Promise<void>) =>
      runSerialized<unknown>(async () => {
        insideActiveTransaction = true;
        try {
          return await original.withTransactionAsync(callback);
        } finally {
          insideActiveTransaction = false;
        }
      });
  }

  return db;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA foreign_keys = ON;");
  // Have SQLite itself wait/retry for up to 5s when it can't immediately
  // get a lock, instead of failing the call the instant another statement
  // is mid-flight. Combined with the JS-side queue below, this is a second
  // safety net against "database is locked" errors.
  await db.execAsync("PRAGMA busy_timeout = 5000;");

  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion < SCHEMA_VERSION) {
    await db.withTransactionAsync(async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await db.execAsync(statement);
      }
    });
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }

  // `CREATE TABLE IF NOT EXISTS` above is a no-op for tables that already
  // exist on a device, so new columns added to an existing table need an
  // explicit ALTER here. Guarded with a column-existence check so this is
  // safe to run on every launch, on both old and fresh installs.
  await addColumnIfMissing(db, "pyrolysis_batches", "submission_status", "TEXT NOT NULL DEFAULT 'draft'");
  await addColumnIfMissing(db, "application_entries", "location_lat", "REAL");
  await addColumnIfMissing(db, "application_entries", "location_lng", "REAL");
  await addColumnIfMissing(db, "application_entries", "location_address", "TEXT");

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

  await addColumnIfMissing(db, "soil_reports", "document_url", "TEXT");
  await addColumnIfMissing(db, "soil_reports", "server_id", "TEXT");

  return serializeDbMethods(db);
}

async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
) {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (columns.some((row) => row.name === column)) return;
  await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/** Singleton db handle. Every service calls this before touching SQLite. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate();
  }
  return dbPromise;
}
