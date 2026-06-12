import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { colors, fonts, spacing } from "../constants/theme";
import { isConsentImage, isConsentPdf } from "../utils/consent";

export default function ConsentViewerModal({
  visible,
  uri,
  fileName,
  onClose
}) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      setLoading(true);
    }
  }, [visible, uri]);

  if (!uri) return null;

  const showAsImage = isConsentImage(uri) && !isConsentPdf(uri);

  async function openExternally() {
    try {
      await Linking.openURL(uri);
    } catch {
      Alert.alert("Unable to open", "Could not open the consent document.");
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>
            {fileName || "Consent form"}
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>

        {showAsImage ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.imageScroll}
          >
            <Image
              source={{ uri }}
              style={styles.image}
              resizeMode="contain"
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                Alert.alert(
                  "Preview unavailable",
                  "Could not load this image. Tap Done and try again after sync completes."
                );
              }}
            />
          </ScrollView>
        ) : (
          <View style={styles.flex}>
            <WebView
              source={{ uri }}
              style={styles.flex}
              originWhitelist={["*"]}
              allowFileAccess
              allowUniversalAccessFromFileURLs
              setSupportMultipleWindows={false}
              onLoadEnd={() => setLoading(false)}
              onHttpError={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                Alert.alert(
                  "Preview unavailable",
                  "Could not preview this document in the app."
                );
              }}
            />
          </View>
        )}

        {!showAsImage && (
          <View style={styles.footer}>
            <TouchableOpacity style={styles.openBtn} onPress={openExternally}>
              <Text style={styles.openText}>Open in browser</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.brunswick} />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white
  },
  flex: {
    flex: 1
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.brunswick
  },
  doneBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4
  },
  doneText: {
    fontSize: 16,
    fontFamily: fonts.medium,
    color: colors.brunswick
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  openBtn: {
    alignItems: "center",
    paddingVertical: 12
  },
  openText: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.brunswick
  },
  imageScroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.md
  },
  image: {
    width: "100%",
    minHeight: 420
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.75)",
    alignItems: "center",
    justifyContent: "center"
  }
});
