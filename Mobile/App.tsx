import React, { useEffect, useState, useCallback } from "react";
import { useFonts } from "expo-font";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { colors } from "./constants/theme";
import { supabase } from "./services/supabase";
import "./database";
import { initISTClock } from "./services/trustedtime";
import { arePermissionsGranted } from "./services/permissions";
import { startSyncListener,
  stopSyncListener,
  processSyncQueue
} from "./services/syncService";
import { startLocationCache, stopLocationCache } from "./services/locationCache";
import LoginScreen from "./screens/LoginScreen";
import PermissionsScreen from "./screens/PermissionsScreen";
import HomeScreen from "./screens/HomeScreen";
import FarmerDashboardScreen from "./screens/FarmerDashboardScreen";
import AddFarmerScreen from "./screens/AddFarmerScreen";
import EditFarmerScreen from "./screens/EditFarmerScreen";
import FarmerDetailScreen from "./screens/FarmerDetailScreen";
import MyNetworkScreen from "./screens/MyNetworkScreen";
import PyrolysisDashboardScreen from "./screens/PyrolysisDashboardScreen";
import PyrolysisSelectKontikkisScreen from "./screens/PyrolysisSelectKontikkisScreen";
import PyrolysisSessionScreen from "./screens/PyrolysisSessionScreen";
import PyrolysisKontikkiWorkflowScreen from "./screens/PyrolysisKontikkiWorkflowScreen";
import MixingDashboardScreen from "./screens/MixingDashboardScreen";
import MixingEntryScreen from "./screens/MixingEntryScreen";
import ApplicationDashboardScreen from "./screens/ApplicationDashboardScreen";
import ApplicationEntryScreen from "./screens/ApplicationEntryScreen";
import KilnSelectKontikkiScreen from "./screens/KilnSelectKontikkiScreen";
import KilnScannerScreen from "./screens/KilnScannerScreen";
import KilnDashboardScreen from "./screens/KilnDashboardScreen";
import KilnSavedBatchesScreen from "./screens/KilnSavedBatchesScreen";
import PhotoWatermarkProcessor from "./components/PhotoWatermarkProcessor";

import type { ComponentType } from "react";

const Stack = createNativeStackNavigator();
const AuthStack = createNativeStackNavigator();

// Screen components are gradually gaining strict navigation types.
const screen = (Component: ComponentType<unknown>) => Component as ComponentType<object>;

function MainStack() {
  return (
    // React Navigation types lag behind React 19 — safe at runtime.
    // @ts-expect-error navigator children typing
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={screen(HomeScreen)} />
      <Stack.Screen
        name="FarmerDashboard"
        component={screen(FarmerDashboardScreen)}
      />
      <Stack.Screen name="AddFarmer" component={screen(AddFarmerScreen)} />
      <Stack.Screen name="FarmerDetail" component={screen(FarmerDetailScreen)} />
      <Stack.Screen name="EditFarmer" component={screen(EditFarmerScreen)} />
      <Stack.Screen name="MyNetwork" component={screen(MyNetworkScreen)} />
      <Stack.Screen
        name="PyrolysisDashboard"
        component={screen(PyrolysisDashboardScreen)}
      />
      <Stack.Screen
        name="PyrolysisSelectKontikkis"
        component={screen(PyrolysisSelectKontikkisScreen)}
      />
      <Stack.Screen
        name="PyrolysisSession"
        component={screen(PyrolysisSessionScreen)}
      />
      <Stack.Screen
        name="PyrolysisKontikkiWorkflow"
        component={screen(PyrolysisKontikkiWorkflowScreen)}
      />
      <Stack.Screen
        name="MixingDashboard"
        component={screen(MixingDashboardScreen)}
      />
      <Stack.Screen name="MixingEntry" component={screen(MixingEntryScreen)} />
      <Stack.Screen
        name="ApplicationDashboard"
        component={screen(ApplicationDashboardScreen)}
      />
      <Stack.Screen
        name="ApplicationEntry"
        component={screen(ApplicationEntryScreen)}
      />
      <Stack.Screen
        name="KilnSelectKontikki"
        component={screen(KilnSelectKontikkiScreen)}
      />
      <Stack.Screen name="KilnScanner" component={screen(KilnScannerScreen)} />
      <Stack.Screen name="KilnDashboard" component={screen(KilnDashboardScreen)} />
      <Stack.Screen
        name="KilnSavedBatches"
        component={screen(KilnSavedBatchesScreen)}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionsOk, setPermissionsOk] = useState(false);

  const [fontsLoaded] = useFonts({
    SatoshiRegular: require("./assets/Satoshi_Complete/Fonts/OTF/Satoshi-Regular.otf"),
    SatoshiMedium: require("./assets/Satoshi_Complete/Fonts/OTF/Satoshi-Medium.otf"),
    SatoshiBold: require("./assets/Satoshi_Complete/Fonts/OTF/Satoshi-Bold.otf")
  });

  const handlePermissionsComplete = useCallback(() => {
    setPermissionsOk(true);
    void startLocationCache();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);

      if (data.session) {
        initISTClock();
        setPermissionsOk(await arePermissionsGranted());
        if (await arePermissionsGranted()) {
          void startLocationCache();
        }
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
        if (await arePermissionsGranted()) {
          void startLocationCache();
        }
        startSyncListener();
        processSyncQueue();
      } else {
        stopSyncListener();
        stopLocationCache();
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
      <PhotoWatermarkProcessor />
      <NavigationContainer>
        {!session ? (
          // @ts-expect-error navigator children typing
          <AuthStack.Navigator screenOptions={{ headerShown: false }}>
            <AuthStack.Screen name="Login" component={screen(LoginScreen)} />
          </AuthStack.Navigator>
        ) : !permissionsOk ? (
          <PermissionsScreen onComplete={handlePermissionsComplete} />
        ) : (
          <MainStack />
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
