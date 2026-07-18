import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import ScreenHeader, { ScreenShell } from "../components/ScreenHeader";
import { bleService } from "../services/kiln/bleManagerService";
import { useKilnStore } from "../store/useKilnStore";
import type { FlashFileInfo } from "../types/kiln";
import { queueKilnBatch } from "../services/kiln/batchService";
import { parseKilnBatchBytes } from "../utils/kilnBatch";
import { processSyncQueue } from "../services/syncService";
import { colors, fonts, spacing, radius } from "../constants/theme";

type Props = {
  navigation: NativeStackNavigationProp<Record<string, object | undefined>>;
};

function formatFileSize(bytes: number) {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function StorageGauge({
  usedBytes,
  totalBytes,
}: {
  usedBytes: number;
  totalBytes: number;
}) {
  const pct = totalBytes > 0 ? Math.min((usedBytes / totalBytes) * 100, 100) : 0;
  const fillColor = pct > 80 ? colors.error : pct > 55 ? colors.warning : colors.success;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>Flash Storage</Text>
        <Text style={[styles.cardPct, { color: fillColor }]}>{pct.toFixed(1)}%</Text>
      </View>
      <View style={styles.gaugeTrack}>
        <View style={[styles.gaugeFill, { width: `${pct}%`, backgroundColor: fillColor }]} />
      </View>
      <Text style={styles.cardMeta}>
        Used {(usedBytes / (1024 * 1024)).toFixed(2)} MB / Total{" "}
        {(totalBytes / (1024 * 1024)).toFixed(2)} MB
      </Text>
    </View>
  );
}

