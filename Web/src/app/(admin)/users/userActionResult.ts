import type { UserActionResult } from "./actions";

/** Turns a returned action error back into a thrown one, on the client where its message survives. */
export function unwrapUserAction<T>(result: UserActionResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
