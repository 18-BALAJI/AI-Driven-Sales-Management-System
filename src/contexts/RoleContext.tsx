/**
 * Active role — now derived from the authenticated user (see AuthContext)
 * rather than a manual selector. Kept as a thin hook so existing pages can
 * continue to `import { useRole } from "@/contexts/RoleContext"`.
 */
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/lib/navigation";

type RoleContextValue = {
  role: UserRole;
};

export function useRole(): RoleContextValue {
  const { user } = useAuth();
  // Routes that consume the role are only reachable once authenticated, so a
  // user is always present here; default to "owner" defensively.
  return { role: (user?.role ?? "owner") as UserRole };
}
