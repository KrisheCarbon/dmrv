import React, { useCallback, useState } from "react";
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
import { colors, fonts, spacing, radius, typeScale } from "../constants/theme";
import {
  fetchPaymentStatement,
  type PaymentPerson,
  type PaymentStatement,
} from "../services/payments";

function formatInr(amount: number): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `₹${amount.toFixed(2)}`;
  }
}

function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function roleLabel(role: string): string {
  if (role === "climapreneur") return "Climapreneur";
  if (role === "supervisor") return "Supervisor";
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  return role;
}

export default function PaymentsScreen({ navigation }) {
  const [statement, setStatement] = useState<PaymentStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchPaymentStatement();
      setStatement(next);
      if (next.viewer.scope === "self") {
        setOpenId(next.people[0]?.id ?? next.viewer.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load payments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const self =
    statement?.people.find((person) => person.id === statement.viewer.id) ??
    (statement?.viewer.scope === "self" ? statement.people[0] : null);
  const team = statement?.viewer.scope === "all";

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>Payment stats</Text>
            <Text style={styles.subtitle}>
              {team
                ? "What the field team is owed, and what has already been paid."
                : "What you have earned from your entries, and what you have received."}
            </Text>
          </View>
        </View>

        {loading && !statement ? (
          <ActivityIndicator color={colors.brunswick} />
        ) : null}

        {error ? (
          <View style={styles.card}>
            <Text style={styles.body}>{error}</Text>
            <Pressable style={styles.retry} onPress={() => void load()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {statement ? (
          <>
            {self && !team ? (
              <View style={styles.summary}>
                <SummaryRow label="You are owed" value={formatInr(self.owed)} />
                <SummaryRow label="You have received" value={formatInr(self.paid)} />
                <SummaryRow label="Still to receive" value={formatInr(self.balance)} />
              </View>
            ) : (
              <View style={styles.summary}>
                <SummaryRow label="Team is owed" value={formatInr(statement.totals.owed)} />
                <SummaryRow label="Team has received" value={formatInr(statement.totals.paid)} />
                <SummaryRow label="Still to pay" value={formatInr(statement.totals.balance)} />
              </View>
            )}
            {statement.rates_active === false ? (
              <Text style={styles.caption}>
                Entries are counted. Amounts stay at ₹0 until a rate card is saved in the admin portal.
              </Text>
            ) : null}

            {self && !team ? (
              <PersonBody
                person={self}
                payments={statement.disbursements.filter((payment) => payment.payee_id === self.id)}
              />
            ) : null}

            {team
              ? statement.people.map((person) => {
                  const open = openId === person.id;
                  return (
                    <View key={person.id} style={styles.card}>
                      <Pressable
                        style={styles.personRow}
                        onPress={() => setOpenId(open ? null : person.id)}
                      >
                        <View style={styles.personText}>
                          <Text style={styles.cardTitle}>{person.name}</Text>
                          <Text style={styles.caption}>{roleLabel(person.role)}</Text>
                          <View style={styles.statLine}>
                            <Text style={styles.stat}>Owed {formatInr(person.owed)}</Text>
                            <Text style={styles.stat}>Received {formatInr(person.paid)}</Text>
                          </View>
                          <Text style={styles.caption}>Still to pay {formatInr(person.balance)}</Text>
                        </View>
                        <Text style={styles.chevron}>{open ? "▾" : "›"}</Text>
                      </Pressable>
                      {open ? (
                        <PersonBody
                          person={person}
                          payments={statement.disbursements.filter(
                            (payment) => payment.payee_id === person.id,
                          )}
                        />
                      ) : null}
                    </View>
                  );
                })
              : null}

            {team && statement.people.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.body}>
                  No farmer, farm, or other record is on file yet. Rate cards are set in the admin portal.
                </Text>
              </View>
            ) : null}

          </>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.caption}>{label}</Text>
      <Text style={styles.amount}>{value}</Text>
    </View>
  );
}

function PersonBody({
  person,
  payments,
}: {
  person: PaymentPerson;
  payments: PaymentStatement["disbursements"];
}) {
  return (
    <View style={styles.personBody}>
      {person.by_activity.map((row) => (
        <View key={row.activity} style={styles.line}>
          <View style={styles.personText}>
            <Text style={styles.body}>
              {row.label} · {row.count}
            </Text>
            {row.how ? <Text style={styles.caption}>{row.how}</Text> : null}
          </View>
          <Text style={styles.bodyStrong}>{formatInr(row.amount_inr)}</Text>
        </View>
      ))}
      {person.by_activity.length === 0 ? <Text style={styles.body}>No entries yet.</Text> : null}
      <Text style={styles.receivedTitle}>Received</Text>
      {payments.length === 0 ? (
        <Text style={styles.body}>No payment recorded yet.</Text>
      ) : (
        payments.map((payment) => (
          <View key={payment.id} style={styles.payment}>
            <Text style={styles.bodyStrong}>{formatInr(payment.amount_inr)}</Text>
            <Text style={styles.caption}>
              {formatDate(payment.paid_on)}
              {payment.note ? ` · ${payment.note}` : ""}
            </Text>
            {payment.signed_url ? (
              <Pressable style={styles.proof} onPress={() => void Linking.openURL(payment.signed_url!)}>
                <Text style={styles.proofText}>{payment.proof_name || "View proof"}</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  backBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.xs,
  },
  backText: {
    fontSize: typeScale.title,
    lineHeight: 30,
    color: colors.brunswick,
    fontFamily: fonts.medium,
  },
  headerText: {
    flex: 1,
    paddingTop: spacing.sm,
  },
  title: {
    fontSize: typeScale.title,
    fontFamily: fonts.bold,
    color: colors.brunswick,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: typeScale.label,
    lineHeight: 18,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  summary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  summaryRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  amount: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  section: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    fontSize: typeScale.heading,
    fontFamily: fonts.medium,
    color: colors.brunswick,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: typeScale.body,
    fontFamily: fonts.medium,
    color: colors.text,
  },
  body: {
    fontSize: typeScale.bodySmall,
    lineHeight: 22,
    fontFamily: fonts.regular,
    color: colors.text,
  },
  bodyStrong: {
    fontSize: typeScale.body,
    fontFamily: fonts.medium,
    color: colors.text,
  },
  caption: {
    marginTop: spacing.xs,
    fontSize: typeScale.label,
    lineHeight: 18,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
    minHeight: 48,
  },
  personRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  personText: {
    flex: 1,
  },
  statLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  stat: {
    fontSize: typeScale.body,
    fontFamily: fonts.medium,
    color: colors.text,
  },
  receivedTitle: {
    marginTop: spacing.sm,
    fontSize: typeScale.body,
    fontFamily: fonts.medium,
    color: colors.brunswick,
  },
  payment: {
    gap: spacing.xs,
  },
  personBody: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  chevron: {
    fontSize: typeScale.heading,
    color: colors.brunswick,
    fontFamily: fonts.medium,
  },
  proof: {
    marginTop: spacing.sm,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.chalk,
  },
  proofText: {
    fontSize: typeScale.body,
    fontFamily: fonts.medium,
    color: colors.brunswick,
  },
  retry: {
    marginTop: spacing.md,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.brunswick,
  },
  retryText: {
    fontSize: typeScale.body,
    fontFamily: fonts.medium,
    color: colors.white,
  },
});
