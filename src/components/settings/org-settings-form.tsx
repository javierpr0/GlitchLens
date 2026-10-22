"use client";

import { Button } from "@/components/ui/button";
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
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/glitchtip/organizations/${initial.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
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
      <p className="text-xs text-muted-foreground">
        GlitchTip only lets the name be changed through its API. Other organization settings are managed in GlitchTip.
      </p>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={saving} className="gap-1.5">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save organization
        </Button>
      </div>
    </form>
  );
}
