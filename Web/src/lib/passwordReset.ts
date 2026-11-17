import { CognitoRequestError, sendForgotPasswordCode } from "@/lib/cognitoApi";

export type PasswordResetError = { message: string; status?: number };

/** Emails a Cognito reset code. The person enters it on the reset page. */
export async function sendPasswordResetEmail(
  email: string,
): Promise<PasswordResetError | null> {
  try {
    await sendForgotPasswordCode(email);
    return null;
  } catch (error) {
    if (error instanceof CognitoRequestError) {
      return { message: error.message, status: error.status };
    }
    return { message: "Could not send the reset email." };
  }
}
