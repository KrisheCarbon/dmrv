import { Q } from "@nozbe/watermelondb";
import {
  kontikkiWorkflowProgress,
  type PyrolysisBatchRecord,
  type PyrolysisKontikkiOption,
  type PyrolysisKontikkiWorkflowSection,
  type PyrolysisSessionRecord,
  type PyrolysisStep,
  type PyrolysisKontikkiData,
} from "@krishecarbon/shared";
import { database } from "../database";
import PyrolysisSession from "../database/models/PyrolysisSession";
import PyrolysisBatch from "../database/models/PyrolysisBatch";
import SyncQueue from "../database/models/SyncQueue";
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
  isStageSectionComplete,
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
  uploadStatus: string;
  syncError: string | null;
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
    uploadStatus: batch.uploadStatus,
    syncError: batch.syncError,
    updatedAt: batch.updatedAt,
  };
}

async function triggerBackgroundSync() {
  const { processSyncQueue } = await import("./syncService");
  void processSyncQueue();
}

function sessionsCollection() {
  return database.get<PyrolysisSession>("pyrolysis_sessions");
}

function batchesCollection() {
  return database.get<PyrolysisBatch>("pyrolysis_batches");
}

function syncQueueCollection() {
  return database.get<SyncQueue>("sync_queue");
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
  const kontikkis = overview.kontikkis
    .filter((row) => row.status === "active")
    .map(mapNetworkKontikki);

  return { kontikkis, occupiedIds };
}

export async function getLocallyOccupiedKontikkiIds(): Promise<Set<string>> {
  const activeSessions = await sessionsCollection()
    .query(Q.where("status", "active"))
    .fetch();

  const occupied = new Set<string>();

  for (const session of activeSessions) {
    const rows = await batchesCollection()
      .query(Q.where("session_id", session.id))
      .fetch();
    for (const row of rows) {
      occupied.add(row.kontikkiId);
    }
  }

  return occupied;
}

export async function listPyrolysisSessions(operatorId: string) {
  return sessionsCollection()
    .query(Q.where("operator_id", operatorId), Q.sortBy("created_at", Q.desc))
    .fetch();
}

export async function getPyrolysisSession(sessionId: string) {
  return sessionsCollection().find(sessionId);
}

export async function getSessionKontikkis(sessionId: string): Promise<SessionKontikkiView[]> {
  const batches = await batchesCollection()
    .query(Q.where("session_id", sessionId), Q.sortBy("kontikki_code", Q.asc))
    .fetch();

  const views: SessionKontikkiView[] = [];
  for (const batch of batches) {
    const payload = await assembleBatchPayload(batch.id);
    views.push(toView(batch, payload));
  }
  return views;
}

