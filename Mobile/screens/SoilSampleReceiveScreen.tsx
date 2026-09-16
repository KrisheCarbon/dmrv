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
import { soilTestStatusLabel } from "@krishecarbon/shared";
import { ScreenShell } from "../components/ScreenHeader";
import PrimaryButton from "../components/PrimaryButton";
import {
  getSoilTestById,
  reviewSoilSampleLocal,
} from "../services/farmersNetworkService";
import { getFarmerByIdLocal } from "../services/farmerService";
import { captureAndSaveFieldPhoto } from "../services/photoWatermark";
import { getUserProfile } from "../services/userProfile";
import { processSyncQueue } from "../services/syncService";
import { colors, fonts, spacing, radius } from "../constants/theme";

export default function SoilSampleReceiveScreen({ route, navigation }) {
  const sampleId = route.params?.sampleId;
  const [farmerName, setFarmerName] = useState("Farmer");
  const [sampleDate, setSampleDate] = useState("");
  const [status, setStatus] = useState("");
  const [samplePhoto, setSamplePhoto] = useState<string | null>(null);
  const [receivePhoto, setReceivePhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const test = await getSoilTestById(sampleId);
    const farmer = await getFarmerByIdLocal(test.farmerId).catch(() => null);
    setFarmerName(farmer?.farmerName || "Farmer");
    setSampleDate(test.sampleDate);
    setStatus(test.status || "submitted");
    setSamplePhoto(test.samplePhotoUri || test.samplePhotoUrl);
    setReceivePhoto(test.receivePhotoUri || test.receivePhotoUrl);
  }, [sampleId]);

  useEffect(() => {
    load().catch((err) => {
      Alert.alert("Error", err instanceof Error ? err.message : String(err), [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    });
  }, [load, navigation]);

  async function takeReceivePhoto() {
    try {
      const captured = await captureAndSaveFieldPhoto();
      if (!captured) return;
      setReceivePhoto(captured.uri);
    } catch (err) {
      Alert.alert("Photo", err instanceof Error ? err.message : String(err));
    }
  }

  async function decide(decision: "accept" | "reject" | "store") {
    if (!receivePhoto) {
      Alert.alert("Required", "Take a photo of the received sample first.");
      return;
    }
    try {
      setLoading(true);
      const profile = await getUserProfile();
      if (!profile) {
        Alert.alert("Error", "You must be signed in.");
        return;
      }
      await reviewSoilSampleLocal(
        sampleId,
        decision,
        { id: profile.id, name: profile.full_name },
        receivePhoto,
      );
      processSyncQueue();
      Alert.alert("Saved", `Sample ${decision === "store" ? "stored" : `${decision}ed`}.`, [
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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Receive sample</Text>
        <Text style={styles.subtitle}>
          {farmerName} · {sampleDate} · {soilTestStatusLabel(status)}
        </Text>

        {samplePhoto ? (
          <Image source={{ uri: samplePhoto }} style={styles.photo} />
        ) : null}

        <Text style={styles.section}>Photo of sample in hand *</Text>
        <Pressable style={styles.locBtn} onPress={takeReceivePhoto}>
          <Text style={styles.locBtnText}>Take photo</Text>
        </Pressable>
        {receivePhoto ? (
          <Image source={{ uri: receivePhoto }} style={styles.photo} />
        ) : (
          <Text style={styles.hint}>Photograph the physical sample before deciding.</Text>
        )}

        <View style={styles.actions}>
          <PrimaryButton
            title="Accept"
            onPress={() => decide("accept")}
            loading={loading}
          />
          <PrimaryButton
            title="Reject"
            onPress={() => decide("reject")}
            loading={loading}
            variant="outline"
          />
          <PrimaryButton
            title="Store"
            onPress={() => decide("store")}
            loading={loading}
            variant="accent"
          />
        </View>
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
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.smoke,
    lineHeight: 20,
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
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.smoke,
  },
  photo: {
    width: "100%",
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.chalk,
  },
  actions: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
});
