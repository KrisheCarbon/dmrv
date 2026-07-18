import {
  BleManager,
  Device,
  Subscription,
  BleError,
  State as BleState,
} from 'react-native-ble-plx';
import { Platform, PermissionsAndroid, NativeModules } from 'react-native';

import {
  KILN_SERVICE_UUID,
  KILN_ID_CHAR_UUID,
  STORAGE_INFO_CHAR_UUID,
  COMMAND_CHAR_UUID,
  FILE_DOWNLOAD_CHAR_UUID,
  FILE_CMD_CHAR_UUID,
  UPTIME_CHAR_UUID,
  ScannedDevice,
  StorageInfo,
  FlashFileInfo,
} from '../../types/kiln';
import { base64ToBytes } from '../../utils/kilnBase64';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Decodes a base64 BLE characteristic value to raw bytes. */
function decodeBase64Bytes(base64: string): Uint8Array {
  return base64ToBytes(base64);
}

/**
 * Standard CRC-32 (IEEE 802.3, reflected, poly 0xEDB88320, init/final
 * 0xFFFFFFFF), returned as 8 uppercase hex chars. MUST stay byte-for-byte
 * identical to crc32Step() in the firmware so download integrity can be checked.
 */
function crc32Hex(bytes: Uint8Array): string {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  return crc.toString(16).padStart(8, '0').toUpperCase();
}

/** Decodes a base64 BLE characteristic value to a UTF-8 string (text-only). */
function decodeBase64(base64: string): string {
  return new TextDecoder('utf-8').decode(decodeBase64Bytes(base64));
}

// CLEAR_FLASH is pure ASCII, so btoa is safe without TextEncoder.
function encodeBase64(plain: string): string {
  return btoa(plain);
}

// ─── Permissions ─────────────────────────────────────────────────────────────

async function requestAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const apiLevel = Platform.Version as number;

  if (apiLevel >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    return (
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted' &&
      results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === 'granted'
    );
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  return result === 'granted';
}

// ─── Service ─────────────────────────────────────────────────────────────────

class BleManagerService {
  private static _instance: BleManagerService | null = null;

  private manager: BleManager | null = null;
  private scanActive: boolean = false;
  private downloadSubscription: Subscription | null = null;
  private disconnectSubscription: Subscription | null = null;
  private byteBuffer: number[] = [];

  private constructor() {}

  private getManager(): BleManager {
    if (!this.manager) {
      if (!NativeModules.BlePlx) {
        throw new Error(
          'Bluetooth is unavailable in this build. Reinstall the dev client: npm run android',
        );
      }
      this.manager = new BleManager();
    }
    return this.manager;
  }

  static getInstance(): BleManagerService {
    if (!BleManagerService._instance) {
      BleManagerService._instance = new BleManagerService();
    }
    return BleManagerService._instance;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  destroy(): void {
    this.stopScan();
    this.stopFileDownload();
    this.disconnectSubscription?.remove();
    this.manager?.destroy();
    this.manager = null;
    BleManagerService._instance = null;
  }

  // ── Permissions ───────────────────────────────────────────────────────────

  async requestPermissions(): Promise<boolean> {
    return requestAndroidPermissions();
  }

  // ── Adapter State ─────────────────────────────────────────────────────────

  /**
   * Resolves true once the BLE adapter is powered on.
   * Rejects after 10 s if the adapter never comes up.
   */
  waitForPowerOn(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('BLE adapter did not power on within 10 s')),
        10_000,
      );

