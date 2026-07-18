import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { canAccessWebPortal } from "@krishecarbon/shared";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

const PUBLIC_PREFIXES = ["/auth", "/onboarding", "/signup"];

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

  if (isPublicRoute(pathname)) {
    if (user && (pathname === "/auth" || pathname === "/signup")) {
      const { data: profile } = await supabase
        .from("users")
        .select("status, role")
        .eq("id", user.id)
        .single();

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

  const { data: profile } = await supabase
    .from("users")
    .select("status, role")
    .eq("id", user.id)
    .single();

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
    return NextResponse.redirect(new URL("/auth?error=unauthorized_role", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|icons|images|public).*)"],
};
