"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

async function send(url: string, method: string, body: unknown): Promise<string | null> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? "Request failed";
}

export function AccountForms({ name }: { name: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(name);
  const [savingName, setSavingName] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setSavingName(true);
    const err = await send("/api/account", "PATCH", { name: displayName });
    setSavingName(false);
    if (err) return toast.error(err);
    toast.success("Name updated.");
    router.refresh();
  }

  async function savePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const next = String(fd.get("next") ?? "");
    if (next !== String(fd.get("confirm") ?? "")) return toast.error("The new passwords do not match.");
    setSavingPw(true);
    const err = await send("/api/account/password", "POST", { current: fd.get("current"), next });
    setSavingPw(false);
    if (err) return toast.error(err);
    form.reset();
    toast.success("Password changed. Other devices were signed out.");
  }

  return (
    <>
      <form onSubmit={saveName} className="flex items-end gap-2">
        <div className="flex-1 space-y-2">
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            required
            className="bg-background"
          />
        </div>
        <Button type="submit" disabled={savingName || !displayName.trim() || displayName.trim() === name}>
          {savingName && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
        </Button>
      </form>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePassword} className="max-w-sm space-y-3">
            <div className="space-y-2">
              <Label htmlFor="pw-current">Current password</Label>
              <Input id="pw-current" name="current" type="password" autoComplete="current-password" required className="bg-background" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw-next">New password</Label>
              <Input id="pw-next" name="next" type="password" autoComplete="new-password" minLength={10} maxLength={128} required className="bg-background" />
              <p className="text-xs text-muted-foreground">At least 10 characters.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw-confirm">Confirm new password</Label>
              <Input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" required className="bg-background" />
            </div>
            <Button type="submit" disabled={savingPw}>
              {savingPw && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Change password
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
