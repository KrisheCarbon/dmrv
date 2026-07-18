"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { establishSessionFromUrl } from "@/lib/parseAuthHash";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      const next = searchParams.get("next") || "/signup";

      try {
        const hashSession = await establishSessionFromUrl(supabase);
        if (hashSession) {
          router.replace(next);
          return;
        }

        const code = searchParams.get("code");
        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          router.replace(next);
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          router.replace(next);
          return;
        }

        throw new Error("Could not sign you in. Ask your admin for a new invite link.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    }

    handleCallback();
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="text-center space-y-3">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={() => router.replace("/signup")}
          className="text-sm text-gray-600 underline"
        >
          Go to signup
        </button>
      </div>
    );
  }

  return <p className="text-sm text-gray-500 text-center">Signing you in…</p>;
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Suspense fallback={<p className="text-sm text-gray-500">Signing you in…</p>}>
        <CallbackHandler />
      </Suspense>
    </div>
  );
}
