import { getDb } from "../../database/db";
import { buildInsert, generateId } from "../../database/sqlHelpers";
import { encryptedBatchToRow, rowToEncryptedBatch, type EncryptedBatch } from "../../database/types";
import { parseKilnBatchBytes } from "../../utils/kilnBatch";

export async function queueKilnBatch(
  kilnId: string,
  sourceFilename: string,
  batchJson: string,
  kontikkiId?: string | null,
): Promise<EncryptedBatch | null> {
  parseKilnBatchBytes(new TextEncoder().encode(batchJson));

  const db = await getDb();
  const existingRow = await db.getFirstAsync<any>(
    "SELECT * FROM encrypted_batches WHERE source_filename = ?",
    [sourceFilename],
  );

  if (existingRow) {
    const existing = rowToEncryptedBatch(existingRow);

    if (existing.isSynced) {
      console.info(
        `[Kiln] "${sourceFilename}" already synced (id=${existing.id}). Skipping.`,
      );
      return null;
    }

    await db.runAsync(
      "UPDATE encrypted_batches SET kiln_id = ?, kontikki_id = ?, payload_base64 = ?, is_synced = 0 WHERE id = ?",
      [kilnId, kontikkiId ?? "", batchJson, existing.id],
    );

    return {
      ...existing,
      kilnId,
      kontikkiId: kontikkiId ?? "",
      payloadBase64: batchJson,
      isSynced: false,
    };
  }

  const id = generateId();
  const row = encryptedBatchToRow({
    kilnId,
    kontikkiId: kontikkiId ?? "",
    sourceFilename,
    payloadBase64: batchJson,
    isSynced: false,
  });

  const { sql, args } = buildInsert("encrypted_batches", { id, ...row });
  await db.runAsync(sql, args);

  const created = await db.getFirstAsync<any>("SELECT * FROM encrypted_batches WHERE id = ?", [id]);
  return rowToEncryptedBatch(created);
}

export async function deleteEncryptedBatch(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM encrypted_batches WHERE id = ?", [id]);
}

export async function deleteBatchesByFilenames(filenames: string[]): Promise<number> {
  if (filenames.length === 0) return 0;

  const db = await getDb();
  const placeholders = filenames.map(() => "?").join(", ");
  const rows = await db.getAllAsync<any>(
    `SELECT id FROM encrypted_batches WHERE source_filename IN (${placeholders})`,
    filenames,
  );

  if (rows.length === 0) return 0;

  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      await db.runAsync("DELETE FROM encrypted_batches WHERE id = ?", [row.id]);
    }
  });

  return rows.length;
}

export async function fetchAllEncryptedBatches(): Promise<EncryptedBatch[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM encrypted_batches ORDER BY created_at DESC",
  );
  return rows.map(rowToEncryptedBatch);
}

export async function fetchUnsyncedEncryptedBatches(): Promise<EncryptedBatch[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM encrypted_batches WHERE is_synced = 0 ORDER BY created_at ASC",
  );
  return rows.map(rowToEncryptedBatch);
}
