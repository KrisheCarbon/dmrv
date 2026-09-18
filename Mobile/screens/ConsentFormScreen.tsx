import React, { useEffect, useState } from "react";
import {
  Text,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { ScreenShell } from "../components/ScreenHeader";
import FormPicker from "../components/FormPicker";
import FormDateField from "../components/FormDateField";
import PrimaryButton from "../components/PrimaryButton";
import FarmerPicker from "../components/FarmerPicker";
import PhotoSlot from "../components/PhotoSlot";
import { saveConsentLocal } from "../services/farmersNetworkService";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import { processSyncQueue } from "../services/syncService";
import { colors, fonts, spacing, radius } from "../constants/theme";
import { usePersistedForm } from "../hooks/usePersistedForm";

const AGREEMENT_TYPES = [
  { value: "Farmer consent", label: "Farmer consent" },
];

const MIN_PHOTOS = 1;
const MAX_PHOTOS = 2;

function todayPlusYears(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

const EMPTY_CONSENT = {
  selectedFarmerId: "",
  agreement_type: "Farmer consent",
  consent_date: new Date().toISOString().slice(0, 10),
  valid_to: todayPlusYears(1),
  photos: [] as string[],
};

export default function ConsentFormScreen({ route, navigation }) {
  const paramFarmerId = route.params?.farmerId ?? "";
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const {
    value: form,
    setValue: setForm,
    hydrated,
    restoredFromDraft,
    clearDraft,
  } = usePersistedForm("consent-form", {
    ...EMPTY_CONSENT,
    selectedFarmerId: paramFarmerId,
    valid_to: todayPlusYears(1),
    consent_date: new Date().toISOString().slice(0, 10),
  });
  const farmerId = form.selectedFarmerId;

  useEffect(() => {
    if (!hydrated || restoredFromDraft) return;
    if (paramFarmerId) {
      setForm((prev) => ({ ...prev, selectedFarmerId: paramFarmerId }));
    }
  }, [paramFarmerId, hydrated, restoredFromDraft, setForm]);

  async function addPhoto() {
    try {
      if (form.photos.length >= MAX_PHOTOS) {
        Alert.alert("Limit", "Maximum 2 document photos.");
        return;
      }
      setCapturing(true);
      const captured = await captureAndSaveFieldPhoto();
      if (!captured) return;
      setForm((prev) => {
        if (prev.photos.length >= MAX_PHOTOS) {
          Alert.alert("Limit", "Maximum 2 document photos.");
          return prev;
        }
        return { ...prev, photos: [...prev.photos, captured.uri] };
      });
    } catch (err) {
      Alert.alert("Photo", err instanceof Error ? err.message : String(err));
    } finally {
      setCapturing(false);
    }
  }

  function removePhoto(uri: string) {
    setForm((prev) => ({
      ...prev,
      photos: prev.photos.filter((photo) => photo !== uri),
    }));
  }

  async function handleSave() {
    if (!farmerId) {
      Alert.alert("Required", "Select a farmer from the dropdown.");
      return;
    }
    if (!form.consent_date.trim()) {
      Alert.alert("Required", "Signed date is required.");
      return;
    }
    if (!form.valid_to.trim()) {
      Alert.alert("Required", "Document expiry date is required.");
      return;
    }
    if (form.photos.length < MIN_PHOTOS) {
      Alert.alert("Required", "Upload at least one document photo.");
      return;
    }
    if (form.photos.length > MAX_PHOTOS) {
      Alert.alert("Limit", "Maximum 2 document photos.");
      return;
    }
    try {
      setLoading(true);
      await saveConsentLocal(farmerId, {
        agreementType: "Farmer consent",
        consentDate: form.consent_date,
        validTo: form.valid_to,
        photos: form.photos,
        consentStatus: "active",
      });
      processSyncQueue();
      await clearDraft();
      Alert.alert("Saved", "Farmer consent recorded.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!hydrated) {
    return <ScreenShell />;
  }

  return (
    <ScreenShell>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Farmer consent</Text>
        <Text style={styles.subtitle}>
          Signed date, expiry, and photos.
        </Text>

        <FarmerPicker
          value={farmerId}
          onChange={(id) => setForm((prev) => ({ ...prev, selectedFarmerId: id }))}
        />

        <FormPicker
          label="Document type"
          value={form.agreement_type}
          options={AGREEMENT_TYPES}
          onValueChange={(v) => setForm((p) => ({ ...p, agreement_type: v }))}
        />
        <FormDateField
          label="Signed date *"
          value={form.consent_date}
          onChange={(t) => setForm((p) => ({ ...p, consent_date: t }))}
        />
        <FormDateField
          label="Document expiry date *"
          value={form.valid_to}
          onChange={(t) => setForm((p) => ({ ...p, valid_to: t }))}
        />

        <PhotoSlot
          label="Document photos"
          required
          uris={form.photos}
          max={MAX_PHOTOS}
          capturing={capturing}
          onAdd={addPhoto}
          onRemove={removePhoto}
          addLabel={
            form.photos.length >= MAX_PHOTOS
              ? "Maximum 2 photos"
              : `Upload / take photo (${form.photos.length}/${MAX_PHOTOS})`
          }
          hint="1–2 photos. Tap to view. Use the red × on the photo to remove it."
        />

        <PrimaryButton title="Save farmer consent" onPress={handleSave} loading={loading} />
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
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.smoke,
    lineHeight: 16,
    marginBottom: spacing.sm,
  },
  section: {
    marginTop: spacing.md,
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.brunswick,
  },
  hint: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.smoke,
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
