"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { canEditUser, formatRoleLabel, getUserManagementHint, type UserRole } from "@/lib/roles";
import DataTable from "@/components/table/DataTable";
import RoleSelect from "@/components/RoleSelect";
import AddUserModal from "./AddUserModal";
import EditUserModal from "./EditUserModal";
import { resendSignupEmail } from "./actions";
import type { UserProfile } from "@/types";
import type { UserTableRow } from "@/types/entities";

function mapUserRow(u: UserProfile & { full_name?: string | null }): UserTableRow {
  return {
    id: u.id,
    name: u.full_name ?? "",
    email: u.email,
    phone: u.phone ?? "",
    role: formatRoleLabel(u.role),
    status:
      u.status === "disabled"
        ? "Disabled"
        : u.status === "pending_auth"
          ? "Pending signup"
          : "Active",
    raw: u,
  };
}

export default function UsersPage() {
  const [rows, setRows] = useState<UserTableRow[]>([]);
  const [actorRole, setActorRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [resendLoading, setResendLoading] = useState<string | null>(null);

  async function fetchData() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role) {
        setActorRole(profile.role as UserRole);
      }
    }

    const { data, error } = await supabase
      .from("users")
      .select(`
        id,
        full_name,
        first_name,
        middle_name,
        last_name,
        email,
        phone,
        role,
        status
      `)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setRows(data.map((u) => mapUserRow(u)));
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleResendEmail(row: UserTableRow) {
    setResendLoading(row.id);
    try {
      await resendSignupEmail(row.id, row.email);
      alert(`Setup email resent to ${row.email}`);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unknown error");
    }
    setResendLoading(null);
  }

  const filteredRows = rows.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || r.status === statusFilter;
    const matchesRole = !roleFilter || r.raw.role === roleFilter;
    return matchesSearch && matchesStatus && matchesRole;
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage Admin, Manager, Supervisor, and Climapreneur accounts
          </p>
        </div>
        {actorRole ? (
          <button
            onClick={() => setShowAdd(true)}
            className="bg-black text-white px-4 py-2 rounded text-sm"
          >
            + Add User
          </button>
        ) : null}
      </div>

      <p className="text-sm text-gray-500">
        Web portal access is for <strong>admins</strong>,{" "}
        <strong>managers</strong>, and <strong>supervisors</strong> only.
        Climapreneurs use the mobile app.
        {actorRole && getUserManagementHint(actorRole) ? (
          <> {getUserManagementHint(actorRole)}</>
        ) : null}
      </p>

      <div className="flex flex-wrap gap-3 items-center">
        <input
          placeholder="Search by name or email"
          className="border px-3 py-2 rounded text-sm w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="border px-3 py-2 rounded text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Pending signup">Pending signup</option>
          <option value="Disabled">Disabled</option>
        </select>

        <RoleSelect
          className="border px-3 py-2 rounded text-sm"
          value={roleFilter}
          includeAllOption
          allOptionLabel="All roles"
          onChange={setRoleFilter}
        />
      </div>

      <DataTable
        loading={loading}
        columns={[
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "role", label: "Role" },
          {
            key: "status",
            label: "Status",
            render: (value) => (
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  value === "Active"
                    ? "bg-green-100 text-green-700"
                    : value === "Pending signup"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-200 text-gray-600"
                }`}
              >
                {String(value)}
              </span>
            ),
          },
        ]}
        rows={filteredRows}
        actions={(row) => {
          const editable =
            actorRole && canEditUser(actorRole, row.raw.role as string);

          return (
            <div className="flex gap-3">
              {editable && row.status === "Pending signup" && (
                <button
                  onClick={() => handleResendEmail(row)}
                  disabled={resendLoading === row.id}
                  className="text-green-700 hover:underline text-sm disabled:opacity-50"
                >
                  {resendLoading === row.id ? "Sending…" : "Resend email"}
                </button>
              )}
              {editable ? (
                <button
                  onClick={() => setEditUser(row.raw)}
                  className="text-blue-600 hover:underline text-sm"
                >
                  Edit
                </button>
              ) : (
                <span className="text-xs text-gray-400">View only</span>
              )}
            </div>
          );
        }}
      />

      {showAdd && actorRole ? (
        <AddUserModal
          actorRole={actorRole}
          onClose={() => setShowAdd(false)}
          onSuccess={() => {
            setShowAdd(false);
            fetchData();
          }}
        />
      ) : null}

      {editUser && actorRole ? (
        <EditUserModal
          actorRole={actorRole}
          data={editUser}
          onClose={() => setEditUser(null)}
          onSuccess={() => {
            setEditUser(null);
            fetchData();
          }}
        />
      ) : null}
    </div>
  );
}
