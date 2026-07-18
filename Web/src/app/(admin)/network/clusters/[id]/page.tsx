"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams } from "next/navigation";
import type { ClusterDetail } from "@/types";

export default function ViewCluster() {
  const { id } = useParams<{ id: string }>();
  const [cluster, setCluster] = useState<ClusterDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCluster() {
      if (!id) return;

      setLoading(true);

      const { data, error } = await supabase
        .from("clusters")
        .select(`
      id,
      name,
      created_by_name,
      clusters_villages (
        id,
        village_name,
        number_of_farmers,
        location,
        clusters_villages_crops (
          crop_type,
          feedstock_type,
          biomass_use_case,
          acres,
          sowing_date,
          estimated_harvest_date,
          estimated_biochar_m3_per_year
        )
      )
    `)
        .eq("id", id)
        .single();

      if (error) {
        console.error("Supabase error:", error);
        setCluster(null);
      } else {
        setCluster(data);
      }

      setLoading(false);
    }

    if (id) fetchCluster();
  }, [id]);

async function handleDelete() {
  const confirmed = window.confirm(
    "This action is irreversible.\n\nDeleting this cluster will permanently remove:\n- The cluster\n- All villages\n- All crops\n\nDo you want to continue?"
  );

  if (!confirmed) return;

  const { error } = await supabase.rpc("delete_cluster", {
    cluster_id: id,
  });

  if (error) {
    alert(error.message || "Failed to delete cluster");
    return;
  }

  alert("Cluster deleted successfully");

  // Redirect back to cluster list
  window.location.href = "/network/clusters";
}


  if (loading) return <p>Loading...</p>;
  if (!cluster) return <p>Cluster not found</p>;

  return (
    <div className="space-y-6">
      {/* Cluster Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{cluster.name}</h1>
          <p className="text-sm text-gray-600">
            Created by: {cluster.created_by_name}
          </p>
        </div>

        <button
          onClick={handleDelete}
          className="text-sm text-red-600 border border-red-200 px-3 py-1 rounded hover:bg-red-50"
        >
          Delete Cluster
        </button>
      </div>


      {/* Villages */}
      {cluster.clusters_villages?.map((village) => (
        <div key={village.id} className="border rounded p-4 space-y-3">
          <div>
            <h3 className="font-medium text-lg">
              {village.village_name}
            </h3>
            <p className="text-sm text-gray-600">
              Farmers: {village.number_of_farmers}
            </p>
            {village.location && (
                <div className="text-sm text-gray-500 space-y-1">
                  <p>
                    Location: {village.location.place_name || village.village_name}
                  </p>
                  {village.location.lat && village.location.lng && (
                    <p>
                      GPS: Lattitude:{village.location.lat}, Longitude:{village.location.lng}
                    </p>
                  )}
                </div>
              )}

          </div>

          {/* Crops table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border px-2 py-1 text-left">Crop</th>
                  <th className="border px-2 py-1 text-left">Feedstock</th>
                  <th className="border px-2 py-1 text-right">Acres</th>
                  <th className="border px-2 py-1 text-right">
                    Biochar (m³/year)
                  </th>
                  <th className="border px-2 py-1 text-right">
                    Biochar Use Case
                  </th>
                  <th className="border px-2 py-1">Sowing</th>
                  <th className="border px-2 py-1">Harvest</th>
                </tr>
              </thead>
              <tbody>
                {village.clusters_villages_crops?.map((crop, ci) => (
                  <tr key={ci}>
                    <td className="border px-2 py-1">
                      {crop.crop_type}
                    </td>
                    <td className="border px-2 py-1">
                      {crop.feedstock_type || "-"}
                    </td>
                    <td className="border px-2 py-1 text-right">
                      {crop.acres}
                    </td>
                    <td className="border px-2 py-1 text-right">
                      {crop.estimated_biochar_m3_per_year ?? 0}
                    </td>
                    <td className="border px-2 py-1">
                      {crop.biomass_use_case || "-"}
                    </td>
                    <td className="border px-2 py-1">
                      {crop.sowing_date || "-"}
                    </td>
                    <td className="border px-2 py-1">
                      {crop.estimated_harvest_date || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Map placeholder */}
          {/* Mapbox / Google Maps render can go here */}
        </div>
      ))}
    </div>
  );
}
