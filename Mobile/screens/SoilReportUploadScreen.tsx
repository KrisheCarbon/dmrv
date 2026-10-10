import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Pressable,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { ScreenShell } from "../components/ScreenHeader";
import FormPicker from "../components/FormPicker";
import PrimaryButton from "../components/PrimaryButton";
import {
  getSoilTestById,
  listReadyToTestSoilSamples,
  saveSoilReportLocal,
} from "../services/farmersNetworkService";
import { getFarmerByIdLocal } from "../services/farmerService";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import { processSyncQueue } from "../services/syncService";
import { pullSoilNetworkFromServer } from "../services/farmerNetworkSync";
import { colors, fonts, spacing, radius, typeScale } from "../constants/theme";
import PhotoSlot from "../components/PhotoSlot";
import { usePersistedForm } from "../hooks/usePersistedForm";

type SampleOption = {
  value: string;
  label: string;
  code: string;
  farmer: string;
  date: string;
};

/** Attach the lab report to a sample that is ready to test; it then shows as Tested. */
export default function SoilReportUploadScreen({ route, navigation }) {
  const paramSampleId: string = route?.params?.sampleId ?? "";
  const [options, setOptions] = useState<SampleOption[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const {
    value,
    setValue,
    hydrated,
    clearDraft,
  } = usePersistedForm("soil-report", {
    sampleId: paramSampleId,
    documentUri: "",
    documentKind: "" as "pdf" | "photo" | "",
  });
  const { sampleId, documentUri, documentKind } = value;

  const load = useCallback(async () => {
    setListLoading(true);
    await pullSoilNetworkFromServer().catch(() => {});
    const tests = await listReadyToTestSoilSamples();
    const mapped = await Promise.all(
      tests.map(async (test) => {
        const farmer = test.farmerName
          ? null
          : await getFarmerByIdLocal(test.farmerId).catch(() => null);
        const farmerName = test.farmerName || farmer?.farmerName || "Farmer";
        const code = test.sampleCode || "Number pending";
        return {
          value: test.id,
          label: `${code} · ${farmerName} · ${test.sampleDate}`,
          code,
          farmer: farmerName,
          date: test.sampleDate,
        };
      }),
    );
    setOptions(mapped);
    setListLoading(false);
    // Only keep a selection that is still waiting for a report; never pick one silently.
    setValue((current) => {
      const wanted = paramSampleId || current.sampleId;
      return {
        ...current,
        sampleId: wanted && mapped.some((item) => item.value === wanted) ? wanted : "",
      };
    });
  }, [setValue, paramSampleId]);

  useEffect(() => {
    if (!hydrated) return;
    load().catch(() => setListLoading(false));
  }, [load, hydrated]);

  const selected = useMemo(
    () => options.find((option) => option.value === sampleId) ?? null,
    [options, sampleId],
  );

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

  function clearDocument() {
    setValue((prev) => ({ ...prev, documentUri: "", documentKind: "" }));
  }

  async function handleSave() {
    if (!sampleId || !selected) {
      Alert.alert("Required", "Select the soil sample this report is for.");
      return;
    }
    if (!documentUri) {
      Alert.alert("Required", "Upload the lab PDF or take a photo of the results.");
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
      Alert.alert("Report saved", `Sample ${selected.code} is now marked Tested.`, [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!hydrated) {
    return <ScreenShell>{null}</ScreenShell>;
  }

  return (
    <ScreenShell>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Soil reports</Text>
        <Text style={styles.subtitle}>
          Choose a sample that is ready to test, then attach the lab PDF or a photo of
          the results.
        </Text>

        {listLoading ? (
          <Text style={styles.hint}>Loading samples ready to test…</Text>
        ) : options.length ? (
          <FormPicker
            label="Soil sample *"
            value={sampleId}
            options={options.map(({ value: optionValue, label }) => ({
              value: optionValue,
              label,
            }))}
            onValueChange={(next) => setValue((prev) => ({ ...prev, sampleId: next }))}
            placeholder="Select sample number…"
            searchable
            searchPlaceholder="Search sample number or farmer"
          />
        ) : (
          <Text style={styles.hint}>
            No samples are ready to test. A sample appears here once a supervisor has
            collected it.
          </Text>
        )}

        {selected ? (
          <View style={styles.selectedCard}>
            <Text style={styles.selectedCode}>{selected.code}</Text>
            <Text style={styles.hint}>
              {selected.farmer} · {selected.date}
            </Text>
          </View>
        ) : null}

        <Pressable style={styles.locBtn} onPress={pickPdf} accessibilityRole="button">
          <Text style={styles.locBtnText}>
            {documentKind === "pdf" && documentUri ? "Choose a different PDF" : "Upload PDF"}
          </Text>
        </Pressable>
        {documentKind === "pdf" && documentUri ? (
          <Pressable style={styles.textButton} onPress={clearDocument}>
            <Text style={styles.textButtonLabel}>PDF selected · Remove</Text>
          </Pressable>
        ) : null}
        <PhotoSlot
          label="Results photo"
          uris={documentKind === "photo" && documentUri ? [documentUri] : []}
          capturing={capturing}
          onAdd={takePhoto}
          onRemove={clearDocument}
          addLabel={
            documentKind === "photo" && documentUri
              ? "Retake photo of results"
              : "Take photo of results"
          }
          hint="Photograph the lab sheet, or upload a PDF above."
        />

        <PrimaryButton
          title="Submit report"
          onPress={handleSave}
          loading={loading}
          disabled={!selected || !documentUri}
        />
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
    fontSize: typeScale.title,
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
  selectedCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    gap: 2,
  },
  selectedCode: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    letterSpacing: 0.5,
  },
  locBtn: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: radius.sm,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.chalk,
  },
  locBtnText: {
    fontFamily: fonts.medium,
    color: colors.brunswick,
    fontSize: typeScale.label,
  },
  textButton: {
    minHeight: 48,
    justifyContent: "center",
  },
  textButtonLabel: {
    fontFamily: fonts.medium,
    color: colors.textSecondary,
    fontSize: typeScale.label,
  },
  hint: {
    fontSize: typeScale.label,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
