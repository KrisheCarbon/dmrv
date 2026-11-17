import { NextResponse } from "next/server";
import {
  OTP_EMAIL_REQUIRED_ERROR,
  isPhoneLoginEmail,
  parseLoginIdentifier,
} from "@krishecarbon/shared";
import { COGNITO_ID_COOKIE } from "@/lib/cognitoSession";
import { CognitoRequestError, sendEmailOtp, verifyEmailOtp } from "@/lib/cognitoApi";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    code?: string;
    session?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const parsed = parseLoginIdentifier(email);
  if (parsed.kind !== "email" || isPhoneLoginEmail(parsed.email)) {
    return NextResponse.json(
      {
        message: isPhoneLoginEmail(email)
          ? OTP_EMAIL_REQUIRED_ERROR
          : "Enter the email address that should receive the code.",
      },
      { status: 400 },
    );
  }

  try {
    if (!body?.code) {
      const session = await sendEmailOtp(email);
      return NextResponse.json({ session });
    }

    const challenge = body.session?.trim() ?? "";
    if (!challenge) {
      return NextResponse.json(
        { message: "Request a new code and try again." },
        { status: 400 },
      );
    }

    const { idToken, expiresIn } = await verifyEmailOtp(email, body.code.trim(), challenge);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(COGNITO_ID_COOKIE, idToken, {
      path: "/",
      maxAge: expiresIn,
      sameSite: "lax",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    const message =
      error instanceof CognitoRequestError
        ? error.message
        : "Could not complete that request. Try again in a moment.";
    const status = error instanceof CognitoRequestError ? error.status : 400;
    return NextResponse.json({ message }, { status });
  }
}
