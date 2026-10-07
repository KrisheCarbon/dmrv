export const KILN_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
export const KILN_ID_CHAR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
export const STORAGE_INFO_CHAR_UUID = 'a3b3d8e6-3f2e-4d7c-b5a1-9e8f7c6d5e4f';
export const COMMAND_CHAR_UUID = 'c6d4f8a2-7b9e-4c3d-a1f2-8e7d6c5b4a3f';
export const FILE_DOWNLOAD_CHAR_UUID = 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a';
export const UPTIME_CHAR_UUID = 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b';
export const FILE_CMD_CHAR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26aa';

/** KriSHE Carbon node (garvk1708/KriSHE-): notify JSON on 0xFFE1. */
export const KRISHE_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
export const KRISHE_TELEMETRY_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

export type SensorProtocol = 'legacy' | 'krishe';

export interface ScannedDevice {
  id: string;
  name: string | null;
  rssi: number;
  kilnId: string;
  protocol: SensorProtocol;
}

export interface StorageInfo {
  usedBytes: number;
  totalBytes: number;
}

export interface FlashFileInfo {
  filename: string;
  sizeBytes: number;
  isActive: boolean;
}

export type DownloadStatus =
  | 'idle'
  | 'syncing_time'
  | 'downloading'
  | 'processing'
  | 'saving'
  | 'complete'
  | 'error';

export interface RawEspBatch {
  batch_name: string;
  kiln_id: string;
  uptime_start_seconds: number;
  start_time_utc: string;
  latitude: number;
  longitude: number;
  duration_seconds: number;
  data_points: Array<{
    time_offset_seconds: number;
    temperature: number;
    top_c?: number | null;
    middle_c?: number | null;
    bottom_c?: number | null;
    kiln_state?: string | null;
    top_valid?: boolean | null;
    middle_valid?: boolean | null;
    bottom_valid?: boolean | null;
    top_open?: boolean | null;
    middle_open?: boolean | null;
    bottom_open?: boolean | null;
    top_rate?: number | null;
    middle_rate?: number | null;
    bottom_rate?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    satellites?: number | null;
    utc_epoch?: number | null;
    uptime_s?: number | null;
  }>;
}
