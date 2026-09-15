import * as Crypto from "expo-crypto";

/** Replaces WatermelonDB's internal id generator. */
export function generateId(): string {
  return Crypto.randomUUID();
}

export function toSqliteBool(value: boolean | null | undefined): number {
  return value ? 1 : 0;
}

export function fromSqliteBool(value: number | null | undefined): boolean {
  return value === 1;
}

/**
 * Builds a parameterized INSERT from a plain object: columns and values are
 * always derived from the same object in the same iteration order, so there
 * is no positional column/value misalignment risk like hand-written
 * `INSERT INTO t (a, b) VALUES (?, ?)` strings have.
 */
export function buildInsert(
  table: string,
  data: Record<string, unknown>,
): { sql: string; args: any[] } {
  const columns = Object.keys(data);
  const args = columns.map((column) => data[column]);
  const placeholders = columns.map(() => "?").join(", ");
  return {
    sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
    args,
  };
}

/**
 * Builds a parameterized UPDATE from a plain object, same safety property as
 * buildInsert. `whereSql` should use `?` placeholders, with matching values
 * passed in `whereArgs`.
 */
export function buildUpdate(
  table: string,
  data: Record<string, unknown>,
  whereSql: string,
  whereArgs: unknown[] = [],
): { sql: string; args: any[] } {
  const columns = Object.keys(data);
  const setClause = columns.map((column) => `${column} = ?`).join(", ");
  const args = columns.map((column) => data[column]);
  return {
    sql: `UPDATE ${table} SET ${setClause} WHERE ${whereSql}`,
    args: [...args, ...whereArgs],
  };
}
