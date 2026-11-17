import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const STORAGE_KEY = "kc_cognito_session";

/** Same public app client the admin site uses. Not a secret. */
const PRODUCTION_COGNITO_REGION = "ap-south-1";
const PRODUCTION_COGNITO_CLIENT_ID = "2l94cete5s4e93fqbcvrjdvfui";

export type StoredAuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: {
    full_name?: string;
    name?: string;
    role?: string;
  };
  app_metadata?: {
    role?: string;
  };
};

type StoredSession = {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  /** True only after the id is public.users.id, never a raw Cognito sub. */
  confirmed: boolean;
  user: StoredAuthUser;
};

type AuthResult = {
  IdToken?: string;
  RefreshToken?: string;
  ExpiresIn?: number;
};

type Listener = (user: StoredAuthUser | null) => void;

const listeners = new Set<Listener>();
let refreshFlight: Promise<StoredSession | null> | null = null;

function cognitoConfig(): { region: string; clientId: string } {
  const extra = Constants.expoConfig?.extra as
    | { cognitoRegion?: string; cognitoClientId?: string }
    | undefined;
  const region =
    extra?.cognitoRegion ||
    process.env.EXPO_PUBLIC_COGNITO_REGION ||
    PRODUCTION_COGNITO_REGION;
  const clientId =
    extra?.cognitoClientId ||
    process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID ||
    PRODUCTION_COGNITO_CLIENT_ID;
  if (!region || !clientId) {
    throw new Error("Sign-in is not configured.");
  }
  return { region, clientId };
}

function emit(user: StoredAuthUser | null) {
  for (const listener of listeners) listener(user);
}

export function subscribeAuth(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) return {};
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = globalThis.atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const payload = JSON.parse(json) as unknown;
    if (!payload || typeof payload !== "object") return {};
    return payload as Record<string, unknown>;
  } catch {
    return {};
  }
}

function stringClaim(claims: Record<string, unknown>, key: string): string {
  const value = claims[key];
  return typeof value === "string" ? value : "";
}

function cognitoErrorMessage(body: Record<string, unknown> | null): string {
  const type = String(body?.__type ?? "");
  const message = typeof body?.message === "string" ? body.message : "";
  if (/USER_AUTH flow not enabled/i.test(message)) {
    return "Email codes are not turned on yet. Sign in with your password.";
  }
  if (type.includes("CodeMismatch")) {
    return "That code doesn't match. Check the email and try again.";
  }
  if (type.includes("ExpiredCode")) {
    return "That code has expired. Request a new one.";
  }
  if (
    type.includes("NotAuthorized") ||
    type.includes("UserNotFound") ||
    /incorrect username or password/i.test(message)
  ) {
    return "Incorrect email or password.";
  }
  if (type.includes("UserLambdaValidation")) {
    return "Sign-in could not check this password. Try again in a moment.";
  }
  if (type.includes("PasswordResetRequired")) {
    return "This account needs a password reset. Ask your admin.";
  }
  if (type.includes("TooManyRequests") || type.includes("LimitExceeded")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (type.includes("UserNotConfirmed")) {
    return "This account is not active yet. Ask your admin.";
  }
  return message || "Unable to sign in.";
}

async function cognitoPost(
  target: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { region } = cognitoConfig();
  let response: Response;
  try {
    response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": target,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Network request failed (${message})`);
  }

  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!response.ok || !payload) {
    throw new Error(cognitoErrorMessage(payload));
  }
  if (payload.__type) {
    throw new Error(cognitoErrorMessage(payload));
  }
  return payload;
}

async function read(): Promise<StoredSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.idToken || !parsed.refreshToken || !parsed.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function write(session: StoredSession): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

