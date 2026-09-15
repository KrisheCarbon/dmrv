import React, { useCallback, useEffect, useState } from "react";
import {
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  Pressable,
  Image,
  View,
} from "react-native";
import { soilTestStatusLabel } from "@krishecarbon/shared";
import { ScreenShell } from "../components/ScreenHeader";
import FormDateField from "../components/FormDateField";
import FormPicker from "../components/FormPicker";
import FormMultiSelectDropdown from "../components/FormMultiSelectDropdown";
import PrimaryButton from "../components/PrimaryButton";
import FarmerPicker from "../components/FarmerPicker";
import {
  listFieldsForFarmer,
  saveSoilTestLocal,
} from "../services/farmersNetworkService";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import { fetchMobileNetworkOverview } from "../services/backendApi";
import { getUserProfile } from "../services/userProfile";
import { processSyncQueue } from "../services/syncService";
import { colors, fonts, spacing, radius } from "../constants/theme";

export default function SoilTestFormScreen({ route, navigation }) {
  const paramFarmerId = route.params?.farmerId ?? "";
  const [selectedFarmerId, setSelectedFarmerId] = useState(paramFarmerId);
  const farmerId = selectedFarmerId || paramFarmerId;
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState("");
  const [userId, setUserId] = useState("");
  const [fields, setFields] = useState<{ value: string; label: string }[]>([]);
  const [supervisors, setSupervisors] = useState<{ value: string; label: string }[]>([]);
  const [form, setForm] = useState({
    fieldIds: [] as string[],
    sampleDate: new Date().toISOString().slice(0, 10),
    sampleLat: null as number | null,
    sampleLng: null as number | null,
    samplePhotoUri: "" as string,
    supervisorId: "",
  });

  useEffect(() => {
    if (paramFarmerId) setSelectedFarmerId(paramFarmerId);
  }, [paramFarmerId]);

  useEffect(() => {
    getUserProfile()
      .then((profile) => {
        setRole(profile?.role || "");
        setUserId(profile?.id || "");
      })
      .catch(() => {});
  }, []);

  const isSupervisor =
    role === "supervisor" || role === "admin" || role === "manager";

  const loadFields = useCallback(async () => {
    if (!farmerId) {
      setFields([]);
      setForm((p) => ({ ...p, fieldIds: [] }));
      return;
    }
    const list = await listFieldsForFarmer(farmerId);
    const options = list
      .filter((f) => f.status === "active")
      .map((f) => ({
        value: f.id,
        label: `${f.fieldCode} · ${f.ownershipType} · ${f.calculatedArea ?? "?"} ac`,
      }));
    setFields(options);
    setForm((p) => ({
      ...p,
      fieldIds: p.fieldIds.filter((id) => options.some((o) => o.value === id)),
    }));
  }, [farmerId]);

  useEffect(() => {
    loadFields().catch(() => {});
  }, [loadFields]);

  useEffect(() => {
    if (isSupervisor) return;
    fetchMobileNetworkOverview()
      .then((overview) => {
        const options = (overview.supervisors ?? []).map((person) => ({
          value: person.id,
          label: person.full_name,
        }));
        setSupervisors(options);
        setForm((p) => ({
          ...p,
          supervisorId:
            options.some((o) => o.value === p.supervisorId) && p.supervisorId
              ? p.supervisorId
              : options[0]?.value || "",
        }));
      })
      .catch(() => setSupervisors([]));
  }, [isSupervisor]);

  async function captureSamplePhoto() {
    try {
      const captured = await captureAndSaveFieldPhoto();
      if (!captured) return;
      setForm((p) => ({
        ...p,
        samplePhotoUri: captured.uri,
        sampleLat: captured.metadata.latitude,
        sampleLng: captured.metadata.longitude,
      }));
    } catch (err) {
      Alert.alert("Photo", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSave() {
    if (!farmerId) {
      Alert.alert("Required", "Select a farmer from the dropdown.");
      return;
    }
    if (form.fieldIds.length === 0) {
      Alert.alert("Required", "Select one or more fields for this soil sample.");
      return;
    }
    if (!form.samplePhotoUri) {
      Alert.alert("Required", "Take a GPS-tagged sample photo.");
      return;
    }
    if (!isSupervisor && !form.supervisorId) {
      Alert.alert("Required", "Select the supervisor to submit this sample to.");
      return;
    }

    try {
      setLoading(true);
      const supervisor = supervisors.find((item) => item.value === form.supervisorId);
      await saveSoilTestLocal(farmerId, {
        fieldIds: form.fieldIds,
        sampleDate: form.sampleDate,
        sampleLat: form.sampleLat,
        sampleLng: form.sampleLng,
        samplePhotoUri: form.samplePhotoUri,
        submittedToSupervisorId: isSupervisor ? userId : form.supervisorId,
        submittedToSupervisorName: isSupervisor ? "Self" : supervisor?.label,
        collectedBy: userId,
        collectedByRole: role || "climapreneur",
      });
      processSyncQueue();
      Alert.alert(
        "Saved",
        isSupervisor
          ? "Sample recorded as collected."
          : `Sample submitted. Status: ${soilTestStatusLabel("submitted")}.`,
        [{ text: "OK", onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenShell>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Soil testing</Text>
        <Text style={styles.subtitle}>
          Pick a farmer first — only that farmer's fields appear. You can merge multiple fields into one sample.
        </Text>

        <FarmerPicker value={farmerId} onChange={setSelectedFarmerId} />

        {farmerId && fields.length === 0 ? (
          <Text style={styles.hint}>
            No fields for this farmer yet. Add fields in Farms onboarding before soil testing.
          </Text>
        ) : farmerId ? (
          <FormMultiSelectDropdown
            label="Fields *"
            placeholder="Select one or more fields…"
            values={form.fieldIds}
            options={fields}
            onChange={(values) => setForm((p) => ({ ...p, fieldIds: values }))}
            emptyText="No fields for this farmer."
          />
        ) : null}

        <FormDateField
          label="Sample date"
          value={form.sampleDate}
          onChange={(t) => setForm((p) => ({ ...p, sampleDate: t }))}
        />

        <Pressable style={styles.locBtn} onPress={captureSamplePhoto}>
          <Text style={styles.locBtnText}>Take GPS-tagged sample photo *</Text>
        </Pressable>
        {form.samplePhotoUri ? (
          <View style={styles.photoWrap}>
            <Image source={{ uri: form.samplePhotoUri }} style={styles.photo} />
            {form.sampleLat != null ? (
              <Text style={styles.hint}>
                {Number(form.sampleLat).toFixed(6)}, {Number(form.sampleLng).toFixed(6)}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.hint}>
            The photo is watermarked with GPS. Sample location description is not needed.
          </Text>
        )}

        {isSupervisor ? (
          <Text style={styles.hint}>
            You are collecting this sample yourself. It will be marked received immediately.
          </Text>
        ) : (
          <FormPicker
            label="Submit sample to supervisor *"
            value={form.supervisorId}
            options={supervisors}
            onValueChange={(v) => setForm((p) => ({ ...p, supervisorId: v }))}
            placeholder="Select assigned supervisor…"
            enabled={supervisors.length > 0}
          />
        )}

        {!isSupervisor && supervisors.length === 0 ? (
          <Text style={styles.hint}>
            No assigned supervisor found. Ask your supervisor to be linked to your producer first.
          </Text>
        ) : null}

        <PrimaryButton title="Save soil sample" onPress={handleSave} loading={loading} />
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.brunswick,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.smoke,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  locBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.chalk,
  },
  locBtnText: {
    fontFamily: fonts.medium,
    color: colors.brunswick,
    fontSize: 13,
  },
  hint: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.smoke,
    lineHeight: 18,
  },
  photoWrap: {
    gap: 6,
  },
  photo: {
    width: "100%",
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.chalk,
  },
});
