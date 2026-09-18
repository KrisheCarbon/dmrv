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
import {
  MIN_SOIL_SAMPLE_SITES,
  completedSoilSampleSites,
  createSoilSampleSites,
  soilSampleSiteName,
  type SoilSampleSite,
} from "@krishecarbon/shared";
import { ScreenShell } from "../components/ScreenHeader";
import FormDateField from "../components/FormDateField";
import FormMultiSelectDropdown from "../components/FormMultiSelectDropdown";
import PrimaryButton from "../components/PrimaryButton";
import FarmerPicker from "../components/FarmerPicker";
import {
  listFieldsForFarmer,
  saveSoilTestLocal,
} from "../services/farmersNetworkService";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import { formatWatermarkTime } from "../services/fieldPhoto";
import { getUserProfile } from "../services/userProfile";
import { processSyncQueue } from "../services/syncService";
import { generateId } from "../database/sqlHelpers";
import { colors, fonts, spacing, radius } from "../constants/theme";

function relabelSites(sites: SoilSampleSite[]): SoilSampleSite[] {
  return sites.map((site, index) => ({
    ...site,
    name: soilSampleSiteName(index),
  }));
}

export default function SoilTestFormScreen({ route, navigation }) {
  const paramFarmerId = route.params?.farmerId ?? "";
  const [selectedFarmerId, setSelectedFarmerId] = useState(paramFarmerId);
  const farmerId = selectedFarmerId;
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState("");
  const [userId, setUserId] = useState("");
  const [fields, setFields] = useState<{ value: string; label: string }[]>([]);
  const [form, setForm] = useState({
    fieldIds: [] as string[],
    sampleDate: new Date().toISOString().slice(0, 10),
    sampleLat: null as number | null,
    sampleLng: null as number | null,
    samplePhotoUri: "" as string,
    sampleCapturedAt: "" as string,
    sampleSites: createSoilSampleSites(),
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
  const completedSites = completedSoilSampleSites(form.sampleSites).length;

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

  async function captureSitePhoto(siteId: string) {
    try {
      const captured = await captureAndSaveFieldPhoto();
      if (!captured) return;
      setForm((prev) => ({
        ...prev,
        sampleSites: prev.sampleSites.map((site) =>
          site.id === siteId
            ? {
                ...site,
                photo_uri: captured.uri,
                latitude: captured.metadata.latitude,
                longitude: captured.metadata.longitude,
                captured_at: captured.metadata.captured_at,
              }
            : site,
        ),
      }));
    } catch (err) {
      Alert.alert("Photo", err instanceof Error ? err.message : String(err));
    }
  }

  async function captureMixedSamplePhoto() {
    try {
      const captured = await captureAndSaveFieldPhoto();
      if (!captured) return;
      setForm((p) => ({
        ...p,
        samplePhotoUri: captured.uri,
        sampleLat: captured.metadata.latitude,
        sampleLng: captured.metadata.longitude,
        sampleCapturedAt: captured.metadata.captured_at,
      }));
    } catch (err) {
      Alert.alert("Photo", err instanceof Error ? err.message : String(err));
    }
  }

  function addSamplingPoint() {
    setForm((prev) => ({
      ...prev,
      sampleSites: relabelSites([
        ...prev.sampleSites,
        {
          id: generateId(),
          name: soilSampleSiteName(prev.sampleSites.length),
          photo_uri: null,
          photo_url: null,
          latitude: null,
          longitude: null,
          captured_at: null,
        },
      ]),
    }));
  }

  function removeSamplingPoint(siteId: string) {
    setForm((prev) => {
      if (prev.sampleSites.length <= MIN_SOIL_SAMPLE_SITES) return prev;
      return {
        ...prev,
        sampleSites: relabelSites(
          prev.sampleSites.filter((site) => site.id !== siteId),
        ),
      };
    });
  }

  async function handleSave() {
    if (!farmerId) {
      Alert.alert("Required", "Select a farmer from the dropdown.");
      return;
    }
    if (form.fieldIds.length === 0) {
      Alert.alert("Required", "Select one or more farms for this soil sample.");
      return;
    }
    if (completedSites < MIN_SOIL_SAMPLE_SITES) {
      Alert.alert(
        "Required",
        `Take GPS-tagged photos at least ${MIN_SOIL_SAMPLE_SITES} sampling points, then mix the soil.`,
      );
      return;
    }
    if (!form.samplePhotoUri) {
      Alert.alert(
        "Required",
        "After mixing the soil from all points, take a photo of the mixed sample.",
      );
      return;
    }

    try {
      setLoading(true);
      await saveSoilTestLocal(farmerId, {
        fieldIds: form.fieldIds,
        sampleDate: form.sampleDate,
        sampleLat: form.sampleLat,
        sampleLng: form.sampleLng,
        samplePhotoUri: form.samplePhotoUri,
        sampleSites: form.sampleSites,
        submittedToSupervisorId: isSupervisor ? userId : null,
        submittedToSupervisorName: isSupervisor ? "Self" : null,
        collectedBy: userId,
        collectedByRole: role || "climapreneur",
        status: isSupervisor ? "accepted" : "collected",
      });
      processSyncQueue();
      Alert.alert(
        "Saved",
        isSupervisor
          ? "Sample recorded as collected."
          : "Sample collected. Submit it to a supervisor from Submit samples.",
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
          Photograph 4+ spots, mix, then take the mixed sample photo.
        </Text>

        <FarmerPicker
          value={farmerId}
          onChange={setSelectedFarmerId}
          requireFields
        />

        {farmerId && fields.length === 0 ? (
          <Text style={styles.hint}>
            No farms for this farmer yet. Add farms in Farms onboarding before soil testing.
          </Text>
        ) : farmerId ? (
          <FormMultiSelectDropdown
            label="Farms *"
            placeholder="Select one or more farms…"
            values={form.fieldIds}
            options={fields}
            onChange={(values) => setForm((p) => ({ ...p, fieldIds: values }))}
            emptyText="No farms for this farmer."
          />
        ) : null}

        <FormDateField
          label="Sample date"
          value={form.sampleDate}
          onChange={(t) => setForm((p) => ({ ...p, sampleDate: t }))}
        />

        <Text style={styles.section}>
          Sampling points * ({completedSites}/{MIN_SOIL_SAMPLE_SITES} minimum)
        </Text>
        <Text style={styles.hint}>
          Photograph each dig spot. Minimum {MIN_SOIL_SAMPLE_SITES}.
        </Text>

        {form.sampleSites.map((site) => {
          const photoUri = site.photo_uri || site.photo_url;
          return (
            <View key={site.id} style={styles.siteCard}>
              <Text style={styles.siteTitle}>{site.name}</Text>
              <Pressable
                style={styles.locBtn}
                onPress={() => captureSitePhoto(site.id)}
              >
                <Text style={styles.locBtnText}>
                  {photoUri ? `Retake ${site.name} photo` : `Take ${site.name} GPS photo`}
                </Text>
              </Pressable>
              {photoUri ? (
                <View style={styles.photoWrap}>
                  <Image source={{ uri: photoUri }} style={styles.sitePhoto} />
                  {site.latitude != null && site.longitude != null ? (
                    <Text style={styles.hint}>
                      GPS {Number(site.latitude).toFixed(6)},{" "}
                      {Number(site.longitude).toFixed(6)}
                    </Text>
                  ) : null}
                  {site.captured_at ? (
                    <Text style={styles.hint}>
                      Time {formatWatermarkTime(site.captured_at)}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {form.sampleSites.length > MIN_SOIL_SAMPLE_SITES ? (
                <Pressable onPress={() => removeSamplingPoint(site.id)}>
                  <Text style={styles.linkMuted}>Remove {site.name}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}

        <Pressable style={styles.locBtn} onPress={addSamplingPoint}>
          <Text style={styles.locBtnText}>Add another sampling point</Text>
        </Pressable>

        <Text style={styles.section}>Mixed sample photo *</Text>
        <Text style={styles.hint}>
          Mix the soil, then photograph the mixed sample.
        </Text>
        <Pressable style={styles.locBtn} onPress={captureMixedSamplePhoto}>
          <Text style={styles.locBtnText}>
            {form.samplePhotoUri
              ? "Retake mixed sample photo"
              : "Take mixed sample photo *"}
          </Text>
        </Pressable>
        {form.samplePhotoUri ? (
          <View style={styles.photoWrap}>
            <Image source={{ uri: form.samplePhotoUri }} style={styles.photo} />
            {form.sampleLat != null ? (
              <Text style={styles.hint}>
                GPS {Number(form.sampleLat).toFixed(6)},{" "}
                {Number(form.sampleLng).toFixed(6)}
              </Text>
            ) : null}
            {form.sampleCapturedAt ? (
              <Text style={styles.hint}>
                Time {formatWatermarkTime(form.sampleCapturedAt)}
              </Text>
            ) : null}
          </View>
        ) : null}

        {isSupervisor ? (
          <Text style={styles.hint}>Saved as accepted.</Text>
        ) : (
          <Text style={styles.hint}>
            Saved as collected. Submit it from Submit samples.
          </Text>
        )}

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
  siteCard: {
    gap: 8,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  siteTitle: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.brunswick,
  },
  photoWrap: {
    gap: 6,
  },
  sitePhoto: {
    width: "100%",
    height: 140,
    borderRadius: radius.md,
    backgroundColor: colors.chalk,
  },
  photo: {
    width: "100%",
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.chalk,
  },
  linkMuted: {
    fontFamily: fonts.medium,
    color: colors.smoke,
    fontSize: 13,
  },
});