      const sub = this.getManager().onStateChange((state) => {
        if (state === BleState.PoweredOn) {
          clearTimeout(timeout);
          sub.remove();
          resolve();
        } else if (
          state === BleState.Unsupported ||
          state === BleState.Unauthorized
        ) {
          clearTimeout(timeout);
          sub.remove();
          reject(new Error(`BLE state: ${state}`));
        }
      }, true);
    });
  }

  // ── Scanning ──────────────────────────────────────────────────────────────

  async startScan(
    onDeviceFound: (device: ScannedDevice) => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    if (this.scanActive) return;

    // Fix 2: Read the adapter state before touching startDeviceScan.
    // The radio may still be waking up when the component mounts, so calling
    // startDeviceScan in a non-PoweredOn state silently yields zero results.
    const currentState = await this.getManager().state();
    if (currentState !== BleState.PoweredOn) {
      console.warn(`[BLE] Scan aborted – adapter state is "${currentState}", expected "PoweredOn".`);
      onError(
        new Error(
          `Bluetooth is not ready (state: ${currentState}). Enable Bluetooth and try again.`,
        ),
      );
      return;
    }

    this.scanActive = true;

    // Null disables UUID filtering (see previous fix). allowDuplicates: true lets
    // repeated advertising packets through so RSSI stays live; deduplication is
    // handled by addOrUpdateScannedDevice in the Zustand store.
    this.getManager().startDeviceScan(
      null,
      { allowDuplicates: true },
      (bleError: BleError | null, device: Device | null) => {
        if (bleError) {
          this.scanActive = false;
          onError(new Error(bleError.message));
          return;
        }
        if (!device) return;

        // Log every peripheral for debugging.
        console.log(
          `[BLE] Detected: "${device.name ?? device.localName ?? '(unnamed)'}" [${device.id}] services=${JSON.stringify(device.serviceUUIDs)}`,
        );

        // Dual filter: name OR service UUID.
        //
        // A 128-bit service UUID (18 bytes) + Flags (3 bytes) fills the 31-byte
        // advertising packet, so NimBLE moves the device name to the scan response.
        // Android fires the scan callback before the scan-response exchange completes,
        // meaning device.name / device.localName can both be null on the very first
        // packet. Checking serviceUUIDs catches the device in that window.
        const hasKilnName =
          device.name === 'Kiln-ESP32' || device.localName === 'Kiln-ESP32';
        const hasKilnService = (device.serviceUUIDs ?? []).some(
          (uuid) => uuid.toLowerCase() === KILN_SERVICE_UUID.toLowerCase(),
        );
        if (!hasKilnName && !hasKilnService) return;

        // Prefer advertised name; fall back to a stable MAC-derived label so the
        // UI always shows something meaningful while Android caches the full name.
        const kilnId =
          device.localName ?? device.name ?? `Kiln-${device.id.slice(-5).toUpperCase()}`;

        onDeviceFound({
          id: device.id,
          name: device.name,
          rssi: device.rssi ?? -100,
          kilnId,
        });
      },
    );
  }

  stopScan(): void {
    if (!this.scanActive) return;
    this.getManager().stopDeviceScan();
    this.scanActive = false;
  }

  // ── Connection ────────────────────────────────────────────────────────────

  async connect(
    deviceId: string,
    onDisconnect: (error: BleError | null) => void,
  ): Promise<Device> {
    const device = await this.getManager().connectToDevice(deviceId, {
      requestMTU: 512,
    });
    await device.discoverAllServicesAndCharacteristics();

    this.disconnectSubscription?.remove();
    this.disconnectSubscription = this.getManager().onDeviceDisconnected(
      deviceId,
      onDisconnect,
    );

    return device;
  }

  async disconnect(deviceId: string): Promise<void> {
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = null;
    this.stopFileDownload();
    await this.getManager().cancelDeviceConnection(deviceId);
  }

  // ── Characteristic Reads ──────────────────────────────────────────────────

  async readKilnId(device: Device): Promise<string> {
    const char = await device.readCharacteristicForService(
      KILN_SERVICE_UUID,
      KILN_ID_CHAR_UUID,
    );
    if (!char.value) throw new Error('KILN_ID characteristic returned no value');
    return decodeBase64(char.value).trim();
  }

  async readStorageInfo(device: Device): Promise<StorageInfo> {
    const char = await device.readCharacteristicForService(
      KILN_SERVICE_UUID,
      STORAGE_INFO_CHAR_UUID,
    );
    if (!char.value)
      throw new Error('STORAGE_INFO characteristic returned no value');

    const raw = decodeBase64(char.value).trim();

    // Accept both "102400,1048576" and "[102400,1048576]" formats from firmware
    const normalised = raw.replace(/[\[\]]/g, '');
    const parts = normalised.split(',').map((s) => parseInt(s.trim(), 10));

    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
      throw new Error(`Unexpected STORAGE_INFO format: "${raw}"`);
    }

    return { usedBytes: parts[0], totalBytes: parts[1] };
  }

  /**
   * Reads the ESP32's total internal uptime in seconds.
   * The firmware writes the uptime as a plain decimal ASCII string
   * (e.g. "123456") to the UPTIME characteristic.
   */
  async readUptimeSeconds(device: Device): Promise<number> {
    const char = await device.readCharacteristicForService(
      KILN_SERVICE_UUID,
      UPTIME_CHAR_UUID,
    );
    if (!char.value)
      throw new Error('UPTIME characteristic returned no value');

    const raw = decodeBase64(char.value).trim();
    const uptime = parseFloat(raw);

    if (isNaN(uptime)) {
      throw new Error(`Unexpected UPTIME format: "${raw}"`);
    }
    return uptime;
  }

  // ── Characteristic Write ──────────────────────────────────────────────────

  /**
   * Transmits the "CLEAR_FLASH" command to the firmware.
   * The firmware interprets this as a request to delete all closed (non-active)
   * batch recordings from flash storage, leaving any in-progress session intact.
   */
  async sendClearFlashCommand(device: Device): Promise<void> {
    const payload = encodeBase64('CLEAR_FLASH');
    await device.writeCharacteristicWithResponseForService(
      KILN_SERVICE_UUID,
      COMMAND_CHAR_UUID,
      payload,
    );
  }

  // ── File Command Characteristic (Write → Notify) ─────────────────────────

  /**
   * Arms a notification listener on FILE_CMD_CHAR_UUID BEFORE writing the
   * command, so no notification can be missed in the write/subscribe gap.
   * Resolves with the first decoded notification response or rejects after 10 s.
   */
  private sendFileCommand(device: Device, command: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let notifySub: Subscription | null = null;

      const cleanup = () => {
        notifySub?.remove();
        notifySub = null;
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(
          new Error(`"${command}" timed out — no response from firmware within 10 s.`),
        );
      }, 10_000);

      // Subscribe first, then write.
      notifySub = device.monitorCharacteristicForService(
        KILN_SERVICE_UUID,
        FILE_CMD_CHAR_UUID,
        (err, char) => {
          if (err) {
            clearTimeout(timeout);
            cleanup();
            reject(new Error(err.message));
            return;
          }
          if (!char?.value) return;
          const response = decodeBase64(char.value).trim();
          clearTimeout(timeout);
          cleanup();
          resolve(response);
        },
      );

      device
        .writeCharacteristicWithResponseForService(
          KILN_SERVICE_UUID,
          FILE_CMD_CHAR_UUID,
          encodeBase64(command),
        )
        .catch((writeErr: Error) => {
          clearTimeout(timeout);
          cleanup();
          reject(writeErr);
        });
    });
  }

  /**
   * Writes "LIST" to FILE_CMD_CHAR_UUID. The firmware responds with a
   * comma-separated list of entries in the format:
   *   "batch_N.json (SIZEB)"   — completed batch
   *   "batch_N.json (SIZEB)*"  — currently recording batch (trailing asterisk)
   * or the sentinel "EMPTY" when flash holds no files.
   *
   * Returns a parsed array of {@link FlashFileInfo} objects with
   * filename, sizeBytes, and isActive fields.
   */
  async listFiles(device: Device): Promise<FlashFileInfo[]> {
    const response = await this.sendFileCommand(device, 'LIST');
    if (!response || response.trim() === 'EMPTY') return [];

    return response
      .split(',')
      .map((raw): FlashFileInfo | null => {
        const entry = raw.trim();
        if (!entry) return null;

        // Trailing '*' marks the actively recording batch
        const isActive = entry.endsWith('*');
        const clean = isActive ? entry.slice(0, -1).trim() : entry;

        // "batch_N.json (SIZEB)" — capture filename and numeric size
        const match = clean.match(/^(.+?)\s+\((\d+)B\)$/);
        if (match) {
          return { filename: match[1].trim(), sizeBytes: parseInt(match[2], 10), isActive };
        }
        // Fallback: no size annotation (shouldn't happen, but be defensive)
        return { filename: clean, sizeBytes: 0, isActive };
      })
      .filter((f): f is FlashFileInfo => f !== null && f.filename.length > 0);
  }

  /**
   * Writes "CLEAR" to FILE_CMD_CHAR_UUID and waits for the firmware's
   * "WIPE_SUCCESS" notification before resolving.
   * Rejects if the firmware responds with any other value.
   */
  async clearFiles(device: Device): Promise<void> {
    const response = await this.sendFileCommand(device, 'CLEAR');
    if (response !== 'WIPE_SUCCESS') {
      throw new Error(
        `Unexpected clear response: "${response}". Expected "WIPE_SUCCESS".`,
      );
    }
  }

  // ── File Download (Notify + Chunk Accumulation) ───────────────────────────

  /**
   * Downloads a single batch JSON file from the ESP32 as raw bytes.
   *
   * Firmware protocol (v1-prototype-firmware.ino):
   *   1. App writes `GET <filename>` to FILE_CMD (optional; omit for latest batch)
   *   2. App subscribes to FILE_DOWNLOAD
   *   3. Kiln sends `LEN:<n> CRC:<8-hex>\n` header, raw JSON bytes, then 0x00 EOF
   */
  async downloadFile(
    device: Device,
    filename: string | null,
    onProgress: (bytesSoFar: number, totalBytes: number) => void,
  ): Promise<Uint8Array> {
    // BLE transfers can silently corrupt bytes in flight. The kiln sends a CRC-32
    // in the header; if the reassembled JSON bytes don't match, re-request the file.
    const maxAttempts = 3;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.attemptDownloadFile(device, filename, onProgress);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Only a CRC/integrity failure is worth retrying; other errors are hard.
        if (!lastError.message.includes('CRC mismatch')) throw lastError;
        console.warn(
          `[BLE DL] ${filename ?? 'latest'}: ${lastError.message} — retry ${attempt}/${maxAttempts}`,
        );
      }
    }

    throw lastError ?? new Error('BLE download failed after retries.');
  }

  private attemptDownloadFile(
    device: Device,
    filename: string | null,
    onProgress: (bytesSoFar: number, totalBytes: number) => void,
  ): Promise<Uint8Array> {
    return new Promise<Uint8Array>((resolve, reject) => {
      const doSubscribe = () => {
        this.stopFileDownload();
        this.byteBuffer = [];

        let downloadCompleted = false;
        let expectedBytes = -1;
        let expectedCrc: string | null = null;
        let receivedBytes = 0;
        let headerParsed = false;
        let headerAccumulator: number[] = [];

        const finish = (finalBytes: Uint8Array) => {
          if (downloadCompleted) return;

          // Verify transport integrity when the kiln supplied a CRC.
          if (expectedCrc !== null) {
            const actualCrc = crc32Hex(finalBytes);
            if (actualCrc !== expectedCrc) {
              downloadCompleted = true;
              clearTimeout(timeoutHandle);
              this.stopFileDownload();
              reject(
                new Error(
                  `BLE download CRC mismatch (expected ${expectedCrc}, got ${actualCrc}, ${finalBytes.length}B).`,
                ),
              );
              return;
            }
          }

          downloadCompleted = true;
          clearTimeout(timeoutHandle);
          console.log(
            `[BLE DL] ${finalBytes.length} bytes received` +
              (expectedBytes >= 0
                ? ` (LEN=${expectedBytes}${expectedCrc ? `, CRC ${expectedCrc} ok` : ''})`
                : ''),
          );
          this.stopFileDownload();
          resolve(finalBytes);
        };

        const fail = (message: string) => {
          if (downloadCompleted) return;
          downloadCompleted = true;
          clearTimeout(timeoutHandle);
          this.stopFileDownload();
          reject(new Error(message));
        };

        const timeoutHandle = setTimeout(() => {
          fail('BLE download timed out waiting for complete payload.');
        }, 120_000);

        const tryComplete = () => {
          if (downloadCompleted) return;

          if (expectedBytes >= 0 && this.byteBuffer.length >= expectedBytes) {
            finish(new Uint8Array(this.byteBuffer.slice(0, expectedBytes)));
            return;
          }

          // Firmware sends a trailing 0x00 EOF after the JSON bytes when no LEN header.
          if (
            expectedBytes < 0 &&
            this.byteBuffer.length > 0 &&
            this.byteBuffer[this.byteBuffer.length - 1] === 0x00
          ) {
            finish(new Uint8Array(this.byteBuffer.slice(0, -1)));
          }
        };

        const parseLenHeader = (): boolean => {
          const headStr = new TextDecoder('utf-8').decode(
            new Uint8Array(headerAccumulator),
          );
          const newlineIdx = headStr.indexOf('\n');
          if (newlineIdx < 0) {
            return false;
          }

          const headerLine = headStr.slice(0, newlineIdx + 1);
          // Accept "LEN:<n>\n" and "LEN:<n> CRC:<8-hex>\n" from firmware.
          const headerMatch = headerLine.match(
            /^LEN:(\d+)(?: CRC:([0-9A-Fa-f]{8}))?\n$/,
          );
          if (!headerMatch) {
            fail(`BLE download failed: invalid LEN header ${JSON.stringify(headerLine)}`);
            return true;
          }

          expectedBytes = parseInt(headerMatch[1], 10);
          if (!Number.isFinite(expectedBytes) || expectedBytes < 0) {
            fail(`BLE download failed: invalid LEN size ${headerMatch[1]}`);
            return true;
          }
          expectedCrc = headerMatch[2] ? headerMatch[2].toUpperCase() : null;

          const headerByteLen = headerMatch[0].length;
          for (let i = headerByteLen; i < headerAccumulator.length; i++) {
            this.byteBuffer.push(headerAccumulator[i]);
          }
          receivedBytes = this.byteBuffer.length;
          headerParsed = true;
          headerAccumulator = [];
          return true;
        };

        this.downloadSubscription = device.monitorCharacteristicForService(
          KILN_SERVICE_UUID,
          FILE_DOWNLOAD_CHAR_UUID,
          (bleError: BleError | null, characteristic) => {
            if (bleError) {
              if (downloadCompleted) return;
              fail(bleError.message);
              return;
            }

            if (!characteristic?.value) return;

            const chunkBytes = decodeBase64Bytes(characteristic.value);

            if (!headerParsed) {
              for (const b of chunkBytes) headerAccumulator.push(b);
              if (parseLenHeader()) {
                onProgress(receivedBytes, expectedBytes);
                tryComplete();
              }
              return;
            }

            for (const b of chunkBytes) this.byteBuffer.push(b);
            receivedBytes = this.byteBuffer.length;
            onProgress(receivedBytes, expectedBytes);
            tryComplete();
          },
        );
      };

      if (filename) {
        device
          .writeCharacteristicWithResponseForService(
            KILN_SERVICE_UUID,
            FILE_CMD_CHAR_UUID,
            encodeBase64(`GET ${filename}`),
          )
          .then(doSubscribe)
          .catch(reject);
      } else {
        doSubscribe();
      }
    });
  }

  private stopFileDownload(): void {
    this.downloadSubscription?.remove();
    this.downloadSubscription = null;
    this.byteBuffer = [];
  }
}

export const bleService = BleManagerService.getInstance();
