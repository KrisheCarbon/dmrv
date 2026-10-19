import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ScreenShell } from "../components/ScreenHeader";
import ScreenHeader from "../components/ScreenHeader";
import PrimaryButton from "../components/PrimaryButton";
import FormInput from "../components/FormInput";
import FormDateTimeField from "../components/FormDateTimeField";
import FileAttach from "../components/FileAttach";
import FormPicker from "../components/FormPicker";
import { colors, fonts, spacing, radius, typeScale } from "../constants/theme";
import {
  DOC_TYPES,
  INSPECTION_BUCKET,
  PHOTO_TYPES,
  VIDEO_TYPES,
  createInspection,
  inspectionOptions,
  listInspections,
  pickDocuments,
  pickPhotos,
  pickVideos,
  uploadPicked,
  type InspectionRecord,
  type OpsProducer,
  type PickedFile,
} from "../services/fieldOperations";

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function InspectionsScreen({ navigation }) {
  const [mode, setMode] = useState<"list" | "form">("list");
  const [rows, setRows] = useState<InspectionRecord[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await listInspections());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load inspections.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event: { preventDefault: () => void }) => {
      if (mode !== "form") return;
      event.preventDefault();
      setMode("list");
    });
    return unsubscribe;
  }, [navigation, mode]);

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <ScreenHeader title="Inspections" />
        <Text style={styles.caption}>One producer per visit</Text>
        {mode === "form" ? (
          <InspectionForm
            onCancel={() => setMode("list")}
            onSaved={() => {
              setMode("list");
              void load();
            }}
          />
        ) : (
          <>
            {loading ? <ActivityIndicator color={colors.brunswick} /> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!loading && rows.length === 0 ? <Text style={styles.body}>No inspections yet.</Text> : null}
            {rows.map((row) => {
              const open = openId === row.id;
              return (
                <Pressable key={row.id} style={styles.card} onPress={() => setOpenId(open ? null : row.id)}>
                  <Text style={styles.cardTitle}>{row.inspector_name}</Text>
                  <Text style={styles.caption}>
                    {formatWhen(row.held_at)} · {row.producer.name}
                  </Text>
                  {open
                    ? row.files.map((file) => (
                        <Pressable
                          key={file.id}
                          onPress={() => {
                            if (file.signed_url) void Linking.openURL(file.signed_url);
                          }}
                        >
                          <Text style={styles.link}>
                            {file.kind} · {file.file_name}
                          </Text>
                        </Pressable>
                      ))
                    : null}
                </Pressable>
              );
            })}
            <PrimaryButton title="Add entry" onPress={() => setMode("form")} />
          </>
        )}
      </ScrollView>
    </ScreenShell>
  );
}

function InspectionForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const [producers, setProducers] = useState<OpsProducer[]>([]);
  const [heldAt, setHeldAt] = useState(new Date());
  const [inspector, setInspector] = useState("");
  const [producerId, setProducerId] = useState("");
  const [report, setReport] = useState<PickedFile | null>(null);
  const [photos, setPhotos] = useState<PickedFile[]>([]);
  const [videos, setVideos] = useState<PickedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      void inspectionOptions()
        .then((options) => setProducers(options.producers))
        .catch((err) => setError(err instanceof Error ? err.message : "Could not load producers."));
    }, []),
  );

  async function save() {
    setError("");
    if (!inspector.trim()) return setError("Enter the inspector’s name.");
    if (!producerId) return setError("Select one producer.");
    if (!report) return setError("Upload the inspection report.");
    if (photos.length === 0) return setError("Upload at least one photo.");
    setSaving(true);
    try {
      const files = [
        ...(await uploadPicked(INSPECTION_BUCKET, "report", [report], DOC_TYPES)),
        ...(await uploadPicked(INSPECTION_BUCKET, "photo", photos, PHOTO_TYPES)),
        ...(await uploadPicked(INSPECTION_BUCKET, "video", videos, VIDEO_TYPES)),
      ];
      await createInspection({
        held_at: heldAt.toISOString(),
        inspector_name: inspector.trim(),
        producer_id: producerId,
        files,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the inspection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.form}>
      <FormDateTimeField label="Date and time" value={heldAt} onChange={setHeldAt} />
      <FormPicker
        label="Producer"
        placeholder="Select one producer"
        value={producerId}
        options={producers.map((producer) => ({ value: producer.id, label: producer.name }))}
        onValueChange={setProducerId}
        searchable
      />
      <FormInput label="Inspector name" value={inspector} onChangeText={setInspector} />
      <FileAttach
        label="Report"
        hint="One PDF or photo."
        single
        files={report ? [report] : []}
        onAdd={() => {
          void pickDocuments()
            .then((files) => {
              if (files[0]) setReport(files[0]);
            })
            .catch((err) => setError(err instanceof Error ? err.message : "Could not open files."));
        }}
        onRemove={() => setReport(null)}
      />
      <FileAttach
        label="Photos — at least one"
        hint="Take or choose photos."
        files={photos}
        onAdd={() => {
          void pickPhotos()
            .then((files) => {
              if (files.length > 0) setPhotos((current) => [...current, ...files]);
            })
            .catch((err) => setError(err instanceof Error ? err.message : "Could not open photos."));
        }}
        onRemove={(index) => setPhotos((current) => current.filter((_, item) => item !== index))}
      />
      <FileAttach
        label="Videos (optional)"
        hint="You can add more than one video."
        files={videos}
        onAdd={() => {
          void pickVideos()
            .then((files) => {
              if (files.length > 0) setVideos((current) => [...current, ...files]);
            })
            .catch((err) => setError(err instanceof Error ? err.message : "Could not open videos."));
        }}
        onRemove={(index) => setVideos((current) => current.filter((_, item) => item !== index))}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton title="Save inspection" onPress={() => void save()} loading={saving} />
      <PrimaryButton title="Back to list" variant="outline" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  back: { minHeight: 48, justifyContent: "center" },
  backText: { fontFamily: fonts.medium, fontSize: typeScale.body, color: colors.brunswick },
  body: { fontFamily: fonts.regular, fontSize: typeScale.body, color: colors.text },
  error: { fontFamily: fonts.regular, fontSize: typeScale.body, color: colors.error },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTitle: { fontFamily: fonts.medium, fontSize: typeScale.heading, color: colors.text },
  caption: { fontFamily: fonts.regular, fontSize: typeScale.label, color: colors.textSecondary },
  form: { gap: spacing.md },
  link: { fontFamily: fonts.medium, fontSize: typeScale.body, color: colors.brunswick, minHeight: 48 },
});
