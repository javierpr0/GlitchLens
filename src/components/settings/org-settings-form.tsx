"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Organization } from "@/lib/glitchtip/types";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

export function OrgSettingsForm({ initial }: { initial: Organization }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [require2fa, setRequire2fa] = useState(initial.require2fa);
  const [openMembership, setOpenMembership] = useState(
    (initial as unknown as { openMembership?: boolean }).openMembership ?? false,
  );
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/glitchtip/organizations/${initial.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, require2fa, openMembership }),
      });
      if (!res.ok) throw new Error();
      toast.success("Organization updated.");
      router.refresh();
    } catch {
      toast.error("Could not update organization.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="org-name">Name</Label>
        <Input
          id="org-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-background"
        />
      </div>
      <div className="flex items-start gap-3">
        <Checkbox
          id="require-2fa"
          checked={require2fa}
          onCheckedChange={(v) => setRequire2fa(v === true)}
        />
        <div>
          <Label htmlFor="require-2fa" className="cursor-pointer">Require 2FA for all members</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Members without 2FA enabled will lose access until they configure it.
          </p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <Checkbox
          id="open-membership"
          checked={openMembership}
          onCheckedChange={(v) => setOpenMembership(v === true)}
        />
        <div>
          <Label htmlFor="open-membership" className="cursor-pointer">Open team membership</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Allow members to join and leave teams without admin approval.
          </p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={saving} className="gap-1.5">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save organization
        </Button>
      </div>
    </form>
  );
}
