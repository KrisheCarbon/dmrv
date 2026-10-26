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
import { colors, fonts, spacing, radius, typeScale } from "../constants/theme";
import type { ConsentPhotoCapture } from "@krishecarbon/shared";
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

type ConsentPhotoDraft = ConsentPhotoCapture & { uri: string };

function consentPhotos(value: unknown): ConsentPhotoDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item) {
      return [{ uri: item, latitude: null, longitude: null, captured_at: null }];
    }
    if (!item || typeof item !== "object" || typeof (item as ConsentPhotoDraft).uri !== "string") {
      return [];
    }
    const photo = item as ConsentPhotoDraft;
    return [
      {
        uri: photo.uri,
        latitude: typeof photo.latitude === "number" ? photo.latitude : null,
        longitude: typeof photo.longitude === "number" ? photo.longitude : null,
        captured_at: typeof photo.captured_at === "string" ? photo.captured_at : null,
      },
    ];
  });
}

const EMPTY_CONSENT = {
  selectedFarmerId: "",
  agreement_type: "Farmer consent",
  consent_date: new Date().toISOString().slice(0, 10),
  valid_to: todayPlusYears(1),
  photos: [] as ConsentPhotoDraft[],
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
  const photos = consentPhotos(form.photos);

  useEffect(() => {
    if (!hydrated || restoredFromDraft) return;
    if (paramFarmerId) {
      setForm((prev) => ({ ...prev, selectedFarmerId: paramFarmerId }));
    }
  }, [paramFarmerId, hydrated, restoredFromDraft, setForm]);

  async function addPhoto() {
    try {
      if (photos.length >= MAX_PHOTOS) {
        Alert.alert("Limit", "Maximum 2 document photos.");
        return;
      }
      setCapturing(true);
      const captured = await captureAndSaveFieldPhoto({ preciseLocation: true });
      if (!captured) return;
      setForm((prev) => {
        const current = consentPhotos(prev.photos);
        if (current.length >= MAX_PHOTOS) {
          Alert.alert("Limit", "Maximum 2 document photos.");
          return prev;
        }
        return {
          ...prev,
          photos: [
            ...current,
            {
              uri: captured.uri,
              latitude: captured.metadata.latitude,
              longitude: captured.metadata.longitude,
              captured_at: captured.metadata.captured_at,
            },
          ],
        };
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
      photos: consentPhotos(prev.photos).filter((photo) => photo.uri !== uri),
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
    if (photos.length < MIN_PHOTOS) {
      Alert.alert("Required", "Upload at least one document photo.");
      return;
    }
    if (photos.length > MAX_PHOTOS) {
      Alert.alert("Limit", "Maximum 2 document photos.");
      return;
    }
    if (photos.some((photo) => photo.latitude == null || photo.longitude == null)) {
      Alert.alert(
        "Location needed",
        "Retake the consent photo so the place it was taken is saved. It can be outside the farm.",
      );
      return;
    }
    try {
      setLoading(true);
      await saveConsentLocal(farmerId, {
        agreementType: "Farmer consent",
        consentDate: form.consent_date,
        validTo: form.valid_to,
        photos: photos.map((photo) => photo.uri),
        photoCaptures: photos.map((photo) => ({
          latitude: photo.latitude,
          longitude: photo.longitude,
          captured_at: photo.captured_at,
        })),
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
          Signed date, expiry, and photos. The photos can be taken outside the farm.
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
          uris={photos.map((photo) => photo.uri)}
          max={MAX_PHOTOS}
          capturing={capturing}
          onAdd={addPhoto}
          onRemove={removePhoto}
          addLabel={
            photos.length >= MAX_PHOTOS
              ? "Maximum 2 photos"
              : `Upload / take photo (${photos.length}/${MAX_PHOTOS})`
          }
          hint="1–2 photos. Can be taken outside the farm. The place each photo was taken is saved."
        />
        {photos.map((photo, index) =>
          photo.latitude != null && photo.longitude != null ? (
            <Text key={photo.uri} style={styles.location}>
              Photo {index + 1} taken at {photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}
            </Text>
          ) : null,
        )}

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
    fontSize: typeScale.label,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  location: {
    fontSize: typeScale.label,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
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
