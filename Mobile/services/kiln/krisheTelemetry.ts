import { Vibration } from "react-native";
import type { Device, Subscription } from "react-native-ble-plx";
import { KRISHE_SERVICE_UUID, KRISHE_TELEMETRY_UUID, type RawEspBatch } from "../../types/kiln";
import { base64ToBytes } from "../../utils/kilnBase64";
import { getKilnSensorSettings } from "./kilnSensorSettings";
import { queueKilnBatch } from "./batchService";
import { syncEncryptedKilnBatches } from "./kilnSyncService";
import { processSyncQueue } from "../syncService";

export interface KrisheSample {
  receivedAt: number;
  state: string;
  top: number;
  mid: number;
  bot: number;
  topValid: boolean;
  midValid: boolean;
  botValid: boolean;
  topOpen: boolean;
  midOpen: boolean;
  botOpen: boolean;
  topRate: number;
  midRate: number;
  botRate: number;
  latitude: number;
  longitude: number;
  satellites: number;
  utcEpoch: number;
  uptime: number;
  batchId: string;
  duration: number;
  firmware: string;
  wifiActive: boolean;
}

export interface LiveChartPoint {
  top: number | null;
  mid: number | null;
  bot: number | null;
}

export interface KrisheLiveSnapshot {
  latest: KrisheSample | null;
  sampleCount: number;
  lastSavedName: string | null;
  lastError: string | null;
  saving: boolean;
  cloudStatus: "receiving" | "saved_on_phone" | "synced" | null;
  recording: boolean;
  chart: LiveChartPoint[];
  link: "ble" | "wifi" | null;
}

type Listener = (snapshot: KrisheLiveSnapshot) => void;

const EMPTY: KrisheLiveSnapshot = {
  latest: null,
  sampleCount: 0,
  lastSavedName: null,
  lastError: null,
  saving: false,
  cloudStatus: null,
  recording: true,
  chart: [],
  link: null,
};

