"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "./actions";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function sendResetEmail() {
    setLoading(true);
    setError("");

    const result = await requestPasswordReset(identifier);

    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSent(true);
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
            Reset your password
          </h1>
        </div>

        <div className="px-6 py-6 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {sent ? (
            <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
              If an account exists for {identifier.trim()}, we&apos;ve emailed a
              link to reset the password. The link works for 24 hours. Check
              your spam folder if you don&apos;t see it.
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600 text-center">
                Enter the email or mobile number you sign in with. We&apos;ll
                email you a link to set a new password.
              </p>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Email or mobile number
                </label>
                <input
                  type="text"
                  placeholder="you@email.com or 10-digit mobile"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <button
                onClick={sendResetEmail}
                disabled={loading || !identifier.trim()}
                className="w-full bg-gray-900 text-white py-2.5 rounded-md text-sm font-medium hover:bg-black transition disabled:opacity-60"
              >
                {loading ? "Sending…" : "Email me a reset link"}
              </button>
            </>
          )}

          <p className="text-center text-sm text-gray-500 pt-2">
            Remembered it?{" "}
            <Link href="/auth" className="text-gray-900 font-medium hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
