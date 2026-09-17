export const KRISHECARBON_OTP_DOMAIN = "krishecarbon.com";

export const OTP_EMAIL_REQUIRED_ERROR =
  "OTP login is only available for @krishecarbon.com accounts. Sign in with your password instead.";

export const INVALID_LOGIN_IDENTIFIER_ERROR =
  "Enter a valid email address or 10-digit mobile number.";

export const PHONE_LOGIN_NOT_FOUND_ERROR =
  "No account found for that mobile number.";

export type LoginIdentifier =
  | { kind: "email"; email: string }
  | { kind: "phone"; phone: string }
  | { kind: "invalid" };

/** Last 10 digits of an Indian mobile, stripping +91 / 91 / leading 0. */
export function toLocalIndianMobile(
  mobile: string | undefined | null,
): string {
  const digits = String(mobile || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function isIndianMobileLogin(mobile: string | undefined | null): boolean {
  return /^[6-9]\d{9}$/.test(toLocalIndianMobile(mobile));
}

export function isKrishecarbonEmail(email: string | undefined | null): boolean {
  const normalized = String(email || "").trim().toLowerCase();
  return normalized.endsWith(`@${KRISHECARBON_OTP_DOMAIN}`);
}

export function parseLoginIdentifier(raw: string | undefined | null): LoginIdentifier {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return { kind: "invalid" };

  if (trimmed.includes("@")) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { kind: "email", email: trimmed.toLowerCase() };
    }
    return { kind: "invalid" };
  }

  const phone = toLocalIndianMobile(trimmed);
  if (/^[6-9]\d{9}$/.test(phone)) {
    return { kind: "phone", phone };
  }

  return { kind: "invalid" };
}

export function findLoginEmailForPhone(
  users: Array<{
    email?: string | null;
    phone?: string | null;
    status?: string | null;
  }>,
  phone: string,
): string | null {
  const local = toLocalIndianMobile(phone);
  if (!/^[6-9]\d{9}$/.test(local)) return null;

  const matches = users.filter(
    (user) =>
      user.status !== "disabled" &&
      user.phone &&
      user.email &&
      toLocalIndianMobile(user.phone) === local,
  );

  if (matches.length !== 1) return null;
  return matches[0].email ?? null;
}
