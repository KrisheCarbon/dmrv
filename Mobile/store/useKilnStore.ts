import { create } from 'zustand';
import type { Device } from 'react-native-ble-plx';
import type {
  ScannedDevice,
  SensorProtocol,
  StorageInfo,
  DownloadStatus,
} from '../types/kiln';
import type { KilnKontikkiOption } from '../services/kiln/kilnKontikkiService';

interface KilnState {
  connectedDevice: Device | null;
  kilnId: string | null;
  sensorProtocol: SensorProtocol | null;
  selectedKontikki: KilnKontikkiOption | null;
  storageInfo: StorageInfo | null;
  scannedDevices: ScannedDevice[];
  isScanning: boolean;
  downloadStatus: DownloadStatus;
  downloadedBytes: number;
  totalBytes: number;
}

interface KilnActions {
  setConnectedDevice: (device: Device | null) => void;
  setKilnId: (id: string | null) => void;
  setSensorProtocol: (protocol: SensorProtocol | null) => void;
  setSelectedKontikki: (kontikki: KilnKontikkiOption | null) => void;
  setStorageInfo: (info: StorageInfo | null) => void;
  setIsScanning: (scanning: boolean) => void;
  addOrUpdateScannedDevice: (device: ScannedDevice) => void;
  clearScannedDevices: () => void;
  setDownloadStatus: (status: DownloadStatus) => void;
  setDownloadProgress: (downloaded: number, total: number) => void;
  resetDownload: () => void;
  resetOnDisconnect: () => void;
  clearKilnSession: () => void;
}

export const useKilnStore = create<KilnState & KilnActions>((set) => ({
  connectedDevice: null,
  kilnId: null,
  sensorProtocol: null,
  selectedKontikki: null,
  storageInfo: null,
  scannedDevices: [],
  isScanning: false,
  downloadStatus: 'idle',
  downloadedBytes: 0,
  totalBytes: -1,

  setConnectedDevice: (device) => set({ connectedDevice: device }),
  setKilnId: (id) => set({ kilnId: id }),
  setSensorProtocol: (protocol) => set({ sensorProtocol: protocol }),
  setSelectedKontikki: (kontikki) => set({ selectedKontikki: kontikki }),
  setStorageInfo: (info) => set({ storageInfo: info }),
  setIsScanning: (scanning) => set({ isScanning: scanning }),

  addOrUpdateScannedDevice: (device) =>
    set((state) => {
      const existing = state.scannedDevices.findIndex((d) => d.id === device.id);
      if (existing >= 0) {
        const updated = [...state.scannedDevices];
        updated[existing] = device;
        return { scannedDevices: updated };
      }
      return { scannedDevices: [...state.scannedDevices, device] };
    }),

  clearScannedDevices: () => set({ scannedDevices: [] }),
  setDownloadStatus: (status) => set({ downloadStatus: status }),
  setDownloadProgress: (downloaded, total) =>
    set({ downloadedBytes: downloaded, totalBytes: total }),
  resetDownload: () =>
    set({ downloadStatus: 'idle', downloadedBytes: 0, totalBytes: -1 }),
  resetOnDisconnect: () =>
    set({
      connectedDevice: null,
      kilnId: null,
      sensorProtocol: null,
      storageInfo: null,
      downloadStatus: 'idle',
      downloadedBytes: 0,
      totalBytes: -1,
    }),
  clearKilnSession: () =>
    set({
      connectedDevice: null,
      kilnId: null,
      sensorProtocol: null,
      selectedKontikki: null,
      storageInfo: null,
      scannedDevices: [],
      isScanning: false,
      downloadStatus: 'idle',
      downloadedBytes: 0,
      totalBytes: -1,
    }),
}));
