import { Q } from '@nozbe/watermelondb';
import { database } from '../../database';
import EncryptedBatch from '../../database/models/EncryptedBatch';
import { parseKilnBatchBytes } from '../../utils/kilnBatch';
import { backendFetch } from '../backendApi';

interface SyncKilnBatchResponse {
  id: string;
  batchName: string;
  dataPointCount?: number;
  alreadySynced?: boolean;
}

interface SyncErrorBody {
  reason?: string;
  message?: string;
}

type PushBatchResult =
  | { ok: true }
  | { ok: false; corrupt: boolean; error: string; reason?: string };

async function pushSingleBatch(record: EncryptedBatch): Promise<PushBatchResult> {
  const batchJson = record.payloadBase64 ?? '';

  if (!batchJson.trim()) {
    return {
      ok: false,
      corrupt: true,
      error: `"${record.sourceFilename}" has an empty payload.`,
    };
  }

  if (!record.kontikkiId?.trim()) {
    return {
      ok: false,
      corrupt: false,
      error:
        'Missing kontikki assignment for this batch. Re-download from the kiln sensor.',
    };
  }

  let batch;
  try {
    batch = parseKilnBatchBytes(new TextEncoder().encode(batchJson));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      corrupt: true,
      error: `"${record.sourceFilename}" is invalid: ${message}`,
    };
  }

  try {
    await backendFetch<SyncKilnBatchResponse>('/kiln-batches/sync', {
      method: 'POST',
      body: JSON.stringify({
        localId: record.id,
        kilnId: record.kilnId,
        kontikkiId: record.kontikkiId,
        sourceFilename: record.sourceFilename,
        batch,
        receivedAt: record.createdAt.getTime(),
      }),
    });

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isCorrupt = message.includes('invalid_json');

    let reason: string | undefined;

    try {
      const jsonStart = message.indexOf('{');
      if (jsonStart >= 0) {
        const parsed = JSON.parse(message.slice(jsonStart)) as SyncErrorBody;
        reason = parsed.reason;
      }
    } catch {
      // Non-JSON error body.
    }

    return {
      ok: false,
      corrupt: isCorrupt,
      reason,
      error: message,
    };
  }
}

export async function syncEncryptedKilnBatches(): Promise<{
  pushed: number;
  failed?: number;
  corruptFilenames?: string[];
  error?: string;
}> {
  const unsynced = await database
    .get<EncryptedBatch>('encrypted_batches')
    .query(Q.where('is_synced', false), Q.sortBy('created_at', Q.asc))
    .fetch();

  if (unsynced.length === 0) return { pushed: 0 };

  let pushed = 0;
  const corruptFilenames: string[] = [];
  let lastNetworkError: string | undefined;

  for (const record of unsynced) {
    const result = await pushSingleBatch(record);

    if (result.ok === false) {
      if (result.corrupt) {
        console.warn(`[Kiln sync] Invalid batch "${record.sourceFilename}": ${result.error}`);
        corruptFilenames.push(record.sourceFilename);
      } else {
        lastNetworkError = result.error;
        console.error("[Kiln sync] Aborting — network/server error:", result.error);
        break;
      }
    } else {
      await database.write(async () => {
        await record.update((r) => {
          r.isSynced = true;
        });
      });
      pushed += 1;
    }
  }

  let error: string | undefined;
  if (lastNetworkError) {
    error =
      pushed > 0
        ? `Uploaded ${pushed}, then hit a network/server error: ${lastNetworkError}`
        : `Could not reach the backend: ${lastNetworkError}`;
  } else if (corruptFilenames.length > 0) {
    error =
      `${corruptFilenames.length} batch(es) were invalid and were skipped: ` +
      `${corruptFilenames.join(', ')}. Delete them and download again from the kiln.` +
      (pushed > 0 ? ` ${pushed} valid batch(es) uploaded successfully.` : '');
  }

  return {
    pushed,
    failed: corruptFilenames.length || undefined,
    corruptFilenames: corruptFilenames.length ? corruptFilenames : undefined,
    error,
  };
}

export async function syncSingleEncryptedBatch(batch: EncryptedBatch) {
  const result = await pushSingleBatch(batch);

  if (result.ok === false) {
    throw new Error(result.error);
  }

  await database.write(async () => {
    await batch.update((r) => {
      r.isSynced = true;
    });
  });
}
