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
import FormMultiSelectDropdown from "../components/FormMultiSelectDropdown";
import LocationPickerModal from "../components/LocationPickerModal";
import { colors, fonts, spacing, radius, typeScale } from "../constants/theme";
import {
  DOC_TYPES,
  PHOTO_TYPES,
  TRAINING_SESSION_BUCKET,
  VIDEO_TYPES,
  createTrainingSession,
  listTrainingSessions,
  pickDocuments,
  pickPhotos,
  pickVideos,
  trainingOptions,
  uploadPicked,
  type OpsProducer,
  type PickedFile,
  type TrainingSession,
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

export default function TrainingsScreen({ navigation }) {
  const [mode, setMode] = useState<"list" | "form">("list");
  const [rows, setRows] = useState<TrainingSession[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await listTrainingSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load trainings.");
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
        <ScreenHeader title="Trainings" />
        <Text style={styles.caption}>Sessions for producers</Text>
        {mode === "form" ? (
          <TrainingForm
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
            {!loading && rows.length === 0 ? (
              <Text style={styles.body}>No trainings yet.</Text>
            ) : null}
            {rows.map((row) => {
              const open = openId === row.id;
              return (
                <Pressable key={row.id} style={styles.card} onPress={() => setOpenId(open ? null : row.id)}>
                  <Text style={styles.cardTitle}>{row.trainer_name}</Text>
                  <Text style={styles.caption}>
                    {formatWhen(row.held_at)} · {row.producers.map((producer) => producer.name).join(", ")}
                  </Text>
                  {open ? <FileList files={row.files} place={row.location_label} lat={row.latitude} lng={row.longitude} /> : null}
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

function TrainingForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const [producers, setProducers] = useState<OpsProducer[]>([]);
  const [heldAt, setHeldAt] = useState(new Date());
  const [trainer, setTrainer] = useState("");
  const [producerIds, setProducerIds] = useState<string[]>([]);
  const [place, setPlace] = useState<{ latitude: number; longitude: number; address: string } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [attendance, setAttendance] = useState<PickedFile[]>([]);
  const [materials, setMaterials] = useState<PickedFile[]>([]);
  const [photos, setPhotos] = useState<PickedFile[]>([]);
  const [videos, setVideos] = useState<PickedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      void trainingOptions()
        .then((options) => setProducers(options.producers))
        .catch((err) => setError(err instanceof Error ? err.message : "Could not load producers."));
    }, []),
  );

  async function attach(
    picker: () => Promise<PickedFile[]>,
    setFiles: React.Dispatch<React.SetStateAction<PickedFile[]>>,
  ) {
    try {
      const picked = await picker();
      if (picked.length > 0) setFiles((current) => [...current, ...picked]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open files.");
    }
  }

  async function save() {
    setError("");
    if (!trainer.trim()) return setError("Enter the trainer’s name.");
    if (producerIds.length === 0) return setError("Select at least one producer.");
    if (!place) return setError("Choose the location on the map.");
    if (attendance.length === 0) return setError("Upload at least one attendance sheet.");
    if (photos.length === 0) return setError("Upload at least one photo.");
    setSaving(true);
    try {
      const files = [
        ...(await uploadPicked(TRAINING_SESSION_BUCKET, "attendance", attendance, DOC_TYPES)),
        ...(await uploadPicked(TRAINING_SESSION_BUCKET, "material", materials, DOC_TYPES)),
        ...(await uploadPicked(TRAINING_SESSION_BUCKET, "photo", photos, PHOTO_TYPES)),
        ...(await uploadPicked(TRAINING_SESSION_BUCKET, "video", videos, VIDEO_TYPES)),
      ];
      await createTrainingSession({
        held_at: heldAt.toISOString(),
        trainer_name: trainer.trim(),
        producer_ids: producerIds,
        latitude: place.latitude,
        longitude: place.longitude,
        location_label: place.address || null,
        files,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the training.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.form}>
      <FormDateTimeField label="Date and time" value={heldAt} onChange={setHeldAt} />
      <FormInput label="Trainer name" value={trainer} onChangeText={setTrainer} />
      <FormMultiSelectDropdown
        label="Producers"
        placeholder="Select producers"
        values={producerIds}
        options={producers.map((producer) => ({ value: producer.id, label: producer.name }))}
        onChange={setProducerIds}
      />
      <Pressable style={styles.attach} onPress={() => setMapOpen(true)}>
        <Text style={styles.attachText}>{place ? place.address || "Location chosen" : "Choose location on the map"}</Text>
      </Pressable>
      <FileAttach
        label="Attendance sheet"
        hint="PDF or photo. You can add more than one."
        files={attendance}
        onAdd={() => void attach(pickDocuments, setAttendance)}
        onRemove={(index) => setAttendance((current) => current.filter((_, item) => item !== index))}
      />
      <FileAttach
        label="Training materials (optional)"
        hint="PDF or photo."
        files={materials}
        onAdd={() => void attach(pickDocuments, setMaterials)}
        onRemove={(index) => setMaterials((current) => current.filter((_, item) => item !== index))}
      />
      <FileAttach
        label="Photos — at least one"
        hint="Take or choose photos."
        files={photos}
        onAdd={() => void attach(pickPhotos, setPhotos)}
        onRemove={(index) => setPhotos((current) => current.filter((_, item) => item !== index))}
      />
      <FileAttach
        label="Videos (optional)"
        hint="You can add more than one video."
        files={videos}
        onAdd={() => void attach(pickVideos, setVideos)}
        onRemove={(index) => setVideos((current) => current.filter((_, item) => item !== index))}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton title="Save training" onPress={() => void save()} loading={saving} />
      <PrimaryButton title="Back to list" variant="outline" onPress={onCancel} />
      <LocationPickerModal
        visible={mapOpen}
        onClose={() => setMapOpen(false)}
        onConfirm={(value) => setPlace(value)}
      />
    </View>
  );
}

function FileList({
  files,
  place,
  lat,
  lng,
}: {
  files: { id: string; kind: string; file_name: string; signed_url: string | null }[];
  place: string | null;
  lat: number;
  lng: number;
}) {
  return (
    <View style={styles.files}>
      <Text style={styles.caption}>{place || "Map location"}</Text>
      <Pressable onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`)}>
        <Text style={styles.link}>Open map</Text>
      </Pressable>
      {files.map((file) => (
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
      ))}
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
  files: { gap: spacing.xs, marginTop: spacing.sm },
  link: { fontFamily: fonts.medium, fontSize: typeScale.body, color: colors.brunswick, minHeight: 48 },
});
