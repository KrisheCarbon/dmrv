import {
  kontikkiWorkflowProgress,
  type PyrolysisBatchRecord,
  type PyrolysisKontikkiOption,
  type PyrolysisKontikkiWorkflowSection,
  type PyrolysisSessionRecord,
  type PyrolysisStep,
  type PyrolysisKontikkiData,
} from "@krishecarbon/shared";
import { getDb } from "../database/db";
import { buildInsert, buildUpdate, generateId } from "../database/sqlHelpers";
import {
  pyrolysisBatchToRow,
  pyrolysisSessionToRow,
  rowToPyrolysisBatch,
  rowToPyrolysisSession,
  syncQueueItemToRow,
  type PyrolysisBatch,
  type PyrolysisSession,
} from "../database/types";
import {
  fetchMobileNetworkOverview,
  backendFetch,
  type MobileNetworkOverview,
  type NetworkKontikki,
} from "./backendApi";
import {
  applyBatchPayload,
  assembleBatchPayload,
  batchToApiRecord,
} from "./batchData";
import { uploadPyrolysisBatchPhotos } from "../utils/pyrolysisPhotoUpload";
import {
  isInfoSectionComplete,
  isMoistureSectionComplete,
  isSampleSectionComplete,
  isYieldSectionComplete,
  sectionCompletionPayload,
} from "../utils/pyrolysisSectionValidation";
import { getCurrentIST } from "./trustedtime";

const LOCAL_SYNC_STATUS = "local";

export type SessionKontikkiView = {
  id: string;
  sessionId: string;
  serverId: string | null;
  kontikkiId: string;
  kontikkiCode: string;
  producerName: string | null;
  infoCompleted: boolean;
  moistureCompleted: boolean;
  pyrolysisCompleted: boolean;
  sampleCompleted: boolean;
  payload: PyrolysisKontikkiData;
  submissionStatus: string;
  uploadStatus: string;
  syncError: string | null;
  reviewStatus: string | null;
  reviewerNotes: string | null;
  createdAt: number;
  updatedAt: number;
};

function toView(batch: PyrolysisBatch, payload: PyrolysisKontikkiData): SessionKontikkiView {
  return {
    id: batch.id,
    sessionId: batch.sessionId,
    serverId: batch.serverId,
    kontikkiId: batch.kontikkiId,
    kontikkiCode: batch.kontikkiCode,
    producerName: batch.producerName,
    infoCompleted: batch.infoCompleted,
    moistureCompleted: batch.moistureCompleted,
    pyrolysisCompleted: batch.pyrolysisCompleted,
    sampleCompleted: batch.sampleCompleted,
    payload,
    submissionStatus: batch.submissionStatus,
    uploadStatus: batch.uploadStatus,
    syncError: batch.syncError,
    reviewStatus: batch.reviewStatus,
    reviewerNotes: batch.reviewerNotes,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
  };
}

async function triggerBackgroundSync() {
  const { processSyncQueue } = await import("./syncService");
  void processSyncQueue();
}

async function findSessionOrThrow(sessionId: string): Promise<PyrolysisSession> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    "SELECT * FROM pyrolysis_sessions WHERE id = ?",
    [sessionId],
  );
  if (!row) {
    throw new Error(`Pyrolysis session with id ${sessionId} not found`);
  }
  return rowToPyrolysisSession(row);
}

async function findBatchOrThrow(batchId: string): Promise<PyrolysisBatch> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    "SELECT * FROM pyrolysis_batches WHERE id = ?",
    [batchId],
  );
  if (!row) {
    throw new Error(`Pyrolysis batch with id ${batchId} not found`);
  }
  return rowToPyrolysisBatch(row);
}

export function mapNetworkKontikki(row: NetworkKontikki): PyrolysisKontikkiOption {
  return {
    id: row.id,
    kontikki_code: row.kontikki_code,
    status: row.status,
    biochar_producer_id: row.biochar_producer_id,
    producer_name: row.producer?.name ?? null,
    capacity: row.capacity ?? null,
  };
}

export async function fetchAvailableKontikkis(): Promise<{
  kontikkis: PyrolysisKontikkiOption[];
  occupiedIds: Set<string>;
}> {
  const overview: MobileNetworkOverview = await fetchMobileNetworkOverview();
  const occupiedIds = await getLocallyOccupiedKontikkiIds();
  // Show every kontikki assigned to this user (active or inactive) so they can
  // see what they have access to. The UI disables selection of anything that
  // isn't "active" — only active kontikkis can actually be used for a batch.
  const kontikkis = overview.kontikkis.map(mapNetworkKontikki);

  return { kontikkis, occupiedIds };
}

