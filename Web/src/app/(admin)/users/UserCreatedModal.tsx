"use client";

import { useState } from "react";

interface UserCreatedModalProps {
  email: string;
  emailSent?: boolean;
  activated?: boolean;
  password?: string;
  onClose: () => void;
}

export default function UserCreatedModal({
  email,
  emailSent = true,
  activated = false,
  password,
  onClose,
}: UserCreatedModalProps) {
  const [copied, setCopied] = useState(false);
  const passwordReady = Boolean(password);

  async function copyLogin() {
    const text = password
      ? `Email: ${email}\nPassword: ${password}`
      : email;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
      <div className="bg-white w-full max-w-lg rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">User created</h2>

        {passwordReady ? (
          <>
            <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
              No setup email was sent. Share these login details so they can
              sign in to the mobile app
              {activated ? " now" : " after you mark them Active"}.
            </p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-1">
              <p className="text-sm">
                <span className="text-gray-500">Email:</span>{" "}
                <span className="font-medium break-all">{email}</span>
              </p>
              <p className="text-sm">
                <span className="text-gray-500">Password:</span>{" "}
                <span className="font-mono font-medium">{password}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={copyLogin}
              className="text-sm font-medium text-brand-dark hover:underline"
            >
              {copied ? "Copied" : "Copy email and password"}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
              A setup email was sent to{" "}
              <span className="font-medium">{email}</span>. They click the link
              in the email, then create their password.
            </p>
            <p className="text-sm text-gray-500">
              This can go to Gmail and other personal inboxes. If it does not
              arrive, edit the user, set a password here, and mark them Active.
            </p>
          </>
        )}

        {emailSent ? (
          <p className="text-xs text-gray-500">
            If the link in the email doesn&apos;t work, check Supabase → URL
            Configuration: Site URL must be{" "}
            <strong>https://admin.krishecarbon.com</strong> (with https://). Then
            click <strong>Resend email</strong> on the Users page.
          </p>
        ) : null}

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="bg-black text-white px-4 py-2 rounded text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
