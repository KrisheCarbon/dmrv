export type QueryResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

export function unwrapQuery<T>(result: QueryResult<T>, fallback: string): T {
  if (result.error || result.data == null) {
    throw new Error(result.error || fallback);
  }
  return result.data;
}
