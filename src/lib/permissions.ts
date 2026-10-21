import type { TokenMode } from "@/lib/instances";
import type { Role } from "@/lib/users";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

// With a shared instance token, members act as the token owner, so these stay with
// the superadmin to keep GlitchLens from being a backdoor to that account's full
// privileges. With per-user tokens GlitchTip already enforces each person's own
// permissions, so none of this applies there.
const ADMIN_ONLY: Array<{ methods?: string[]; pattern: RegExp }> = [
  { methods: ["POST", "PUT", "PATCH", "DELETE"], pattern: /^organizations\/[^/]+\/members(\/|$)/ },
  { methods: ["POST", "PUT", "PATCH", "DELETE"], pattern: /^organizations\/?$/ },
  { methods: ["PUT", "PATCH", "DELETE"], pattern: /^organizations\/[^/]+$/ },
  { methods: ["DELETE"], pattern: /^projects\/[^/]+\/[^/]+$/ },
  { methods: ["DELETE"], pattern: /^teams\/[^/]+\/[^/]+$/ },
];

// The token owner's own account and credentials: not even readable through a shared token.
const OWNER_ACCOUNT = /^(api-tokens|users)(\/|$)/;

export function canAccess(role: Role, method: string, subpath: string, mode: TokenMode): boolean {
  const m = method.toUpperCase();
  const path = subpath.replace(/^\/+|\/+$/g, "");
  if (role === "superadmin" || mode === "per_user") return role === "viewer" ? SAFE.has(m) : true;
  if (OWNER_ACCOUNT.test(path)) return false;
  if (SAFE.has(m)) return true;
  if (role === "viewer") return false;
  return !ADMIN_ONLY.some((r) => (!r.methods || r.methods.includes(m)) && r.pattern.test(path));
}
