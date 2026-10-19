"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { establishSessionFromUrl } from "@/lib/parseAuthHash";

type Step = "checking" | "form" | "expired";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function openResetLink() {
      // An expired or used link comes back with an error in the hash instead of tokens.
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      if (hash.get("error")) {
        window.history.replaceState(null, "", "/reset-password");
        setStep("expired");
        return;
      }

      try {
        const session =
          (await establishSessionFromUrl(supabase)) ??
          (await supabase.auth.getSession()).data.session;

        if (!session) {
          setStep("expired");
          return;
        }

        setEmail(session.user.email ?? "");
        setStep("form");
      } catch {
        setStep("expired");
      }
    }

    openResetLink();
  }, []);

  async function saveNewPassword() {
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    // Sign out on every device so the person signs in fresh with the new password,
    // where their role belongs: web or mobile app.
    await supabase.auth.signOut({ scope: "global" });
    router.replace("/auth?reset=done");
  }

  async function cancelReset() {
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/auth");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-[380px] max-w-full bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-8 pb-6 text-center border-b">
          <div className="flex justify-center mb-3">
            <img
              src="/icons/logo-vertical.png"
              alt="KriSHE Carbon"
              className="h-16 w-auto"
            />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">
            Set a new password
          </h1>
        </div>

        <div className="px-6 py-6 space-y-4">
          {step === "checking" && (
            <p className="text-sm text-gray-500 text-center">Opening your reset link…</p>
          )}

          {step === "expired" && (
            <>
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                This reset link has expired or was already used. Reset links
                work for 24 hours and only once.
              </p>
              <Link
                href="/forgot-password"
                className="block w-full text-center bg-gray-900 text-white py-2.5 rounded-md text-sm font-medium hover:bg-black transition"
              >
                Send a new reset link
              </Link>
            </>
          )}

          {step === "form" && (
            <>
              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              {email && (
                <p className="text-sm text-gray-600 text-center">
                  New password for{" "}
                  <span className="font-medium text-gray-900">{email}</span>
                </p>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    New password
                  </label>
                  <input
                    type="password"
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Confirm new password
                  </label>
                  <input
                    type="password"
                    placeholder="Repeat password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>

              <button
                onClick={saveNewPassword}
                disabled={loading || !password || !confirm}
                className="w-full bg-gray-900 text-white py-2.5 rounded-md text-sm font-medium hover:bg-black transition disabled:opacity-60"
              >
                {loading ? "Saving…" : "Save new password"}
              </button>

              <button
                type="button"
                onClick={cancelReset}
                disabled={loading}
                className="w-full text-sm text-gray-600 hover:text-gray-900 disabled:opacity-60"
              >
                Cancel and go to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
