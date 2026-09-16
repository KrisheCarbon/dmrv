"use client";

import { useState } from "react";
import { createUser } from "./actions";
import UserCreatedModal from "./UserCreatedModal";
import RoleSelect from "@/components/RoleSelect";
import { getAssignableRoles, getUserManagementHint, type UserRole } from "@/lib/roles";
import type { CreateUserResult, ModalCallbacks, UserFormData, UserOnboardingMethod } from "@/types";

interface AddUserModalProps extends ModalCallbacks {
  actorRole: UserRole;
}

function defaultMethodForRole(role: string): UserOnboardingMethod {
  return role === "climapreneur" ? "password" : "invite";
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => chars[value % chars.length]).join("");
}

export default function AddUserModal({
  actorRole,
  onClose,
  onSuccess,
}: AddUserModalProps) {
  const assignableRoles = getAssignableRoles(actorRole);
  const defaultRole = assignableRoles[0] ?? "climapreneur";
  const managementHint = getUserManagementHint(actorRole);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<
    (CreateUserResult & { password?: string }) | null
  >(null);

  const [form, setForm] = useState<UserFormData>({
    first_name: "",
    middle_name: "",
    last_name: "",
    email: "",
    phone: "",
    role: defaultRole,
    onboardingMethod: defaultMethodForRole(defaultRole),
    password: "",
    activateNow: true,
  });

  function updateRole(role: string) {
    setForm((current) => ({
      ...current,
      role,
      onboardingMethod: defaultMethodForRole(role),
    }));
  }

  async function handleSubmit() {
    setError(null);

    if (!form.first_name || !form.last_name || !form.email || !form.phone) {
      setError("Please fill all mandatory fields");
      return;
    }

    if (form.onboardingMethod === "password" && (form.password?.trim().length ?? 0) < 8) {
      setError("Set a password of at least 8 characters, or generate one.");
      return;
    }

    setLoading(true);

    try {
      const result = await createUser(form);
      setCreated({
        ...result,
        password:
          form.onboardingMethod === "password" ? form.password?.trim() : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }

    setLoading(false);
  }

  if (created) {
    return (
      <UserCreatedModal
        email={created.email}
        emailSent={created.emailSent}
        activated={created.activated}
        password={created.password}
        onClose={() => {
          setCreated(null);
          onSuccess();
        }}
      />
    );
  }

  const usingPassword = form.onboardingMethod === "password";

  return (
    <div className="fixed inset-0 bg-black/40 z-50">
      <div className="absolute inset-0 overflow-y-auto">
        <div className="min-h-full flex justify-center py-10">
          <div className="bg-white w-full max-w-lg p-6 rounded space-y-4">
            <h2 className="text-lg font-semibold">Add User</h2>

            {managementHint ? (
              <p className="text-sm text-gray-500">{managementHint}</p>
            ) : null}

            <input
              placeholder="First name *"
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
              placeholder="Last name *"
              className="w-full border px-3 py-2 rounded"
              value={form.last_name}
              onChange={(e) =>
                setForm({ ...form, last_name: e.target.value })
              }
            />

            <div>
              <input
                type="email"
                placeholder="Email * (Gmail or any inbox)"
                className="w-full border px-3 py-2 rounded"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-500">
                Company and personal emails are both allowed.
              </p>
            </div>

            <input
              placeholder="Phone *"
              className="w-full border px-3 py-2 rounded"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />

            <RoleSelect
              value={form.role}
              roles={assignableRoles}
              onChange={updateRole}
            />

            <div className="space-y-2 rounded-lg border border-gray-200 p-3">
              <p className="text-sm font-medium text-gray-800">How they sign in</p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  className="mt-0.5"
                  checked={usingPassword}
                  onChange={() =>
                    setForm({ ...form, onboardingMethod: "password" })
                  }
                />
                <span>
                  Set a password here — no email needed. Best for climapreneurs
                  and personal inboxes.
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  className="mt-0.5"
                  checked={!usingPassword}
                  onChange={() =>
                    setForm({ ...form, onboardingMethod: "invite" })
                  }
                />
                <span>
                  Send a setup email. This can go to any inbox, but delivery is
                  more reliable for @krishecarbon.com.
                </span>
              </label>
            </div>

            {usingPassword ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Password * (min. 8 characters)"
                    className="w-full border px-3 py-2 rounded font-mono text-sm"
                    value={form.password ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="shrink-0 border px-3 py-2 rounded text-sm"
                    onClick={() =>
                      setForm({ ...form, password: generatePassword() })
                    }
                  >
                    Generate
                  </button>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={Boolean(form.activateNow)}
                    onChange={(e) =>
                      setForm({ ...form, activateNow: e.target.checked })
                    }
                  />
                  <span>
                    Activate now so they can sign in to the app. Uncheck to
                    leave them invited until you mark them Active on this page.
                  </span>
                </label>
              </div>
            ) : null}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-4">
              <button onClick={onClose}>Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-black text-white px-4 py-2 rounded"
              >
                {loading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
