import type { ExpoConfig } from "expo/config";
import appJson from "./app.json";

export default (): ExpoConfig => {
  const isDevClient = process.env.EAS_BUILD_PROFILE === "development";

  const plugins = (appJson.expo.plugins ?? []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return isDevClient || name !== "expo-dev-client";
  });

  return {
    ...appJson.expo,
    plugins: plugins as ExpoConfig["plugins"],
    extra: {
      ...appJson.expo.extra,
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
      mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "",
      backendUrl:
        process.env.EXPO_PUBLIC_BACKEND_URL ??
        "http://192.168.1.17:3001,http://127.0.0.1:3001,http://localhost:3001",
    },
  } as ExpoConfig;
};
