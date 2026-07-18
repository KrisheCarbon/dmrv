import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { formatRoleLabel } from "@krishecarbon/shared";
import ScreenHeader, { ScreenShell } from "../components/ScreenHeader";
import { colors, fonts, spacing, radius } from "../constants/theme";
import {
  fetchMobileNetworkOverview,
  type MobileNetworkOverview,
  type NetworkKontikki,
  type NetworkPerson,
  type NetworkProducer,
  type NetworkFeedstock,
} from "../services/backendApi";

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{count}</Text>
      </View>
      {children}
    </View>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <Text style={styles.emptyText}>{message}</Text>;
}

function PersonCard({ person }: { person: NetworkPerson }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{person.full_name}</Text>
      <Text style={styles.cardMeta}>{formatRoleLabel(person.role)}</Text>
      {person.phone ? (
        <Text style={styles.cardDetail}>{person.phone}</Text>
      ) : null}
      {person.email ? (
        <Text style={styles.cardDetail}>{person.email}</Text>
      ) : null}
    </View>
  );
}

function ProducerCard({ producer }: { producer: NetworkProducer }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{producer.name}</Text>
      {producer.producer_code ? (
        <Text style={styles.cardMeta}>{producer.producer_code}</Text>
      ) : null}
      {producer.contact_name ? (
        <Text style={styles.cardDetail}>Contact: {producer.contact_name}</Text>
      ) : null}
      {producer.mobile_number ? (
        <Text style={styles.cardDetail}>{producer.mobile_number}</Text>
      ) : null}
      {producer.status ? (
        <Text style={styles.cardBadge}>{producer.status}</Text>
      ) : null}
    </View>
  );
}

function KontikkiCard({ kontikki }: { kontikki: NetworkKontikki }) {
  const operatorNames = (kontikki.operators ?? [])
    .map((person) => person.full_name)
    .join(", ");

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{kontikki.kontikki_code}</Text>
      {kontikki.producer?.name ? (
        <Text style={styles.cardMeta}>{kontikki.producer.name}</Text>
      ) : null}
      <Text style={styles.cardDetail}>
        Status: {kontikki.status}
        {kontikki.capacity != null ? ` · ${kontikki.capacity} capacity` : ""}
      </Text>
      {operatorNames ? (
        <Text style={styles.cardDetail}>Operators: {operatorNames}</Text>
      ) : null}
    </View>
  );
}

function FeedstockCard({ item }: { item: NetworkFeedstock }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.biomass_type}</Text>
      {item.producer?.name ? (
        <Text style={styles.cardMeta}>{item.producer.name}</Text>
      ) : null}
      <Text style={styles.cardDetail}>Lab status: {item.lab_status}</Text>
    </View>
  );
}

export default function MyNetworkScreen({ navigation }) {
  const [data, setData] = useState<MobileNetworkOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const overview = await fetchMobileNetworkOverview();
      setData(overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load network");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      setLoading(true);
      loadData();
    });
    return unsubscribe;
  }, [navigation, loadData]);

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
  }

  const isAdminView =
    data?.role === "admin" || data?.role === "manager";

  const showSupervisors =
    isAdminView ||
    data?.role === "supervisor" ||
    data?.role === "climapreneur" ||
    (data?.supervisors.length ?? 0) > 0;
  const showClimapreneurs =
    isAdminView ||
    data?.role === "supervisor" ||
    data?.role === "climapreneur" ||
    (data?.climapreneurs.length ?? 0) > 0;
  const showFeedstock = Boolean(data);

  return (
    <ScreenShell>
      <ScreenHeader
        title="My Network"
        subtitle="Your related network details"
      />

      {loading && !data ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brunswick} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {data ? (
            <>
              <View style={styles.noteCard}>
                <Text style={styles.noteText}>
                  {isAdminView
                    ? "Read-only network overview. Editing will be added in a later update."
                    : "Read-only view of producers, kontikkis, and people linked to your work."}
                </Text>
              </View>

              <Section title="Producers" count={data.producers.length}>
                {data.producers.length === 0 ? (
                  <EmptyRow message="No producers assigned yet." />
                ) : (
                  data.producers.map((producer) => (
                    <ProducerCard key={producer.id} producer={producer} />
                  ))
                )}
              </Section>

              <Section title="Kontikkis" count={data.kontikkis.length}>
                {data.kontikkis.length === 0 ? (
                  <EmptyRow message="No kontikkis assigned yet." />
                ) : (
                  data.kontikkis.map((kontikki) => (
                    <KontikkiCard key={kontikki.id} kontikki={kontikki} />
                  ))
                )}
              </Section>

              {showSupervisors ? (
                <Section title="Supervisors" count={data.supervisors.length}>
                  {data.supervisors.length === 0 ? (
                    <EmptyRow message="No supervisors yet." />
                  ) : (
                    data.supervisors.map((person) => (
                      <PersonCard key={person.id} person={person} />
                    ))
                  )}
                </Section>
              ) : null}

              {showClimapreneurs ? (
                <Section
                  title="Climapreneurs"
                  count={data.climapreneurs.length}
                >
                  {data.climapreneurs.length === 0 ? (
                    <EmptyRow message="No climapreneurs yet." />
                  ) : (
                    data.climapreneurs.map((person) => (
                      <PersonCard key={person.id} person={person} />
                    ))
                  )}
                </Section>
              ) : null}

              {showFeedstock ? (
                <Section title="Feedstock" count={data.feedstock.length}>
                  {data.feedstock.length === 0 ? (
                    <EmptyRow message="No feedstock records yet." />
                  ) : (
                    data.feedstock.map((item) => (
                      <FeedstockCard key={item.id} item={item} />
                    ))
                  )}
                </Section>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  noteCard: {
    backgroundColor: colors.chalk,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
    lineHeight: 18,
  },
  errorCard: {
    backgroundColor: colors.errorBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  errorText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.error,
    lineHeight: 18,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.brunswick,
  },
  sectionCount: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.smoke,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
    fontStyle: "italic",
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  cardTitle: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.brunswick,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
  },
  cardDetail: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
    lineHeight: 18,
  },
  cardBadge: {
    alignSelf: "flex-start",
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.brunswick,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});