export async function getLocallyOccupiedKontikkiIds(): Promise<Set<string>> {
  const db = await getDb();
  // A kontikki stays reserved while it belongs to an active session — unless
  // its own entry has already been submitted *and* synced. That way a
  // kontikki frees up for the next batch as soon as its data is safely on
  // the server, without waiting for the rest of the session to finish.
  const rows = await db.getAllAsync<{ kontikki_id: string }>(
    `SELECT b.kontikki_id as kontikki_id
     FROM pyrolysis_batches b
     JOIN pyrolysis_sessions s ON s.id = b.session_id
     WHERE s.status = ?
       AND NOT (b.submission_status = ? AND b.sync_status = ?)`,
    ["active", "submitted", "synced"],
  );

  return new Set(rows.map((row) => row.kontikki_id));
}

export async function listPyrolysisSessions(operatorId: string): Promise<PyrolysisSession[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM pyrolysis_sessions WHERE operator_id = ? ORDER BY created_at DESC",
    [operatorId],
  );
  return rows.map(rowToPyrolysisSession);
}

export async function getPyrolysisSession(sessionId: string): Promise<PyrolysisSession> {
  return findSessionOrThrow(sessionId);
}

export async function getSessionKontikkis(sessionId: string): Promise<SessionKontikkiView[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM pyrolysis_batches WHERE session_id = ? ORDER BY kontikki_code ASC",
    [sessionId],
  );

  const views: SessionKontikkiView[] = [];
  for (const row of rows) {
    const batch = rowToPyrolysisBatch(row);
    const payload = await assembleBatchPayload(batch.id);
    views.push(toView(batch, payload));
  }
  return views;
}

export async function refreshPyrolysisReviewStatuses() {
  const remote = await backendFetch<
    Array<{
      batch_id: string;
      review_status: string;
      reviewer_notes: string | null;
    }>
  >("/pyrolysis-sessions/review-statuses");

  const byServerId = new Map(
    remote.map((row) => [row.batch_id, row] as const),
  );
  if (byServerId.size === 0) return;

  const db = await getDb();
  const locals = await db.getAllAsync<any>("SELECT * FROM pyrolysis_batches");

  for (const row of locals) {
    const batch = rowToPyrolysisBatch(row);
    if (!batch.serverId) continue;
    const next = byServerId.get(batch.serverId);
    if (!next) continue;
    const reviewStatus = next.review_status || "pending";
    const reviewerNotes = next.reviewer_notes ?? null;
    if (batch.reviewStatus === reviewStatus && batch.reviewerNotes === reviewerNotes) {
      continue;
    }

    await db.runAsync(
      "UPDATE pyrolysis_batches SET review_status = ?, reviewer_notes = ? WHERE id = ?",
      [reviewStatus, reviewerNotes, batch.id],
    );
  }
}