export default function KilnDashboardScreen({ navigation }: Props) {
  const {
    connectedDevice,
    kilnId,
    selectedKontikki,
    storageInfo,
    downloadStatus,
    downloadedBytes,
    totalBytes,
    setStorageInfo,
    setDownloadStatus,
    setDownloadProgress,
    resetDownload,
    resetOnDisconnect,
  } = useKilnStore();

  const [isClearingStorage, setIsClearingStorage] = useState(false);
  const [isRefreshingStorage, setIsRefreshingStorage] = useState(false);
  const [isListingFiles, setIsListingFiles] = useState(false);
  const [espFileList, setEspFileList] = useState<FlashFileInfo[]>([]);
  const [downloadStatusDetail, setDownloadStatusDetail] = useState("");

  const refreshStorageInfo = useCallback(async () => {
    if (!connectedDevice) return;
    setIsRefreshingStorage(true);
    try {
      const info = await bleService.readStorageInfo(connectedDevice);
      setStorageInfo(info);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      Alert.alert("Storage Read Error", msg);
    } finally {
      setIsRefreshingStorage(false);
    }
  }, [connectedDevice, setStorageInfo]);

  useEffect(() => {
    refreshStorageInfo();
  }, [refreshStorageInfo]);

  const handleDownload = useCallback(async () => {
    if (!connectedDevice) return;
    if (downloadStatus !== "idle" && downloadStatus !== "error") return;

    try {
      setDownloadStatus("syncing_time");
      const espFiles = await bleService.listFiles(connectedDevice);
      const completedFiles = espFiles.filter(
        (f) => /^batch_\d{14}\.json$/.test(f.filename) && !f.isActive,
      );

      if (completedFiles.length === 0) {
        resetDownload();
        Alert.alert(
          "Nothing to Download",
          "The sensor has no completed recordings in flash memory.",
        );
        return;
      }

      setDownloadStatus("downloading");
      let savedCount = 0;

      for (let i = 0; i < completedFiles.length; i++) {
        const { filename, sizeBytes: expectedSize } = completedFiles[i];
        setDownloadStatusDetail(`${i + 1} / ${completedFiles.length}`);

        try {
          const rawBytes = await bleService.downloadFile(
            connectedDevice,
            filename,
            (rx, total) => setDownloadProgress(rx, total),
          );

          const batch = parseKilnBatchBytes(rawBytes);
          if (expectedSize > 0 && rawBytes.length !== expectedSize) continue;

          setDownloadStatus("saving");
          const batchJson = new TextDecoder("utf-8").decode(rawBytes);
          const queued = await queueKilnBatch(
            batch.kiln_id ?? kilnId ?? selectedKontikki?.module_id ?? "unknown",
            filename,
            batchJson,
            selectedKontikki?.id,
          );
          if (queued) savedCount += 1;
          setDownloadStatus("downloading");
        } catch (fileErr) {
          console.warn(`[Kiln DL] Error downloading ${filename}:`, fileErr);
          setDownloadStatus("downloading");
        }
      }

      setDownloadStatusDetail("");
      setDownloadStatus("complete");
      await refreshStorageInfo();
      void processSyncQueue();

      setTimeout(() => {
        resetDownload();
        setDownloadStatusDetail("");
      }, 3000);

      if (savedCount === 0) {
        Alert.alert(
          "Already Up to Date",
          "All recordings from this sensor are already saved on your device.",
        );
      } else {
        Alert.alert(
          "Download Complete",
          `${savedCount} batch recording(s) saved locally. Sync to cloud will run automatically when online.`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setDownloadStatus("error");
      setDownloadStatusDetail("");
      Alert.alert("Download Error", msg);
    }
  }, [
    connectedDevice,
    kilnId,
    selectedKontikki,
    downloadStatus,
    setDownloadStatus,
    setDownloadProgress,
    resetDownload,
    refreshStorageInfo,
  ]);

  const handleListFiles = useCallback(async () => {
    if (!connectedDevice) return;
    setIsListingFiles(true);
    try {
      const files = await bleService.listFiles(connectedDevice);
      setEspFileList(files);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      Alert.alert("List Files Failed", msg);
    } finally {
      setIsListingFiles(false);
    }
  }, [connectedDevice]);

  const handleClearStorage = useCallback(() => {
    Alert.alert(
      "Clear Flash Storage",
      "This permanently deletes closed batch recordings from the sensor. Active recordings are kept.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Storage",
          style: "destructive",
          onPress: async () => {
            if (!connectedDevice) return;
            setIsClearingStorage(true);
            try {
              await bleService.clearFiles(connectedDevice);
              setEspFileList([]);
              await refreshStorageInfo();
              Alert.alert("Flash Cleared", "WIPE_SUCCESS received.");
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Unknown error";
              Alert.alert("Clear Failed", msg);
            } finally {
              setIsClearingStorage(false);
            }
          },
        },
      ],
    );
  }, [connectedDevice, refreshStorageInfo]);

  const handleDisconnect = useCallback(async () => {
    if (!connectedDevice) return;
    try {
      await bleService.disconnect(connectedDevice.id);
    } catch {
      // ignore
    } finally {
      resetOnDisconnect();
      navigation.navigate("KilnScanner");
    }
  }, [connectedDevice, resetOnDisconnect, navigation]);

  if (!connectedDevice) {
    return (
      <ScreenShell>
        <ScreenHeader title="Kiln Dashboard" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No Device Connected</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate("KilnScanner")}>
            <Text style={styles.primaryBtnText}>Go to Scanner</Text>
          </TouchableOpacity>
        </View>
      </ScreenShell>
    );
  }

  const isDownloadActive =
    downloadStatus !== "idle" && downloadStatus !== "error" && downloadStatus !== "complete";

  return (
    <ScreenShell>
      <ScreenHeader
        title={selectedKontikki?.kontikki_code ?? kilnId ?? "Connected Kiln"}
        subtitle={
          selectedKontikki
            ? `Module ${selectedKontikki.module_id} · Connected via Bluetooth`
            : "Connected via Bluetooth"
        }
        onBack={() => navigation.goBack()}
        rightElement={
          <TouchableOpacity onPress={handleDisconnect}>
            <Text style={styles.dangerText}>Disconnect</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isRefreshingStorage ? (
          <ActivityIndicator color={colors.brunswick} style={{ marginBottom: spacing.md }} />
        ) : storageInfo ? (
          <StorageGauge usedBytes={storageInfo.usedBytes} totalBytes={storageInfo.totalBytes} />
        ) : null}

        {downloadStatus !== "idle" ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {downloadStatus === "complete"
                ? "Download complete"
                : downloadStatus === "error"
                  ? "Download failed"
                  : `Downloading ${downloadStatusDetail || "…"}`}
            </Text>
            {totalBytes > 0 ? (
              <Text style={styles.cardMeta}>
                {downloadedBytes} / {totalBytes} bytes
              </Text>
            ) : null}
          </View>
        ) : null}

        <ActionRow
          title="Download Data"
          subtitle="Save batch recordings from sensor flash to this device"
          onPress={handleDownload}
          disabled={isDownloadActive}
          loading={isDownloadActive}
        />
        <ActionRow
          title="List Flash Files"
          subtitle="Show batch files currently on the sensor"
          onPress={handleListFiles}
          disabled={isListingFiles || isDownloadActive}
          loading={isListingFiles}
        />
        <ActionRow
          title="Clear Storage"
          subtitle="Delete closed recordings from sensor flash"
          onPress={handleClearStorage}
          disabled={isClearingStorage || isDownloadActive}
          loading={isClearingStorage}
          danger
        />
        <ActionRow
          title="Refresh Storage Info"
          subtitle="Re-read flash usage from the sensor"
          onPress={refreshStorageInfo}
          disabled={isRefreshingStorage}
          loading={isRefreshingStorage}
        />

        {espFileList.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Flash Files ({espFileList.length})</Text>
            {espFileList.map((file, index) => (
              <View key={`${file.filename}-${index}`} style={styles.fileRow}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {file.filename}
                </Text>
                <Text style={styles.fileSize}>{formatFileSize(file.sizeBytes)}</Text>
                {file.isActive ? <Text style={styles.recBadge}>REC</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.savedLink}
          onPress={() => navigation.navigate("KilnSavedBatches")}
        >
          <Text style={styles.linkText}>View Saved Batches →</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenShell>
  );
}

function ActionRow({
  title,
  subtitle,
  onPress,
  disabled,
  loading,
  danger,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionRow, disabled && styles.actionRowDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionTitle, danger && styles.dangerText]}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      {loading ? <ActivityIndicator color={colors.brunswick} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xl },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  cardPct: { fontFamily: fonts.bold, fontSize: 24 },
  cardMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, marginTop: 8 },
  gaugeTrack: {
    height: 10,
    backgroundColor: colors.border,
    borderRadius: 5,
    overflow: "hidden",
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  gaugeFill: { height: "100%", borderRadius: 5 },
  actionRow: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  actionRowDisabled: { opacity: 0.6 },
  actionTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.text, marginBottom: 4 },
  actionSubtitle: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fileName: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.text },
  fileSize: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  recBadge: { color: colors.error, fontFamily: fonts.bold, fontSize: 11 },
  savedLink: { alignItems: "center", paddingVertical: spacing.md },
  linkText: { color: colors.brunswick, fontFamily: fonts.medium, fontSize: 14 },
  dangerText: { color: colors.error, fontFamily: fonts.medium, fontSize: 14 },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.textSecondary, marginBottom: spacing.md },
  primaryBtn: {
    backgroundColor: colors.brunswick,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  primaryBtnText: { color: colors.white, fontFamily: fonts.bold, fontSize: 15 },
});