export async function createPyrolysisSessionLocal(
  operatorId: string,
  selected: PyrolysisKontikkiOption[],
) {
  const now = Date.now();
  let sessionId = "";

  await database.write(async () => {
    const session = await sessionsCollection().create((record) => {
      record.operatorId = operatorId;
      record.status = "active";
      record.currentStep = "info";
      record.uploadStatus = LOCAL_SYNC_STATUS;
      record.syncError = null;
      record.createdAt = now;
      record.updatedAt = now;
    });

    sessionId = session.id;

    for (const kontikki of selected) {
      await batchesCollection().create((record) => {
        record.sessionId = session.id;
        record.kontikkiId = kontikki.id;
        record.kontikkiCode = kontikki.kontikki_code;
        record.producerName = kontikki.producer_name ?? null;
        record.infoCompleted = false;
        record.moistureCompleted = false;
        record.pyrolysisCompleted = false;
        record.sampleCompleted = false;
        record.uploadStatus = LOCAL_SYNC_STATUS;
        record.syncError = null;
        record.createdAt = now;
        record.updatedAt = now;
      });
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
  const current = await assembleBatchPayload(kontikkiRowId);
  const merged = buildMergedDraft(current, section, payload);
  const now = Date.now();

  await applyBatchPayload(kontikkiRowId, merged);

  await database.write(async () => {
    const row = await batchesCollection().find(kontikkiRowId);
    const flags = sectionCompletionFlags(section, merged);

    await row.update((record) => {
      record.updatedAt = now;
      if (flags.infoCompleted != null) record.infoCompleted = flags.infoCompleted;
      if (flags.moistureCompleted != null) {
        record.moistureCompleted = flags.moistureCompleted;
      }
      if (flags.pyrolysisCompleted != null) {
        record.pyrolysisCompleted = flags.pyrolysisCompleted;
      }
      if (flags.sampleCompleted != null) {
        record.sampleCompleted = flags.sampleCompleted;
      }
    });
  });

  await maybeAdvanceSessionStep(sessionId);
}

export async function saveKontikkiSectionLocal(
  sessionId: string,
  kontikkiRowId: string,
  section: PyrolysisKontikkiSection,
  payload: Partial<PyrolysisKontikkiData>,
) {
  const now = Date.now();

  await applyBatchPayload(kontikkiRowId, payload);

  await database.write(async () => {
    const row = await batchesCollection().find(kontikkiRowId);
    await row.update((record) => {
      record.updatedAt = now;
      if (section === "info") record.infoCompleted = true;
      if (section === "moisture") record.moistureCompleted = true;
      if (section === "yield") record.pyrolysisCompleted = true;
      if (section === "sample") record.sampleCompleted = true;
    });
  });

  await maybeAdvanceSessionStep(sessionId);
}

async function maybeAdvanceSessionStep(sessionId: string) {
  const session = await sessionsCollection().find(sessionId);
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

  await database.write(async () => {
    await session.update((record) => {
      record.currentStep = nextStep;
      record.updatedAt = Date.now();
    });
  });
}

export async function completePyrolysisBatchLocal(sessionId: string) {
  const rows = await getSessionKontikkis(sessionId);
  const allDone = rows.every(
    (row) =>
      row.infoCompleted &&
      row.moistureCompleted &&
      row.pyrolysisCompleted &&
      row.sampleCompleted,
  );

  if (!allDone) {
    throw new Error("Complete every section for all kontikkis before submitting.");
  }

  const now = Date.now();
  await database.write(async () => {
    const session = await sessionsCollection().find(sessionId);
    await session.update((record) => {
      record.status = "completed";
      record.currentStep = "complete";
      record.uploadStatus = "pending";
      record.syncError = null;
      record.updatedAt = now;
    });

    const batches = await batchesCollection()
      .query(Q.where("session_id", sessionId))
      .fetch();

    for (const row of batches) {
      await row.update((record) => {
        record.uploadStatus = "pending";
        record.syncError = null;
        record.updatedAt = now;
      });
    }
  });

  await enqueuePyrolysisBatchSync(sessionId);
  void triggerBackgroundSync();
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
  const existing = await syncQueueCollection()
    .query(
      Q.where("entity_local_id", sessionLocalId),
      Q.where("entity_type", "pyrolysis_session"),
    )
    .fetch();

  const pending = existing.find((item) => item.status === "pending");
  if (pending) return;

  const failed = existing.find((item) => item.status === "failed");
  if (failed) {
    await database.write(async () => {
      await failed.update((record) => {
        record.status = "pending";
        record.retries = 0;
        record.errorMessage = null;
      });
    });
    return;
  }

  await database.write(async () => {
    await syncQueueCollection().create((record) => {
      record.entityType = "pyrolysis_session";
      record.entityLocalId = sessionLocalId;
      record.operation = "complete";
      record.status = "pending";
      record.retries = 0;
      record.createdAt = Date.now();
    });
  });
}

function sanitizeApiBatchPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...payload };
  if (next.farm_id === "") next.farm_id = null;
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
    const expected = new Set(kontikkiIds);
    const resumed = list.find((row) => {
      if (row.status !== "active") return false;
      const ids = row.batches.map((batch) => batch.kontikki_id);
      return (
        ids.length === kontikkiIds.length && ids.every((id) => expected.has(id))
      );
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
  await database.write(async () => {
    await session.update((record) => {
      record.serverId = serverSession.id;
      record.updatedAt = Date.now();
    });

    for (const localBatch of batches) {
      const serverBatch = serverBatchesByKontikki.get(localBatch.kontikkiId);
      if (!serverBatch) continue;

      await localBatch.update((record) => {
        record.serverId = serverBatch.id;
        record.updatedAt = Date.now();
      });
    }
  });
}

export async function syncPyrolysisBatch(session: PyrolysisSession) {
  const batches = await batchesCollection()
    .query(Q.where("session_id", session.id))
    .fetch();

  const { serverSession, serverBatchesByKontikki } =
    await resolveServerPyrolysisSession(session, batches);

  const serverId = serverSession.id;
  await persistServerSessionMapping(session, batches, serverSession, serverBatchesByKontikki);

  for (const localBatch of batches) {
    const serverBatch = serverBatchesByKontikki.get(localBatch.kontikkiId);
    const serverBatchId = serverBatch?.id;
    if (!serverBatchId) {
      throw new Error(`Server batch missing for kontikki ${localBatch.kontikkiCode}.`);
    }

    let payload = await assembleBatchPayload(localBatch.id);
    payload = await uploadPyrolysisBatchPhotos(serverBatchId, localBatch.id, payload);

    const apiRecord = batchToApiRecord(localBatch, payload);
    apiRecord.id = serverBatchId;

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

    await database.write(async () => {
      await localBatch.update((record) => {
        record.serverId = serverBatchId;
        record.uploadStatus = "synced";
        record.syncError = null;
        record.updatedAt = Date.now();
      });
    });
  }

  if (serverSession.status !== "completed") {
    await backendFetch(`/pyrolysis-sessions/${serverId}/step`, {
      method: "PATCH",
      body: JSON.stringify({ current_step: "complete" }),
    });

    await backendFetch(`/pyrolysis-sessions/${serverId}/complete`, {
      method: "POST",
    });
  }

  await database.write(async () => {
    await session.update((record) => {
      record.serverId = serverId;
      record.uploadStatus = "synced";
      record.syncError = null;
      record.updatedAt = Date.now();
    });
  });
}
