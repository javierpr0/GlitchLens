import Link from "next/link";
import { AlertTriangle, KeyRound, Server } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import type { TokenMode } from "@/lib/instances";

export type ProblemKind = "none" | "token_unreadable" | "needs_token" | "auth" | "unreachable";

const COPY: Record<ProblemKind, { title: string; admin: string; member: string }> = {
  none: {
    title: "No GlitchTip instance connected",
    admin: "Connect your first GlitchTip instance to start seeing issues, projects and alerts.",
    member: "You have not been given access to any instance yet. Ask a superadmin to assign one to you.",
  },
  token_unreadable: {
    title: "The instance token cannot be read",
    admin: "The stored token could not be decrypted, usually because GLITCHLENS_SECRET changed. Enter the token again.",
    member: "This instance needs its token re-entered by a superadmin.",
  },
  needs_token: {
    title: "Add your GlitchTip token",
    admin: "This instance uses one token per person, so your actions are recorded under your own GlitchTip account.",
    member: "This instance uses one token per person, so your actions are recorded under your own GlitchTip account.",
  },
  auth: {
    title: "GlitchTip rejected the instance token",
    admin: "The token for this instance is invalid, expired or revoked. Create a new one in GlitchTip and update it here.",
    member: "This instance's token was rejected. Ask a superadmin to update it.",
  },
  unreachable: {
    title: "Could not reach GlitchTip",
    admin: "The server did not answer. Check that the URL is correct and reachable from where GlitchLens runs.",
    member: "This instance is not responding right now. Try again in a moment or tell a superadmin.",
  },
};

export function InstanceProblem({
  kind,
  isSuperadmin,
  instanceName,
  tokenMode = "shared",
}: {
  kind: ProblemKind;
  isSuperadmin: boolean;
  instanceName?: string;
  tokenMode?: TokenMode;
}) {
  const personal = kind === "needs_token" || (kind === "auth" && tokenMode === "per_user");
  const copy = personal
    ? {
        title: kind === "needs_token" ? COPY.needs_token.title : "GlitchTip rejected your token",
        admin: kind === "needs_token" ? COPY.needs_token.admin : "Your personal token is invalid, expired or revoked. Add a new one in your account.",
        member: kind === "needs_token" ? COPY.needs_token.member : "Your personal token is invalid, expired or revoked. Add a new one in your account.",
      }
    : COPY[kind];
  return (
    <EmptyState
      icon={kind === "none" ? Server : personal ? KeyRound : AlertTriangle}
      title={instanceName && kind !== "none" ? `${copy.title} (${instanceName})` : copy.title}
      description={isSuperadmin ? copy.admin : copy.member}
      action={
        personal ? (
          <Link href="/settings/account" className={buttonVariants({ className: "gap-1.5" })}>
            <KeyRound className="h-3.5 w-3.5" /> Open my account
          </Link>
        ) : isSuperadmin ? (
          <Link href="/settings/instances" className={buttonVariants({ className: "gap-1.5" })}>
            <Server className="h-3.5 w-3.5" /> Manage instances
          </Link>
        ) : undefined
      }
    />
  );
}
