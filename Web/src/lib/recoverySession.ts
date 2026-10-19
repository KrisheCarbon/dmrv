/**
 * True when the access token was issued by a password reset link. Such a session
 * may only set a new password: it must not open the portal, or the reset step
 * could be skipped.
 */
export function isRecoveryAccessToken(accessToken: string | undefined): boolean {
  if (!accessToken) return false;

  try {
    const payload = accessToken.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const amr = (JSON.parse(json) as { amr?: unknown }).amr;
    if (!Array.isArray(amr)) return false;

    return amr.some(
      (entry) =>
        (typeof entry === "string" ? entry : (entry as { method?: string })?.method) ===
        "recovery",
    );
  } catch {
    return false;
  }
}