export async function createPyrolysisSessionLocal(
  operatorId: string,
  selected: PyrolysisKontikkiOption[],
): Promise<string> {
  const db = await getDb();
  const now = Date.now();
  const sessionId = generateId();

  await db.withTransactionAsync(async () => {
    const sessionRow = pyrolysisSessionToRow({
      serverId: null,
      operatorId,
      status: "active",
      currentStep: "info",
      uploadStatus: LOCAL_SYNC_STATUS,
      syncError: null,
      createdAt: now,
      updatedAt: now,
    });
    const sessionInsert = buildInsert("pyrolysis_sessions", { id: sessionId, ...sessionRow });
    await db.runAsync(sessionInsert.sql, sessionInsert.args);

    for (const kontikki of selected) {
      const batchRow = pyrolysisBatchToRow({
        sessionId,
        serverId: null,
        kontikkiId: kontikki.id,
        kontikkiCode: kontikki.kontikki_code,
        producerName: kontikki.producer_name ?? null,
        batchNumber: null,
        feedstockQuantity: null,
        avgFeedstockSizeCm: null,
        feedstockId: null,
        feedstockName: null,
        locationLat: null,
        locationLng: null,
        locationAddress: null,
        feedstockPhotoLocalUri: null,
        feedstockPhotoUrl: null,
        feedstockSizePhotoLocalUri: null,
        feedstockSizePhotoUrl: null,
        feedstockPhotoMetadataJson: null,
        feedstockSizePhotoMetadataJson: null,
        moistureReading1: null,
        moistureReading2: null,
        moistureReading3: null,
        moistureReading4: null,
        moistureReading5: null,
        moisturePhotoLocalUri1: null,
        moisturePhotoLocalUri2: null,
        moisturePhotoLocalUri3: null,
        moisturePhotoLocalUri4: null,
        moisturePhotoLocalUri5: null,
        moisturePhotoUrl1: null,
        moisturePhotoUrl2: null,
        moisturePhotoUrl3: null,
        moisturePhotoUrl4: null,
        moisturePhotoUrl5: null,
        moisturePhotoMetadataJson1: null,
        moisturePhotoMetadataJson2: null,
        moisturePhotoMetadataJson3: null,
        moisturePhotoMetadataJson4: null,
        moisturePhotoMetadataJson5: null,
        stageInitialPhotoLocalUri: null,
        stageMiddlePhotoLocalUri: null,
        stageFinalPhotoLocalUri: null,
        stageQuenchingPhotoLocalUri: null,
        stageInitialPhotoUrl: null,
        stageMiddlePhotoUrl: null,
        stageFinalPhotoUrl: null,
        stageQuenchingPhotoUrl: null,
        stageInitialCapturedAt: null,
        stageMiddleCapturedAt: null,
        stageFinalCapturedAt: null,
        stageQuenchingCapturedAt: null,
        stageInitialSavedAt: null,
        stageMiddleSavedAt: null,
        stageFinalSavedAt: null,
        stageQuenchingSavedAt: null,
        stageInitialPhotoMetadataJson: null,
        stageMiddlePhotoMetadataJson: null,
        stageFinalPhotoMetadataJson: null,
        stageQuenchingPhotoMetadataJson: null,
        infoCompleted: false,
        moistureCompleted: false,
        pyrolysisCompleted: false,
        infoSavedAt: null,
        moistureSavedAt: null,
        pyrolysisSavedAt: null,
        yieldSavedAt: null,
        yieldPercent: null,
        comment: null,
        sampleId: null,
        samplePhotoLocalUri: null,
        samplePhotoUrl: null,
        samplePhotoMetadataJson: null,
        sampleSavedAt: null,
        sampleCompleted: false,
        reviewStatus: null,
        reviewerNotes: null,
        submissionStatus: "draft",
        uploadStatus: LOCAL_SYNC_STATUS,
        syncError: null,
        createdAt: now,
        updatedAt: now,
      });

      const batchInsert = buildInsert("pyrolysis_batches", { id: generateId(), ...batchRow });
      await db.runAsync(batchInsert.sql, batchInsert.args);
    }
  });

  return sessionId;
}

export async function sessionStepIsComplete(
  sessionId: string,
  step: PyrolysisStep,
): Promise<boolean> {
  const rows = await getSessionKontikkis(sessionId);
  if (rows.length === 0) return false;

  if (step === "info") return rows.every((row) => row.infoCompleted);
  if (step === "moisture") return rows.every((row) => row.moistureCompleted);
  if (step === "pyrolysis") return rows.every((row) => row.pyrolysisCompleted);
  return true;
}

export type PyrolysisKontikkiSection = PyrolysisKontikkiWorkflowSection;

function sectionTimestamp(): string {
  try {
    return getCurrentIST();
  } catch {
    return new Date().toISOString();
  }
}

function buildMergedDraft(
  current: PyrolysisKontikkiData,
  section: PyrolysisKontikkiSection,
  payload: Partial<PyrolysisKontikkiData>,
): PyrolysisKontikkiData {
  const savedAt = sectionTimestamp();
  const completionPatch = sectionCompletionPayload(section, { ...current, ...payload }, savedAt);

  return {
    ...current,
    ...payload,
    ...completionPatch,
    stage_saved_at: {
      ...(current.stage_saved_at ?? {}),
      ...(payload.stage_saved_at ?? {}),
      ...(completionPatch.stage_saved_at ?? {}),
    },
    stage_photos: payload.stage_photos
      ? { ...(current.stage_photos ?? {}), ...payload.stage_photos }
      : current.stage_photos,
    moisture_readings: payload.moisture_readings ?? current.moisture_readings,
  };
}

