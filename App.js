import React, { useEffect, useState, useCallback } from "react";
import { useFonts } from "expo-font";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "./constants/theme";
import { supabase } from "./services/supabase";
import "./database";
import { initISTClock } from "./services/trustedtime";
import { arePermissionsGranted } from "./services/permissions";
import {
  startSyncListener,
  stopSyncListener,
  processSyncQueue
} from "./services/syncService";
import LoginScreen from "./screens/LoginScreen";
import PermissionsScreen from "./screens/PermissionsScreen";
import HomeScreen from "./screens/HomeScreen";
import FarmerDashboardScreen from "./screens/FarmerDashboardScreen";
import AddFarmerScreen from "./screens/AddFarmerScreen";
import EditFarmerScreen from "./screens/EditFarmerScreen";
import FarmerDetailScreen from "./screens/FarmerDetailScreen";

const Stack = createNativeStackNavigator();

function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen
        name="FarmerDashboard"
        component={FarmerDashboardScreen}
      />
      <Stack.Screen name="AddFarmer" component={AddFarmerScreen} />
      <Stack.Screen name="FarmerDetail" component={FarmerDetailScreen} />
      <Stack.Screen name="EditFarmer" component={EditFarmerScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [permissionsOk, setPermissionsOk] = useState(false);

  const [fontsLoaded] = useFonts({
    SatoshiRegular: require("./assets/Satoshi_Complete/Fonts/OTF/Satoshi-Regular.otf"),
    SatoshiMedium: require("./assets/Satoshi_Complete/Fonts/OTF/Satoshi-Medium.otf"),
    SatoshiBold: require("./assets/Satoshi_Complete/Fonts/OTF/Satoshi-Bold.otf")
  });

  const handlePermissionsComplete = useCallback(() => {
    setPermissionsOk(true);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);

      if (data.session) {
        initISTClock();
        setPermissionsOk(await arePermissionsGranted());
        startSyncListener();
        processSyncQueue();
      }

      setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);

      if (newSession) {
        initISTClock();
        setPermissionsOk(await arePermissionsGranted());
        startSyncListener();
        processSyncQueue();
      } else {
        stopSyncListener();
        setPermissionsOk(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      stopSyncListener();
    };
  }, []);

  if (!fontsLoaded || loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.white
        }}
      >
        <ActivityIndicator size="large" color={colors.brunswick} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        {!session ? (
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={LoginScreen} />
          </Stack.Navigator>
        ) : !permissionsOk ? (
          <PermissionsScreen onComplete={handlePermissionsComplete} />
        ) : (
          <MainStack />
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
