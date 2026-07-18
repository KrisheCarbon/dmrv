/** Shared Supabase select fragments for kontikki pages. */

export const KONTIKKI_OPERATORS_SELECT = `
  kontikki_operators (
    operator_id,
    users (
      id,
      full_name
    )
  )
`;

export const KONTIKKI_LIST_SELECT = `
  id,
  kontikki_code,
  module_id,
  status,
  capacity,
  top_diameter_cm,
  bottom_diameter_cm,
  depth_cm,
  biochar_producer_id,
  biochar_producer:biochar_producers (
    id,
    name
  ),
  ${KONTIKKI_OPERATORS_SELECT}
`;

export const KONTIKKI_DETAIL_SELECT = `
  id,
  kontikki_code,
  module_id,
  status,
  kp_number,
  biochar_producer_id,
  biochar_producer:biochar_producers (
    id,
    name,
    producer_code
  ),
  ${KONTIKKI_OPERATORS_SELECT},
  top_diameter_cm,
  bottom_diameter_cm,
  depth_cm,
  capacity,
  top_photo_urls,
  bottom_photo_urls,
  top_photo_url,
  side_photo_url,
  plan_pdf_url
`;

export function resolveProducerName(row: {
  biochar_producer?: { name?: string } | { name?: string }[] | null;
}): string {
  const bp = row.biochar_producer;
  const biocharName = Array.isArray(bp) ? bp[0]?.name : bp?.name;
  return biocharName ?? "—";
}

type OperatorAssignment = {
  operator_id?: string;
  users?: { full_name?: string } | { full_name?: string }[] | null;
};

export function resolveOperatorNames(row: {
  kontikki_operators?: OperatorAssignment[] | null;
}): string {
  const assignments = row.kontikki_operators ?? [];
  const names = assignments
    .map((assignment) => {
      const user = Array.isArray(assignment.users)
        ? assignment.users[0]
        : assignment.users;
      return user?.full_name?.trim();
    })
    .filter((name): name is string => Boolean(name));

  return names.length ? names.join(", ") : "—";
}
