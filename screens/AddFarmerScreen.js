import React, { useState } from "react";
import { View, Alert } from "react-native";
import { supabase } from "../services/supabase";
import FarmerForm from "../components/FarmerForm";
import { ScreenShell } from "../components/ScreenHeader";
import { saveFarmerLocal } from "../services/farmerService";
import { processSyncQueue } from "../services/syncService";

export default function AddFarmerScreen({ navigation }) {
  const [loading, setLoading] = useState(false);

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

      await saveFarmerLocal(form, user.id);
      processSyncQueue();

      Alert.alert(
        "Saved",
        "Farmer saved on your phone. Will sync when online.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenShell>
      <FarmerForm
        title="Onboard Farmer"
        onSubmit={handleSubmit}
        loading={loading}
      />
    </ScreenShell>
  );
}
