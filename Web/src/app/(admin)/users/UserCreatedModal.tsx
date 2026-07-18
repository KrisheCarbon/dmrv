"use client";

interface UserCreatedModalProps {
  email: string;
  onClose: () => void;
}

export default function UserCreatedModal({ email, onClose }: UserCreatedModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
      <div className="bg-white w-full max-w-lg rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">User created</h2>

        <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
          A setup email was sent to{" "}
          <span className="font-medium">{email}</span>. They click the link in
          the email, then create their password.
        </p>

        <p className="text-sm text-gray-500">
          If the link in the email doesn&apos;t work, check Supabase → URL
          Configuration: Site URL must be{" "}
          <strong>https://admin.krishecarbon.com</strong> (with https://). Then
          click <strong>Resend email</strong> on the Users page.
        </p>

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
