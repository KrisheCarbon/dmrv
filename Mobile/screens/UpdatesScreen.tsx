import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ScreenShell } from "../components/ScreenHeader";
import ScreenHeader from "../components/ScreenHeader";
import PrimaryButton from "../components/PrimaryButton";
import { colors, fonts, spacing, radius, typeScale } from "../constants/theme";
import {
  listUpdateInbox,
  markAllUpdatesRead,
  markUpdateRead,
  updatesErrorMessage,
  type UpdateMessage,
} from "../services/updatesService";

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function UpdatesScreen({ navigation }) {
  const [messages, setMessages] = useState<UpdateMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const inbox = await listUpdateInbox();
      setMessages(inbox.messages);
    } catch (err) {
      setError(updatesErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const unread = messages.filter((message) => !message.read).length;

  async function openMessage(message: UpdateMessage) {
    if (message.read) return;
    setMessages((current) =>
      current.map((item) => (item.id === message.id ? { ...item, read: true } : item)),
    );
    try {
      await markUpdateRead(message.id);
    } catch (err) {
      setError(updatesErrorMessage(err));
      void load();
    }
  }

  async function markAll() {
    if (unread === 0 || markingAll) return;
    setMarkingAll(true);
    try {
      await markAllUpdatesRead();
      setMessages((current) => current.map((item) => ({ ...item, read: true })));
    } catch (err) {
      setError(updatesErrorMessage(err));
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <ScreenShell>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable style={styles.back} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <ScreenHeader title="Updates" />
          <Text style={styles.caption}>Messages sent to you</Text>

          {loading ? <ActivityIndicator color={colors.brunswick} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!loading && !error && messages.length === 0 ? (
            <Text style={styles.body}>No updates yet.</Text>
          ) : null}

          {messages.map((message) => (
            <Pressable
              key={message.id}
              style={[styles.card, !message.read && styles.cardNew]}
              onPress={() => void openMessage(message)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{message.title}</Text>
                {message.read ? null : (
                  <View style={styles.newPill}>
                    <View style={styles.newDot} />
                    <Text style={styles.newText}>New</Text>
                  </View>
                )}
              </View>
              <Text style={styles.body}>{message.body}</Text>
              <Text style={styles.caption}>
                {message.author_name ? `${message.author_name} · ` : ""}
                {formatWhen(message.created_at)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {unread > 0 ? (
          <View style={styles.footer}>
            <PrimaryButton
              title="Mark all as read"
              variant="outline"
              loading={markingAll}
              onPress={() => void markAll()}
            />
          </View>
        ) : null}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  back: { minHeight: 48, justifyContent: "center" },
  backText: {
    fontFamily: fonts.medium,
    fontSize: typeScale.body,
    color: colors.brunswick,
  },
  caption: {
    fontFamily: fonts.regular,
    fontSize: typeScale.label,
    color: colors.textSecondary,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    color: colors.text,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    color: colors.error,
  },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    minHeight: 48,
  },
  cardNew: {
    backgroundColor: colors.successBg,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typeScale.heading,
    color: colors.text,
  },
  newPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  newDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
  },
  newText: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label,
    color: colors.success,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
});
