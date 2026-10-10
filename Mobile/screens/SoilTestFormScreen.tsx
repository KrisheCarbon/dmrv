import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  Pressable,
  View,
} from "react-native";
import {
  MIN_SOIL_SAMPLE_SITES,
  completedSoilSampleSites,
  createSoilSampleSites,
  hasMappedBoundary,
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
  soilFarmContaining,
} from "../services/farmersNetworkService";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import { getUserProfile, type UserProfile } from "../services/userProfile";
import { processSyncQueue } from "../services/syncService";
import { generateId } from "../database/sqlHelpers";
import type { FarmField } from "../database/types";
import { colors, fonts, spacing, radius, typeScale } from "../constants/theme";
import PhotoSlot from "../components/PhotoSlot";
import { usePersistedForm } from "../hooks/usePersistedForm";

class OutsideFarmError extends Error {}

function relabelSites(sites: SoilSampleSite[]): SoilSampleSite[] {
  return sites.map((site, index) => ({
    ...site,
    name: soilSampleSiteName(index),
  }));
}

function emptySoilForm(farmerId: string) {
  return {
    selectedFarmerId: farmerId,
    fieldIds: [] as string[],
    sampleDate: new Date().toISOString().slice(0, 10),
    sampleLat: null as number | null,
    sampleLng: null as number | null,
    samplePhotoUri: "" as string,
    sampleCapturedAt: "" as string,
    sampleSites: createSoilSampleSites(),
  };
}

function isSupervisorRole(role: string) {
  return role === "supervisor" || role === "admin" || role === "manager";
}

