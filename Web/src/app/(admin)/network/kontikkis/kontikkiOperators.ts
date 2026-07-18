import { supabase } from "@/lib/supabase";

/** Replace all operator (climapreneur) assignments for a kontikki. */
export async function syncKontikkiOperators(
  kontikkiId: string,
  operatorIds: string[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("kontikki_operators")
    .delete()
    .eq("kontikki_id", kontikkiId);

  if (deleteError) throw deleteError;

  if (operatorIds.length === 0) return;

  const { error: insertError } = await supabase.from("kontikki_operators").insert(
    operatorIds.map((operator_id) => ({
      kontikki_id: kontikkiId,
      operator_id,
    })),
  );

  if (insertError) throw insertError;
}

export function extractOperatorIds(
  assignments:
    | Array<{ operator_id?: string; users?: { id?: string } | { id?: string }[] | null }>
    | null
    | undefined,
): string[] {
  if (!assignments?.length) return [];

  return assignments
    .map((row) => {
      if (row.operator_id) return row.operator_id;
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      return user?.id;
    })
    .filter((id): id is string => Boolean(id));
}
