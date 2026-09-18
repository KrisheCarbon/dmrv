import React, { useCallback, useEffect, useState } from "react";
import {
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Pressable,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { soilTestStatusLabel } from "@krishecarbon/shared";
import { ScreenShell } from "../components/ScreenHeader";
import FormPicker from "../components/FormPicker";
import PrimaryButton from "../components/PrimaryButton";
import {
  getSoilTestById,
  listReportableSoilSamples,
  saveSoilReportLocal,
} from "../services/farmersNetworkService";
import { getFarmerByIdLocal } from "../services/farmerService";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import { processSyncQueue } from "../services/syncService";
import { colors, fonts, spacing, radius } from "../constants/theme";
import PhotoSlot from "../components/PhotoSlot";
import { usePersistedForm } from "../hooks/usePersistedForm";

export default function SoilReportUploadScreen({ navigation }) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const {
    value,
    setValue,
    hydrated,
    clearDraft,
  } = usePersistedForm("soil-report", {
    sampleId: "",
    documentUri: "",
    documentKind: "" as "pdf" | "photo" | "",
  });
  const { sampleId, documentUri, documentKind } = value;

  const load = useCallback(async () => {
    const tests = await listReportableSoilSamples();
    const mapped = await Promise.all(
      tests.map(async (test) => {
        const farmer = await getFarmerByIdLocal(test.farmerId).catch(() => null);
        return {
          value: test.id,
          label: `${farmer?.farmerName || "Farmer"} · ${test.sampleDate} · ${soilTestStatusLabel(test.status)}`,
        };
      }),
    );
    setOptions(mapped);
    setValue((current) => ({
      ...current,
      sampleId:
        current.sampleId && mapped.some((item) => item.value === current.sampleId)
          ? current.sampleId
          : mapped[0]?.value || current.sampleId,
    }));
  }, [setValue]);

  useEffect(() => {
    if (!hydrated) return;
    load().catch(() => {});
  }, [load, hydrated]);

  async function pickPdf() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setValue((prev) => ({
        ...prev,
        documentUri: result.assets[0].uri,
        documentKind: "pdf",
      }));
    } catch (err) {
      Alert.alert("PDF", err instanceof Error ? err.message : String(err));
    }
  }

  async function takePhoto() {
    try {
      setCapturing(true);
      const captured = await captureAndSaveFieldPhoto();
      if (!captured) return;
      setValue((prev) => ({
        ...prev,
        documentUri: captured.uri,
        documentKind: "photo",
      }));
    } catch (err) {
      Alert.alert("Photo", err instanceof Error ? err.message : String(err));
    } finally {
      setCapturing(false);
    }
  }

  async function handleSave() {
    if (!sampleId) {
      Alert.alert("Required", "Select a soil sample.");
      return;
    }
    if (!documentUri) {
      Alert.alert("Required", "Upload a PDF or take a photo of the results.");
      return;
    }
    try {
      setLoading(true);
      const test = await getSoilTestById(sampleId);
      await saveSoilReportLocal(test.farmerId, {
        soilTestId: sampleId,
        fieldId: test.fieldId,
        source: documentKind === "pdf" ? "Lab PDF" : "Lab photo",
        documentUri,
      });
      processSyncQueue();
      await clearDraft();
      Alert.alert("Saved", "Soil report uploaded.", [
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
        <Text style={styles.title}>Soil reports</Text>
        <Text style={styles.subtitle}>
          Upload the lab PDF or a photo of results.
        </Text>

        {options.length ? (
          <FormPicker
            label="Soil sample *"
            value={sampleId}
            options={options}
            onValueChange={(next) =>
              setValue((prev) => ({ ...prev, sampleId: next }))
            }
            placeholder="Select sample…"
          />
        ) : (
          <Text style={styles.hint}>
            No accepted or stored samples yet. Receive samples first.
          </Text>
        )}

        <Pressable style={styles.locBtn} onPress={pickPdf}>
          <Text style={styles.locBtnText}>Upload PDF</Text>
        </Pressable>
        <PhotoSlot
          label="Results photo"
          uris={documentKind === "photo" && documentUri ? [documentUri] : []}
          capturing={capturing}
          onAdd={takePhoto}
          onRemove={() =>
            setValue((prev) => ({
              ...prev,
              documentUri: "",
              documentKind: "",
            }))
          }
          addLabel={
            documentKind === "photo" && documentUri
              ? "Retake photo of results"
              : "Take photo of results"
          }
          hint="Photograph the lab sheet, or upload a PDF above."
        />
        {documentKind === "pdf" && documentUri ? (
          <Pressable
            onPress={() =>
              setValue((prev) => ({
                ...prev,
                documentUri: "",
                documentKind: "",
              }))
            }
          >
            <Text style={styles.hint}>PDF selected. Tap to remove.</Text>
          </Pressable>
        ) : null}

        <PrimaryButton title="Save report" onPress={handleSave} loading={loading} />
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
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.smoke,
    lineHeight: 18,
  },
  photo: {
    width: "100%",
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.chalk,
  },
});
