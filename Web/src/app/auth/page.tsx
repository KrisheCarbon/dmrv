"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { establishSessionFromUrl } from "@/lib/parseAuthHash";
import { useRouter } from "next/navigation";

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [error, setError] = useState("");
  const [processingInvite, setProcessingInvite] = useState(
    () =>
      typeof window !== "undefined" &&
      window.location.hash.includes("access_token")
  );

  useEffect(() => {
    if (searchParams.get("error") === "unauthorized_role") {
      setError(
        "The web portal is for admins, managers, and supervisors only. Climapreneurs should sign in through the mobile app.",
      );
    }
  }, [searchParams]);

  useEffect(() => {
    async function handleHash() {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;

      const params = new URLSearchParams(hash);
      const description =
        params.get("error_description") || params.get("error");

      if (description) {
        setProcessingInvite(false);
        setError(
          description.replace(/\+/g, " ") +
            ". Ask your admin for a new invite link."
        );
        window.history.replaceState(null, "", "/auth");
        return;
      }

      if (!hash.includes("access_token")) return;

      setProcessingInvite(true);

      try {
        const session = await establishSessionFromUrl(supabase);
        const type = params.get("type");

        if (session && type === "invite") {
          router.replace("/signup");
          return;
        }

        if (session) {
          const { data: profile } = await supabase
            .from("users")
            .select("status")
            .eq("id", session.user.id)
            .single();

          if (profile?.status === "pending_auth") {
            router.replace("/signup");
            return;
          }

          router.replace("/");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }

      setProcessingInvite(false);
    }

    handleHash();
  }, [router]);

  async function loginWithPassword() {
    setLoading(true);
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    await supabase.auth.getSession();
    router.replace("/");
  }

  async function sendOtp() {
    if (!email) {
      setError("Enter your email first");
      return;
    }

    setOtpLoading(true);
    setError("");

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    setOtpLoading(false);

    if (otpError) {
      setError(otpError.message);
      return;
    }

    setOtpSent(true);
  }

  async function verifyOtp() {
    setLoading(true);
    setError("");

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

    if (verifyError) {
      setError(verifyError.message);
      setLoading(false);
      return;
    }

    await supabase.auth.getSession();
    router.replace("/");
  }

  function resetOtp() {
    setOtpSent(false);
    setOtp("");
    setError("");
  }

  if (processingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-500">Setting up your account…</p>
      </div>
    );
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
          <h1 className="text-lg font-semibold text-gray-900">Sign in</h1>
        </div>

        <div className="px-6 py-6 space-y-4">
          <div className="min-h-[40px]">
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {error}
              </div>
            )}
          </div>

          {!otpSent ? (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="you@krishecarbon.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <button
                onClick={loginWithPassword}
                disabled={loading || !email || !password}
                className="w-full bg-gray-900 text-white py-2.5 rounded-md text-sm font-medium hover:bg-black transition disabled:opacity-60"
              >
                {loading ? "Signing in…" : "Sign in with password"}
              </button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-400">or</span>
                </div>
              </div>

              <button
                onClick={sendOtp}
                disabled={otpLoading || !email}
                className="w-full border border-gray-300 text-gray-700 py-2.5 rounded-md text-sm font-medium hover:bg-gray-50 transition disabled:opacity-60"
              >
                {otpLoading ? "Sending OTP…" : "Send OTP to email"}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500 text-center">
                A 6-digit code was sent to{" "}
                <span className="font-medium text-gray-700">{email}</span>
              </p>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  One-time password
                </label>
                <input
                  type="text"
                  placeholder="Enter the 6-digit code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <button
                onClick={verifyOtp}
                disabled={loading || !otp}
                className="w-full bg-gray-900 text-white py-2.5 rounded-md text-sm font-medium hover:bg-black transition disabled:opacity-60"
              >
                {loading ? "Verifying…" : "Verify & sign in"}
              </button>

              <button
                onClick={resetOtp}
                className="w-full text-sm text-gray-500 hover:text-gray-900"
              >
                Back to password login
              </button>
            </>
          )}

          <p className="text-center text-sm text-gray-500 pt-2">
            First time here?{" "}
            <Link href="/signup" className="text-gray-900 font-medium hover:underline">
              Set up your account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      }
    >
      <AuthForm />
    </Suspense>
  );
}
