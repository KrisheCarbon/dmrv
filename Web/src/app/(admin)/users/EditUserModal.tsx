"use client";

import { useState } from "react";
import { updateUser } from "./actions";
import RoleSelect from "@/components/RoleSelect";
import { getAssignableRoles, type UserRole } from "@/lib/roles";
import type { ModalCallbacks, UserFormData, UserProfile } from "@/types";

interface EditUserModalProps extends ModalCallbacks {
  data: UserProfile;
  actorRole: UserRole;
}

export default function EditUserModal({
  data,
  actorRole,
  onClose,
  onSuccess,
}: EditUserModalProps) {
  const assignableRoles = getAssignableRoles(actorRole);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<UserFormData>({
    first_name: data.first_name ?? "",
    middle_name: data.middle_name ?? "",
    last_name: data.last_name ?? "",
    phone: data.phone ?? "",
    role: data.role ?? "climapreneur",
    status: data.status ?? "active",
    email: data.email,
  });

  async function handleSubmit() {
    setError(null);
    setLoading(true);

    try {
      await updateUser(data.id, form);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }

    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50">
      <div className="absolute inset-0 overflow-y-auto">
        <div className="min-h-full flex justify-center py-10">
          <div className="bg-white w-full max-w-lg p-6 rounded space-y-4">
            <h2 className="text-lg font-semibold">Edit User</h2>

            <p className="text-sm text-gray-500">{data.email}</p>

            <input
              placeholder="First name"
              className="w-full border px-3 py-2 rounded"
              value={form.first_name}
              onChange={(e) =>
                setForm({ ...form, first_name: e.target.value })
              }
            />

            <input
              placeholder="Middle name"
              className="w-full border px-3 py-2 rounded"
              value={form.middle_name}
              onChange={(e) =>
                setForm({ ...form, middle_name: e.target.value })
              }
            />

            <input
              placeholder="Last name"
              className="w-full border px-3 py-2 rounded"
              value={form.last_name}
              onChange={(e) =>
                setForm({ ...form, last_name: e.target.value })
              }
            />

            <input
              placeholder="Phone"
              className="w-full border px-3 py-2 rounded"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />

            <RoleSelect
              value={form.role}
              roles={assignableRoles}
              onChange={(role) => setForm({ ...form, role })}
            />

            <select
              className="w-full border px-3 py-2 rounded"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="pending_auth">Invited</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-4">
              <button onClick={onClose}>Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-black text-white px-4 py-2 rounded"
              >
                {loading ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
