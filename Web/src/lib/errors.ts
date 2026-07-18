export function getErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof Error && err.message) return err.message;

  if (typeof err === "object" && err !== null) {
    const record = err as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
    if (typeof record.error_description === "string" && record.error_description) {
      return record.error_description;
    }
    if (typeof record.error === "string" && record.error) return record.error;
  }

  if (typeof err === "string" && err) return err;
  return fallback;
}

export function isMissingColumnError(message: string, column: string): boolean {
  return message.toLowerCase().includes(column.toLowerCase());
}

export function isStorageBucketMissingError(err: unknown): boolean {
  const message = getErrorMessage(err).toLowerCase();
  return (
    message.includes("bucket not found") ||
    message.includes("invalid bucket") ||
    message.includes("does not exist") ||
    message.includes("mime type") ||
    message.includes("not allowed")
  );
}
