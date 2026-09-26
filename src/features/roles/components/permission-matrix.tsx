"use client";

import { useActionFormState } from "@/components/form/action-form";

interface PermissionMatrixProps {
  groups: readonly {
    id: string;
    label: string;
    permissions: readonly { value: string; label: string }[];
  }[];
  defaultSelected: readonly string[];
  disabled?: boolean;
}

/**
 * Role permission checklist grouped by area (FR-RBAC-01). Plain checkboxes
 * named `permissions`, so it submits without JavaScript; after a failed save
 * the user's selection is restored from the echoed form values.
 */
export function PermissionMatrix({
  groups,
  defaultSelected,
  disabled = false,
}: PermissionMatrixProps) {
  const echoed = useActionFormState().values?.permissions;
  const selected = new Set(
    echoed === undefined ? defaultSelected : Array.isArray(echoed) ? echoed : [echoed],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map((group) => (
        <fieldset
          key={group.id}
          disabled={disabled}
          className="rounded-control border border-border p-4 disabled:opacity-70"
        >
          <legend className="px-1 text-sm font-semibold text-ink">{group.label}</legend>
          <ul className="mt-2 flex flex-col gap-1">
            {group.permissions.map((permission) => (
              <li key={permission.value}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2 text-sm text-ink hover:bg-surface-muted">
                  <input
                    type="checkbox"
                    name="permissions"
                    value={permission.value}
                    defaultChecked={selected.has(permission.value)}
                    className="size-5 shrink-0 accent-primary"
                  />
                  <span>{permission.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}
