import { canAccessCarbon } from "@/lib/roles";
import { getBackendUrl } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("You must be signed in.", { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !canAccessCarbon(profile.role)) {
    return new Response("You do not have access to verification reports.", {
      status: 403,
    });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return new Response("You must be signed in.", { status: 401 });
  }

  let response: Response;
  try {
    response = await fetch(`${getBackendUrl()}/verification-reports/rainbow`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
  } catch {
    return new Response(
      `Cannot reach the backend at ${getBackendUrl()}. Make sure it is running.`,
      { status: 502 },
    );
  }

  if (!response.ok) {
    const text = (await response.text()).trim();
    let message = text;
    try {
      const body = JSON.parse(text) as { message?: string | string[] };
      if (typeof body.message === "string") message = body.message;
      else if (Array.isArray(body.message)) message = body.message.join(", ");
    } catch {
      // Keep the raw response text.
    }
    return new Response(message || "Download failed.", { status: response.status });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/zip");
  headers.set("Cache-Control", "no-store");
  const disposition = response.headers.get("Content-Disposition");
  if (disposition) headers.set("Content-Disposition", disposition);

  return new Response(response.body, { status: 200, headers });
}
