"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertRuleDialog } from "@/components/alerts/alert-rule-dialog";
import type { AlertRule } from "@/lib/glitchtip/types";
import { Bell, Mail, MessageCircle, MoreHorizontal, Pencil, Trash2, Webhook } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

const RECIPIENT_ICON = {
  email: Mail,
  slack: MessageCircle,
  googlechat: MessageCircle,
  discord: MessageCircle,
  webhook: Webhook,
} as const;

export function AlertRuleRow({
  orgSlug,
  projectSlug,
  rule,
}: {
  orgSlug: string;
  projectSlug: string;
  rule: AlertRule;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);

  function destroy() {
    if (!confirm(`Delete rule "${rule.name || `#${rule.id}`}"?`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/glitchtip/projects/${orgSlug}/${projectSlug}/alerts/${rule.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Could not delete rule.");
        return;
      }
      toast.success("Rule deleted.");
      router.refresh();
    });
  }

  return (
    <>
      <li className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {rule.name || `Rule #${rule.id}`}
          </div>
          <div className="text-xs text-muted-foreground">
            Trigger when ≥ {rule.quantity} event{rule.quantity === 1 ? "" : "s"} in {rule.timespanMinutes} minute{rule.timespanMinutes === 1 ? "" : "s"}
            {rule.uptime && " · uptime"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex flex-wrap gap-1">
            {rule.alertRecipients.map((r) => {
              const Icon = RECIPIENT_ICON[r.recipientType as keyof typeof RECIPIENT_ICON] ?? Bell;
              return (
                <Badge key={r.id} variant="outline" className="gap-1 text-[10px]">
                  <Icon className="h-3 w-3" />
                  {r.recipientType}
                </Badge>
              );
            })}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" disabled={pending} />}
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)} className="gap-2">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={destroy} className="gap-2 text-red-400 focus:text-red-400">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </li>

      <AlertRuleDialog
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        rule={rule}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}
