/** @type {import('expo/config').ExpoConfig} */
module.exports = () => {
  const appJson = require("./app.json");
  const isDevClient = process.env.EAS_BUILD_PROFILE === "development";

  const plugins = (appJson.expo.plugins ?? []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return isDevClient || name !== "expo-dev-client";
  });

  return {
    ...appJson,
    expo: {
      ...appJson.expo,
      plugins,
      extra: {
        ...appJson.expo.extra,
        supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
        supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
        mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? ""
      }
    }
  };
};
