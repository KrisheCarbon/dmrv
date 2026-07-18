const PRODUCTION_URL = "https://admin.krishecarbon.com";

export function getSiteUrl() {
  const url =
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    (process.env.NODE_ENV === "production" ? PRODUCTION_URL : null);

  if (!url) {
    throw new Error(
      "SITE_URL is not configured. Set SITE_URL=https://admin.krishecarbon.com in Vercel (or http://localhost:3000 locally)."
    );
  }

  let normalized = url.trim().replace(/\/$/, "");

  // Fix common mistake: "admin.krishecarbon.com" without protocol.
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = `https://${normalized}`;
  }

  return normalized;
}

export function getSignupRedirect() {
  const redirect = `${getSiteUrl()}/signup`;

  if (!redirect.startsWith("https://") && process.env.NODE_ENV === "production") {
    throw new Error(
      `Invite redirect must use https in production. Got: ${redirect}`
    );
  }

  return redirect;
}
