import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { ScreenShell } from "../components/ScreenHeader";
import SearchField from "../components/SearchField";
import FormDateField from "../components/FormDateField";
import FormPicker from "../components/FormPicker";
import { colors, fonts, spacing, radius } from "../constants/theme";
import {
  fetchFieldActivity,
  type FieldActivityPerson,
  type FieldActivityStats,
  type FieldActivityTeam,
} from "../services/fieldActivity";

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCalendarDay(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatEnteredAt(value: string | null): string {
  if (!value) return "No entries in this period";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No entries in this period";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function periodLabel(from: string, to: string): string {
  if (!from && !to) return "All time";
  if (from && to) return `${formatCalendarDay(from)} – ${formatCalendarDay(to)}`;
  if (from) return `From ${formatCalendarDay(from)}`;
  return `Until ${formatCalendarDay(to)}`;
}

function matchesQuery(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

function countText(counts: FieldActivityStats["totals"]) {
  return {
    farmers: `${counts.farmers} farmers · ${counts.farmersInfoOnly ?? 0} info only · ${counts.farmersWithFarm ?? 0} with a farm`,
    rest: `${counts.farms} farms · ${counts.consents} consents · ${counts.soilTests} soil tests · ${counts.soilReports ?? 0} reports`,
  };
}

const EMPTY_COUNTS: FieldActivityStats["totals"] = {
  farmers: 0,
  farmersInfoOnly: 0,
  farmersWithFarm: 0,
  farms: 0,
  consents: 0,
  soilTests: 0,
  soilReports: 0,
};

function StatList({ totals }: { totals: FieldActivityStats["totals"] }) {
  const rows: { label: string; value: number; nested?: boolean }[] = [
    { label: "Total farmers registered", value: totals.farmers },
    { label: "Only farmer info registered", value: totals.farmersInfoOnly ?? 0, nested: true },
    { label: "Farmers with at least one farm", value: totals.farmersWithFarm ?? 0, nested: true },
    { label: "Total farms registered", value: totals.farms },
    { label: "Total soil tests done", value: totals.soilTests },
    { label: "Total soil reports received", value: totals.soilReports ?? 0 },
    { label: "Total consents collected", value: totals.consents },
  ];

  return (
    <View style={styles.statList}>
      {rows.map((row) => (
        <View key={row.label} style={styles.statRow}>
          <Text style={[styles.statRowLabel, row.nested && styles.statRowLabelNested]}>
            {row.label}
          </Text>
          <Text style={styles.statRowValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

function PersonCard({
  person,
  onPress,
  eyebrow,
  ranged,
}: {
  person: FieldActivityPerson;
  onPress: () => void;
  eyebrow?: string;
  ranged?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.personCard, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.personTop}>
        <View style={styles.personTitleWrap}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.personName}>{person.name}</Text>
          <Text style={styles.countLine}>{countText(person.counts).farmers}</Text>
          <Text style={styles.countSub}>{countText(person.counts).rest}</Text>
          <Text style={styles.lastEntered}>
            {person.lastEnteredAt
              ? `Last entered ${formatEnteredAt(person.lastEnteredAt)}`
              : ranged
                ? "No entries in this period"
                : "No entries"}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

function PersonSection({
  title,
  people,
  onOpen,
  ranged,
}: {
  title: string;
  people: FieldActivityPerson[];
  onOpen: (person: FieldActivityPerson) => void;
  ranged: boolean;
}) {
  if (people.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {people.map((person) => (
        <PersonCard
          key={person.id}
          person={person}
          eyebrow={title.endsWith("s") ? title.slice(0, -1) : title}
          onPress={() => onOpen(person)}
          ranged={ranged}
        />
      ))}
    </View>
  );
}

function SupervisorCard({
  team,
  onPress,
  ranged,
}: {
  team: FieldActivityTeam;
  onPress: () => void;
  ranged: boolean;
}) {
  const own = team.supervisor.counts;
  const teamCounts = team.totals;
  return (
    <Pressable
      style={({ pressed }) => [styles.personCard, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.personTop}>
        <View style={styles.personTitleWrap}>
          <Text style={styles.eyebrow}>Supervisor</Text>
          <Text style={styles.personName}>{team.supervisor.name}</Text>
          <Text style={styles.statLabel}>Individual</Text>
          <Text style={styles.countLine}>{countText(own).farmers}</Text>
          <Text style={styles.countSub}>{countText(own).rest}</Text>
          <Text style={styles.lastEntered}>
            {team.supervisor.lastEnteredAt
              ? `Last entered ${formatEnteredAt(team.supervisor.lastEnteredAt)}`
              : ranged
                ? "No entries in this period"
                : "No entries"}
          </Text>
          <Text style={styles.statLabel}>Team</Text>
          <Text style={styles.countLine}>{countText(teamCounts).farmers}</Text>
          <Text style={styles.countSub}>
            {countText(teamCounts).rest}
            {" · "}
            {team.climapreneurs.length} climapreneurs
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

export default function FieldActivityScreen({ navigation }) {
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [stats, setStats] = useState<FieldActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [clusterId, setClusterId] = useState("");
  const [entryScope, setEntryScope] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [periodChoice, setPeriodChoice] = useState<"all" | "today" | "custom">("all");

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const next = await fetchFieldActivity(appliedFrom || undefined, appliedTo || undefined, {
        clusterId: clusterId || undefined,
        scope: entryScope || undefined,
        userId: selectedUserId || undefined,
      });
      setStats(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load field activity");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [appliedFrom, appliedTo, clusterId, entryScope, selectedUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyRange(from: string, to: string) {
    setDraftFrom(from);
    setDraftTo(to);
    setAppliedFrom(from);
    setAppliedTo(to);
    setRangeError(null);
  }

  function choosePeriod(value: string) {
    if (value === "today") {
      setPeriodChoice("today");
      applyRange(isoDate(new Date()), isoDate(new Date()));
      return;
    }
    if (value === "all") {
      setPeriodChoice("all");
      applyRange("", "");
      return;
    }
    setPeriodChoice("custom");
  }

  function chooseCluster(next: string) {
    setClusterId(next);
    setSelectedUserId("");
  }

  function chooseScope(next: string) {
    setEntryScope(next);
    setSelectedUserId("");
  }

  function applySearch() {
    if (draftFrom && draftTo && draftFrom > draftTo) {
      setRangeError("The from date has to be on or before the to date.");
      return;
    }
    setRangeError(null);
    setAppliedFrom(draftFrom);
    setAppliedTo(draftTo);
  }

  function openFarmers(person: FieldActivityPerson) {
    navigation.navigate("FarmerDashboard", {
      title: person.name,
      listMode: "all",
      enteredById: person.id,
      enteredByName: person.name,
    });
  }

  const isSupervisorView = stats?.role === "supervisor";
  const isClimapreneurView = stats?.role === "climapreneur";
  const isPortalView = stats?.role === "admin" || stats?.role === "manager";
  const activeScope = entryScope || stats?.scope || "";

  const today = isoDate(new Date());
  const showingToday = appliedFrom === today && appliedTo === today;
  const showingAllTime = !appliedFrom && !appliedTo;
  const rangeLabel = showingToday
    ? "today"
    : showingAllTime
      ? "all time"
      : periodLabel(appliedFrom, appliedTo);
  const draftPending = draftFrom !== appliedFrom || draftTo !== appliedTo;

  const climapreneurPeople = useMemo(() => {
    if (!stats) return [];
    if (stats.role === "supervisor") return stats.climapreneurs ?? [];
    const people = new Map<string, FieldActivityPerson>();
    for (const team of stats.teams) {
      for (const person of team.climapreneurs) people.set(person.id, person);
    }
    for (const person of stats.unassignedClimapreneurs ?? []) {
      people.set(person.id, person);
    }
    return [...people.values()].sort((a, b) => {
      const score = (person: FieldActivityPerson) =>
        person.counts.farmers +
        person.counts.farms +
        person.counts.consents +
        person.counts.soilTests +
        (person.counts.soilReports ?? 0);
      return score(b) - score(a) || a.name.localeCompare(b.name);
    });
  }, [stats]);

  return (
    <ScreenShell>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load("refresh")}
            tintColor={colors.brunswick}
          />
        }
      >
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>Farmers stats</Text>
          </View>
        </View>

        <View style={styles.filterCard}>
          <FormPicker
            label="Period"
            value={periodChoice}
            options={[
              { value: "all", label: "All time" },
              { value: "today", label: "Today" },
              { value: "custom", label: "Custom range" },
            ]}
            onValueChange={choosePeriod}
          />
          {periodChoice === "custom" ? (
            <>
              <View style={styles.dateRow}>
                <View style={styles.dateField}>
                  <FormDateField
                    label="From"
                    value={draftFrom}
                    maximumDate={draftTo || undefined}
                    onChange={setDraftFrom}
                  />
                </View>
                <View style={styles.dateField}>
                  <FormDateField
                    label="To"
                    value={draftTo}
                    minimumDate={draftFrom || undefined}
                    onChange={setDraftTo}
                  />
                </View>
              </View>
              <Pressable style={styles.searchBtn} onPress={applySearch}>
                <Text style={styles.searchBtnText}>Search</Text>
              </Pressable>
              {draftPending && !rangeError ? (
                <Text style={styles.pendingHint}>Press Search to update the totals.</Text>
              ) : null}
              {rangeError ? <Text style={styles.rangeError}>{rangeError}</Text> : null}
            </>
          ) : null}

          {stats ? (
            <>
              {(stats.clusters ?? []).length === 0 && !isPortalView ? (
                <Text style={styles.emptyInline}>You are not assigned to a cluster yet.</Text>
              ) : (
                <FormPicker
                  label={isPortalView ? "Cluster" : "Your cluster"}
                  value={clusterId || "all"}
                  options={[
                    {
                      value: "all",
                      label: isPortalView ? "All clusters" : "All your clusters",
                    },
                    ...(stats.clusters ?? []).map((cluster) => ({
                      value: cluster.id,
                      label: cluster.name,
                    })),
                  ]}
                  onValueChange={(value) => chooseCluster(value === "all" ? "" : value)}
                />
              )}
              <FormPicker
                label="Users"
                value={
                  activeScope === "company"
                    ? "company"
                    : activeScope === "team"
                      ? "team"
                      : activeScope === "me"
                        ? "me"
                        : activeScope === "supervisors"
                          ? "supervisors"
                          : activeScope === "climapreneurs"
                            ? "climapreneurs"
                            : isClimapreneurView
                              ? "cluster"
                              : isSupervisorView
                                ? "team"
                                : "company"
                }
                options={[
                  ...(isPortalView ? [{ value: "company", label: "All data" }] : []),
                  ...(isSupervisorView ? [{ value: "team", label: "All this team" }] : []),
                  ...(isClimapreneurView ? [{ value: "cluster", label: "Entire cluster" }] : []),
                  { value: "me", label: "You" },
                  { value: "supervisors", label: "Supervisors" },
                  { value: "climapreneurs", label: "Climapreneurs" },
                ]}
                onValueChange={chooseScope}
              />
              {activeScope === "supervisors" || activeScope === "climapreneurs" ? (
                <FormPicker
                  label={activeScope === "supervisors" ? "Supervisor" : "Climapreneur"}
                  value={selectedUserId || "all"}
                  searchable
                  searchPlaceholder="Search name"
                  options={[
                    {
                      value: "all",
                      label: activeScope === "supervisors" ? "All supervisors" : "All climapreneurs",
                    },
                    ...(activeScope === "supervisors"
                      ? stats.teams.map((team) => team.supervisor)
                      : stats.climapreneurs ?? []
                    ).map((person) => ({
                      value: person.id,
                      label: person.name,
                    })),
                  ]}
                  onValueChange={(value) => setSelectedUserId(value === "all" ? "" : value)}
                />
              ) : null}
            </>
          ) : null}
        </View>

        {loading && !stats ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.brunswick} />
            <Text style={styles.loadingText}>Loading entries…</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.loadError}>{error}</Text> : null}

        {stats ? (
          <>
            <Text style={styles.showing}>
              {`Showing ${rangeLabel}`}
              {clusterId
                ? ` · ${(stats.clusters ?? []).find((cluster) => cluster.id === clusterId)?.name || "Cluster"}`
                : isPortalView
                  ? " · All clusters"
                  : " · All your clusters"}
              {selectedUserId
                ? ` · ${
                    [...(stats.climapreneurs ?? []), ...stats.teams.map((team) => team.supervisor)].find(
                      (person) => person.id === selectedUserId,
                    )?.name || "Selected person"
                  }`
                : activeScope === "company"
                  ? " · All data"
                  : activeScope === "me"
                    ? " · You"
                    : activeScope === "supervisors"
                      ? " · All supervisors"
                      : activeScope === "climapreneurs"
                        ? " · All climapreneurs"
                        : activeScope === "cluster"
                          ? " · Entire cluster"
                          : " · All this team"}
              {loading ? " · Updating…" : ""}
            </Text>
            {isClimapreneurView && !selectedUserId && activeScope !== "me" && activeScope !== "supervisors" && activeScope !== "climapreneurs" ? (
              <>
                <Text style={styles.sectionTitle}>Entire cluster</Text>
                <StatList totals={stats.totals} />
                <Text style={styles.sectionTitle}>Your entries</Text>
                <StatList totals={stats.self?.counts ?? EMPTY_COUNTS} />
              </>
            ) : (
              <StatList totals={stats.totals} />
            )}

            {isClimapreneurView || activeScope === "me" ? null : (
            <>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Search name"
              style={styles.search}
            />

            {(() => {
              const ranged = Boolean(appliedFrom || appliedTo);
              const needle = query.trim();
              const matches = (name: string) => !needle || matchesQuery(name, needle);
              const supervisorTeams = stats.teams.filter((team) =>
                matches(team.supervisor.name),
              );
              const climapreneurs = climapreneurPeople.filter((person) =>
                matches(person.name),
              );
              const admins = (stats.admins ?? []).filter((person) => matches(person.name));
              const managers = (stats.managers ?? []).filter((person) =>
                matches(person.name),
              );
              const showAdmins = activeScope === "company" && isPortalView;
              const showSupervisors =
                activeScope === "team" ||
                activeScope === "company" ||
                activeScope === "supervisors";
              const showClimapreneurs =
                activeScope === "team" ||
                activeScope === "company" ||
                activeScope === "climapreneurs";
              const nothingMatches =
                Boolean(needle) &&
                (!showSupervisors || supervisorTeams.length === 0) &&
                (!showClimapreneurs || climapreneurs.length === 0) &&
                (!showAdmins || (admins.length === 0 && managers.length === 0));

              return (
                <>
                  {showAdmins ? (
                    <>
                      <PersonSection
                        title="Admins"
                        people={admins}
                        onOpen={openFarmers}
                        ranged={ranged}
                      />
                      <PersonSection
                        title="Managers"
                        people={managers}
                        onOpen={openFarmers}
                        ranged={ranged}
                      />
                    </>
                  ) : null}

                  {showSupervisors &&
                  (!needle || supervisorTeams.length > 0 || stats.teams.length === 0) ? (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Supervisors</Text>
                      {isSupervisorView ? (
                        <Text style={styles.sectionHint}>Only supervisors on your clusters.</Text>
                      ) : null}
                      {stats.teams.length === 0 ? (
                        <Text style={styles.emptyInline}>No supervisors yet.</Text>
                      ) : (
                        supervisorTeams.map((team) => (
                          <SupervisorCard
                            key={team.supervisor.id}
                            team={team}
                            ranged={ranged}
                            onPress={() => openFarmers(team.supervisor)}
                          />
                        ))
                      )}
                    </View>
                  ) : null}

                  {showClimapreneurs &&
                  (!needle || climapreneurs.length > 0 || climapreneurPeople.length === 0) ? (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Climapreneurs</Text>
                      {climapreneurPeople.length === 0 ? (
                        <Text style={styles.emptyInline}>No climapreneurs yet.</Text>
                      ) : (
                        climapreneurs.map((person) => (
                          <PersonCard
                            key={person.id}
                            person={person}
                            eyebrow="Climapreneur"
                            onPress={() => openFarmers(person)}
                            ranged={ranged}
                          />
                        ))
                      )}
                    </View>
                  ) : null}
                  {nothingMatches ? (
                    <Text style={styles.emptyInline}>No one matches that search.</Text>
                  ) : null}
                </>
              );
            })()}
            </>
            )}
          </>
        ) : null}
      </ScrollView>
    </ScreenShell>
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
    marginBottom: spacing.md,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.xs,
  },
  backText: {
    fontSize: 28,
    lineHeight: 30,
    color: colors.brunswick,
    fontFamily: fonts.medium,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    color: colors.smoke,
  },
  filterCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  filterLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  chipRow: {
    paddingBottom: spacing.sm,
  },
  choiceChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.chalk,
    marginRight: spacing.sm,
  },
  choiceChipActive: {
    backgroundColor: colors.brunswick,
    borderColor: colors.brunswick,
  },
  choiceChipText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.brunswick,
  },
  choiceChipTextActive: {
    color: colors.white,
  },
  quickRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  quickBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.chalk,
  },
  quickBtnActive: {
    backgroundColor: colors.brunswick,
    borderColor: colors.brunswick,
  },
  quickBtnText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.brunswick,
  },
  quickBtnTextActive: {
    color: colors.white,
  },
  dateRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  dateField: {
    flex: 1,
  },
  searchBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.brunswick,
    marginTop: -spacing.xs,
  },
  searchBtnText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.white,
  },
  pendingHint: {
    marginTop: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
  },
  showing: {
    marginBottom: spacing.sm,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.brunswick,
  },
  rangeError: {
    marginTop: spacing.sm,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.error,
    textAlign: "center",
  },
  loadError: {
    marginBottom: spacing.md,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.error,
  },
  loading: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  loadingText: {
    fontFamily: fonts.regular,
    color: colors.smoke,
  },
  statList: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statRowLabel: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 18,
    color: colors.text,
  },
  statRowLabelNested: {
    paddingLeft: spacing.md,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  statRowValue: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.brunswick,
  },
  caption: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  search: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.brunswick,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
    marginTop: -4,
    marginBottom: spacing.sm,
  },
  personCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.white,
  },
  cardPressed: {
    backgroundColor: colors.chalk,
  },
  personTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  personTitleWrap: {
    flex: 1,
  },
  eyebrow: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.smoke,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  statLabel: {
    marginTop: spacing.sm,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  personName: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
  },
  countLine: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.brunswick,
  },
  countSub: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  lastEntered: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
  },
  chevron: {
    fontSize: 22,
    color: colors.smoke,
    marginLeft: spacing.sm,
  },
  teamCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.chalk,
  },
  teamName: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.brunswick,
  },
  teamToggle: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  teamToggleText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.brunswick,
  },
  recentList: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  entryBody: {
    flex: 1,
  },
  entryKind: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.brunswick,
  },
  entryName: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text,
  },
  entryMeta: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
  },
  entryDate: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "right",
    maxWidth: 96,
  },
  emptyInline: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
    marginBottom: spacing.sm,
  },
});
