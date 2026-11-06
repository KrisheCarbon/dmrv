export const COGNITO_ID_COOKIE = "kc_id_token";

type JwtBody = { exp?: number };

function jwtBody(token: string): JwtBody | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    const payload = JSON.parse(json) as unknown;
    if (!payload || typeof payload !== "object") return null;
    return payload as JwtBody;
  } catch {
    return null;
  }
}

/** True when the Cognito ID token has more than 30 seconds left. */
export function isCognitoTokenCurrent(token: string | undefined | null): boolean {
  if (!token) return false;
  const exp = jwtBody(token)?.exp;
  if (!exp) return false;
  return exp * 1000 > Date.now() + 30_000;
}

export function readCognitoIdToken(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${COGNITO_ID_COOKIE}=`;
  const raw = document.cookie
    .split("; ")
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  if (!raw) return null;
  const token = decodeURIComponent(raw);
  return isCognitoTokenCurrent(token) ? token : null;
}

export function clearCognitoIdToken(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COGNITO_ID_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
