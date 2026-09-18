import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Pressable,
  Image,
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

export default function SoilReportUploadScreen({ navigation }) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [sampleId, setSampleId] = useState("");
  const [documentUri, setDocumentUri] = useState("");
  const [documentKind, setDocumentKind] = useState<"pdf" | "photo" | "">("");
  const [loading, setLoading] = useState(false);

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
    setSampleId((current) =>
      current && mapped.some((item) => item.value === current)
        ? current
        : mapped[0]?.value || "",
    );
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function pickPdf() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setDocumentUri(result.assets[0].uri);
      setDocumentKind("pdf");
    } catch (err) {
      Alert.alert("PDF", err instanceof Error ? err.message : String(err));
    }
  }

  async function takePhoto() {
    try {
      const captured = await captureAndSaveFieldPhoto();
      if (!captured) return;
      setDocumentUri(captured.uri);
      setDocumentKind("photo");
    } catch (err) {
      Alert.alert("Photo", err instanceof Error ? err.message : String(err));
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
      Alert.alert("Saved", "Soil report uploaded.", [
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
        <Text style={styles.title}>Soil reports</Text>
        <Text style={styles.subtitle}>
          Upload the lab PDF or a photo of results.
        </Text>

        {options.length ? (
          <FormPicker
            label="Soil sample *"
            value={sampleId}
            options={options}
            onValueChange={setSampleId}
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
        <Pressable style={styles.locBtn} onPress={takePhoto}>
          <Text style={styles.locBtnText}>Take photo of results</Text>
        </Pressable>

        {documentUri && documentKind === "photo" ? (
          <Image source={{ uri: documentUri }} style={styles.photo} />
        ) : documentUri ? (
          <Text style={styles.hint}>PDF selected.</Text>
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
