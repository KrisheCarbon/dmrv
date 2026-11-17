type CognitoErrorBody = { __type?: string; message?: string };

export class CognitoRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function config(): { region: string; clientId: string } {
  const region = process.env.COGNITO_REGION?.trim();
  const clientId = process.env.COGNITO_CLIENT_ID?.trim();
  if (!region || !clientId) {
    throw new CognitoRequestError("Sign-in is not configured.", 500);
  }
  return { region, clientId };
}

function mapCognitoMessage(body: CognitoErrorBody | null): { message: string; status: number } {
  const type = body?.__type ?? "";
  const message = body?.message ?? "";
  if (type.includes("CodeMismatch")) {
    return { message: "That code doesn't match. Check the email and try again.", status: 400 };
  }
  if (type.includes("ExpiredCode")) {
    return { message: "That code has expired. Request a new one.", status: 400 };
  }
  if (type.includes("InvalidPassword")) {
    return {
      message: message || "Choose a stronger password (at least 8 characters).",
      status: 400,
    };
  }
  if (type.includes("LimitExceeded") || type.includes("TooManyRequests")) {
    return { message: "Too many attempts. Wait a minute and try again.", status: 429 };
  }
  if (/no inbox|no registered\/verified email/i.test(message)) {
    return {
      message: "This account has no email inbox. Ask your admin to set a password.",
      status: 400,
    };
  }
  if (/USER_AUTH flow not enabled/i.test(message)) {
    return {
      message: "Email codes are not turned on yet. Sign in with your password.",
      status: 400,
    };
  }
  if (type.includes("UserLambdaValidation") && /no inbox/i.test(message)) {
    return {
      message: "This account has no email inbox. Ask your admin to set a password.",
      status: 400,
    };
  }
  if (type.includes("NotAuthorized") || type.includes("UserNotFound")) {
    return { message: "That code doesn't match. Check the email and try again.", status: 400 };
  }
  return { message: "Could not complete that request. Try again in a moment.", status: 400 };
}

export async function cognitoCommand<T>(
  target: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { region } = config();
  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": target,
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as (T & CognitoErrorBody) | null;
  if (!response.ok) {
    const mapped = mapCognitoMessage(result);
    throw new CognitoRequestError(mapped.message, mapped.status);
  }
  return (result ?? {}) as T;
}

export async function sendForgotPasswordCode(email: string): Promise<void> {
  const { clientId } = config();
  await cognitoCommand("AWSCognitoIdentityProviderService.ForgotPassword", {
    ClientId: clientId,
    Username: email,
  });
}

export async function confirmForgotPassword(
  email: string,
  code: string,
  password: string,
): Promise<void> {
  const { clientId } = config();
  await cognitoCommand("AWSCognitoIdentityProviderService.ConfirmForgotPassword", {
    ClientId: clientId,
    Username: email,
    ConfirmationCode: code,
    Password: password,
  });
}

type AuthChallenge = {
  ChallengeName?: string;
  Session?: string;
  AuthenticationResult?: { IdToken?: string; ExpiresIn?: number };
};

export async function sendEmailOtp(email: string): Promise<string> {
  const { clientId } = config();
  let result = await cognitoCommand<AuthChallenge>(
    "AWSCognitoIdentityProviderService.InitiateAuth",
    {
      AuthFlow: "USER_AUTH",
      ClientId: clientId,
      AuthParameters: {
        USERNAME: email,
        PREFERRED_CHALLENGE: "EMAIL_OTP",
      },
    },
  );

  if (result.ChallengeName === "SELECT_CHALLENGE" && result.Session) {
    result = await cognitoCommand<AuthChallenge>(
      "AWSCognitoIdentityProviderService.RespondToAuthChallenge",
      {
        ChallengeName: "SELECT_CHALLENGE",
        ClientId: clientId,
        Session: result.Session,
        ChallengeResponses: {
          USERNAME: email,
          ANSWER: "EMAIL_OTP",
        },
      },
    );
  }

  if (result.ChallengeName === "SELECT_CHALLENGE") {
    throw new CognitoRequestError(
      "Email codes start working after one password sign-in, or after you reset your password.",
      400,
    );
  }
  if (result.ChallengeName !== "EMAIL_OTP" || !result.Session) {
    throw new CognitoRequestError("Could not send the email code. Try again.", 400);
  }
  return result.Session;
}

export async function verifyEmailOtp(
  email: string,
  code: string,
  session: string,
): Promise<{ idToken: string; expiresIn: number }> {
  const { clientId } = config();
  const result = await cognitoCommand<AuthChallenge>(
    "AWSCognitoIdentityProviderService.RespondToAuthChallenge",
    {
      ChallengeName: "EMAIL_OTP",
      ClientId: clientId,
      Session: session,
      ChallengeResponses: {
        USERNAME: email,
        EMAIL_OTP_CODE: code,
      },
    },
  );
  const idToken = result.AuthenticationResult?.IdToken;
  if (!idToken) {
    throw new CognitoRequestError(
      "That code doesn't match. Check the email and try again.",
      400,
    );
  }
  return {
    idToken,
    expiresIn: result.AuthenticationResult?.ExpiresIn ?? 3600,
  };
}
