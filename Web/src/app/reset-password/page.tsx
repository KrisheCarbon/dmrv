"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Old reset links opened this page. Codes are entered on the forgot-password page. */
export default function ResetPasswordPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/forgot-password");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <p className="text-sm text-gray-500">Opening the password reset page…</p>
    </div>
  );
}
