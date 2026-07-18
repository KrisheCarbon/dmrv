import { USER_ROLES, ROLE_LABELS, type UserRole } from "@/lib/roles";

interface RoleSelectProps {
  value: string;
  onChange: (role: string) => void;
  className?: string;
  includeAllOption?: boolean;
  allOptionLabel?: string;
  /** Limit which roles appear. Defaults to all roles. */
  roles?: readonly UserRole[];
}

export default function RoleSelect({
  value,
  onChange,
  className = "w-full border px-3 py-2 rounded",
  includeAllOption = false,
  allOptionLabel = "All roles",
  roles,
}: RoleSelectProps) {
  const options = roles ?? USER_ROLES;

  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {includeAllOption ? <option value="">{allOptionLabel}</option> : null}
      {options.map((role) => (
        <option key={role} value={role}>
          {ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  );
}
