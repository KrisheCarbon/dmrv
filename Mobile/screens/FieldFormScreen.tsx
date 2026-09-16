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
import {
  ACRES_PER_HECTARE,
  FIELD_WATER_SOURCES,
  CROP_OPTIONS,
  boundaryPointsToGeojson,
  formatHectaresFromAcres,
  isOverOneHectare,
  parseBoundaryGeojson,
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
import { getFarmerByIdLocal } from "../services/farmerService";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import { getCurrentFarmLocation } from "../utils/location";
import { startLocationCache } from "../services/locationCache";
import { processSyncQueue } from "../services/syncService";
import { colors, fonts, spacing, radius } from "../constants/theme";

const OWNERSHIP = [
  { value: "Owned", label: "Owned" },
  { value: "Leased", label: "Leased" },
];

const WATER = FIELD_WATER_SOURCES.map((value) => ({ value, label: value }));

const SEASONS = [
  { value: "Kharif", label: "Kharif" },
  { value: "Rabi", label: "Rabi" },
  { value: "Zaid", label: "Zaid" },
  { value: "Annual", label: "Annual" },
];

const CROP_PICKER = CROP_OPTIONS.map((crop) => ({ value: crop, label: crop }));

export default function FieldFormScreen({ route, navigation }) {
  const paramFarmerId = route.params?.farmerId ?? "";
  const fieldId = route.params?.fieldId ?? null;
  const [selectedFarmerId, setSelectedFarmerId] = useState(paramFarmerId);
  const [loading, setLoading] = useState(false);
  const [land, setLand] = useState({ cap: 0, used: 0, remaining: 0 });
  const [existingFields, setExistingFields] = useState([]);
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
    season: "Kharif",
    sowingDate: "",
    harvestDate: "",
    cropPhotos: [] as string[],
  });
  const [boundaryPoints, setBoundaryPoints] = useState<GeoPoint[]>([]);
  const [polygonMapVisible, setPolygonMapVisible] = useState(false);

  const farmerId = selectedFarmerId;
  const areaNum = Number(field.calculatedArea) || 0;
  const showPolygon = isOverOneHectare(areaNum);

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

  const loadExisting = useCallback(async () => {
    if (!fieldId) return;
    const f = await getFieldById(fieldId);
    setSelectedFarmerId(f.farmerId);
    setField({
      ownershipType: f.ownershipType,
      landReference: f.landReference || "",
      leaseStart: f.leaseStart || "",
      leaseEnd: f.leaseEnd || "",
      latitude: f.latitude,
      longitude: f.longitude,
      calculatedArea: f.calculatedArea != null ? String(f.calculatedArea) : "",
      waterSource: f.waterSource || "Rainfed",
      photos: f.photos || [],
      notes: f.notes || "",
      cropName: f.cropName || (CROP_OPTIONS[0] as string),
      season: f.season || "Kharif",
      sowingDate: f.sowingDate || "",
      harvestDate: f.harvestDate || "",
      cropPhotos: f.cropPhotos || [],
    });
    setBoundaryPoints(parseBoundaryGeojson(f.boundaryGeojson));
  }, [fieldId]);

  useEffect(() => {
    loadExisting().catch((err) =>
      Alert.alert("Error", err instanceof Error ? err.message : String(err)),
    );
  }, [loadExisting]);

  async function captureGps() {
    try {
      await startLocationCache();
      const loc = await getCurrentFarmLocation();
      setField((prev) => ({
        ...prev,
        latitude: loc.latitude,
        longitude: loc.longitude,
      }));
    } catch (err) {
      Alert.alert("GPS", err instanceof Error ? err.message : String(err));
    }
  }

  async function openPolygonMapper() {
    const canOpen = await openMapPickerIfOnline(() => {
      Alert.alert(
        "Map unavailable",
        "Polygon mapping needs internet and a Mapbox token so you can clip the farm on the map.",
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

  async function handleSave(addAnother: boolean) {
    if (!farmerId) {
      Alert.alert("Required", "Select a farmer from the dropdown.");
      return;
    }
    if (!field.calculatedArea) {
      Alert.alert("Required", "Enter plot area in acres.");
      return;
    }
    if (field.ownershipType === "Leased" && !field.leaseEnd) {
      Alert.alert("Required", "Lease end date is needed for leased farms.");
      return;
    }

    try {
      setLoading(true);
      const savedFieldId = await saveFieldLocal(
        farmerId,
        {
          ownershipType: field.ownershipType as "Owned" | "Leased",
          landReference: field.landReference,
          leaseStart: field.leaseStart || undefined,
          leaseEnd: field.leaseEnd || undefined,
          latitude: field.latitude,
          longitude: field.longitude,
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
          Select a farmer, then add farms. Total farm area cannot exceed the farmer's cultivated land.
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
        <FormInput
          label="Land title / lease reference"
          value={field.landReference}
          onChangeText={(t) => setField((p) => ({ ...p, landReference: t }))}
        />
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

        <Text style={styles.section}>GPS / area</Text>
        <Pressable style={styles.locBtn} onPress={captureGps}>
          <Text style={styles.locBtnText}>Capture GPS point</Text>
        </Pressable>
        {field.latitude != null ? (
          <Text style={styles.hint}>
            {Number(field.latitude).toFixed(6)},{" "}
            {Number(field.longitude).toFixed(6)}
          </Text>
        ) : null}
        <FormInput
          label="Plot area (acres) *"
          value={field.calculatedArea}
          onChangeText={(t) => setField((p) => ({ ...p, calculatedArea: t }))}
          keyboardType="decimal-pad"
        />
        {areaNum > 0 ? (
          <Text style={styles.hint}>
            {areaNum} acres ≈ {formatHectaresFromAcres(areaNum)} ha
            {showPolygon
              ? ` (over 1 hectare / ${ACRES_PER_HECTARE.toFixed(2)} acres)`
              : ""}
          </Text>
        ) : null}

        {showPolygon ? (
          <View style={styles.polygonBox}>
            <Text style={styles.section}>Polygon mapping</Text>
            <Text style={styles.hint}>
              This plot is more than 1 hectare. Clip the farm boundary on the satellite map — do not walk GPS corners.
            </Text>
            <Pressable style={styles.locBtn} onPress={openPolygonMapper}>
              <Text style={styles.locBtnText}>
                {boundaryPoints.length >= 3
                  ? "Edit farm polygon on map"
                  : "Clip farm on map"}
              </Text>
            </Pressable>
            {boundaryPoints.length >= 3 ? (
              <Text style={styles.hint}>
                {boundaryPoints.length} corners clipped on the map
              </Text>
            ) : null}
            {boundaryPoints.length > 0 ? (
              <Pressable onPress={() => setBoundaryPoints([])}>
                <Text style={styles.linkMuted}>Clear boundary</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <FormPicker
          label="Water source"
          value={field.waterSource}
          options={WATER}
          onValueChange={(v) => setField((p) => ({ ...p, waterSource: v }))}
        />

        <Text style={styles.section}>Farm photographs (up to 5)</Text>
        <Pressable style={styles.locBtn} onPress={() => addPhoto("field")}>
          <Text style={styles.locBtnText}>Take farm photo</Text>
        </Pressable>
        <View style={styles.photoRow}>
          {field.photos.map((uri) => (
            <Image key={uri} source={{ uri }} style={styles.thumb} />
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
        <Text style={styles.hint}>Crop photo is optional (max 5).</Text>
        <Pressable style={styles.locBtn} onPress={() => addPhoto("crop")}>
          <Text style={styles.locBtnText}>Take crop photo</Text>
        </Pressable>
        <View style={styles.photoRow}>
          {field.cropPhotos.map((uri) => (
            <Image key={uri} source={{ uri }} style={styles.thumb} />
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
        onConfirm={setBoundaryPoints}
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
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.smoke,
    lineHeight: 18,
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
  linkMuted: {
    fontFamily: fonts.medium,
    color: colors.smoke,
    fontSize: 13,
  },
});
