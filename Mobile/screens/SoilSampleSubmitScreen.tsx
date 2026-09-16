import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  Image,
} from "react-native";
import { soilTestStatusLabel } from "@krishecarbon/shared";
import { ScreenShell } from "../components/ScreenHeader";
import FormPicker from "../components/FormPicker";
import PrimaryButton from "../components/PrimaryButton";
import {
  listCollectedSoilSamples,
  submitSoilSampleLocal,
} from "../services/farmersNetworkService";
import { getFarmerByIdLocal } from "../services/farmerService";
import { fetchMobileNetworkOverview } from "../services/backendApi";
import { getUserProfile } from "../services/userProfile";
import { processSyncQueue } from "../services/syncService";
import { colors, fonts, spacing, radius } from "../constants/theme";

type Row = {
  id: string;
  farmerName: string;
  sampleDate: string;
  photoUri: string | null;
  supervisorName: string | null;
};

export default function SoilSampleSubmitScreen({ navigation }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [supervisors, setSupervisors] = useState<{ value: string; label: string }[]>([]);
  const [supervisorId, setSupervisorId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const tests = await listCollectedSoilSamples();
    const mapped = await Promise.all(
      tests.map(async (test) => {
        const farmer = await getFarmerByIdLocal(test.farmerId).catch(() => null);
        return {
          id: test.id,
          farmerName: farmer?.farmerName || "Farmer",
          sampleDate: test.sampleDate,
          photoUri: test.samplePhotoUri || test.samplePhotoUrl,
          supervisorName: test.submittedToSupervisorName,
        };
      }),
    );
    setRows(mapped);
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      load().catch(() => {});
    });
    load().catch(() => {});
    fetchMobileNetworkOverview()
      .then((overview) => {
        const options = (overview.supervisors ?? []).map((person) => ({
          value: person.id,
          label: person.full_name,
        }));
        setSupervisors(options);
        setSupervisorId((current) =>
          current && options.some((item) => item.value === current)
            ? current
            : options[0]?.value || "",
        );
      })
      .catch(() => setSupervisors([]));
    return unsubscribe;
  }, [navigation, load]);

  async function submit(id: string) {
    if (!supervisorId) {
      Alert.alert("Required", "Select a supervisor first.");
      return;
    }
    try {
      setSavingId(id);
      const supervisor = supervisors.find((item) => item.value === supervisorId);
      const profile = await getUserProfile();
      if (!profile) {
        Alert.alert("Error", "You must be signed in.");
        return;
      }
      await submitSoilSampleLocal(id, {
        id: supervisorId,
        name: supervisor?.label || "Supervisor",
      });
      processSyncQueue();
      await load();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await processSyncQueue();
    await load();
    setRefreshing(false);
  }

  return (
    <ScreenShell>
      <View style={styles.header}>
        <Text style={styles.title}>Submit samples</Text>
        <Text style={styles.subtitle}>
          Collected samples stay here until you select a supervisor and submit.
        </Text>
        {supervisors.length ? (
          <FormPicker
            label="Submit to supervisor *"
            value={supervisorId}
            options={supervisors}
            onValueChange={setSupervisorId}
            placeholder="Select supervisor…"
          />
        ) : (
          <Text style={styles.hint}>
            No assigned supervisor found. Ask your supervisor to be linked first.
          </Text>
        )}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brunswick}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No collected samples waiting to submit.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.farmerName}</Text>
            <Text style={styles.meta}>
              {item.sampleDate} · {soilTestStatusLabel("collected")}
            </Text>
            {item.photoUri ? (
              <Image source={{ uri: item.photoUri }} style={styles.thumb} />
            ) : null}
            <PrimaryButton
              title="Submit sample"
              onPress={() => submit(item.id)}
              loading={savingId === item.id}
              disabled={!supervisorId}
            />
          </View>
        )}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.brunswick,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: spacing.sm,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.smoke,
    lineHeight: 20,
  },
  hint: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.smoke,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 8,
  },
  name: {
    fontFamily: fonts.bold,
    color: colors.brunswick,
    fontSize: 16,
  },
  meta: {
    fontFamily: fonts.regular,
    color: colors.smoke,
    fontSize: 13,
  },
  thumb: {
    width: "100%",
    height: 140,
    borderRadius: radius.md,
    backgroundColor: colors.chalk,
  },
  empty: {
    paddingTop: 48,
    textAlign: "center",
    fontFamily: fonts.regular,
    color: colors.smoke,
  },
});
