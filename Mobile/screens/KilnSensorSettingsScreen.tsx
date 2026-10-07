import React, { useEffect, useState } from "react";
import { View, Text, Switch, StyleSheet, ScrollView, Alert } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import ScreenHeader, { ScreenShell } from "../components/ScreenHeader";
import FormInput from "../components/FormInput";
import PrimaryButton from "../components/PrimaryButton";
import {
  DEFAULT_KILN_SENSOR_SETTINGS,
  loadKilnSensorSettings,
  saveKilnSensorSettings,
  type KilnSensorSettings,
} from "../services/kiln/kilnSensorSettings";
import { colors, fonts, spacing, radius } from "../constants/theme";

type Props = {
  navigation: NativeStackNavigationProp<Record<string, object | undefined>>;
};

export default function KilnSensorSettingsScreen({ navigation }: Props) {
  const [form, setForm] = useState<KilnSensorSettings>(DEFAULT_KILN_SENSOR_SETTINGS);

  useEffect(() => {
    void loadKilnSensorSettings().then(setForm);
  }, []);

  const save = async () => {
    await saveKilnSensorSettings(form);
    Alert.alert("Saved", "Sensor display settings are updated on this phone.");
    navigation.goBack();
  };

  return (
    <ScreenShell>
      <ScreenHeader title="Sensor settings" subtitle="Display and alerts" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.section}>Temperature unit</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{form.tempUnit === "F" ? "Fahrenheit" : "Celsius"}</Text>
          <Switch
            value={form.tempUnit === "F"}
            onValueChange={(fahrenheit) => setForm({ ...form, tempUnit: fahrenheit ? "F" : "C" })}
            trackColor={{ true: colors.brunswick, false: colors.border }}
          />
        </View>

        <Text style={styles.section}>Calibration offsets (°C)</Text>
        <FormInput
          label="Top offset"
          keyboardType="numeric"
          value={String(form.topOffset)}
          onChangeText={(text) => setForm({ ...form, topOffset: Number(text) || 0 })}
        />
        <FormInput
          label="Middle offset"
          keyboardType="numeric"
          value={String(form.midOffset)}
          onChangeText={(text) => setForm({ ...form, midOffset: Number(text) || 0 })}
        />
        <FormInput
          label="Bottom offset"
          keyboardType="numeric"
          value={String(form.botOffset)}
          onChangeText={(text) => setForm({ ...form, botOffset: Number(text) || 0 })}
        />
        <Text style={styles.note}>
          Offsets change what you see on this phone. The recording uploaded to the portal stays the raw probe value.
        </Text>

        <Text style={styles.section}>Alerts</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Vibrate when the kiln becomes active</Text>
          <Switch
            value={form.alertOnActive}
            onValueChange={(alertOnActive) => setForm({ ...form, alertOnActive })}
            trackColor={{ true: colors.brunswick, false: colors.border }}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Vibrate when cooldown starts</Text>
          <Switch
            value={form.alertOnCooldown}
            onValueChange={(alertOnCooldown) => setForm({ ...form, alertOnCooldown })}
            trackColor={{ true: colors.brunswick, false: colors.border }}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Vibration on</Text>
          <Switch
            value={form.vibration}
            onValueChange={(vibration) => setForm({ ...form, vibration })}
            trackColor={{ true: colors.brunswick, false: colors.border }}
          />
        </View>
        <FormInput
          label="High temperature alert (°C)"
          keyboardType="numeric"
          value={String(form.highTempAlertC)}
          onChangeText={(text) => setForm({ ...form, highTempAlertC: Number(text) || 0 })}
        />

        <Text style={styles.section}>Wi-Fi hotspot</Text>
        <FormInput
          label="Status address"
          value={form.wifiStatusUrl}
          onChangeText={(wifiStatusUrl) => setForm({ ...form, wifiStatusUrl })}
          placeholder="http://192.168.4.1/api/status"
        />
        <Text style={styles.note}>
          Join the sensor hotspot KriSHE_Carbon_AP, then use Read over Wi-Fi on the scanner. Password on the module is krishecarbon.
        </Text>

        <PrimaryButton title="Save settings" onPress={() => void save()} />
        <View style={styles.gap} />
        <PrimaryButton
          title="Reset defaults"
          variant="outline"
          onPress={() => setForm(DEFAULT_KILN_SENSOR_SETTINGS)}
        />
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  section: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    marginTop: spacing.sm,
  },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowLabel: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.text },
  note: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  gap: { height: spacing.sm },
});
