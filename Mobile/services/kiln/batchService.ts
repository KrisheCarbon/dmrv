import { Q } from '@nozbe/watermelondb';
import { database } from '../../database';
import EncryptedBatch from '../../database/models/EncryptedBatch';
import { parseKilnBatchBytes } from '../../utils/kilnBatch';

export async function queueKilnBatch(
  kilnId: string,
  sourceFilename: string,
  batchJson: string,
  kontikkiId?: string | null,
): Promise<EncryptedBatch | null> {
  parseKilnBatchBytes(new TextEncoder().encode(batchJson));

  const existing = await database
    .get<EncryptedBatch>('encrypted_batches')
    .query(Q.where('source_filename', sourceFilename))
    .fetch();

  if (existing.length > 0) {
    const record = existing[0];

    if (record.isSynced) {
      console.info(
        `[Kiln] "${sourceFilename}" already synced (id=${record.id}). Skipping.`,
      );
      return null;
    }

    await database.write(async () => {
      await record.update((r) => {
        r.kilnId = kilnId;
        r.kontikkiId = kontikkiId ?? '';
        r.payloadBase64 = batchJson;
        r.isSynced = false;
      });
    });
    return record;
  }

  return database.write(async () => {
    return database.get<EncryptedBatch>('encrypted_batches').create((record) => {
      record.kilnId = kilnId;
      record.kontikkiId = kontikkiId ?? '';
      record.sourceFilename = sourceFilename;
      record.payloadBase64 = batchJson;
      record.isSynced = false;
    });
  });
}

export async function deleteEncryptedBatch(id: string): Promise<void> {
  await database.write(async () => {
    const record = await database.get<EncryptedBatch>('encrypted_batches').find(id);
    await record.destroyPermanently();
  });
}

export async function deleteBatchesByFilenames(filenames: string[]): Promise<number> {
  if (filenames.length === 0) return 0;

  const records = await database
    .get<EncryptedBatch>('encrypted_batches')
    .query(Q.where('source_filename', Q.oneOf(filenames)))
    .fetch();

  if (records.length === 0) return 0;

  await database.write(async () => {
    for (const record of records) {
      await record.destroyPermanently();
    }
  });

  return records.length;
}

export async function fetchAllEncryptedBatches(): Promise<EncryptedBatch[]> {
  return database
    .get<EncryptedBatch>('encrypted_batches')
    .query(Q.sortBy('created_at', Q.desc))
    .fetch();
}

export async function fetchUnsyncedEncryptedBatches(): Promise<EncryptedBatch[]> {
  return database
    .get<EncryptedBatch>('encrypted_batches')
    .query(Q.where('is_synced', false), Q.sortBy('created_at', Q.asc))
    .fetch();
}
