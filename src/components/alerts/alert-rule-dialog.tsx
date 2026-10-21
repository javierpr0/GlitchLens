"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AlertRule } from "@/lib/glitchtip/types";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactElement } from "react";
import { toast } from "sonner";

const RECIPIENT_TYPES = [
  { value: "email", label: "Email" },
  { value: "slack", label: "Slack webhook" },
  { value: "discord", label: "Discord webhook" },
  { value: "googlechat", label: "Google Chat webhook" },
  { value: "webhook", label: "Generic webhook" },
];

interface RecipientDraft {
  recipientType: string;
  url: string;
}

interface AlertRuleDialogProps {
  orgSlug: string;
  projectSlug: string;
  rule?: AlertRule;
  /** When provided, the dialog renders its own trigger via Base UI's render prop. */
  trigger?: ReactElement;
  /** Controlled open state (alternative to using `trigger`). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AlertRuleDialog({
  orgSlug,
  projectSlug,
  rule,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: AlertRuleDialogProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [name, setName] = useState(rule?.name ?? "");
  const [quantity, setQuantity] = useState(String(rule?.quantity ?? 1));
  const [timespan, setTimespan] = useState(String(rule?.timespanMinutes ?? 1));
  const [uptime] = useState(rule?.uptime ?? false);
  const [recipients, setRecipients] = useState<RecipientDraft[]>(
    rule?.alertRecipients?.map((r) => ({ recipientType: r.recipientType, url: r.url })) ?? [
      { recipientType: "email", url: "" },
    ],
  );
  const [submitting, setSubmitting] = useState(false);

  function addRecipient() {
    setRecipients((r) => [...r, { recipientType: "email", url: "" }]);
  }
  function removeRecipient(i: number) {
    setRecipients((r) => r.filter((_, idx) => idx !== i));
  }
  function patchRecipient(i: number, patch: Partial<RecipientDraft>) {
    setRecipients((r) => r.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function submit() {
    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        quantity: Number(quantity) || 1,
        timespanMinutes: Number(timespan) || 1,
        uptime,
        alertRecipients: recipients
          .filter((r) => r.recipientType === "email" || r.url.trim())
          .map((r) => ({ recipientType: r.recipientType, url: r.url.trim() })),
      };
      const res = await fetch(
        rule
          ? `/api/glitchtip/projects/${orgSlug}/${projectSlug}/alerts/${rule.id}`
          : `/api/glitchtip/projects/${orgSlug}/${projectSlug}/alerts`,
        {
          method: rule ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error();
      toast.success(rule ? "Alert rule updated." : "Alert rule created.");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error(rule ? "Could not update rule." : "Could not create rule.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit alert rule" : "New alert rule"}</DialogTitle>
          <DialogDescription>
            Trigger notifications when an event volume threshold is crossed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="rule-name">Name</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="High error rate on production"
              className="bg-background"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rule-qty">Min events</Label>
              <Input
                id="rule-qty"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-span">In minutes</Label>
              <Input
                id="rule-span"
                type="number"
                min="1"
                value={timespan}
                onChange={(e) => setTimespan(e.target.value)}
                className="bg-background"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Recipients</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addRecipient} className="gap-1.5">
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            {recipients.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button type="button" variant="outline" size="sm" className="w-32 justify-between" />}
                  >
                    <span className="capitalize">
                      {RECIPIENT_TYPES.find((t) => t.value === r.recipientType)?.label.split(" ")[0]}
                    </span>
                    <ChevronDown className="h-3 w-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {RECIPIENT_TYPES.map((t) => (
                      <DropdownMenuItem
                        key={t.value}
                        onClick={() => patchRecipient(i, { recipientType: t.value })}
                      >
                        {t.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {r.recipientType !== "email" ? (
                  <Input
                    value={r.url}
                    onChange={(e) => patchRecipient(i, { url: e.target.value })}
                    placeholder="https://hooks.slack.com/services/..."
                    className="flex-1 bg-background font-mono text-xs"
                  />
                ) : (
                  <span className="flex-1 text-xs text-muted-foreground">
                    Sends to subscribed members
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeRecipient(i)}
                  className="text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="gap-1.5">
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {rule ? "Save changes" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
