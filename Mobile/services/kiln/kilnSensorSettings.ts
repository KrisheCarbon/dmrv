import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "kiln-sensor-settings";

export interface KilnSensorSettings {
  tempUnit: "C" | "F";
  topOffset: number;
  midOffset: number;
  botOffset: number;
  highTempAlertC: number;
  alertOnActive: boolean;
  alertOnCooldown: boolean;
  vibration: boolean;
  wifiStatusUrl: string;
}

export const DEFAULT_KILN_SENSOR_SETTINGS: KilnSensorSettings = {
  tempUnit: "C",
  topOffset: 0,
  midOffset: 0,
  botOffset: 0,
  highTempAlertC: 350,
  alertOnActive: true,
  alertOnCooldown: true,
  vibration: true,
  wifiStatusUrl: "http://192.168.4.1/api/status",
};

let cached: KilnSensorSettings = DEFAULT_KILN_SENSOR_SETTINGS;

export function getKilnSensorSettings(): KilnSensorSettings {
  return cached;
}

export async function loadKilnSensorSettings(): Promise<KilnSensorSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return cached;
    const parsed = JSON.parse(raw) as Partial<KilnSensorSettings>;
    cached = { ...DEFAULT_KILN_SENSOR_SETTINGS, ...parsed };
  } catch {
    cached = DEFAULT_KILN_SENSOR_SETTINGS;
  }
  return cached;
}

export async function saveKilnSensorSettings(
  next: KilnSensorSettings,
): Promise<KilnSensorSettings> {
  cached = next;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return cached;
}

export function formatProbeTemperature(
  celsius: number,
  offset: number,
  unit: "C" | "F",
): string {
  const adjusted = celsius + offset;
  if (unit === "F") {
    return `${((adjusted * 9) / 5 + 32).toFixed(1)} °F`;
  }
  return `${adjusted.toFixed(1)} °C`;
}

export function formatUptime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  if (mins > 0) return `${mins}m ${String(secs).padStart(2, "0")}s`;
  return `${secs}s`;
}
