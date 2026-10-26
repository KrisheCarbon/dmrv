import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { canAccessWebPortal } from "@krishecarbon/shared";
import { getBackendUrl, supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { isRecoveryAccessToken } from "@/lib/recoverySession";

const PUBLIC_PREFIXES = [
  "/auth",
  "/onboarding",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const pathname = req.nextUrl.pathname;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A session opened from a reset link can only set the new password. Anything
  // else goes back to the reset form until the password is saved.
  if (user && pathname !== "/reset-password") {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (isRecoveryAccessToken(session?.access_token)) {
      return NextResponse.redirect(new URL("/reset-password", req.url));
    }
  }

  if (isPublicRoute(pathname)) {
    if (user && (pathname === "/auth" || pathname === "/signup")) {
      const profile = await loadAccount(supabase);

      if (profile?.status === "pending_auth") {
        if (pathname !== "/signup") {
          return NextResponse.redirect(new URL("/signup", req.url));
        }
        return res;
      }

      if (profile?.status === "active") {
        const canAccessPortal = canAccessWebPortal(profile.role);
        if (pathname === "/signup") {
          return NextResponse.redirect(
            new URL(canAccessPortal ? "/" : "/auth", req.url)
          );
        }
        if (pathname === "/auth" && canAccessPortal) {
          return NextResponse.redirect(new URL("/", req.url));
        }
      }
    }

    return res;
  }

  if (!user) {
    return NextResponse.redirect(new URL("/auth", req.url));
  }

  const profile = await loadAccount(supabase);

  if (!profile) {
    return NextResponse.redirect(new URL("/auth", req.url));
  }

  if (profile.status === "pending_auth") {
    return NextResponse.redirect(new URL("/signup", req.url));
  }

  if (profile.status === "disabled") {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/auth", req.url));
  }

  if (!canAccessWebPortal(profile.role)) {
    await supabase.auth.signOut();
    const url = new URL("/auth", req.url);
    url.searchParams.set("error", "unauthorized_role");
    url.searchParams.set("role", profile.role);
    return NextResponse.redirect(url);
  }

  return res;
}

async function loadAccount(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
): Promise<{ status: string; role: string } | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  const response = await fetch(`${getBackendUrl()}/auth/me`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|icons|images|public).*)"],
};
