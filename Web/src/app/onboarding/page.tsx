"use client";

import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { completeOnboarding } from "./actions";

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setUserId(session.user.id);
        setStep("setup");
        return;
      }

      setStep("invalid");
    }

    init();
  }, []);

  async function handleSetup() {
    setError("");

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);

    try {
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) throw pwError;

      await completeOnboarding({ userId: userId! });
      setStep("done");
      setTimeout(() => router.replace("/"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }

    setLoading(false);
  }

  if (step === "loading") {
    return (
      <Shell>
        <p className="text-sm text-gray-500 text-center">Loading…</p>
      </Shell>
    );
  }

  if (step === "invalid") {
    return (
      <Shell>
        <p className="text-sm text-red-600 text-center">
          Please sign up first to set up your account.
        </p>
        <a
          href="/signup"
          className="block text-center text-sm text-gray-900 font-medium mt-4 hover:underline"
        >
          Go to signup →
        </a>
      </Shell>
    );
  }

  if (step === "done") {
    return (
      <Shell>
        <p className="text-sm text-green-700 text-center font-medium">
          Account set up! Redirecting…
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h2 className="text-lg font-semibold text-gray-900 text-center">
        Create your password
      </h2>
      <p className="text-sm text-gray-500 text-center mt-1 mb-6">
        Almost done. Choose a password for your account.
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-sm text-gray-600 block mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 8 characters"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="text-sm text-gray-600 block mb-1">
            Confirm password
          </label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat password"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      <button
        onClick={handleSetup}
        disabled={loading}
        className="mt-6 w-full bg-gray-900 text-white py-2.5 rounded-md text-sm font-medium hover:bg-black transition disabled:opacity-60"
      >
        {loading ? "Saving…" : "Complete setup"}
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-[400px] max-w-full bg-white rounded-xl border border-gray-200 shadow-sm px-8 py-10">
        <div className="flex justify-center mb-6">
          <img
            src="/icons/logo-vertical.png"
            alt="KriSHE Carbon"
            className="h-14 w-auto"
          />
        </div>
        {children}
      </div>
    </div>
  );
}
