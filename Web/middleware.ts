import { NextResponse, type NextRequest } from "next/server";
import { canAccessWebPortal } from "@krishecarbon/shared";
import { COGNITO_ID_COOKIE, isCognitoTokenCurrent } from "@/lib/cognitoSession";
import { getBackendUrl } from "@/lib/env";

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

  // These pages must render with no session. Do not call Supabase here:
  // that host is gone, and the request hangs until it times out.
  if (
    isPublicRoute(pathname) ||
    pathname === "/api/auth/cognito" ||
    pathname.startsWith("/api/auth/cognito/")
  ) {
    return res;
  }

  const cognitoToken = req.cookies.get(COGNITO_ID_COOKIE)?.value;
  if (!isCognitoTokenCurrent(cognitoToken)) {
    return NextResponse.redirect(new URL("/auth", req.url));
  }

  return cognitoGate(req, res, pathname, cognitoToken as string);
}

async function cognitoGate(
  req: NextRequest,
  res: NextResponse,
  pathname: string,
  token: string,
): Promise<NextResponse> {
  const profile = await loadAccountWithToken(token);

  if (isPublicRoute(pathname)) {
    if (profile?.status === "pending_auth" && pathname !== "/signup") {
      return NextResponse.redirect(new URL("/signup", req.url));
    }
    if (
      profile?.status === "active" &&
      canAccessWebPortal(profile.role) &&
      (pathname === "/auth" || pathname === "/signup")
    ) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return res;
  }

  if (!profile || profile.status === "disabled" || !canAccessWebPortal(profile.role)) {
    const url = new URL("/auth", req.url);
    if (profile && !canAccessWebPortal(profile.role) && profile.status !== "disabled") {
      url.searchParams.set("error", "unauthorized_role");
      url.searchParams.set("role", profile.role);
    }
    const redirect = NextResponse.redirect(url);
    redirect.cookies.set(COGNITO_ID_COOKIE, "", { path: "/", maxAge: 0 });
    return redirect;
  }

  if (profile.status === "pending_auth") {
    return NextResponse.redirect(new URL("/signup", req.url));
  }

  return res;
}

async function loadAccountWithToken(
  token: string,
): Promise<{ status: string; role: string } | null> {
  const response = await fetch(`${getBackendUrl()}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|icons|images|public).*)"],
};
