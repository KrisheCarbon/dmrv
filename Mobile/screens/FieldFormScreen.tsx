import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  Pressable,
  Image,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import {
  FIELD_SEASONS,
  FIELD_WATER_SOURCES,
  CROP_OPTIONS,
  boundaryPointsToGeojson,
  farmAreasAreNearby,
  fieldSeasonLabel,
  formatHectaresFromAcres,
  normalizeFieldSeason,
  parseBoundaryGeojson,
  polygonAreaAcres,
  polygonCentroid,
  type GeoPoint,
} from "@krishecarbon/shared";
import { ScreenShell } from "../components/ScreenHeader";
import FormInput from "../components/FormInput";
import FormPicker from "../components/FormPicker";
import FormDateField from "../components/FormDateField";
import PrimaryButton from "../components/PrimaryButton";
import FarmerPicker from "../components/FarmerPicker";
import PolygonMapperModal from "../components/PolygonMapperModal";
import { openMapPickerIfOnline } from "../components/LocationPickerModal";
import {
  getFieldById,
  listFieldsForFarmer,
  remainingCultivatedAcres,
  saveCropLocal,
  saveFieldLocal,
} from "../services/farmersNetworkService";
import type { FarmField } from "../database/types";
import { getFarmerByIdLocal } from "../services/farmerService";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import { persistFarmFile } from "../utils/farmLocalFiles";
import { isLocalMediaUri } from "../utils/farmerNetworkPhotoUpload";
import { processSyncQueue } from "../services/syncService";
import { colors, fonts, spacing, radius } from "../constants/theme";

const OWNERSHIP = [
  { value: "Owned", label: "Owned" },
  { value: "Leased", label: "Leased" },
];

const WATER = FIELD_WATER_SOURCES.map((value) => ({ value, label: value }));

const SEASONS = FIELD_SEASONS.map((value) => ({
  value,
  label: fieldSeasonLabel(value),
}));

const CROP_PICKER = CROP_OPTIONS.map((crop) => ({ value: crop, label: crop }));

function isMediaUri(value: string): boolean {
  return /^(file:|content:|https?:)/i.test(value) || isLocalMediaUri(value);
}

function isImageUri(value: string): boolean {
  if (!isMediaUri(value)) return false;
  return !/\.pdf($|\?)/i.test(value);
}

function fileNameFromUri(uri: string): string {
  try {
    return decodeURIComponent(uri.split("/").pop()?.split("?")[0] || "Document");
  } catch {
    return "Document";
  }
}

