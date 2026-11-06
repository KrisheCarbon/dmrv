import { NextResponse } from "next/server";
import { COGNITO_ID_COOKIE } from "@/lib/cognitoSession";

type CognitoError = { __type?: string; message?: string };
type CognitoSuccess = {
  AuthenticationResult?: { IdToken?: string; ExpiresIn?: number };
};

function cognitoConfig(): { region: string; clientId: string } | null {
  const region = process.env.COGNITO_REGION?.trim();
  const clientId = process.env.COGNITO_CLIENT_ID?.trim();
  if (!region || !clientId) return null;
  return { region, clientId };
}

function failureMessage(body: CognitoError): string {
  const message = body.message ?? "";
  if (
    body.__type?.includes("NotAuthorized") ||
    body.__type?.includes("UserNotFound") ||
    /bad credentials|incorrect username or password/i.test(message)
  ) {
    return "Incorrect email or password.";
  }
  if (body.__type?.includes("UserLambdaValidation")) {
    return "Sign-in could not check the existing password. Try again in a moment.";
  }
  return "Unable to sign in.";
}

export async function POST(request: Request) {
  const config = cognitoConfig();
  if (!config) {
    return NextResponse.json({ message: "Sign-in is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ message: "Enter your email and password." }, { status: 400 });
  }

  const upstream = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
    },
    body: JSON.stringify({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: config.clientId,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }),
  });

  const result = (await upstream.json().catch(() => null)) as
    | CognitoError
    | CognitoSuccess
    | null;
  const idToken =
    result && "AuthenticationResult" in result
      ? result.AuthenticationResult?.IdToken
      : undefined;
  if (!upstream.ok || !idToken) {
    return NextResponse.json(
      { message: failureMessage((result as CognitoError) ?? {}) },
      { status: 401 },
    );
  }

  const expiresIn =
    result && "AuthenticationResult" in result
      ? result.AuthenticationResult?.ExpiresIn ?? 3600
      : 3600;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COGNITO_ID_COOKIE, idToken, {
    path: "/",
    maxAge: expiresIn,
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
