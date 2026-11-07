import * as FileSystem from "expo-file-system/legacy";
import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const PLAIN_DB = "dmrv.db";
const SEALED_DB = "dmrv-sealed.db";
const PROBE_DB = "cipher-probe.db";
const KEY_ACCOUNT = "dmrv-sqlite-key";

let encrypted = false;

export function isOfflineDatabaseEncrypted(): boolean {
  return encrypted;
}

function databaseFile(name: string): string | null {
  const directory = SQLite.defaultDatabaseDirectory;
  if (!directory) return null;
  return directory.endsWith("/") ? `${directory}${name}` : `${directory}/${name}`;
}

function sqlitePath(name: string): string | null {
  const file = databaseFile(name);
  if (!file) return null;
  return file.startsWith("file://") ? decodeURIComponent(file.slice("file://".length)) : file;
}

async function fileExists(name: string): Promise<boolean> {
  const path = databaseFile(name);
  if (!path) return false;
  const info = await FileSystem.getInfoAsync(path);
  return info.exists;
}

async function databaseKey(): Promise<string | null> {
  try {
    const existing = await SecureStore.getItemAsync(KEY_ACCOUNT);
    if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;

    const bytes = await Crypto.getRandomBytesAsync(32);
    const hex = Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    await SecureStore.setItemAsync(KEY_ACCOUNT, hex, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return hex;
  } catch {
    // The installed app was built before the keystore module. Keep the
    // plaintext database until the next native build.
    return null;
  }
}

async function sqlCipherAvailable(): Promise<boolean> {
  const probe = await SQLite.openDatabaseAsync(PROBE_DB, { useNewConnection: true });
  try {
    const row = await probe.getFirstAsync<Record<string, unknown>>("PRAGMA cipher_version");
    const version = row ? Object.values(row)[0] : null;
    return typeof version === "string" && version.length > 0;
  } catch {
    return false;
  } finally {
    await probe.closeAsync().catch(() => undefined);
    await SQLite.deleteDatabaseAsync(PROBE_DB).catch(() => undefined);
  }
}

async function openSealed(key: string): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(SEALED_DB, { useNewConnection: true });
  await db.execAsync(`PRAGMA key = "x'${key}'"`);
  // Confirms the key and that this binary is actually SQLCipher.
  await db.getFirstAsync("SELECT count(*) AS n FROM sqlite_master");
  return db;
}

async function migratePlainDatabase(key: string): Promise<void> {
  const sealedPath = sqlitePath(SEALED_DB);
  if (!sealedPath) throw new Error("SQLite directory is not available.");

  if (await fileExists(SEALED_DB)) {
    await SQLite.deleteDatabaseAsync(SEALED_DB).catch(() => undefined);
  }

  const plain = await SQLite.openDatabaseAsync(PLAIN_DB, { useNewConnection: true });
  try {
    await plain.execAsync("PRAGMA wal_checkpoint(TRUNCATE)");
    const quotedPath = sealedPath.replace(/'/g, "''");
    await plain.execAsync(`ATTACH DATABASE '${quotedPath}' AS encrypted KEY "x'${key}'"`);
    await plain.execAsync("SELECT sqlcipher_export('encrypted')");
    await plain.execAsync("DETACH DATABASE encrypted");
  } finally {
    await plain.closeAsync().catch(() => undefined);
  }

  const check = await openSealed(key);
  await check.closeAsync();
  await SQLite.deleteDatabaseAsync(PLAIN_DB);
}

/**
 * Opens the local database. When this build includes SQLCipher, the file is
 * encrypted with a key that stays in the device keystore. An older plaintext
 * file is copied into the encrypted database and then removed.
 * A build without SQLCipher keeps the existing plaintext file.
 */
export async function openAppDatabase(): Promise<SQLite.SQLiteDatabase> {
  encrypted = false;
  if (Platform.OS === "web" || !SQLite.defaultDatabaseDirectory) {
    return SQLite.openDatabaseAsync(PLAIN_DB);
  }

  const cipher = await sqlCipherAvailable();
  const key = cipher ? await databaseKey() : null;
  if (!cipher || !key) {
    return SQLite.openDatabaseAsync(PLAIN_DB);
  }

  const sealedExists = await fileExists(SEALED_DB);
  const plainExists = await fileExists(PLAIN_DB);

  try {
    if (!sealedExists && plainExists) {
      await migratePlainDatabase(key);
    }
    const db = await openSealed(key);
    encrypted = true;
    return db;
  } catch (err) {
    console.warn("[db] encrypted database was not opened:", err);
    if (await fileExists(PLAIN_DB)) {
      await SQLite.deleteDatabaseAsync(SEALED_DB).catch(() => undefined);
    }
    return SQLite.openDatabaseAsync(PLAIN_DB);
  }
}