export default function FieldFormScreen({ route, navigation }) {
  const paramFarmerId = route.params?.farmerId ?? "";
  const fieldId = route.params?.fieldId ?? null;
  const [selectedFarmerId, setSelectedFarmerId] = useState(paramFarmerId);
  const [loading, setLoading] = useState(false);
  const [land, setLand] = useState({ cap: 0, used: 0, remaining: 0 });
  const [existingFields, setExistingFields] = useState<FarmField[]>([]);
  const [farmerName, setFarmerName] = useState("");
  const [field, setField] = useState({
    ownershipType: "Owned",
    landReference: "",
    leaseStart: "",
    leaseEnd: "",
    latitude: null as number | null,
    longitude: null as number | null,
    calculatedArea: "",
    waterSource: "Rainfed",
    photos: [] as string[],
    notes: "",
    cropName: (CROP_OPTIONS[0] || "Cotton") as string,
    season: "Monsoon",
    sowingDate: "",
    harvestDate: "",
    cropPhotos: [] as string[],
  });
  const [boundaryPoints, setBoundaryPoints] = useState<GeoPoint[]>([]);
  const [polygonMapVisible, setPolygonMapVisible] = useState(false);

  const farmerId = selectedFarmerId;
  const areaNum = Number(field.calculatedArea) || 0;
  const mappedArea = polygonAreaAcres(boundaryPoints);
  const areaMismatch =
    areaNum > 0 && mappedArea > 0 && !farmAreasAreNearby(areaNum, mappedArea);
  const landDocLabel =
    field.ownershipType === "Leased"
      ? "Lease document"
      : "Land ownership document";

  const remainingLabel = useMemo(() => {
    if (!land.cap) return "Set cultivated land on the farmer profile first.";
    return `${land.remaining.toFixed(2)} of ${land.cap} acres remaining for new farms.`;
  }, [land]);

  useEffect(() => {
    if (paramFarmerId) setSelectedFarmerId(paramFarmerId);
  }, [paramFarmerId]);

  const loadFarmerContext = useCallback(async () => {
    if (!farmerId) {
      setLand({ cap: 0, used: 0, remaining: 0 });
      setExistingFields([]);
      setFarmerName("");
      return;
    }
    const [summary, fields, farmer] = await Promise.all([
      remainingCultivatedAcres(farmerId, fieldId),
      listFieldsForFarmer(farmerId),
      getFarmerByIdLocal(farmerId).catch(() => null),
    ]);
    setLand(summary);
    setExistingFields(fields);
    setFarmerName(farmer?.farmerName || "");
  }, [farmerId, fieldId]);

  useEffect(() => {
    loadFarmerContext().catch(() => {});
  }, [loadFarmerContext]);

  const applyBoundary = useCallback((points: GeoPoint[]) => {
    setBoundaryPoints(points);
    const centroid = polygonCentroid(points);
    setField((prev) => ({
      ...prev,
      latitude: centroid?.latitude ?? null,
      longitude: centroid?.longitude ?? null,
    }));
  }, []);

  const loadExisting = useCallback(async () => {
    if (!fieldId) return;
    const f = await getFieldById(fieldId);
    setSelectedFarmerId(f.farmerId);
    const points = parseBoundaryGeojson(f.boundaryGeojson);
    const centroid = polygonCentroid(points);
    setField({
      ownershipType: f.ownershipType,
      landReference: f.landReference || "",
      leaseStart: f.leaseStart || "",
      leaseEnd: f.leaseEnd || "",
      latitude: centroid?.latitude ?? f.latitude,
      longitude: centroid?.longitude ?? f.longitude,
      calculatedArea: f.calculatedArea != null ? String(f.calculatedArea) : "",
      waterSource: f.waterSource || "Rainfed",
      photos: f.photos || [],
      notes: f.notes || "",
      cropName: f.cropName || (CROP_OPTIONS[0] as string),
      season: normalizeFieldSeason(f.season),
      sowingDate: f.sowingDate || "",
      harvestDate: f.harvestDate || "",
      cropPhotos: f.cropPhotos || [],
    });
    setBoundaryPoints(points);
  }, [fieldId]);

  useEffect(() => {
    loadExisting().catch((err) =>
      Alert.alert("Error", err instanceof Error ? err.message : String(err)),
    );
  }, [loadExisting]);

  async function openPolygonMapper() {
    const canOpen = await openMapPickerIfOnline(() => {
      Alert.alert(
        "Map unavailable",
        "Drawing the farm boundary needs internet and a Mapbox token.",
      );
    });
    if (canOpen) setPolygonMapVisible(true);
  }

  async function addPhoto(target: "field" | "crop") {
    try {
      const captured = await captureAndSaveFieldPhoto();
      if (!captured) return;
      if (target === "field") {
        setField((prev) => {
          if (prev.photos.length >= 5) {
            Alert.alert("Limit", "Maximum 5 farm photographs.");
            return prev;
          }
          return { ...prev, photos: [...prev.photos, captured.uri] };
        });
      } else {
        setField((prev) => {
          if (prev.cropPhotos.length >= 5) {
            Alert.alert("Limit", "Maximum 5 crop photographs.");
            return prev;
          }
          return { ...prev, cropPhotos: [...prev.cropPhotos, captured.uri] };
        });
      }
    } catch (err) {
      Alert.alert("Photo", err instanceof Error ? err.message : String(err));
    }
  }

  function removePhoto(target: "field" | "crop", uri: string) {
    Alert.alert("Remove photo", "Remove this photograph?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          setField((prev) =>
            target === "field"
              ? { ...prev, photos: prev.photos.filter((item) => item !== uri) }
              : {
                  ...prev,
                  cropPhotos: prev.cropPhotos.filter((item) => item !== uri),
                },
          ),
      },
    ]);
  }

  async function pickLandDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      const fromName = asset.name?.split(".").pop();
      const fallback = asset.mimeType?.includes("pdf") ? "pdf" : "jpg";
      const uri = await persistFarmFile(asset.uri, fromName || fallback);
      setField((prev) => ({ ...prev, landReference: uri }));
    } catch (err) {
      Alert.alert("Document", err instanceof Error ? err.message : String(err));
    }
  }

  async function photographLandDocument() {
    try {
      const captured = await captureAndSaveFieldPhoto();
      if (!captured) return;
      setField((prev) => ({ ...prev, landReference: captured.uri }));
    } catch (err) {
      Alert.alert("Document", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSave(addAnother: boolean) {
    if (!farmerId) {
      Alert.alert("Required", "Select a farmer from the dropdown.");
      return;
    }
    if (!areaNum) {
      Alert.alert("Required", "Enter the farm area in acres.");
      return;
    }
    if (boundaryPoints.length < 3 || mappedArea <= 0) {
      Alert.alert(
        "Required",
        "Draw the farm boundary on the map so we can check the area.",
      );
      return;
    }
    if (field.photos.length < 1) {
      Alert.alert("Required", "Take at least 1 farm photograph.");
      return;
    }
    if (field.ownershipType === "Leased" && !field.leaseEnd) {
      Alert.alert("Required", "Lease end date is needed for leased farms.");
      return;
    }
    if (areaMismatch) {
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "Area does not match map",
          `You entered ${areaNum} acres. The map shape is about ${mappedArea} acres. Check the number or redraw the boundary.`,
          [
            { text: "Check again", style: "cancel", onPress: () => resolve(false) },
            { text: "Save anyway", onPress: () => resolve(true) },
          ],
        );
      });
      if (!confirmed) return;
    }

    try {
      setLoading(true);
      const centroid = polygonCentroid(boundaryPoints);
      const savedFieldId = await saveFieldLocal(
        farmerId,
        {
          ownershipType: field.ownershipType as "Owned" | "Leased",
          landReference: field.landReference,
          leaseStart:
            field.ownershipType === "Leased" ? field.leaseStart || undefined : undefined,
          leaseEnd:
            field.ownershipType === "Leased" ? field.leaseEnd || undefined : undefined,
          latitude: centroid?.latitude ?? field.latitude,
          longitude: centroid?.longitude ?? field.longitude,
          boundaryGeojson: boundaryPointsToGeojson(boundaryPoints),
          calculatedArea: areaNum,
          waterSource: field.waterSource,
          photos: field.photos,
          notes: field.notes,
          cropName: field.cropName,
          season: field.season,
          sowingDate: field.sowingDate || undefined,
          harvestDate: field.harvestDate || undefined,
          cropPhotos: field.cropPhotos,
        },
        fieldId,
      );

      if (field.cropName && areaNum && !fieldId) {
        await saveCropLocal(farmerId, savedFieldId, {
          cropName: field.cropName,
          cultivatedArea: areaNum,
          season: field.season,
          photos: field.cropPhotos,
          sowingDate: field.sowingDate || undefined,
          harvestDate: field.harvestDate || undefined,
        });
      }

      processSyncQueue();

      if (addAnother && !fieldId) {
        setField((prev) => ({
          ...prev,
          landReference: "",
          leaseStart: "",
          leaseEnd: "",
          latitude: null,
          longitude: null,
          calculatedArea: "",
          photos: [],
          cropPhotos: [],
          sowingDate: "",
          harvestDate: "",
        }));
        setBoundaryPoints([]);
        await loadFarmerContext();
        Alert.alert("Farm saved", "Add the next farm for this farmer.");
        return;
      }

      Alert.alert("Saved", "Farm saved.", [
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
        <Text style={styles.title}>
          {fieldId ? "Edit farm" : "Farms onboarding"}
        </Text>
        <Text style={styles.subtitle}>
          Enter acres, then draw the farm on the map.
        </Text>

        <FarmerPicker
          value={farmerId}
          onChange={setSelectedFarmerId}
        />

        {farmerId ? (
          <Text style={styles.hint}>
            {farmerName ? `${farmerName} · ` : ""}
            {remainingLabel}
          </Text>
        ) : null}

        {existingFields.length > 0 && !fieldId ? (
          <View style={styles.existing}>
            <Text style={styles.section}>Farms already added</Text>
            {existingFields.map((item) => (
              <Pressable
                key={item.id}
                onPress={() =>
                  navigation.navigate("FieldForm", {
                    farmerId,
                    fieldId: item.id,
                  })
                }
              >
                <Text style={styles.hint}>
                  {item.fieldCode} · {item.ownershipType} ·{" "}
                  {item.calculatedArea ?? "?"} ac
                  {item.status === "inactive" ? " (inactive)" : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={styles.section}>Farm</Text>
        <FormPicker
          label="Ownership *"
          value={field.ownershipType}
          options={OWNERSHIP}
          onValueChange={(v) =>
            setField((prev) => ({
              ...prev,
              ownershipType: v,
            }))
          }
        />

        <Text style={styles.fieldLabel}>{landDocLabel}</Text>
        <Text style={styles.hint}>
          Optional. Photograph or upload the paper if you have it.
        </Text>
        <View style={styles.rowBtns}>
          <Pressable style={[styles.locBtn, styles.rowBtn]} onPress={photographLandDocument}>
            <Text style={styles.locBtnText}>Photograph document</Text>
          </Pressable>
          <Pressable style={[styles.locBtn, styles.rowBtn]} onPress={pickLandDocument}>
            <Text style={styles.locBtnText}>Upload PDF / image</Text>
          </Pressable>
        </View>
        {field.landReference ? (
          <View style={styles.docBox}>
            {isImageUri(field.landReference) ? (
              <Image source={{ uri: field.landReference }} style={styles.docThumb} />
            ) : (
              <Text style={styles.hint}>
                {isMediaUri(field.landReference)
                  ? fileNameFromUri(field.landReference)
                  : field.landReference}
              </Text>
            )}
            <Pressable
              onPress={() => setField((prev) => ({ ...prev, landReference: "" }))}
            >
              <Text style={styles.linkMuted}>Remove document</Text>
            </Pressable>
          </View>
        ) : null}

        {field.ownershipType === "Leased" ? (
          <>
            <FormDateField
              label="Lease start"
              value={field.leaseStart}
              onChange={(t) => setField((p) => ({ ...p, leaseStart: t }))}
            />
            <FormDateField
              label="Lease end *"
              value={field.leaseEnd}
              onChange={(t) => setField((p) => ({ ...p, leaseEnd: t }))}
            />
          </>
        ) : null}

        <FormInput
          label="Plot area (acres) *"
          value={field.calculatedArea}
          onChangeText={(t) => setField((p) => ({ ...p, calculatedArea: t }))}
          keyboardType="decimal-pad"
          error={areaMismatch ? "This does not match the map estimate." : undefined}
        />
        {areaNum > 0 ? (
          <Text style={styles.hint}>
            Entered: {areaNum} acres ≈ {formatHectaresFromAcres(areaNum)} ha
          </Text>
        ) : null}

        <View style={styles.polygonBox}>
          <Text style={styles.section}>Farm boundary *</Text>
          <Text style={styles.hint}>
            Draw the plot on the map. Area is checked against the acres entered.
          </Text>
          <Pressable style={styles.locBtn} onPress={openPolygonMapper}>
            <Text style={styles.locBtnText}>
              {boundaryPoints.length >= 3
                ? "Edit farm polygon on map"
                : "Draw farm on map"}
            </Text>
          </Pressable>
          {boundaryPoints.length >= 3 && mappedArea > 0 ? (
            <Text style={styles.hint}>
              {boundaryPoints.length} corners · map estimate {mappedArea} acres
              {` (≈ ${formatHectaresFromAcres(mappedArea)} ha)`}
            </Text>
          ) : (
            <Text style={styles.hint}>No boundary yet.</Text>
          )}
          {areaNum > 0 && mappedArea > 0 ? (
            <View style={[styles.compareBox, areaMismatch && styles.compareBoxWarn]}>
              <Text style={areaMismatch ? styles.warnText : styles.hint}>
                {areaMismatch
                  ? `Flag: entered ${areaNum} ac is not close to the map estimate of ${mappedArea} ac. Check the acres or redraw the boundary.`
                  : `Entered ${areaNum} ac is close to the map estimate of ${mappedArea} ac.`}
              </Text>
            </View>
          ) : null}
          {boundaryPoints.length > 0 ? (
            <Pressable
              onPress={() => {
                setBoundaryPoints([]);
                setField((prev) => ({
                  ...prev,
                  latitude: null,
                  longitude: null,
                }));
              }}
            >
              <Text style={styles.linkMuted}>Clear boundary</Text>
            </Pressable>
          ) : null}
        </View>

        <FormPicker
          label="Water source"
          value={field.waterSource}
          options={WATER}
          onValueChange={(v) => setField((p) => ({ ...p, waterSource: v }))}
        />

        <Text style={styles.section}>Farm photographs * (1 required, max 5)</Text>
        <Text style={styles.hint}>At least 1 photo, max 5. Tap to remove.</Text>
        <Pressable
          style={styles.locBtn}
          onPress={() => addPhoto("field")}
          disabled={field.photos.length >= 5}
        >
          <Text style={styles.locBtnText}>
            {field.photos.length >= 5
              ? "Maximum 5 farm photos"
              : `Take farm photo (${field.photos.length}/5)`}
          </Text>
        </Pressable>
        <View style={styles.photoRow}>
          {field.photos.map((uri) => (
            <Pressable key={uri} onPress={() => removePhoto("field", uri)}>
              <Image source={{ uri }} style={styles.thumb} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>Crop on this farm</Text>
        <FormPicker
          label="Crop"
          value={field.cropName}
          options={CROP_PICKER}
          onValueChange={(v) => setField((p) => ({ ...p, cropName: v }))}
        />
        <FormPicker
          label="Season"
          value={field.season}
          options={SEASONS}
          onValueChange={(v) => setField((p) => ({ ...p, season: v }))}
        />
        <FormDateField
          label="Estimated sowing date"
          value={field.sowingDate}
          onChange={(t) => setField((p) => ({ ...p, sowingDate: t }))}
        />
        <FormDateField
          label="Estimated harvest date"
          value={field.harvestDate}
          onChange={(t) => setField((p) => ({ ...p, harvestDate: t }))}
        />
        <Text style={styles.section}>Crop photograph</Text>
        <Text style={styles.hint}>
          Optional. Only if already sown. Max 5.
        </Text>
        <Pressable
          style={styles.locBtn}
          onPress={() => addPhoto("crop")}
          disabled={field.cropPhotos.length >= 5}
        >
          <Text style={styles.locBtnText}>
            {field.cropPhotos.length >= 5
              ? "Maximum 5 crop photos"
              : `Take crop photo (${field.cropPhotos.length}/5)`}
          </Text>
        </Pressable>
        <View style={styles.photoRow}>
          {field.cropPhotos.map((uri) => (
            <Pressable key={uri} onPress={() => removePhoto("crop", uri)}>
              <Image source={{ uri }} style={styles.thumb} />
            </Pressable>
          ))}
        </View>

        <PrimaryButton title="Save farm" onPress={() => handleSave(false)} loading={loading} />
        {!fieldId ? (
          <PrimaryButton
            title="Save and add another farm"
            onPress={() => handleSave(true)}
            loading={loading}
            variant="outline"
          />
        ) : null}
      </ScrollView>
      <PolygonMapperModal
        visible={polygonMapVisible}
        initialLatitude={field.latitude}
        initialLongitude={field.longitude}
        initialPoints={boundaryPoints}
        onClose={() => setPolygonMapVisible(false)}
        onConfirm={applyBoundary}
      />
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
  fieldLabel: {
    marginTop: spacing.sm,
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
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
  rowBtns: {
    flexDirection: "row",
    gap: 8,
  },
  rowBtn: {
    flex: 1,
  },
  hint: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.smoke,
    lineHeight: 18,
  },
  photoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: colors.chalk,
  },
  existing: {
    marginTop: spacing.sm,
    gap: 4,
  },
  polygonBox: {
    gap: 8,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  compareBox: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.chalk,
  },
  compareBoxWarn: {
    backgroundColor: colors.warningBg,
  },
  warnText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.warning,
    lineHeight: 18,
  },
  docBox: {
    gap: 8,
  },
  docThumb: {
    width: "100%",
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.chalk,
  },
  linkMuted: {
    fontFamily: fonts.medium,
    color: colors.smoke,
    fontSize: 13,
  },
});
