import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Alert, ScrollView } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import ScreenHeader, { ScreenShell } from "./ScreenHeader";
import PrimaryButton from "./PrimaryButton";
import KilnLiveChart from "./KilnLiveChart";
import { bleService } from "../services/kiln/bleManagerService";
import {
  krisheSession,
  type KrisheLiveSnapshot,
  type KrisheSample,
} from "../services/kiln/krisheTelemetry";
import {
  formatProbeTemperature,
  formatUptime,
  getKilnSensorSettings,
  loadKilnSensorSettings,
  type KilnSensorSettings,
} from "../services/kiln/kilnSensorSettings";
import { useKilnStore } from "../store/useKilnStore";
import { colors, fonts, spacing, radius } from "../constants/theme";

type Props = {
  navigation: NativeStackNavigationProp<Record<string, object | undefined>>;
};

function zoneLabel(sample: KrisheSample, zone: "top" | "mid" | "bot", settings: KilnSensorSettings): string {
  const open = zone === "top" ? sample.topOpen : zone === "mid" ? sample.midOpen : sample.botOpen;
  const valid = zone === "top" ? sample.topValid : zone === "mid" ? sample.midValid : sample.botValid;
  const value = zone === "top" ? sample.top : zone === "mid" ? sample.mid : sample.bot;
  const offset = zone === "top" ? settings.topOffset : zone === "mid" ? settings.midOffset : settings.botOffset;
  if (open) return "OPEN";
  if (!valid) return "FAULT";
  return formatProbeTemperature(value, offset, settings.tempUnit);
}

function probeState(sample: KrisheSample, zone: "top" | "mid" | "bot", settings: KilnSensorSettings): string {
  const open = zone === "top" ? sample.topOpen : zone === "mid" ? sample.midOpen : sample.botOpen;
  const valid = zone === "top" ? sample.topValid : zone === "mid" ? sample.midValid : sample.botValid;
  const offset = zone === "top" ? settings.topOffset : zone === "mid" ? settings.midOffset : settings.botOffset;
  if (open) return "Disconnected";
  if (!valid) return "Fault";
  if (offset !== 0) return `OK, offset ${offset > 0 ? "+" : ""}${offset}`;
  return "OK";
}

function ZoneCard({
  title,
  value,
  rate,
}: {
  title: string;
  value: string;
  rate: string;
}) {
  return (
    <View style={styles.zoneCard}>
      <Text style={styles.zoneTitle}>{title}</Text>
      <Text style={styles.zoneValue}>{value}</Text>
      <Text style={styles.zoneRate}>{rate}</Text>
    </View>
  );
}