function sectionCompletionFlags(
  section: PyrolysisKontikkiSection,
  merged: PyrolysisKontikkiData,
): {
  infoCompleted?: boolean;
  moistureCompleted?: boolean;
  pyrolysisCompleted?: boolean;
  sampleCompleted?: boolean;
} {
  if (section === "info") {
    return { infoCompleted: isInfoSectionComplete(merged) };
  }
  if (section === "moisture") {
    return { moistureCompleted: isMoistureSectionComplete(merged.moisture_readings ?? []) };
  }
  if (section === "yield") {
    return { pyrolysisCompleted: isYieldSectionComplete(merged) };
  }
  if (section === "sample") {
    return { sampleCompleted: isSampleSectionComplete(merged) };
  }
  return {};
}

export async function autoSaveKontikkiSectionLocal(
  sessionId: string,
  kontikkiRowId: string,
  section: PyrolysisKontikkiSection,
  payload: Partial<PyrolysisKontikkiData>,
) {
  const db = await getDb();
  const current = await assembleBatchPayload(kontikkiRowId);
  const merged = buildMergedDraft(current, section, payload);
  const now = Date.now();

  await applyBatchPayload(kontikkiRowId, merged);

  const flags = sectionCompletionFlags(section, merged);
  const patch: Record<string, unknown> = { updated_at: now };
  if (flags.infoCompleted != null) patch.info_completed = flags.infoCompleted ? 1 : 0;
  if (flags.moistureCompleted != null) patch.moisture_completed = flags.moistureCompleted ? 1 : 0;
  if (flags.pyrolysisCompleted != null) patch.pyrolysis_completed = flags.pyrolysisCompleted ? 1 : 0;
  if (flags.sampleCompleted != null) patch.sample_completed = flags.sampleCompleted ? 1 : 0;

  const { sql, args } = buildUpdate("pyrolysis_batches", patch, "id = ?", [kontikkiRowId]);
  await db.runAsync(sql, args);

  await maybeAdvanceSessionStep(sessionId);
}

export async function saveKontikkiSectionLocal(
  sessionId: string,
  kontikkiRowId: string,
  section: PyrolysisKontikkiSection,
  payload: Partial<PyrolysisKontikkiData>,
) {
  const db = await getDb();
  const now = Date.now();

  await applyBatchPayload(kontikkiRowId, payload);

  const patch: Record<string, unknown> = { updated_at: now };
  if (section === "info") patch.info_completed = 1;
  if (section === "moisture") patch.moisture_completed = 1;
  if (section === "yield") patch.pyrolysis_completed = 1;
  if (section === "sample") patch.sample_completed = 1;

  const { sql, args } = buildUpdate("pyrolysis_batches", patch, "id = ?", [kontikkiRowId]);
  await db.runAsync(sql, args);

  await maybeAdvanceSessionStep(sessionId);
}

async function maybeAdvanceSessionStep(sessionId: string) {
  const db = await getDb();
  const session = await findSessionOrThrow(sessionId);
  const rows = await getSessionKontikkis(sessionId);

  let nextStep: PyrolysisStep = "info";
  if (rows.every((row) => row.sampleCompleted)) {
    nextStep = "complete";
  } else if (rows.every((row) => row.moistureCompleted)) {
    nextStep = "pyrolysis";
  } else if (rows.every((row) => row.infoCompleted)) {
    nextStep = "moisture";
  }

  if (session.currentStep === nextStep) return;

  await db.runAsync(
    "UPDATE pyrolysis_sessions SET current_step = ?, updated_at = ? WHERE id = ?",
    [nextStep, Date.now(), sessionId],
  );
}

/**
 * Marks the given kontikki entries as submitted (queuing them for sync) and
 * leaves everything else untouched. Kontikkis left out of `batchRowIds`
 * (e.g. missing a photo) stay as drafts — still reserved for this session,
 * still editable, and can be submitted later or deleted instead.
 */
export async function submitSelectedKontikkisLocal(
  sessionId: string,
  batchRowIds: string[],
) {
  if (batchRowIds.length === 0) {
    throw new Error("Select at least one kontikki to submit.");
  }

  const db = await getDb();
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    for (const batchRowId of batchRowIds) {
      await db.runAsync(
        "UPDATE pyrolysis_batches SET submission_status = ?, sync_status = ?, sync_error = NULL, updated_at = ? WHERE id = ? AND session_id = ?",
        ["submitted", "pending", now, batchRowId, sessionId],
      );
    }

    const remainingDrafts = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM pyrolysis_batches WHERE session_id = ? AND submission_status = ?",
      [sessionId, "draft"],
    );

    if ((remainingDrafts?.count ?? 0) === 0) {
      await db.runAsync(
        "UPDATE pyrolysis_sessions SET status = ?, current_step = ?, sync_status = ?, sync_error = NULL, updated_at = ? WHERE id = ?",
        ["completed", "complete", "pending", now, sessionId],
      );
    } else {
      await db.runAsync(
        "UPDATE pyrolysis_sessions SET sync_status = ?, sync_error = NULL, updated_at = ? WHERE id = ?",
        ["pending", now, sessionId],
      );
    }
  });

  await enqueuePyrolysisBatchSync(sessionId);
  void triggerBackgroundSync();
}

