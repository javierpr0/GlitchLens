import type { TokenMode } from "@/lib/instances";
import type { Role } from "@/lib/users";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

// Operations on the GlitchTip organization itself. With a shared instance token,
// members act as the token owner, so these stay with the superadmin to keep it from
// being a backdoor to that account's full privileges. With per-user tokens GlitchTip
// already enforces each person's own permissions, so these limits do not apply.
const ADMIN_ONLY: Array<{ methods?: string[]; pattern: RegExp }> = [
  { pattern: /^organizations\/[^/]+\/members(\/|$)/ },
  { methods: ["POST", "PUT", "PATCH", "DELETE"], pattern: /^organizations\/?$/ },
  { methods: ["PUT", "PATCH", "DELETE"], pattern: /^organizations\/[^/]+$/ },
  { methods: ["DELETE"], pattern: /^projects\/[^/]+\/[^/]+$/ },
  { methods: ["DELETE"], pattern: /^teams\/[^/]+\/[^/]+$/ },
  { pattern: /^(api-tokens|users)(\/|$)/ },
];

export function canMutate(role: Role, method: string, subpath: string, mode: TokenMode): boolean {
  const m = method.toUpperCase();
  if (SAFE.has(m)) return true;
  if (role === "viewer") return false;
  if (role === "superadmin" || mode === "per_user") return true;
  const path = subpath.replace(/^\/+|\/+$/g, "");
  return !ADMIN_ONLY.some((r) => (!r.methods || r.methods.includes(m)) && r.pattern.test(path));
}
