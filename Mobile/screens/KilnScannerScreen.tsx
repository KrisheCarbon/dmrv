import React, { useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BleError } from "react-native-ble-plx";
import ScreenHeader, { ScreenShell } from "../components/ScreenHeader";
import { bleService } from "../services/kiln/bleManagerService";
import { useKilnStore } from "../store/useKilnStore";
import type { ScannedDevice } from "../types/kiln";
import { colors, fonts, spacing, radius } from "../constants/theme";

type Props = {
  navigation: NativeStackNavigationProp<Record<string, object | undefined>>;
};

function RssiIndicator({ rssi }: { rssi: number }) {
  const bars = rssi >= -60 ? 4 : rssi >= -75 ? 3 : rssi >= -90 ? 2 : 1;
  return (
    <View style={styles.rssiContainer}>
      {[1, 2, 3, 4].map((level) => (
        <View
          key={level}
          style={[
            styles.rssiBar,
            { height: level * 5 + 4 },
            level <= bars ? styles.rssiBarActive : styles.rssiBarInactive,
          ]}
        />
      ))}
      <Text style={styles.rssiLabel}>{rssi} dBm</Text>
    </View>
  );
}

export default function KilnScannerScreen({ navigation }: Props) {
  const {
    scannedDevices,
    isScanning,
    connectedDevice,
    selectedKontikki,
    setIsScanning,
    addOrUpdateScannedDevice,
    clearScannedDevices,
    setConnectedDevice,
    setKilnId,
    resetOnDisconnect,
  } = useKilnStore();

  const connectingIdRef = useRef<string | null>(null);
  const [connectingId, setConnectingId] = React.useState<string | null>(null);
  const permissionsGrantedRef = useRef(false);

  useEffect(() => {
    if (!selectedKontikki) {
      navigation.replace("KilnSelectKontikki");
    }
  }, [navigation, selectedKontikki]);

  useEffect(() => {
    bleService
      .requestPermissions()
      .then((granted) => {
        permissionsGrantedRef.current = granted;
        if (!granted) {
          Alert.alert(
            "Permissions Required",
            "Bluetooth and Location permissions are needed to scan for kiln sensors.",
          );
        }
      })
      .catch(console.error);
  }, []);

  const stopScan = useCallback(() => {
    bleService.stopScan();
    setIsScanning(false);
  }, [setIsScanning]);

  const startScan = useCallback(() => {
    if (!selectedKontikki) return;

    if (!permissionsGrantedRef.current) {
      Alert.alert(
        "Permissions Required",
        "Grant Bluetooth and Location permissions before scanning.",
      );
      return;
    }

    clearScannedDevices();
    setIsScanning(true);

    bleService.startScan(
      (device) => addOrUpdateScannedDevice(device),
      (err) => {
        setIsScanning(false);
        Alert.alert("Scan Error", err.message);
      },
    );

    setTimeout(() => {
      bleService.stopScan();
      setIsScanning(false);
    }, 15_000);
  }, [clearScannedDevices, setIsScanning, addOrUpdateScannedDevice, selectedKontikki]);

  const handleConnect = useCallback(
    async (device: ScannedDevice) => {
      if (!selectedKontikki || connectingIdRef.current) return;
      connectingIdRef.current = device.id;
      setConnectingId(device.id);
      stopScan();

      try {
        await bleService.waitForPowerOn();
        const connectedDev = await bleService.connect(device.id, (err: BleError | null) => {
          resetOnDisconnect();
          if (err) Alert.alert("Disconnected", `Lost connection: ${err.message}`);
        });

        const kilnId = await bleService.readKilnId(connectedDev);

        if (kilnId.trim() !== selectedKontikki.module_id.trim()) {
          await bleService.disconnect(connectedDev.id);
          resetOnDisconnect();
          Alert.alert(
            "Wrong Hardware Module",
            `This sensor reports "${kilnId}" but ${selectedKontikki.kontikki_code} is linked to module "${selectedKontikki.module_id}".`,
          );
          return;
        }

        setConnectedDevice(connectedDev);
        setKilnId(kilnId);
        navigation.navigate("KilnDashboard");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        Alert.alert("Connection Failed", message);
      } finally {
        connectingIdRef.current = null;
        setConnectingId(null);
      }
    },
    [
      stopScan,
      resetOnDisconnect,
      setConnectedDevice,
      setKilnId,
      navigation,
      selectedKontikki,
    ],
  );

  const handleDisconnect = useCallback(async () => {
    if (!connectedDevice) return;
    try {
      await bleService.disconnect(connectedDevice.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      Alert.alert("Disconnect Error", message);
    } finally {
      resetOnDisconnect();
    }
  }, [connectedDevice, resetOnDisconnect]);

  if (!selectedKontikki) {
    return null;
  }

  return (
    <ScreenShell>
      <ScreenHeader
        title={selectedKontikki.kontikki_code}
        subtitle={`Looking for module ${selectedKontikki.module_id}`}
        onBack={() => navigation.navigate("KilnSelectKontikki")}
        rightElement={
          <TouchableOpacity onPress={() => navigation.navigate("KilnSavedBatches")}>
            <Text style={styles.linkText}>History</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.targetCard}>
        <Text style={styles.targetLabel}>Assigned kontikki</Text>
        <Text style={styles.targetValue}>{selectedKontikki.kontikki_code}</Text>
        <Text style={styles.targetMeta}>Module ID: {selectedKontikki.module_id}</Text>
      </View>

      <TouchableOpacity
        style={[styles.scanButton, isScanning && styles.scanButtonActive]}
        onPress={isScanning ? stopScan : startScan}
      >
        {isScanning ? (
          <ActivityIndicator size="small" color={colors.white} style={{ marginRight: 8 }} />
        ) : null}
        <Text style={styles.scanButtonText}>
          {isScanning ? "Stop Scanning" : "Scan for Sensor"}
        </Text>
      </TouchableOpacity>

      <FlatList
        data={scannedDevices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isConnected = connectedDevice?.id === item.id;
          const isConnecting = connectingId === item.id;

          return (
            <View style={styles.deviceCard}>
              <View style={styles.deviceInfo}>
                <View style={[styles.statusDot, isConnected && styles.statusDotActive]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceKilnId}>{item.kilnId}</Text>
                  <Text style={styles.deviceId} numberOfLines={1}>
                    {item.id}
                  </Text>
                </View>
              </View>
              <View style={styles.deviceRight}>
                <RssiIndicator rssi={item.rssi} />
                {isConnecting ? (
                  <ActivityIndicator size="small" color={colors.brunswick} />
                ) : isConnected ? (
                  <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
                    <Text style={styles.disconnectBtnText}>Disconnect</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.connectBtn} onPress={() => handleConnect(item)}>
                    <Text style={styles.connectBtnText}>Connect</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Sensors Detected</Text>
            <Text style={styles.emptySubtitle}>
              Power on the ESP32 sensor for {selectedKontikki.kontikki_code}, ensure it is
              within Bluetooth range, then tap Scan.
            </Text>
          </View>
        }
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  linkText: { color: colors.brunswick, fontFamily: fonts.medium, fontSize: 14 },
  targetCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  targetLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  targetValue: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
    marginTop: 4,
  },
  targetMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.brunswick,
    marginTop: 4,
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.brunswick,
  },
  scanButtonActive: { backgroundColor: colors.brunswickLight },
  scanButtonText: { color: colors.white, fontFamily: fonts.bold, fontSize: 15 },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, flexGrow: 1 },
  deviceCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  deviceInfo: { flexDirection: "row", alignItems: "center", flex: 1, gap: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.smokeLight },
  statusDotActive: { backgroundColor: colors.success },
  deviceKilnId: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  deviceId: { fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  deviceRight: { alignItems: "flex-end", gap: 8 },
  rssiContainer: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  rssiBar: { width: 4, borderRadius: 2 },
  rssiBarActive: { backgroundColor: colors.success },
  rssiBarInactive: { backgroundColor: colors.border },
  rssiLabel: { fontSize: 10, color: colors.textSecondary, marginLeft: 4 },
  connectBtn: {
    backgroundColor: colors.brunswick,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 90,
    alignItems: "center",
  },
  connectBtnText: { color: colors.white, fontFamily: fonts.medium, fontSize: 13 },
  disconnectBtn: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 90,
    alignItems: "center",
  },
  disconnectBtnText: { color: colors.error, fontFamily: fonts.medium, fontSize: 13 },
  emptyState: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.textSecondary, marginBottom: 8 },
  emptySubtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