export default function KilnLiveSession({ navigation }: Props) {
  const { connectedDevice, selectedKontikki, resetOnDisconnect } = useKilnStore();
  const [live, setLive] = useState<KrisheLiveSnapshot | null>(null);
  const [settings, setSettings] = useState<KilnSensorSettings>(getKilnSensorSettings());

  useFocusEffect(
    React.useCallback(() => {
      void loadKilnSensorSettings().then(setSettings);
    }, []),
  );

  useEffect(() => {
    if (connectedDevice && selectedKontikki) {
      krisheSession.ensureStarted(connectedDevice, {
        moduleId: selectedKontikki.module_id,
        kontikkiId: selectedKontikki.id,
      });
    }
    return krisheSession.subscribe(setLive);
  }, [connectedDevice, selectedKontikki]);

  const finishDisconnect = async () => {
    krisheSession.stop();
    if (connectedDevice) {
      try {
        await bleService.disconnect(connectedDevice.id);
      } catch {
        // The radio may already be down.
      }
    }
    resetOnDisconnect();
    navigation.navigate("KilnScanner");
  };

  const handleDisconnect = () => {
    if (krisheSession.sampleCount() === 0) {
      void finishDisconnect();
      return;
    }

    Alert.alert(
      "Save this recording?",
      "Readings stay on this phone until you save them. Saving sends the session to Sensor data. It is not attached to a pyrolysis entry.",
      [
        { text: "Stay connected", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            krisheSession.discard();
            void finishDisconnect();
          },
        },
        {
          text: "Save",
          onPress: () => {
            void (async () => {
              const result = await krisheSession.saveNow();
              if (result.ok === false) {
                Alert.alert("Could not save", result.error);
                return;
              }
              await finishDisconnect();
            })();
          },
        },
      ],
    );
  };

  const handleSave = async () => {
    const result = await krisheSession.saveNow();
    if (result.ok === false) {
      Alert.alert("Could not save", result.error);
      return;
    }
    Alert.alert(
      "Recording saved",
      `${result.batchName} is on this phone and will sync to Sensor data when online.`,
    );
  };

  const latest = live?.latest ?? null;

  return (
    <ScreenShell>
      <ScreenHeader
        title={selectedKontikki?.kontikki_code ?? "Kiln sensor"}
        subtitle={
          selectedKontikki
            ? `Module ${selectedKontikki.module_id} · Live`
            : "Live"
        }
        onBack={() => navigation.goBack()}
        rightElement={
          <Text style={styles.settingsLink} onPress={() => navigation.navigate("KilnSensorSettings")}>
            Settings
          </Text>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.stateCard}>
          <Text style={styles.stateLabel}>Kiln state</Text>
          <Text style={styles.stateValue}>{latest?.state ?? "Waiting for sensor"}</Text>
          <Text style={styles.stateMeta}>
            {latest
              ? `${latest.satellites} satellites · batch ${latest.batchId || "not started"} · ${latest.duration}s on module`
              : "Keep the phone next to the kontikki. Samples arrive about once a second."}
          </Text>
        </View>

        <KilnLiveChart points={live?.chart ?? []} />

        <View style={styles.zoneRow}>
          <ZoneCard
            title="Top"
            value={latest ? zoneLabel(latest, "top", settings) : "—"}
            rate={latest ? `${probeState(latest, "top", settings)} · ${latest.topRate.toFixed(1)} °C/s` : ""}
          />
          <ZoneCard
            title="Middle"
            value={latest ? zoneLabel(latest, "mid", settings) : "—"}
            rate={latest ? `${probeState(latest, "mid", settings)} · ${latest.midRate.toFixed(1)} °C/s` : ""}
          />
          <ZoneCard
            title="Bottom"
            value={latest ? zoneLabel(latest, "bot", settings) : "—"}
            rate={latest ? `${probeState(latest, "bot", settings)} · ${latest.botRate.toFixed(1)} °C/s` : ""}
          />
        </View>

        <View style={styles.metaCard}>
          <Text style={styles.metaLine}>
            GNSS {latest && (latest.latitude !== 0 || latest.longitude !== 0) ? "FIXED" : "SEARCHING"}
            {latest && (latest.latitude !== 0 || latest.longitude !== 0)
              ? ` · ${latest.latitude.toFixed(5)}, ${latest.longitude.toFixed(5)} · ${latest.satellites} satellites`
              : ""}
          </Text>
          <Text style={styles.metaLine}>
            {latest && latest.utcEpoch > 1_000_000_000
              ? `GPS time ${new Date(latest.utcEpoch > 1e12 ? latest.utcEpoch : latest.utcEpoch * 1000).toLocaleTimeString()}`
              : "GPS time searching · using phone clock"}
          </Text>
          <Text style={styles.metaLine}>
            Uptime {latest ? formatUptime(latest.uptime) : "—"}
            {latest ? ` · session ${formatUptime(latest.duration)}` : ""}
            {latest?.firmware ? ` · firmware ${latest.firmware}` : ""}
            {live?.link === "wifi" ? " · Wi-Fi" : " · Bluetooth"}
          </Text>
          <Text style={styles.metaLine}>
            {live?.recording === false ? "Recording paused" : "Recording"} · received{" "}
            {live?.sampleCount ?? 0}
          </Text>
          <Text style={styles.metaLine}>
            {live?.cloudStatus === "synced"
              ? "Synced to cloud"
              : live?.cloudStatus === "saved_on_phone"
                ? "Saved on this phone. Waiting to sync."
                : "Not saved yet. These readings are only on this phone."}
          </Text>
          {live?.lastSavedName ? (
            <Text style={styles.metaLine}>Last saved: {live.lastSavedName}</Text>
          ) : null}
          {live?.lastError ? <Text style={styles.errorLine}>{live.lastError}</Text> : null}
          <Text style={styles.note}>
            A finished burn saves on its own when the module reaches Complete. Saved
            recordings show under Sensor data. They stay separate from pyrolysis entries
            you type in by hand.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          title={live?.recording === false ? "Start recording" : "Stop recording"}
          variant="outline"
          onPress={() => krisheSession.setRecording(live?.recording === false)}
        />
        <View style={styles.footerGap} />
        <PrimaryButton
          title={live?.saving ? "Saving…" : "Save recording"}
          onPress={() => void handleSave()}
          loading={live?.saving ?? false}
          disabled={(live?.sampleCount ?? 0) === 0}
        />
        <View style={styles.footerGap} />
        <PrimaryButton title="Disconnect" variant="outline" onPress={handleDisconnect} />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  settingsLink: { color: colors.brunswick, fontFamily: fonts.medium, fontSize: 15 },
  footerGap: { height: spacing.sm },
  scroll: { padding: spacing.md, paddingBottom: spacing.lg },
  stateCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  stateLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  stateValue: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.text,
    marginTop: spacing.xs,
  },
  stateMeta: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  zoneRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  zoneCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    minHeight: 96,
  },
  zoneTitle: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  zoneValue: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    marginTop: spacing.xs,
  },
  zoneRate: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  metaCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  metaLine: { fontFamily: fonts.regular, fontSize: 15, color: colors.text, lineHeight: 22 },
  errorLine: { fontFamily: fonts.medium, fontSize: 15, color: colors.error, lineHeight: 22 },
  note: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  footer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
});
