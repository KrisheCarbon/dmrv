"use client";

import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import EditArtisanProModal from "../EditArtisanProModal";
import type { ArtisanProDetail } from "@/types";
import type { Supervisor } from "@/types/entities";

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}

export default function ArtisanProViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<ArtisanProDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);



  async function fetchData() {
    setLoading(true);

    const { data, error } = await supabase
      .from("artisan_pros")
      .select(`
        *,
        artisan_pro_feedstocks(feedstock_name),
        artisan_pro_villages(id,
          village_name,
          location),
        kontikkis(id, kontikki_code)
      `)
      .eq("id", id)
      .single();

    if (!error) setData(data);
    setLoading(false);
  }

  async function fetchSupervisors() {
      const { data, error } = await supabase
        .from("artisan_pro_supervisors")
        .select(`
          supervisor_id,
          users (
            id,
            full_name,
            email,
            phone,
            status
          )
        `)
        .eq("artisan_pro_id", id);

      if (!error && data) {
        const mapped: Supervisor[] = [];
        for (const row of data) {
          const users = row.users;
          if (Array.isArray(users)) {
            for (const u of users) {
              if (u && typeof u === "object" && "id" in u) {
                mapped.push(u as Supervisor);
              }
            }
          } else if (users && typeof users === "object" && "id" in users) {
            mapped.push(users as Supervisor);
          }
        }
        setSupervisors(mapped);
      }
    }

  useEffect(() => {
    if (!id) return;

    async function fetchDataFromEffect() {
      setLoading(true);

      const { data, error } = await supabase
        .from("artisan_pros")
        .select(`
        *,
        artisan_pro_feedstocks(feedstock_name),
        artisan_pro_villages(id,
          village_name,
          location),
        kontikkis(id, kontikki_code)
      `)
        .eq("id", id)
        .single();

      if (!error) setData(data);
      setLoading(false);
    }

    async function fetchSupervisorsFromEffect() {
      const { data, error } = await supabase
        .from("artisan_pro_supervisors")
        .select(`
          supervisor_id,
          users (
            id,
            full_name,
            email,
            phone,
            status
          )
        `)
        .eq("artisan_pro_id", id);

      if (!error && data) {
        const mapped: Supervisor[] = [];
        for (const row of data) {
          const users = row.users;
          if (Array.isArray(users)) {
            for (const u of users) {
              if (u && typeof u === "object" && "id" in u) {
                mapped.push(u as Supervisor);
              }
            }
          } else if (users && typeof users === "object" && "id" in users) {
            mapped.push(users as Supervisor);
          }
        }
        setSupervisors(mapped);
      }
    }

    fetchDataFromEffect();
    fetchSupervisorsFromEffect();
  }, [id]);


    function handleAddSupervisor() {
      router.push("/network/biochar-producers"); 
      // or open AddUserModal if you want later
    }


async function handleDelete() {
  if (!data) return;
  if ((data.kontikkis?.length ?? 0) > 0) {
    alert(
      "This Artisan Pro has Kontikkis assigned.\n\nPlease delete or reassign them before deleting this Artisan Pro."
    );
    return;
  }

  const confirmed = window.confirm(
    "This will permanently delete the Artisan Pro.\n\nContinue?"
  );
  if (!confirmed) return;

  const { error } = await supabase.rpc("delete_artisan_pro", {
    p_artisan_pro_id: id,
  });

  if (error) {
    alert(error.message);
  } else {
    router.push("/network/artisan-pros");
  }
}

