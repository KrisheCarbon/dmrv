import React, { useEffect, useState } from "react";
import { View, Alert, ActivityIndicator } from "react-native";
import { getStoredAuthUser } from "../services/auth";
import FarmerForm from "../components/FarmerForm";
import { ScreenShell } from "../components/ScreenHeader";
import { farmerToFormData, getFarmerByIdLocal, saveFarmerLocal } from "../services/farmerService";
import { isFarmerSyncing, processSyncQueue } from "../services/syncService";
import { colors } from "../constants/theme";

export default function EditFarmerScreen({ route, navigation }) {
  const farmerId = route.params?.farmerId;
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!farmerId) {
      setFetching(false);
      Alert.alert("Farmer not found", "This farmer record is missing.", [
        { text: "OK", onPress: () => navigation.goBack() }
      ]);
      return;
    }
    loadFarmer();
  }, [farmerId]);

  async function loadFarmer() {
    try {
      const farmer = await getFarmerByIdLocal(farmerId);

      if (farmer.uploadStatus === "syncing") {
        Alert.alert(
          "Sync in progress",
          "This farmer is currently syncing. You can edit after sync completes.",
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
        return;
      }

      setInitialData(farmerToFormData(farmer));
    } catch (err) {
      Alert.alert("Error", err.message, [
        { text: "OK", onPress: () => navigation.goBack() }
      ]);
    } finally {
      setFetching(false);
    }
  }

  async function handleSubmit(form) {
    try {
      setLoading(true);

      if (await isFarmerSyncing(farmerId)) {
        Alert.alert(
          "Sync in progress",
          "This farmer is currently syncing. Try again after sync completes."
        );
        return;
      }

      const user = await getStoredAuthUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in.");
        return;
      }

      await saveFarmerLocal(
        {
          ...initialData,
          ...form,
          father_spouse_name:
            form.father_spouse_name ?? initialData?.father_spouse_name,
          agri_id: form.agri_id ?? initialData?.agri_id,
          village: form.village ?? initialData?.village,
          mandal: form.mandal ?? initialData?.mandal,
          district: form.district ?? initialData?.district,
          state: form.state ?? initialData?.state,
          owned_land_size:
            form.owned_land_size ?? initialData?.owned_land_size,
          leased_land_size:
            form.leased_land_size ?? initialData?.leased_land_size,
        },
        user.id,
        farmerId,
      );
      processSyncQueue();

      Alert.alert(
        "Updated",
        "Changes saved on your phone. Will sync when online.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return (
      <ScreenShell>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.brunswick} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <FarmerForm
        title="Edit Farmer"
        mode="edit"
        initialData={initialData}
        onSubmit={handleSubmit}
        submitLabel="Update Farmer"
        loading={loading}
        useChalkHighlight={false}
      />
    </ScreenShell>
  );
}
