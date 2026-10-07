import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import ViewShot, { captureRef } from "react-native-view-shot";
import * as ImageManipulator from "expo-image-manipulator";
import type { FieldPhotoMetadata } from "@krishecarbon/shared";
import {
  formatWatermarkGps,
  formatWatermarkTime,
} from "../services/fieldPhoto";
import { registerPhotoWatermarkHandle } from "../services/photoWatermark";
import { colors, fonts, logos } from "../constants/theme";

export type PhotoWatermarkHandle = {
  watermark: (sourceUri: string, metadata: FieldPhotoMetadata) => Promise<string>;
};

const MAX_WATERMARK_WIDTH = 1280;

type WatermarkJob = {
  sourceUri: string;
  metadata: FieldPhotoMetadata;
  width: number;
  height: number;
  resolve: (uri: string) => void;
  reject: (error: Error) => void;
};

function scaledFontSize(imageWidth: number) {
  return Math.max(20, Math.round(imageWidth * 0.032));
}

const PhotoWatermarkProcessor = forwardRef<PhotoWatermarkHandle>(
  function PhotoWatermarkProcessor(_props, ref) {
    const viewRef = useRef<ViewShot>(null);
    const [job, setJob] = useState<WatermarkJob | null>(null);
    const [imageReady, setImageReady] = useState(false);
    const captureStartedRef = useRef(false);

    const runCapture = useCallback(async () => {
      if (!job || !viewRef.current || !imageReady) return;
      if (captureStartedRef.current) return;
      captureStartedRef.current = true;

      try {
        await new Promise((resolve) =>
          setTimeout(resolve, Platform.OS === "android" ? 250 : 120),
        );

        const capturedUri = await captureRef(viewRef, {
          format: "jpg",
          quality: 0.92,
          result: "tmpfile",
        });

        const compressed = await ImageManipulator.manipulateAsync(
          capturedUri,
          [],
          { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG },
        );

        job.resolve(compressed.uri);
      } catch (err) {
        job.reject(
          err instanceof Error ? err : new Error("Could not watermark photo."),
        );
      } finally {
        captureStartedRef.current = false;
        setImageReady(false);
        setJob(null);
      }
    }, [job, imageReady]);

    useEffect(() => {
      if (imageReady) {
        void runCapture();
      }
    }, [imageReady, runCapture]);

    const watermarkPhoto = useCallback(
      async (sourceUri: string, metadata: FieldPhotoMetadata) => {
        const resized = await ImageManipulator.manipulateAsync(
          sourceUri,
          [{ resize: { width: MAX_WATERMARK_WIDTH } }],
          { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
        );

        const dimensions = await new Promise<{ width: number; height: number }>(
          (resolve, reject) => {
            Image.getSize(
              resized.uri,
              (width, height) => resolve({ width, height }),
              () => reject(new Error("Could not read photo dimensions.")),
            );
          },
        );

        return new Promise<string>((resolve, reject) => {
          captureStartedRef.current = false;
          setImageReady(false);
          setJob({
            sourceUri: resized.uri,
            metadata,
            width: dimensions.width,
            height: dimensions.height,
            resolve,
            reject,
          });
        });
      },
      [],
    );

    useEffect(() => {
      registerPhotoWatermarkHandle({ watermark: watermarkPhoto });
      return () => registerPhotoWatermarkHandle(null);
    }, [watermarkPhoto]);

    useImperativeHandle(ref, () => ({ watermark: watermarkPhoto }), [watermarkPhoto]);

    if (!job) {
      return null;
    }

    const timeLine = formatWatermarkTime(job.metadata.captured_at);
    const gpsLine = formatWatermarkGps(
      job.metadata.latitude,
      job.metadata.longitude,
    );
    const fontSize = scaledFontSize(job.width);
    const barPadding = Math.round(fontSize * 0.65);
    const brandSize = Math.round(fontSize * 0.92);
    const logoSize = Math.round(fontSize * 3.7);

    return (
      <View style={styles.offscreen} pointerEvents="none" collapsable={false}>
        <ViewShot
          ref={viewRef}
          style={{ width: job.width, height: job.height }}
          options={{ format: "jpg", quality: 0.92 }}
        >
          <View
            collapsable={false}
            style={{ width: job.width, height: job.height, backgroundColor: "#000" }}
          >
            <Image
              source={{ uri: job.sourceUri }}
              style={{ width: job.width, height: job.height }}
              resizeMode="cover"
              onLoadEnd={() => setImageReady(true)}
            />
            <View
              collapsable={false}
              style={[styles.watermarkBar, { width: job.width }]}
            >
              <View style={styles.watermarkScrim} />
              <View
                style={[
                  styles.watermarkRow,
                  { paddingHorizontal: barPadding, paddingVertical: barPadding },
                ]}
              >
                <View
                  style={[
                    styles.logoTile,
                    {
                      width: logoSize,
                      height: logoSize,
                      marginRight: Math.round(fontSize * 0.5),
                    },
                  ]}
                >
                  <Image
                    source={logos.watermark}
                    style={{ width: logoSize, height: logoSize }}
                    resizeMode="cover"
                  />
                </View>
                <View style={styles.watermarkTextCol}>
                  <Text
                    style={[
                      styles.brandKrishe,
                      {
                        fontSize: brandSize,
                        lineHeight: Math.round(brandSize * 1.15),
                      },
                    ]}
                  >
                    KriSHE
                    <Text style={styles.brandCarbon}> Carbon</Text>
                  </Text>
                  <Text
                    style={[styles.watermarkText, { fontSize, lineHeight: fontSize * 1.25, marginTop: 4 }]}
                  >
                    GPS {gpsLine}
                  </Text>
                  <Text
                    style={[
                      styles.watermarkText,
                      { fontSize, lineHeight: fontSize * 1.25, marginTop: 2 },
                    ]}
                  >
                    Time {timeLine}
                  </Text>
                  {job.metadata.address ? (
                    <Text
                      style={[
                        styles.watermarkSubtext,
                        {
                          fontSize: Math.max(14, Math.round(fontSize * 0.78)),
                          lineHeight: Math.max(18, Math.round(fontSize * 0.95)),
                          marginTop: 4,
                        },
                      ]}
                      numberOfLines={2}
                    >
                      {job.metadata.address}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        </ViewShot>
      </View>
    );
  },
);

export default PhotoWatermarkProcessor;

const styles = StyleSheet.create({
  offscreen: {
    position: "absolute",
    left: -20000,
    top: 0,
    overflow: "hidden",
  },
  watermarkBar: {
    position: "absolute",
    left: 0,
    bottom: 0,
    borderTopWidth: 3,
    borderTopColor: colors.chartreuse,
  },
  watermarkScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#000000",
    opacity: 0.62,
  },
  watermarkRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoTile: {
    backgroundColor: colors.white,
    overflow: "hidden",
  },
  watermarkTextCol: {
    flex: 1,
  },
  brandKrishe: {
    fontFamily: fonts.bold,
    color: colors.chartreuse,
  },
  brandCarbon: {
    fontFamily: fonts.regular,
    color: colors.chartreuse,
  },
  watermarkText: {
    fontFamily: fonts.medium,
    color: colors.white,
  },
  watermarkSubtext: {
    fontFamily: fonts.regular,
    color: colors.chalk,
  },
});