/**
 * Permanently removes a kontikki entry from a batch before it's submitted,
 * freeing that kontikki up immediately (e.g. skipped/abandoned entries).
 * Already-submitted entries can't be deleted this way.
 */
export async function deleteSessionKontikkiLocal(
  sessionId: string,
  batchRowId: string,
): Promise<{ sessionDeleted: boolean }> {
  const db = await getDb();
  const batch = await findBatchOrThrow(batchRowId);

  if (batch.sessionId !== sessionId) {
    throw new Error("This kontikki does not belong to this batch.");
  }
  if (batch.submissionStatus === "submitted") {
    throw new Error("This kontikki has already been submitted and can't be deleted.");
  }

  if (batch.serverId) {
    try {
      const session = await findSessionOrThrow(sessionId);
      if (session.serverId) {
        await backendFetch(
          `/pyrolysis-sessions/${session.serverId}/batches/${batch.serverId}`,
          { method: "DELETE" },
        );
      }
    } catch {
      // Best-effort — the kontikki is freed locally either way; a stale
      // draft row on the server will simply be ignored on the next sync.
    }
  }

  await db.runAsync("DELETE FROM pyrolysis_batches WHERE id = ?", [batchRowId]);

  const remaining = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM pyrolysis_batches WHERE session_id = ?",
    [sessionId],
  );

  if ((remaining?.count ?? 0) === 0) {
    await db.runAsync(
      "DELETE FROM sync_queue WHERE entity_local_id = ? AND entity_type = ?",
      [sessionId, "pyrolysis_session"],
    );
    await db.runAsync("DELETE FROM pyrolysis_sessions WHERE id = ?", [sessionId]);
    return { sessionDeleted: true };
  }

  return { sessionDeleted: false };
}

export function kontikkiSectionProgress(row: SessionKontikkiView): number {
  return kontikkiWorkflowProgress(
    {
      infoCompleted: row.infoCompleted,
      moistureCompleted: row.moistureCompleted,
      pyrolysisCompleted: row.pyrolysisCompleted,
      sampleCompleted: row.sampleCompleted,
    },
    row.payload,
  );
}

async function enqueuePyrolysisBatchSync(sessionLocalId: string) {
  const db = await getDb();

  const existing = await db.getAllAsync<any>(
    "SELECT * FROM sync_queue WHERE entity_local_id = ? AND entity_type = ?",
    [sessionLocalId, "pyrolysis_session"],
  );

  const pending = existing.find((item) => item.status === "pending");
  if (pending) return;

  const failed = existing.find((item) => item.status === "failed");
  if (failed) {
    await db.runAsync(
      "UPDATE sync_queue SET status = ?, retries = ?, error_message = NULL WHERE id = ?",
      ["pending", 0, failed.id],
    );
    return;
  }

  const row = syncQueueItemToRow({
    entityType: "pyrolysis_session",
    entityLocalId: sessionLocalId,
    operation: "complete",
    status: "pending",
    retries: 0,
    errorMessage: null,
    createdAt: Date.now(),
  });
  const { sql, args } = buildInsert("sync_queue", { id: generateId(), ...row });
  await db.runAsync(sql, args);
}

function sanitizeApiBatchPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...payload };
  if (next.feedstock_id === "") next.feedstock_id = null;
  return next;
}

