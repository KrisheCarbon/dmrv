"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { establishSessionFromUrl } from "@/lib/parseAuthHash";
import { checkSignupEmail, completeSignup } from "./actions";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [linkExpired, setLinkExpired] = useState(false);

  useEffect(() => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    function activate(session: Session) {
      if (!session || settled) return;
      settled = true;
      clearTimeout(timeoutId);
      setUserId(session.user.id);
      setEmail(session.user.email ?? "");
      setStep("setup");
    }

    function showFallback(msg?: string) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (msg) setError(msg);
      setLinkExpired(!!msg);
      setStep("otp-email");
      window.history.replaceState(null, "", "/signup");
    }

    async function init() {
      const queryError = searchParams.get("error_description");
      if (queryError) {
        showFallback(decodeURIComponent(queryError.replace(/\+/g, " ")));
        return;
      }

      const hash = window.location.hash.replace(/^#/, "");
      const hashParams = new URLSearchParams(hash);
      const hashError =
        hashParams.get("error_description") || hashParams.get("error");

      if (hashError) {
        showFallback(hashError.replace(/\+/g, " "));
        return;
      }

      const code = searchParams.get("code");

      try {
        const hashSession = await establishSessionFromUrl(supabase);
        if (hashSession) {
          activate(hashSession);
          return;
        }

        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;

          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            activate(session);
            return;
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          activate(session);
          return;
        }
      } catch (err) {
        showFallback(err instanceof Error ? err.message : "Unknown error");
        return;
      }

      timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          setStep("otp-email");
        }
      }, 2000);
    }

    init();
    return () => clearTimeout(timeoutId);
  }, [searchParams]);

  async function sendOtp() {
    if (!email) {
      setError("Enter your email");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const check = await checkSignupEmail(email);
      if (!check.allowed) {
        if (check.reason === "not_found") {
          setError("No account found. Contact your admin.");
        } else if (check.reason === "already_active") {
          setError("Account already set up. Use the login page.");
        } else if (check.reason === "disabled") {
          setError("This account is disabled. Contact your admin.");
        } else {
          setError("Unable to verify this email.");
        }
        setLoading(false);
        return;
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (otpError) throw otpError;

      setStep("otp-code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }

    setLoading(false);
  }

  async function verifyOtp() {
    setLoading(true);
    setError("");

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

    if (verifyError) {
      setError(verifyError.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      setUserId(data.session.user.id);
      setEmail(data.session.user.email ?? email);
      setStep("setup");
    }

    setLoading(false);
  }

  async function handleSubmit() {
    setError("");

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) throw pwError;

      // Account is only activated after password is saved — required for dMRV.
      await completeSignup({ userId: userId! });
      setStep("done");
      setTimeout(() => router.replace("/"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }

    setLoading(false);
  }

  return (
    <div className="w-[400px] max-w-full bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-6 pt-8 pb-6 text-center border-b">
        <div className="flex justify-center mb-3">
          <img
            src="/icons/logo-vertical.png"
            alt="KriSHE Carbon"
            className="h-16 w-auto"
          />
        </div>
        <h1 className="text-lg font-semibold text-gray-900">
          Set up your account
        </h1>
      </div>

      <div className="px-6 py-6 space-y-4">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {step === "loading" && (
          <p className="text-sm text-gray-500 text-center py-4">
            Verifying your invite…
          </p>
        )}

        {step === "otp-email" && (
          <>
            {linkExpired && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                Your invite link expired or was already used (Gmail warnings
                can cause this). Verify your email below instead.
              </p>
            )}

            <p className="text-sm text-gray-600 text-center">
              Enter the email your admin registered. We&apos;ll send a one-time
              code to verify it&apos;s you — then you&apos;ll{" "}
              <strong>create your password</strong> (used for admin portal and
              dMRV app login).
            </p>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Work email
              </label>
              <input
                type="email"
                placeholder="you@krishecarbon.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <button
              onClick={sendOtp}
              disabled={loading || !email}
              className="w-full bg-gray-900 text-white py-2.5 rounded-md text-sm font-medium hover:bg-black transition disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send verification code"}
            </button>
          </>
        )}

        {step === "otp-code" && (
          <>
            <p className="text-sm text-gray-500 text-center">
              Code sent to{" "}
              <span className="font-medium text-gray-700">{email}</span>. After
              verifying, you&apos;ll set your password.
            </p>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Verification code
              </label>
              <input
                type="text"
                placeholder="6-digit code"
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
              {loading ? "Verifying…" : "Verify & continue"}
            </button>

            <button
              onClick={() => {
                setStep("otp-email");
                setOtp("");
                setError("");
              }}
              className="w-full text-sm text-gray-500 hover:text-gray-900"
            >
              Use a different email
            </button>
          </>
        )}

        {step === "setup" && (
          <>
            <p className="text-sm text-gray-600 text-center">
              Create the password you&apos;ll use to sign in (admin portal and
              dMRV app):
            </p>
            <EmailBadge email={email} />

            <div className="space-y-3 pt-2">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Confirm password
                </label>
                <input
                  type="password"
                  placeholder="Repeat password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-gray-900 text-white py-2.5 rounded-md text-sm font-medium hover:bg-black transition disabled:opacity-60"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </>
        )}

        {step === "done" && (
          <p className="text-sm text-green-700 text-center font-medium py-4">
            Account created! Redirecting…
          </p>
        )}

        <p className="text-center text-sm text-gray-500 pt-2">
          Already set up?{" "}
          <Link
            href="/auth"
            className="text-gray-900 font-medium hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function EmailBadge({ email }: { email: string }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
        Your account email
      </p>
      <p className="text-sm font-semibold text-gray-900 break-all">{email}</p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
        <SignupForm />
      </Suspense>
    </div>
  );
}
