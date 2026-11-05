import React, { useEffect, useState } from "react";
import FormPicker from "./FormPicker";
import { loadClusterVillages } from "../services/clusterVillageService";
import { getUserProfile } from "../services/userProfile";

export type AssignedCluster = { id: string; name: string };

/** Admin and manager cover every cluster. Supervisors cover the ones assigned to them. */
export function asksWhichCluster(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "supervisor";
}

/** Clusters this signed-in person is assigned to, from the villages already on the phone. */
export function useAssignedClusters() {
  const [role, setRole] = useState<string | null>(null);
  const [clusters, setClusters] = useState<AssignedCluster[]>([]);
  const [clusterId, setClusterId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getUserProfile(), loadClusterVillages()])
      .then(([profile, villages]) => {
        if (cancelled) return;
        setRole(profile?.role ?? null);
        const names = new Map<string, string>();
        for (const village of villages) {
          if (!village.cluster_id) continue;
          names.set(village.cluster_id, village.cluster_name || "Cluster");
        }
        const list = [...names.entries()].map(([id, name]) => ({ id, name }));
        setClusters(list);
        if (list.length === 1) setClusterId(list[0].id);
      })
      .catch(() => {
        if (!cancelled) {
          setRole(null);
          setClusters([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { role, clusters, clusterId, setClusterId, loading };
}

export default function SupervisorClusterPicker({
  clusters,
  value,
  onChange,
}: {
  clusters: AssignedCluster[];
  value: string;
  onChange: (clusterId: string) => void;
}) {
  if (clusters.length <= 1) return null;
  return (
    <FormPicker
      label="Which cluster is this for? *"
      placeholder="Choose a cluster"
      value={value}
      options={clusters.map((cluster) => ({ value: cluster.id, label: cluster.name }))}
      onValueChange={onChange}
    />
  );
}