async function resolveServerPyrolysisSession(
  session: PyrolysisSession,
  batches: PyrolysisBatch[],
): Promise<{
  serverSession: PyrolysisSessionRecord;
  serverBatchesByKontikki: Map<string, PyrolysisBatchRecord>;
}> {
  const kontikkiIds = batches.map((row) => row.kontikkiId);

  if (session.serverId) {
    const existing = await backendFetch<PyrolysisSessionRecord>(
      `/pyrolysis-sessions/${session.serverId}`,
    );
    return {
      serverSession: existing,
      serverBatchesByKontikki: new Map(
        existing.batches.map((row) => [row.kontikki_id, row]),
      ),
    };
  }

  try {
    const created = await backendFetch<PyrolysisSessionRecord>(
      "/pyrolysis-sessions/start",
      {
        method: "POST",
        body: JSON.stringify({ kontikki_ids: kontikkiIds }),
      },
    );
    return {
      serverSession: created,
      serverBatchesByKontikki: new Map(
        created.batches.map((row) => [row.kontikki_id, row]),
      ),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/active batch|already in an active/i.test(message)) {
      throw err;
    }

    const list = await backendFetch<PyrolysisSessionRecord[]>("/pyrolysis-sessions");
    const resumed = list.find((row) => {
      if (row.status !== "active") return false;
      const ids = new Set(row.batches.map((batch) => batch.kontikki_id));
      return kontikkiIds.every((id) => ids.has(id));
    });

    if (!resumed) throw err;

    return {
      serverSession: resumed,
      serverBatchesByKontikki: new Map(
        resumed.batches.map((row) => [row.kontikki_id, row]),
      ),
    };
  }
}

async function persistServerSessionMapping(
  session: PyrolysisSession,
  batches: PyrolysisBatch[],
  serverSession: PyrolysisSessionRecord,
  serverBatchesByKontikki: Map<string, PyrolysisBatchRecord>,
) {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE pyrolysis_sessions SET server_id = ?, updated_at = ? WHERE id = ?",
      [serverSession.id, Date.now(), session.id],
    );

    for (const localBatch of batches) {
      const serverBatch = serverBatchesByKontikki.get(localBatch.kontikkiId);
      if (!serverBatch) continue;

      await db.runAsync(
        "UPDATE pyrolysis_batches SET server_id = ?, updated_at = ? WHERE id = ?",
        [serverBatch.id, Date.now(), localBatch.id],
      );
    }
  });
}

export async function syncPyrolysisBatch(session: PyrolysisSession) {
  const db = await getDb();
  const batchRows = await db.getAllAsync<any>(
    "SELECT * FROM pyrolysis_batches WHERE session_id = ?",
    [session.id],
  );
  const batches = batchRows.map(rowToPyrolysisBatch);

  const { serverSession, serverBatchesByKontikki } =
    await resolveServerPyrolysisSession(session, batches);

  const serverId = serverSession.id;
  await persistServerSessionMapping(session, batches, serverSession, serverBatchesByKontikki);

  // Draft (not-yet-submitted) kontikkis stay local-only — only submitted
  // ones get their data uploaded and marked synced.
  const submittedBatches = batches.filter((batch) => batch.submissionStatus === "submitted");

  for (const localBatch of submittedBatches) {
    const serverBatch = serverBatchesByKontikki.get(localBatch.kontikkiId);
    const serverBatchId = serverBatch?.id;
    if (!serverBatchId) {
      throw new Error(`Server batch missing for kontikki ${localBatch.kontikkiCode}.`);
    }

    let payload = await assembleBatchPayload(localBatch.id);
    payload = await uploadPyrolysisBatchPhotos(serverBatchId, localBatch.id, payload);

    const apiRecord = batchToApiRecord(localBatch, payload);
    apiRecord.id = serverBatchId;
    apiRecord.submission_status = "submitted";

    await backendFetch(`/pyrolysis-sessions/${serverId}/batches/${serverBatchId}`, {
      method: "PATCH",
      body: JSON.stringify(
        sanitizeApiBatchPayload({
          ...apiRecord,
          id: undefined,
          session_id: undefined,
          kontikki_id: undefined,
          kontikki_code: undefined,
          created_at: undefined,
          updated_at: undefined,
        }),
      ),
    });

    await applyBatchPayload(localBatch.id, payload);

    await db.runAsync(
      "UPDATE pyrolysis_batches SET server_id = ?, sync_status = ?, sync_error = NULL, review_status = COALESCE(review_status, ?), updated_at = ? WHERE id = ?",
      [serverBatchId, "synced", "pending", Date.now(), localBatch.id],
    );
  }

  const hasRemainingDrafts = batches.some((batch) => batch.submissionStatus !== "submitted");

  if (!hasRemainingDrafts && serverSession.status !== "completed") {
    await backendFetch(`/pyrolysis-sessions/${serverId}/step`, {
      method: "PATCH",
      body: JSON.stringify({ current_step: "complete" }),
    });

    await backendFetch(`/pyrolysis-sessions/${serverId}/complete`, {
      method: "POST",
    });
  }

  await db.runAsync(
    "UPDATE pyrolysis_sessions SET server_id = ?, sync_status = ?, sync_error = NULL, updated_at = ? WHERE id = ?",
    [serverId, "synced", Date.now(), session.id],
  );
}
