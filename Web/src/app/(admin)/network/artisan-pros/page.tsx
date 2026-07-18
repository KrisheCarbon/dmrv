"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable from "@/components/table/DataTable";
import AddArtisanProModal from "./AddArtisanProModal";
import { useRouter } from "next/navigation";
import type { ArtisanProTableRow } from "@/types";

export default function ArtisanProsPage() {
  const [rows, setRows] = useState<ArtisanProTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const router = useRouter();

  async function fetchData() {
    setLoading(true);

    const { data, error } = await supabase
      .from("artisan_pros")
      .select(`
        id,
        artisan_pro_code,
        name,
        estimated_production_m3_year,
        artisan_pro_villages(count),
        kontikkis(count)
      `)
      .order("created_at", { ascending: false });

    if (!error) {
      setRows(
        data.map((a) => ({
          id: a.id,
          code: a.artisan_pro_code,
          name: a.name,
          villages: a.artisan_pro_villages?.[0]?.count ?? 0,
          kontikkis: a.kontikkis?.[0]?.count ?? 0,
          production: a.estimated_production_m3_year
        }))
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    async function fetchDataFromEffect() {
      setLoading(true);

      const { data, error } = await supabase
        .from("artisan_pros")
        .select(`
        id,
        artisan_pro_code,
        name,
        estimated_production_m3_year,
        artisan_pro_villages(count),
        kontikkis(count)
      `)
        .order("created_at", { ascending: false });

      if (!error) {
        setRows(
          data.map((a) => ({
            id: a.id,
            code: a.artisan_pro_code,
            name: a.name,
            villages: a.artisan_pro_villages?.[0]?.count ?? 0,
            kontikkis: a.kontikkis?.[0]?.count ?? 0,
            production: a.estimated_production_m3_year
          }))
        );
      }

      setLoading(false);
    }

    fetchDataFromEffect();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Artisan Pros</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-black text-white px-4 py-2 rounded text-sm"
        >
          + Add Artisan Pro
        </button>
      </div>

      <DataTable
        loading={loading}
        columns={[
          { key: "code", label: "Artisan Pro ID" },
          { key: "name", label: "Name" },
          { key: "villages", label: "Villages" },
          { key: "kontikkis", label: "Kontikkis" },
          { key: "production", label: "Est. Production (m³/year)" }
        ]}
        rows={rows}
        actions={(row) => (
          <button
            onClick={() => router.push(`/network/artisan-pros/${row.id}`)}
            className="text-blue-600 text-sm hover:underline"
          >
            View
          </button>
        )}
      />

      {showAdd && (
        <AddArtisanProModal
          onClose={() => setShowAdd(false)}
          onSuccess={() => {
            setShowAdd(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}
