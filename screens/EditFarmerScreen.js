import React, { useEffect, useState } from "react";
import { View, Alert, ActivityIndicator } from "react-native";
import { supabase } from "../services/supabase";
import FarmerForm from "../components/FarmerForm";
import { ScreenShell } from "../components/ScreenHeader";
import { getFarmerByIdLocal, saveFarmerLocal } from "../services/farmerService";
import { processSyncQueue } from "../services/syncService";
import { colors } from "../constants/theme";

export default function EditFarmerScreen({ route, navigation }) {
  const { farmerId } = route.params;
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    loadFarmer();
  }, [farmerId]);

  async function loadFarmer() {
    try {
      const farmer = await getFarmerByIdLocal(farmerId);
      setInitialData(farmer.toFormData());
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

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in.");
        return;
      }

      await saveFarmerLocal(form, user.id, farmerId);
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
      />
    </ScreenShell>
  );
}
