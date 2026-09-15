import React, { useEffect, useState } from "react";
import {
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  Pressable,
  Image,
  View,
} from "react-native";
import { ScreenShell } from "../components/ScreenHeader";
import FormInput from "../components/FormInput";
import FormPicker from "../components/FormPicker";
import FormDateField from "../components/FormDateField";
import PrimaryButton from "../components/PrimaryButton";
import FarmerPicker from "../components/FarmerPicker";
import { saveConsentLocal } from "../services/farmersNetworkService";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import { processSyncQueue } from "../services/syncService";
import { colors, fonts, spacing, radius } from "../constants/theme";

const AGREEMENT_TYPES = [
  { value: "Farmer consent", label: "Farmer consent" },
  { value: "Lease agreement", label: "Lease agreement" },
  { value: "Program agreement", label: "Program agreement" },
  { value: "Other document", label: "Other document" },
];

function todayPlusYears(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export default function ConsentFormScreen({ route, navigation }) {
  const paramFarmerId = route.params?.farmerId ?? "";
  const [selectedFarmerId, setSelectedFarmerId] = useState(paramFarmerId);
  const farmerId = selectedFarmerId || paramFarmerId;
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    agreement_type: "Farmer consent",
    consent_date: new Date().toISOString().slice(0, 10),
    valid_to: todayPlusYears(1),
    agreement_reference: "",
    photos: [] as string[],
  });

  useEffect(() => {
    if (paramFarmerId) setSelectedFarmerId(paramFarmerId);
  }, [paramFarmerId]);

  async function addPhoto() {
    try {
      const captured = await captureAndSaveFieldPhoto();
      if (!captured) return;
      setForm((prev) => {
        if (prev.photos.length >= 8) {
          Alert.alert("Limit", "Maximum 8 document photos.");
          return prev;
        }
        return { ...prev, photos: [...prev.photos, captured.uri] };
      });
    } catch (err) {
      Alert.alert("Photo", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSave() {
    if (!farmerId) {
      Alert.alert("Required", "Select a farmer from the dropdown.");
      return;
    }
    if (!form.valid_to.trim()) {
      Alert.alert("Required", "Deadline is required.");
      return;
    }
    if (form.photos.length === 0) {
      Alert.alert("Required", "Upload at least one document photo.");
      return;
    }
    try {
      setLoading(true);
      await saveConsentLocal(farmerId, {
        agreementType: form.agreement_type,
        consentDate: form.consent_date,
        validTo: form.valid_to,
        agreementReference: form.agreement_reference,
        photos: form.photos,
        consentStatus: "active",
      });
      processSyncQueue();
      Alert.alert("Saved", "Document recorded with deadline.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
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
        <Text style={styles.title}>Consent / documents</Text>
        <Text style={styles.subtitle}>
          Select the farmer, upload photos of the document, and set a deadline.
        </Text>

        <FarmerPicker value={farmerId} onChange={setSelectedFarmerId} />

        <FormPicker
          label="Document type"
          value={form.agreement_type}
          options={AGREEMENT_TYPES}
          onValueChange={(v) => setForm((p) => ({ ...p, agreement_type: v }))}
        />
        <FormDateField
          label="Document date"
          value={form.consent_date}
          onChange={(t) => setForm((p) => ({ ...p, consent_date: t }))}
        />
        <FormDateField
          label="Deadline *"
          value={form.valid_to}
          onChange={(t) => setForm((p) => ({ ...p, valid_to: t }))}
        />
        <FormInput
          label="Reference (optional)"
          value={form.agreement_reference}
          onChangeText={(t) =>
            setForm((p) => ({ ...p, agreement_reference: t }))
          }
        />

        <Text style={styles.section}>Document photos *</Text>
        <Pressable style={styles.locBtn} onPress={addPhoto}>
          <Text style={styles.locBtnText}>Upload / take photo</Text>
        </Pressable>
        <View style={styles.photoRow}>
          {form.photos.map((uri) => (
            <Image key={uri} source={{ uri }} style={styles.thumb} />
          ))}
        </View>

        <PrimaryButton title="Save document" onPress={handleSave} loading={loading} />
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
  section: {
    marginTop: spacing.md,
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.brunswick,
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
  photoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: colors.chalk,
  },
});
