import React, { useEffect, useState } from "react";
import { useFonts } from "expo-font";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, ActivityIndicator, AppState, type AppStateStatus } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { colors } from "./constants/theme";
import { supabase } from "./services/supabase";
import { assertActiveAccount } from "./services/auth";
import { getDb } from "./database/db";
import { initISTClock } from "./services/trustedtime";
import { startSyncListener,
  stopSyncListener,
  processSyncQueue
} from "./services/syncService";
import { startLocationCache, stopLocationCache } from "./services/locationCache";
import { applyExpoUpdateIfAvailable } from "./utils/applyExpoUpdate";
import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import FarmersNetworkScreen from "./screens/FarmersNetworkScreen";
import NewFarmerOnboardingScreen from "./screens/NewFarmerOnboardingScreen";
import NewFarmerProgressScreen from "./screens/NewFarmerProgressScreen";
import FieldFormScreen from "./screens/FieldFormScreen";
import ConsentFormScreen from "./screens/ConsentFormScreen";
import SoilTestFormScreen from "./screens/SoilTestFormScreen";
import SoilSampleSubmitScreen from "./screens/SoilSampleSubmitScreen";
import SoilSamplesInboxScreen from "./screens/SoilSamplesInboxScreen";
import SoilSampleReceiveScreen from "./screens/SoilSampleReceiveScreen";
import SoilReportUploadScreen from "./screens/SoilReportUploadScreen";
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
import ErrorBoundary from "./components/ErrorBoundary";

import type { ComponentType } from "react";

// Opens the SQLite connection and runs schema migrations immediately on app start.
void getDb();

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
        name="FarmersNetwork"
        component={screen(FarmersNetworkScreen)}
      />
      <Stack.Screen
        name="NewFarmerOnboarding"
        component={screen(NewFarmerOnboardingScreen)}
      />
      <Stack.Screen
        name="NewFarmerProgress"
        component={screen(NewFarmerProgressScreen)}
      />
      <Stack.Screen name="FieldForm" component={screen(FieldFormScreen)} />
      <Stack.Screen name="ConsentForm" component={screen(ConsentFormScreen)} />
      <Stack.Screen name="SoilTestForm" component={screen(SoilTestFormScreen)} />
      <Stack.Screen
        name="SoilSampleSubmit"
        component={screen(SoilSampleSubmitScreen)}
      />
      <Stack.Screen
        name="SoilSamplesInbox"
        component={screen(SoilSamplesInboxScreen)}
      />
      <Stack.Screen
        name="SoilSampleReceive"
        component={screen(SoilSampleReceiveScreen)}
      />
      <Stack.Screen
        name="SoilReportUpload"
        component={screen(SoilReportUploadScreen)}
      />
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

  const [fontsLoaded] = useFonts({
    SatoshiRegular: require("./assets/Satoshi_Complete/Fonts/OTF/Satoshi-Regular.otf"),
    SatoshiMedium: require("./assets/Satoshi_Complete/Fonts/OTF/Satoshi-Medium.otf"),
    SatoshiBold: require("./assets/Satoshi_Complete/Fonts/OTF/Satoshi-Bold.otf")
  });

  useEffect(() => {
    void applyExpoUpdateIfAvailable();

    supabase.auth.getSession().then(async ({ data }) => {
      const nextSession = data.session;
      if (nextSession && !(await assertActiveAccount(nextSession.user.id))) {
        setSession(null);
        setLoading(false);
        return;
      }

      setSession(nextSession);

      if (nextSession) {
        initISTClock();
        void startLocationCache();
        startSyncListener();
        processSyncQueue();
      }

      setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (newSession && !(await assertActiveAccount(newSession.user.id))) {
        setSession(null);
        stopSyncListener();
        stopLocationCache();
        return;
      }

      setSession(newSession);

      if (newSession) {
        initISTClock();
        void startLocationCache();
        startSyncListener();
        processSyncQueue();
      } else {
        stopSyncListener();
        stopLocationCache();
      }
    });

    return () => {
      subscription.unsubscribe();
      stopSyncListener();
    };
  }, []);

  useEffect(() => {
    // Supabase's token auto-refresh timer only ticks while explicitly told
    // the app is active. Without this, a backgrounded/locked phone can let
    // the access token expire silently, and the next save looks like a
    // forced logout mid-entry.
    function handleAppStateChange(nextState: AppStateStatus) {
      if (nextState === "active") {
        void supabase.auth.startAutoRefresh();
        void applyExpoUpdateIfAvailable();
      } else {
        void supabase.auth.stopAutoRefresh();
      }
    }

    if (AppState.currentState === "active") {
      void supabase.auth.startAutoRefresh();
    }

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, []);

  if (!fontsLoaded || loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.white,
          paddingHorizontal: 32
        }}
      >
        <ActivityIndicator size="large" color={colors.brunswick} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <PhotoWatermarkProcessor />
        <NavigationContainer>
          {!session ? (
            // @ts-expect-error navigator children typing
            <AuthStack.Navigator screenOptions={{ headerShown: false }}>
              <AuthStack.Screen name="Login" component={screen(LoginScreen)} />
            </AuthStack.Navigator>
          ) : (
            <MainStack />
          )}
        </NavigationContainer>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