function flag(json: Record<string, unknown>, key: string): boolean {
  const value = json[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return false;
}

export function parseKrisheTelemetry(jsonText: string): KrisheSample | null {
  let json: Record<string, unknown>;
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    json = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const numberField = (key: string) => {
    const value = json[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };

  const batchId = typeof json.batch_id === "string" ? json.batch_id.trim() : "";

  return {
    receivedAt: Date.now(),
    state: typeof json.state === "string" && json.state.trim() ? json.state.trim() : "IDLE",
    top: numberField("top"),
    mid: numberField("mid"),
    bot: numberField("bot"),
    topValid: flag(json, "top_v"),
    midValid: flag(json, "mid_v"),
    botValid: flag(json, "bot_v"),
    topOpen: flag(json, "top_open"),
    midOpen: flag(json, "mid_open"),
    botOpen: flag(json, "bot_open"),
    topRate: numberField("top_rate"),
    midRate: numberField("mid_rate"),
    botRate: numberField("bot_rate"),
    latitude: numberField("lat"),
    longitude: numberField("lon"),
    satellites: numberField("sat"),
    utcEpoch: numberField("utc"),
    uptime: numberField("up"),
    batchId: batchId && batchId.toUpperCase() !== "NONE" ? batchId : "",
    duration: numberField("duration"),
    firmware: "",
    wifiActive: false,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function num(record: Record<string, unknown> | null, key: string): number {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function flagOf(record: Record<string, unknown> | null, key: string): boolean {
  const value = record?.[key];
  return value === true || value === 1;
}

/** Maps the module's Wi-Fi GET /api/status document into the same sample as BLE. */
export function wifiStatusToSample(body: unknown): KrisheSample | null {
  const root = asRecord(body);
  if (!root) return null;
  if (typeof root.top === "number") {
    return parseKrisheTelemetry(JSON.stringify(root));
  }

  const temperature = asRecord(root.temperature);
  const kiln = asRecord(root.kiln);
  const gnss = asRecord(root.gnss);
  const device = asRecord(root.device);
  const system = asRecord(root.system);
  if (!temperature || !kiln) return null;

  const batchRaw = kiln.batch_id;
  const batchId = typeof batchRaw === "string" ? batchRaw : "";

  return {
    receivedAt: Date.now(),
    state: typeof kiln.state === "string" && kiln.state.trim() ? kiln.state.trim() : "IDLE",
    top: num(temperature, "top_c"),
    mid: num(temperature, "middle_c"),
    bot: num(temperature, "bottom_c"),
    topValid: flagOf(temperature, "top_valid"),
    midValid: flagOf(temperature, "middle_valid"),
    botValid: flagOf(temperature, "bottom_valid"),
    topOpen: flagOf(temperature, "top_open"),
    midOpen: flagOf(temperature, "middle_open"),
    botOpen: flagOf(temperature, "bottom_open"),
    topRate: num(temperature, "top_rate"),
    midRate: num(temperature, "middle_rate"),
    botRate: num(temperature, "bottom_rate"),
    latitude: num(gnss, "latitude"),
    longitude: num(gnss, "longitude"),
    satellites: num(gnss, "satellites"),
    utcEpoch: num(gnss, "utc_epoch"),
    uptime: num(device, "uptime_s"),
    batchId: batchId && batchId.toUpperCase() !== "NONE" ? batchId : "",
    duration: num(kiln, "duration_s"),
    firmware: typeof device?.firmware === "string" ? device.firmware : "",
    wifiActive: flagOf(system, "wifi"),
  };
}

function chartPoint(sample: KrisheSample): LiveChartPoint {
  return {
    top: sample.topValid && !sample.topOpen ? sample.top : null,
    mid: sample.midValid && !sample.midOpen ? sample.mid : null,
    bot: sample.botValid && !sample.botOpen ? sample.bot : null,
  };
}

function representativeTemperature(sample: KrisheSample): number {
  if (sample.midValid) return sample.mid;
  const zones: number[] = [];
  if (sample.topValid) zones.push(sample.top);
  if (sample.botValid) zones.push(sample.bot);
  if (zones.length === 0) return sample.mid;
  return zones.reduce((sum, value) => sum + value, 0) / zones.length;
}

function zoneOrNull(valid: boolean, value: number): number | null {
  return valid ? value : null;
}

export function buildKrisheBatch(samples: KrisheSample[], moduleId: string): RawEspBatch {
  const startMs = samples[0]?.receivedAt ?? Date.now();
  const byOffset = new Map<number, KrisheSample>();
  for (const sample of samples) {
    const offset = Math.max(0, Math.round((sample.receivedAt - startMs) / 1000));
    byOffset.set(offset, sample);
  }

  const points = [...byOffset.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time_offset_seconds, sample]) => ({
      time_offset_seconds,
      temperature: representativeTemperature(sample),
      top_c: zoneOrNull(sample.topValid, sample.top),
      middle_c: zoneOrNull(sample.midValid, sample.mid),
      bottom_c: zoneOrNull(sample.botValid, sample.bot),
      kiln_state: sample.state,
      top_valid: sample.topValid,
      middle_valid: sample.midValid,
      bottom_valid: sample.botValid,
      top_open: sample.topOpen,
      middle_open: sample.midOpen,
      bottom_open: sample.botOpen,
      top_rate: sample.topRate,
      middle_rate: sample.midRate,
      bottom_rate: sample.botRate,
      latitude: sample.latitude,
      longitude: sample.longitude,
      satellites: sample.satellites,
      utc_epoch: sample.utcEpoch > 0 ? sample.utcEpoch : null,
      uptime_s: sample.uptime,
    }));

  const last = points[points.length - 1];
  const located = [...samples].reverse().find((sample) => sample.latitude !== 0 || sample.longitude !== 0);
  const firmwareId = [...samples].reverse().find((sample) => sample.batchId)?.batchId;
  const stamp = new Date(startMs).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const batchName = `${firmwareId || "LIVE"}-${stamp}`;

  return {
    batch_name: batchName,
    kiln_id: moduleId.trim(),
    uptime_start_seconds: samples[0]?.uptime ?? 0,
    start_time_utc: new Date(startMs).toISOString(),
    latitude: located?.latitude ?? 0,
    longitude: located?.longitude ?? 0,
    duration_seconds: last?.time_offset_seconds ?? 0,
    data_points: points,
  };
}

class KrisheTelemetrySession {
  private subscription: Subscription | null = null;
  private wifiTimer: ReturnType<typeof setInterval> | null = null;
  private deviceId: string | null = null;
  private moduleId = "";
  private kontikkiId = "";
  private samples: KrisheSample[] = [];
  private chart: LiveChartPoint[] = [];
  private lastBatchId = "";
  private lastState = "";
  private recording = true;
  private highTempLatched = false;
  private listeners = new Set<Listener>();
  private snapshot: KrisheLiveSnapshot = EMPTY;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  sampleCount(): number {
    return this.samples.length;
  }

  ensureStarted(device: Device, context: { moduleId: string; kontikkiId: string }): void {
    this.moduleId = context.moduleId;
    this.kontikkiId = context.kontikkiId;
    this.patch({ link: "ble" });
    if (this.deviceId === device.id && this.subscription) return;

    this.stopMonitor();
    this.deviceId = device.id;
    this.subscription = device.monitorCharacteristicForService(
      KRISHE_SERVICE_UUID,
      KRISHE_TELEMETRY_UUID,
      (error, characteristic) => {
        if (error) {
          this.patch({ lastError: error.message });
          return;
        }
        if (!characteristic?.value) return;

        let jsonText = "";
        try {
          jsonText = new TextDecoder("utf-8").decode(base64ToBytes(characteristic.value));
        } catch {
          return;
        }

        const sample = parseKrisheTelemetry(jsonText);
        if (sample) this.ingest(sample);
      },
    );
  }

  startWifi(context: { moduleId: string; kontikkiId: string }, url: string): void {
    this.moduleId = context.moduleId;
    this.kontikkiId = context.kontikkiId;
    this.stopMonitor();
    this.stopWifi();
    this.patch({ link: "wifi", lastError: null });

    const tick = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          this.patch({ lastError: `Wi-Fi sensor replied ${response.status}` });
          return;
        }
        const sample = wifiStatusToSample(await response.json());
        if (!sample) {
          this.patch({ lastError: "Wi-Fi sensor sent an unexpected status." });
          return;
        }
        this.ingest(sample);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not reach the sensor Wi-Fi.";
        this.patch({ lastError: message });
      }
    };

    void tick();
    this.wifiTimer = setInterval(() => void tick(), 1000);
  }

  setRecording(recording: boolean): void {
    this.recording = recording;
    this.patch({ recording });
  }

  stop(): void {
    this.stopMonitor();
    this.stopWifi();
  }

  discard(): void {
    this.samples = [];
    this.lastBatchId = "";
    this.lastState = "";
    this.patch({ latest: null, sampleCount: 0, lastError: null });
  }

  async saveNow(): Promise<{ ok: true; batchName: string } | { ok: false; error: string }> {
    if (this.samples.length === 0) {
      return { ok: false, error: "No readings yet. Stay connected until the sensor sends a sample." };
    }
    const finished = this.samples.slice();
    this.samples = [];
    this.patch({ sampleCount: 0, saving: true, lastError: null });
    return this.persist(finished);
  }

  private ingest(sample: KrisheSample): void {
    this.noteAlerts(sample);
    this.chart = [...this.chart, chartPoint(sample)].slice(-40);
    const batchId = sample.batchId;
    const previousBatch = this.lastBatchId;
    const previousState = this.lastState;
    const batchChanged = Boolean(previousBatch && batchId && previousBatch !== batchId);

    if (this.recording && batchChanged && this.samples.length > 0) {
      const finished = this.samples.slice();
      this.samples = [];
      void this.persist(finished);
    }

    if (this.recording) {
      this.samples.push(sample);
    }
    this.lastBatchId = batchId || this.lastBatchId;
    this.lastState = sample.state;

    const sessionEnded =
      this.recording &&
      (sample.state === "COMPLETE" ||
        ((previousState === "ACTIVE" || previousState === "COOLDOWN") &&
          (sample.state === "RESTING" || sample.state === "IDLE")));

    if (sessionEnded && this.samples.length > 0) {
      const finished = this.samples.slice();
      this.samples = [];
      void this.persist(finished);
    }

    this.patch({
      latest: sample,
      sampleCount: this.samples.length,
      lastError: null,
      cloudStatus: this.samples.length > 0 ? "receiving" : this.snapshot.cloudStatus,
      chart: this.chart,
      recording: this.recording,
    });
  }

  private noteAlerts(sample: KrisheSample): void {
    const settings = getKilnSensorSettings();
    if (!settings.vibration) return;

    if (settings.alertOnActive && this.lastState !== "ACTIVE" && sample.state === "ACTIVE") {
      Vibration.vibrate(250);
    }
    if (settings.alertOnCooldown && this.lastState !== "COOLDOWN" && sample.state === "COOLDOWN") {
      Vibration.vibrate(400);
    }

    const hottest = [sample.topValid ? sample.top : 0, sample.midValid ? sample.mid : 0, sample.botValid ? sample.bot : 0];
    const peak = Math.max(...hottest);
    if (peak >= settings.highTempAlertC && !this.highTempLatched) {
      this.highTempLatched = true;
      Vibration.vibrate(500);
    } else if (peak < settings.highTempAlertC) {
      this.highTempLatched = false;
    }
  }

  private stopWifi(): void {
    if (this.wifiTimer) clearInterval(this.wifiTimer);
    this.wifiTimer = null;
  }

  private async persist(
    samples: KrisheSample[],
  ): Promise<{ ok: true; batchName: string } | { ok: false; error: string }> {
    this.patch({ saving: true });
    try {
      const batch = buildKrisheBatch(samples, this.moduleId);
      const filename = `${batch.batch_name}.json`;
      const queued = await queueKilnBatch(
        this.moduleId,
        filename,
        JSON.stringify(batch),
        this.kontikkiId,
      );
      if (queued) {
        const syncResult = await syncEncryptedKilnBatches();
        void processSyncQueue();
        this.patch({
          saving: false,
          lastSavedName: batch.batch_name,
          lastError: syncResult.error ?? null,
          sampleCount: this.samples.length,
          cloudStatus: syncResult.error ? "saved_on_phone" : "synced",
        });
      } else {
        this.patch({
          saving: false,
          lastSavedName: batch.batch_name,
          lastError: null,
          sampleCount: this.samples.length,
          cloudStatus: "synced",
        });
      }
      return { ok: true, batchName: batch.batch_name };
    } catch (err) {
      this.samples = [...samples, ...this.samples];
      const message = err instanceof Error ? err.message : "Could not save the recording.";
      this.patch({ saving: false, lastError: message, sampleCount: this.samples.length });
      return { ok: false, error: message };
    }
  }

  private stopMonitor(): void {
    this.subscription?.remove();
    this.subscription = null;
    this.deviceId = null;
  }

  private patch(partial: Partial<KrisheLiveSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

export const krisheSession = new KrisheTelemetrySession();