async function clear(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

function authResult(payload: Record<string, unknown>): AuthResult | null {
  const result = payload.AuthenticationResult;
  if (!result || typeof result !== "object") return null;
  return result as AuthResult;
}

async function refreshStored(stored: StoredSession): Promise<StoredSession | null> {
  const { clientId } = cognitoConfig();
  try {
    const payload = await cognitoPost(
      "AWSCognitoIdentityProviderService.InitiateAuth",
      {
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: clientId,
        AuthParameters: { REFRESH_TOKEN: stored.refreshToken },
      },
    );
    const auth = authResult(payload);
    if (!auth?.IdToken) return stored;
    const next: StoredSession = {
      ...stored,
      idToken: auth.IdToken,
      refreshToken: auth.RefreshToken || stored.refreshToken,
      expiresAt: Date.now() + (auth.ExpiresIn ?? 3600) * 1000,
    };
    await write(next);
    return next;
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (
      message === "Incorrect email or password." ||
      message.includes("not active") ||
      message.includes("password reset")
    ) {
      await clear();
      emit(null);
      return null;
    }
    return stored;
  }
}

async function fetchProfile(backendUrl: string, idToken: string) {
  const response = await fetch(`${backendUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as {
    id?: string;
    email?: string | null;
    full_name?: string | null;
    role?: string | null;
  } | null;
  if (!body?.id) return null;
  return body;
}

async function loadProfile(idToken: string): Promise<{
  id: string;
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
} | null> {
  const { getBackendUrl, resolveBackendUrl } = await import("./backendApi");
  const first = getBackendUrl();
  const direct = await fetchProfile(first, idToken).catch(() => null);
  if (direct) return direct;
  const resolved = await resolveBackendUrl().catch(() => "");
  if (!resolved || resolved === first) return null;
  return fetchProfile(resolved, idToken).catch(() => null);
}

function userFromProfile(
  profile: { id: string; email?: string | null; full_name?: string | null; role?: string | null },
  email: string,
  name: string,
): StoredAuthUser {
  return {
    id: profile.id,
    email: profile.email ?? email,
    user_metadata: {
      full_name: profile.full_name?.trim() || undefined,
      name: name || undefined,
      role: profile.role ?? undefined,
    },
    app_metadata: { role: profile.role ?? undefined },
  };
}

async function persistAuthentication(
  auth: AuthResult,
  fallbackEmail: string,
): Promise<StoredAuthUser> {
  if (!auth.IdToken || !auth.RefreshToken) {
    throw new Error("Unable to sign in.");
  }
  const idToken = auth.IdToken;
  const refreshToken = auth.RefreshToken;
  const claims = decodeJwtPayload(idToken);
  const legacyId = stringClaim(claims, "custom:legacy_id");
  const emailClaim = stringClaim(claims, "email") || fallbackEmail;
  const name = stringClaim(claims, "name");
  const provisionalId = legacyId || stringClaim(claims, "sub");
  if (!provisionalId) throw new Error("Unable to sign in.");

  const session: StoredSession = {
    idToken,
    refreshToken,
    expiresAt: Date.now() + (auth.ExpiresIn ?? 3600) * 1000,
    confirmed: false,
    user: { id: provisionalId, email: emailClaim },
  };
  await write(session);

  let profile: Awaited<ReturnType<typeof loadProfile>> = null;
  try {
    profile = await loadProfile(idToken);
  } catch {
    profile = null;
  }

  const user = profile
    ? userFromProfile(profile, emailClaim, name)
    : legacyId
      ? {
          id: legacyId,
          email: emailClaim,
          user_metadata: { name: name || undefined },
        }
      : null;

  if (!user) {
    await clear();
    throw new Error("Could not load your account. Try again.");
  }

  await write({ ...session, confirmed: true, user });
  emit(user);
  return user;
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<StoredAuthUser> {
  const { clientId } = cognitoConfig();
  const payload = await cognitoPost(
    "AWSCognitoIdentityProviderService.InitiateAuth",
    {
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: clientId,
      AuthParameters: {
        USERNAME: email.trim().toLowerCase(),
        PASSWORD: password,
      },
    },
  );

  const auth = authResult(payload);
  if (!auth?.IdToken || !auth.RefreshToken) {
    if (payload.ChallengeName) {
      throw new Error("This account must finish setup on the web dashboard.");
    }
    throw new Error("Unable to sign in.");
  }

  return persistAuthentication(auth, email.trim().toLowerCase());
}

/** Emails a sign-in code and returns the Cognito challenge session. */
export async function sendEmailOtp(email: string): Promise<string> {
  const { clientId } = cognitoConfig();
  const username = email.trim().toLowerCase();
  let payload = await cognitoPost(
    "AWSCognitoIdentityProviderService.InitiateAuth",
    {
      AuthFlow: "USER_AUTH",
      ClientId: clientId,
      AuthParameters: {
        USERNAME: username,
        PREFERRED_CHALLENGE: "EMAIL_OTP",
      },
    },
  );

  if (payload.ChallengeName === "SELECT_CHALLENGE" && typeof payload.Session === "string") {
    payload = await cognitoPost(
      "AWSCognitoIdentityProviderService.RespondToAuthChallenge",
      {
        ChallengeName: "SELECT_CHALLENGE",
        ClientId: clientId,
        Session: payload.Session,
        ChallengeResponses: {
          USERNAME: username,
          ANSWER: "EMAIL_OTP",
        },
      },
    );
  }

  if (payload.ChallengeName === "SELECT_CHALLENGE") {
    throw new Error(
      "Email codes start working after one password sign-in, or after you reset your password.",
    );
  }
  if (payload.ChallengeName !== "EMAIL_OTP" || typeof payload.Session !== "string") {
    throw new Error("Could not send the email code. Try again.");
  }
  return payload.Session;
}

export async function verifyEmailOtp(
  email: string,
  code: string,
  session: string,
): Promise<StoredAuthUser> {
  const { clientId } = cognitoConfig();
  const payload = await cognitoPost(
    "AWSCognitoIdentityProviderService.RespondToAuthChallenge",
    {
      ChallengeName: "EMAIL_OTP",
      ClientId: clientId,
      Session: session,
      ChallengeResponses: {
        USERNAME: email.trim().toLowerCase(),
        EMAIL_OTP_CODE: code.trim(),
      },
    },
  );

  const auth = authResult(payload);
  if (!auth?.IdToken || !auth.RefreshToken) {
    throw new Error("That code doesn't match. Check the email and try again.");
  }
  return persistAuthentication(auth, email.trim().toLowerCase());
}

export async function signOut(): Promise<void> {
  await clear();
  emit(null);
}

export async function readStoredUser(): Promise<StoredAuthUser | null> {
  const stored = await read();
  if (!stored?.confirmed) return null;
  return stored.user;
}

export async function restoreSession(): Promise<StoredAuthUser | null> {
  const stored = await read();
  if (!stored?.confirmed) {
    if (stored) await clear();
    return null;
  }
  if (stored.expiresAt <= Date.now() + 60_000) {
    const next = await refreshStored(stored);
    return next?.confirmed ? next.user : null;
  }
  return stored.user;
}

export async function refreshSessionIfNeeded(): Promise<void> {
  const stored = await read();
  if (!stored?.confirmed) return;
  if (stored.expiresAt > Date.now() + 5 * 60_000) return;
  refreshFlight ??= refreshStored(stored).finally(() => {
    refreshFlight = null;
  });
  await refreshFlight;
}

/** Cognito ID token. The API rejects the access token. */
export async function getIdToken(): Promise<string> {
  const stored = await read();
  if (!stored?.idToken) throw new Error("You must be signed in.");
  if (stored.expiresAt > Date.now() + 60_000) return stored.idToken;

  refreshFlight ??= refreshStored(stored).finally(() => {
    refreshFlight = null;
  });
  const next = await refreshFlight;
  if (!next?.idToken) throw new Error("You must be signed in.");
  return next.idToken;
}