export default function SoilTestFormScreen({ route, navigation }) {
  const paramFarmerId = route.params?.farmerId ?? "";
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [farmerFields, setFarmerFields] = useState<FarmField[]>([]);
  const [capturingKey, setCapturingKey] = useState<string | null>(null);
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const {
    value: form,
    setValue: setForm,
    hydrated,
    restoredFromDraft,
    clearDraft,
  } = usePersistedForm("soil-test", emptySoilForm(paramFarmerId));
  const farmerId = form.selectedFarmerId;
  const role = profile?.role || "";
  const isSupervisor = isSupervisorRole(role);

  useEffect(() => {
    if (!hydrated || restoredFromDraft) return;
    if (paramFarmerId) {
      setForm((prev) => ({ ...prev, selectedFarmerId: paramFarmerId }));
    }
  }, [paramFarmerId, hydrated, restoredFromDraft, setForm]);

  useEffect(() => {
    getUserProfile()
      .then(setProfile)
      .catch(() => {});
  }, []);

  const sampleSites = Array.isArray(form.sampleSites)
    ? form.sampleSites
    : createSoilSampleSites();
  const completedSites = completedSoilSampleSites(sampleSites).length;

  const activeFields = useMemo(
    () => farmerFields.filter((field) => field.status === "active"),
    [farmerFields],
  );
  const mappedFields = useMemo(
    () => activeFields.filter((field) => hasMappedBoundary(field.boundaryGeojson)),
    [activeFields],
  );
  const unmappedCount = activeFields.length - mappedFields.length;
  const selectedFields = useMemo(
    () => mappedFields.filter((field) => form.fieldIds.includes(field.id)),
    [mappedFields, form.fieldIds],
  );
  const fieldOptions = useMemo(
    () =>
      mappedFields.map((field) => ({
        value: field.id,
        label: `${field.fieldCode} · ${field.ownershipType} · ${field.calculatedArea ?? "?"} ac`,
      })),
    [mappedFields],
  );

  const loadFields = useCallback(async () => {
    if (!farmerId) {
      setFarmerFields([]);
      setForm((p) => ({ ...p, fieldIds: [] }));
      return;
    }
    const list = await listFieldsForFarmer(farmerId);
    setFarmerFields(list);
    const usable = list.filter(
      (field) => field.status === "active" && hasMappedBoundary(field.boundaryGeojson),
    );
    setForm((p) => {
      const kept = p.fieldIds.filter((id) => usable.some((field) => field.id === id));
      return {
        ...p,
        fieldIds: kept.length === 0 && usable.length === 1 ? [usable[0].id] : kept,
      };
    });
  }, [farmerId, setForm]);

  useEffect(() => {
    if (!hydrated) return;
    loadFields().catch(() => {});
  }, [loadFields, hydrated]);

  function farmLabelFor(latitude: number | null | undefined, longitude: number | null | undefined) {
    if (latitude == null || longitude == null) return null;
    return soilFarmContaining(selectedFields, latitude, longitude)?.fieldCode ?? null;
  }

  function outsideMessage() {
    const farms = selectedFields.map((field) => field.fieldCode).join(", ");
    return `This photo was taken outside the selected farm (${farms}). Walk inside the farm boundary and take it again.`;
  }

  async function capturePhotoInsideFarm(key: string) {
    if (selectedFields.length === 0) {
      Alert.alert("Select a farm", "Choose the farm you are sampling before taking photos.");
      return null;
    }
    try {
      setCapturingKey(key);
      return await captureAndSaveFieldPhoto({
        preciseLocation: true,
        validate: (metadata) => {
          if (!soilFarmContaining(selectedFields, metadata.latitude, metadata.longitude)) {
            throw new OutsideFarmError(outsideMessage());
          }
        },
      });
    } catch (err) {
      if (err instanceof OutsideFarmError) {
        Alert.alert("Not inside the farm", err.message);
      } else {
        Alert.alert("Photo", err instanceof Error ? err.message : String(err));
      }
      return null;
    } finally {
      setCapturingKey(null);
    }
  }

  async function captureSitePhoto(siteId: string) {
    const captured = await capturePhotoInsideFarm(siteId);
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
  }

  function clearSite(site: SoilSampleSite): SoilSampleSite {
    return {
      ...site,
      photo_uri: null,
      photo_url: null,
      latitude: null,
      longitude: null,
      captured_at: null,
    };
  }

  function removeSitePhoto(siteId: string) {
    setForm((prev) => ({
      ...prev,
      sampleSites: prev.sampleSites.map((site) =>
        site.id === siteId ? clearSite(site) : site,
      ),
    }));
  }

  async function captureMixedSamplePhoto() {
    const captured = await capturePhotoInsideFarm("mixed");
    if (!captured) return;
    setForm((p) => ({
      ...p,
      samplePhotoUri: captured.uri,
      sampleLat: captured.metadata.latitude,
      sampleLng: captured.metadata.longitude,
      sampleCapturedAt: captured.metadata.captured_at,
    }));
  }

  /** Changing farms drops any photo that is not inside the new selection. */
  function changeFarms(values: string[]) {
    const nextFields = mappedFields.filter((field) => values.includes(field.id));
    const inside = (lat: number | null | undefined, lng: number | null | undefined) =>
      lat != null && lng != null && Boolean(soilFarmContaining(nextFields, lat, lng));
    const outsideSiteIds = new Set(
      sampleSites
        .filter(
          (site) =>
            (site.photo_uri || site.photo_url) && !inside(site.latitude, site.longitude),
        )
        .map((site) => site.id),
    );
    const keepMixed = !form.samplePhotoUri || inside(form.sampleLat, form.sampleLng);
    const dropped = outsideSiteIds.size + (keepMixed ? 0 : 1);
    setForm((prev) => ({
      ...prev,
      fieldIds: values,
      sampleSites: prev.sampleSites.map((site) =>
        outsideSiteIds.has(site.id) ? clearSite(site) : site,
      ),
      ...(keepMixed
        ? {}
        : { samplePhotoUri: "", sampleLat: null, sampleLng: null, sampleCapturedAt: "" }),
    }));
    if (dropped > 0) {
      Alert.alert(
        "Photos removed",
        `${dropped} photo${dropped === 1 ? " was" : "s were"} not inside the selected farm and must be retaken.`,
      );
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
    if (selectedFields.length === 0) {
      Alert.alert("Required", "Select the farm this soil sample is taken from.");
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
    if (!profile) {
      Alert.alert("Error", "You must be signed in.");
      return;
    }

    try {
      setLoading(true);
      const saved = await saveSoilTestLocal(farmerId, {
        fieldIds: selectedFields.map((field) => field.id),
        sampleDate: form.sampleDate,
        sampleLat: form.sampleLat,
        sampleLng: form.sampleLng,
        samplePhotoUri: form.samplePhotoUri,
        sampleSites: sampleSites,
        submittedToSupervisorId: isSupervisor ? profile.id : null,
        submittedToSupervisorName: isSupervisor ? profile.full_name : null,
        collectedBy: profile.id,
        collectedByName: profile.full_name,
        collectedByRole: role || "climapreneur",
        collectorCode: profile.collector_code ?? null,
        status: isSupervisor ? "accepted" : "collected",
      });
      processSyncQueue();
      await clearDraft();
      setSavedCode(saved.sampleCode);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!hydrated) {
    return <ScreenShell>{null}</ScreenShell>;
  }

  if (savedCode) {
    return (
      <ScreenShell>
        <View style={styles.doneWrap}>
          <Text style={styles.title}>Sample saved</Text>
          <Text style={styles.body}>Write this sample number on the sample bag:</Text>
          <View style={styles.codeCard}>
            <Text style={styles.code} selectable>
              {savedCode}
            </Text>
          </View>
          <Text style={styles.body}>
            {isSupervisor
              ? "The sample is ready to test."
              : "The sample is waiting for your supervisor to pick it up. Hand over the labelled bag."}
          </Text>
          <View style={styles.doneActions}>
            <PrimaryButton title="Done" onPress={() => navigation.goBack()} />
            <PrimaryButton
              title="View sample tracking"
              variant="outline"
              onPress={() => navigation.replace("SoilSamplesInbox")}
            />
          </View>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Soil testing</Text>
        <Text style={styles.subtitle}>
          Pick the farm, photograph 4+ dig spots inside it, mix, then photograph the
          mixed sample.
        </Text>

        <FarmerPicker
          value={farmerId}
          onChange={(id) => setForm((prev) => ({ ...prev, selectedFarmerId: id }))}
          requireFields
        />

        {farmerId && mappedFields.length === 0 ? (
          <Text style={styles.hint}>
            This farmer has no farm with a mapped boundary. Draw the farm boundary in
            Farms onboarding before soil testing.
          </Text>
        ) : farmerId ? (
          <FormMultiSelectDropdown
            label="Farm *"
            placeholder="Select the farm being sampled…"
            values={form.fieldIds}
            options={fieldOptions}
            onChange={changeFarms}
            emptyText="No mapped farms for this farmer."
          />
        ) : null}
        {farmerId && unmappedCount > 0 ? (
          <Text style={styles.hint}>
            {unmappedCount} farm{unmappedCount === 1 ? " is" : "s are"} hidden because
            {unmappedCount === 1 ? " its" : " their"} boundary is not mapped.
          </Text>
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
          Each photo must be taken inside the selected farm. Minimum{" "}
          {MIN_SOIL_SAMPLE_SITES}.
        </Text>

        {sampleSites.map((site) => {
          const photoUri = site.photo_uri || site.photo_url;
          const farmCode = photoUri ? farmLabelFor(site.latitude, site.longitude) : null;
          return (
            <View key={site.id} style={styles.siteCard}>
              <PhotoSlot
                label={site.name}
                required
                uris={photoUri ? [photoUri] : []}
                capturing={capturingKey === site.id}
                onAdd={() => captureSitePhoto(site.id)}
                onRemove={() => removeSitePhoto(site.id)}
                addLabel={photoUri ? `Retake ${site.name} photo` : `Take ${site.name} GPS photo`}
                hint="Photograph this dig spot inside the farm."
                metadata={
                  photoUri
                    ? [
                        {
                          latitude: site.latitude,
                          longitude: site.longitude,
                          captured_at: site.captured_at,
                        },
                      ]
                    : undefined
                }
              />
              {farmCode ? (
                <Text style={styles.inside}>✓ Inside farm {farmCode}</Text>
              ) : null}
              {sampleSites.length > MIN_SOIL_SAMPLE_SITES ? (
                <Pressable
                  style={styles.textButton}
                  onPress={() => removeSamplingPoint(site.id)}
                >
                  <Text style={styles.textButtonLabel}>Remove {site.name}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}

        <Pressable style={styles.locBtn} onPress={addSamplingPoint}>
          <Text style={styles.locBtnText}>Add another sampling point</Text>
        </Pressable>

        <PhotoSlot
          label="Mixed sample photo"
          required
          uris={form.samplePhotoUri ? [form.samplePhotoUri] : []}
          capturing={capturingKey === "mixed"}
          onAdd={captureMixedSamplePhoto}
          onRemove={() =>
            setForm((p) => ({
              ...p,
              samplePhotoUri: "",
              sampleLat: null,
              sampleLng: null,
              sampleCapturedAt: "",
            }))
          }
          addLabel={
            form.samplePhotoUri
              ? "Retake mixed sample photo"
              : "Take mixed sample photo"
          }
          hint="Mix the soil inside the farm, then photograph the mixed sample."
          metadata={
            form.samplePhotoUri
              ? [
                  {
                    latitude: form.sampleLat,
                    longitude: form.sampleLng,
                    captured_at: form.sampleCapturedAt,
                  },
                ]
              : undefined
          }
        />
        {form.samplePhotoUri && farmLabelFor(form.sampleLat, form.sampleLng) ? (
          <Text style={styles.inside}>
            ✓ Inside farm {farmLabelFor(form.sampleLat, form.sampleLng)}
          </Text>
        ) : null}

        <Text style={styles.hint}>
          {isSupervisor
            ? "On save you get a sample number for the bag. The sample is ready to test."
            : "On save you get a sample number for the bag. Your supervisor then picks the sample up."}
        </Text>

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
  body: {
    fontSize: typeScale.body,
    fontFamily: fonts.regular,
    color: colors.text,
    lineHeight: 22,
  },
  section: {
    marginTop: spacing.md,
    fontSize: typeScale.heading,
    fontFamily: fonts.medium,
    color: colors.brunswick,
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
  hint: {
    fontSize: typeScale.label,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  inside: {
    fontSize: typeScale.label,
    fontFamily: fonts.medium,
    color: colors.success,
  },
  siteCard: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.white,
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
  doneWrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  codeCard: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.brunswick,
    backgroundColor: colors.white,
    alignItems: "center",
  },
  code: {
    fontSize: typeScale.display,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    letterSpacing: 1,
  },
  doneActions: {
    marginTop: "auto",
    gap: spacing.sm,
  },
});