async function handleDeleteKontikki(kontikkiId: string, kontikkiCode: string) {
  const confirmed = window.confirm(
    `This will permanently delete Kontikki "${kontikkiCode}".\n\nThis action cannot be undone.\n\nContinue?`
  );

  if (!confirmed) return;

  const { error } = await supabase.rpc("delete_kontikki", {
    kontikki_id: kontikkiId,
  });

  if (error) {
    alert(error.message || "Failed to delete Kontikki");
    return;
  }

  // Refresh Artisan Pro data
  fetchData();
}


  if (loading) return <p>Loading...</p>;
  if (!data) return <p>Not found</p>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-xl font-semibold">{data.name}</h1>
          <p className="text-sm text-gray-600">
            Artisan Pro ID: {data.artisan_pro_code}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowEdit(true)}
            className="text-blue-600 text-sm"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="text-red-600 text-sm"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm border rounded p-4">
        <Detail label="Artisan Pro ID" value={data.artisan_pro_code} />
        <Detail label="Name" value={data.name} />
        <Detail label="DMRV ID" value={data.dmrv_id} />

        <Detail
          label="Estimated production (m³/year)"
          value={data.estimated_production_m3_year}
        />

        <Detail
          label="Real production last year (m³)"
          value={data.real_production_last_year_m3}
        />

        <Detail
          label="Proper end use confirmed"
          value={data.proper_end_use_confirmed ? "Yes" : "No"}
        />

        <Detail
          label="First internal inspection"
          value={data.first_internal_inspection}
        />

        <Detail
          label="Last internal inspection"
          value={data.last_internal_inspection}
        />

        <Detail
          label="Last supervisor name"
          value={data.last_supervisor_name}
        />

        <Detail
          label="Last unannounced inspection"
          value={data.last_unannounced_inspection}
        />
      </div>


      {data.gps_location && (
        <div className="text-sm">
          <b>Location:</b><br />
          {data.gps_location.place_name || "-"}<br />
          Lat: {data.gps_location.lat}, Lng: {data.gps_location.lng}
        </div>
      )}

      <div>
        <h3 className="font-medium">Feedstocks</h3>
        <ul className="list-disc pl-5">
          {data.artisan_pro_feedstocks?.map((f, i) => (
            <li key={i}>{f.feedstock_name}</li>
          ))}
        </ul>
      </div>

      <h3 className="font-medium">Villages</h3>
      <div className="border rounded p-4 space-y-3">
        {(data.artisan_pro_villages?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-500">
            No villages added yet
          </p>
        ) : (
          <ul className="space-y-3 text-sm">
            {data.artisan_pro_villages?.map((v) => (
              <li key={v.id} className="border rounded p-2">
                <p className="font-medium">{v.village_name}</p>

                {v.location ? (
                  <p className="text-xs text-gray-600">
                    📍{" "}
                    {v.location.place_name ??
                      `${v.location.lat}, ${v.location.lng}`}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">
                    No location set
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h3 className="font-medium">Kontikkis</h3>

          <button
            onClick={() => router.push("/network/kontikkis/new")}
            className="text-sm bg-black text-white px-3 py-1 rounded"
          >
            + Add Kontikki
          </button>
        </div>

        {/* List */}
        {(data.kontikkis?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-500">
            No kontikkis assigned
          </p>
        ) : (
          <ul className="space-y-2">
            {data.kontikkis?.map((k) => (
              <li
                key={k.id}
                className="flex justify-between items-center border rounded px-3 py-2 text-sm"
              >
                <button
                  onClick={() =>
                    router.push(`/network/kontikkis/${k.id}`)
                  }
                  className="text-blue-600 hover:underline"
                >
                  {k.kontikki_code}
                </button>

                <button
                  onClick={() =>
                    handleDeleteKontikki(k.id, k.kontikki_code)
                  }
                  className="text-xs text-red-600 hover:underline"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}


        <div className="space-y-3">
          {/* Header */}
          <div className="flex justify-between items-center">
            <h3 className="font-medium">Supervisors</h3>

            <button
              onClick={handleAddSupervisor}
              className="text-sm bg-black text-white px-3 py-1 rounded"
            >
              + Add Supervisor
            </button>
          </div>

          {/* List */}
          {supervisors.length === 0 ? (
            <p className="text-sm text-gray-500">
              No supervisors assigned
            </p>
          ) : (
            <ul className="space-y-2">
              {supervisors.map((s) => (
                <li
                  key={s.id}
                  className="flex justify-between items-center border rounded px-3 py-2 text-sm"
                >
                  {/* LEFT: View supervisor */}
                  <button
                    onClick={() =>
                      router.push(`/network/biochar-producers/${s.id}`)
                    }
                    className="text-blue-600 hover:underline"
                  >
                    {s.full_name}
                  </button>

                  {/* RIGHT: Status + action */}
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        s.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {s.status === "active" ? "Active" : "Disabled"}
                    </span>

                    <button
                      onClick={() =>
                        alert(
                          "Supervisor assignment is managed from Users screen."
                        )
                      }
                      className="text-xs text-gray-600 hover:underline"
                    >
                      Manage
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>


      </div>


      {showEdit && (
        <EditArtisanProModal
          data={data}
          onClose={() => setShowEdit(false)}
          onSuccess={() => {
            setShowEdit(false);
            fetchData();
          }}
        />
      )}

    </div>
  );
}
