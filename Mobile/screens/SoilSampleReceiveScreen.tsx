import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
} from "react-native";
import { soilSampleStage } from "@krishecarbon/shared";
import { ScreenShell } from "../components/ScreenHeader";
import PrimaryButton from "../components/PrimaryButton";
import PhotoSlot from "../components/PhotoSlot";
import SoilSampleTracker from "../components/SoilSampleTracker";
import {
  getFieldById,
  getSoilTestById,
  reviewSoilSampleLocal,
} from "../services/farmersNetworkService";
import { getFarmerByIdLocal } from "../services/farmerService";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import { getUserProfile, type UserProfile } from "../services/userProfile";
import { processSyncQueue } from "../services/syncService";
import type { SoilTest } from "../database/types";
import { colors, fonts, spacing, radius, typeScale } from "../constants/theme";

/**
 * One soil sample: its number, farmer, tracking and photos. A supervisor
 * marks a waiting sample as collected after photographing the labelled bag.
 */
export default function SoilSampleReceiveScreen({ route, navigation }) {
  const sampleId = route.params?.sampleId;
  const [test, setTest] = useState<SoilTest | null>(null);
  const [farmerName, setFarmerName] = useState("Farmer");
  const [village, setVillage] = useState<string | null>(null);
  const [farmCodes, setFarmCodes] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [receivePhoto, setReceivePhoto] = useState<string | null>(null);
  const [receiveMeta, setReceiveMeta] = useState<{
    latitude: number;
    longitude: number;
    captured_at: string;
  } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const found = await getSoilTestById(sampleId);
    setTest(found);
    const farmer = found.farmerName
      ? null
      : await getFarmerByIdLocal(found.farmerId).catch(() => null);
    setFarmerName(found.farmerName || farmer?.farmerName || "Farmer");
    setVillage(found.farmerVillage || farmer?.village || null);
    const codes = await Promise.all(
      found.fieldIds.map((id) =>
        getFieldById(id)
          .then((field) => field.fieldCode)
          .catch(() => null),
      ),
    );
    setFarmCodes(codes.filter((code): code is string => Boolean(code)));
  }, [sampleId]);

  useEffect(() => {
    getUserProfile().then(setProfile).catch(() => {});
    load().catch((err) => {
      Alert.alert("Error", err instanceof Error ? err.message : String(err), [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    });
  }, [load, navigation]);

  const role = profile?.role || "";
  const isSupervisor = role === "supervisor" || role === "admin" || role === "manager";
  const stage = soilSampleStage(test?.status);
  const canPickUp = isSupervisor && stage === "waiting_pickup";

  async function takeReceivePhoto() {
    try {
      setCapturing(true);
      const captured = await captureAndSaveFieldPhoto();
      if (!captured) return;
      setReceivePhoto(captured.uri);
      setReceiveMeta({
        latitude: captured.metadata.latitude,
        longitude: captured.metadata.longitude,
        captured_at: captured.metadata.captured_at,
      });
    } catch (err) {
      Alert.alert("Photo", err instanceof Error ? err.message : String(err));
    } finally {
      setCapturing(false);
    }
  }

  async function decide(decision: "accept" | "reject") {
    if (!receivePhoto) {
      Alert.alert("Required", "Photograph the labelled sample bag first.");
      return;
    }
    if (!profile) {
      Alert.alert("Error", "You must be signed in.");
      return;
    }
    try {
      setLoading(true);
      await reviewSoilSampleLocal(
        sampleId,
        decision,
        { id: profile.id, name: profile.full_name },
        receivePhoto,
      );
      processSyncQueue();
      Alert.alert(
        "Saved",
        decision === "accept"
          ? "Sample collected. It is now ready to test."
          : "Sample rejected.",
        [{ text: "OK", onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function confirmReject() {
    Alert.alert(
      "Reject this sample?",
      "Reject only if the bag is damaged, unlabelled, or the number does not match. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reject", style: "destructive", onPress: () => decide("reject") },
      ],
    );
  }

  if (!test) return <ScreenShell>{null}</ScreenShell>;

  const samplePhoto = test.samplePhotoUri || test.samplePhotoUrl;
  const existingReceivePhoto = test.receivePhotoUri || test.receivePhotoUrl;
  const pointsTaken = test.sampleSites.filter((site) => site.photo_uri || site.photo_url).length;

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Sample number</Text>
        <Text style={styles.code} selectable>
          {test.sampleCode || "Number pending"}
        </Text>

        <View style={styles.card}>
          <SoilSampleTracker status={test.status} />
        </View>

        <View style={styles.card}>
          <Detail label="Farmer" value={`${farmerName}${village ? ` · ${village}` : ""}`} />
          <Detail label="Farm" value={farmCodes.join(", ") || null} />
          <Detail label="Sample date" value={test.sampleDate} />
          <Detail label="Collected by" value={test.collectedByName} />
          <Detail label="Picked up by" value={test.receivedByName} />
          <Detail label="Sampling points" value={pointsTaken ? `${pointsTaken} photographed` : null} />
        </View>

        {samplePhoto ? (
          <>
            <Text style={styles.section}>Mixed sample photo</Text>
            <Image source={{ uri: samplePhoto }} style={styles.photo} />
          </>
        ) : null}

        {existingReceivePhoto && !canPickUp ? (
          <>
            <Text style={styles.section}>Labelled bag at pickup</Text>
            <Image source={{ uri: existingReceivePhoto }} style={styles.photo} />
          </>
        ) : null}

        {canPickUp ? (
          <>
            <Text style={styles.section}>Pick up this sample</Text>
            <Text style={styles.hint}>
              Check that {test.sampleCode || "the sample number"} is written on the bag,
              then photograph the bag.
            </Text>
            <PhotoSlot
              label="Labelled sample bag"
              required
              uris={receivePhoto ? [receivePhoto] : []}
              capturing={capturing}
              onAdd={takeReceivePhoto}
              onRemove={() => {
                setReceivePhoto(null);
                setReceiveMeta(null);
              }}
              addLabel={receivePhoto ? "Retake bag photo" : "Take bag photo"}
              hint="The sample number must be readable in the photo."
              metadata={receiveMeta ? [receiveMeta] : undefined}
            />
            <View style={styles.actions}>
              <PrimaryButton
                title="Mark collected"
                onPress={() => decide("accept")}
                loading={loading}
              />
              <PrimaryButton
                title="Reject sample"
                onPress={confirmReject}
                loading={loading}
                variant="outline"
              />
            </View>
          </>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  label: {
    fontSize: typeScale.label,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
  },
  code: {
    fontSize: typeScale.display,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    letterSpacing: 1,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  detailRow: {
    gap: 2,
  },
  detailLabel: {
    fontSize: typeScale.label,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
  },
  detailValue: {
    fontSize: typeScale.body,
    fontFamily: fonts.regular,
    color: colors.text,
  },
  section: {
    marginTop: spacing.md,
    fontSize: typeScale.heading,
    fontFamily: fonts.medium,
    color: colors.brunswick,
  },
  hint: {
    fontSize: typeScale.label,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  photo: {
    width: "100%",
    height: 200,
    borderRadius: radius.md,
    backgroundColor: colors.chalk,
  },
  actions: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
});
