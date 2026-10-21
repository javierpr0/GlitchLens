"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TwoFactorPolicy } from "@/lib/policy";
import { Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

const OPTIONS: Array<{ value: TwoFactorPolicy; label: string; help: string }> = [
  { value: "off", label: "Optional", help: "Each person decides whether to use it." },
  { value: "superadmins", label: "Required for superadmins", help: "Superadmins must set it up before they can do anything else." },
  { value: "all", label: "Required for everyone", help: "Every user must set it up before they can do anything else." },
];

export function TwoFactorPolicyCard({ current }: { current: TwoFactorPolicy }) {
  const router = useRouter();
  const [value, setValue] = useState<TwoFactorPolicy>(current);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requireTwoFactor: value }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return toast.error(data.error ?? "Could not save the policy.");
    }
    toast.success("Two-factor policy updated.");
    router.refresh();
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-emerald-400" /> Two-factor policy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                value === o.value ? "border-violet-500/60 bg-violet-500/10" : "border-border"
              }`}
            >
              <input type="radio" name="tf-policy" checked={value === o.value} onChange={() => setValue(o.value)} className="mt-1 accent-violet-500" />
              <span>
                <span className="block">{o.label}</span>
                <span className="block text-xs text-muted-foreground">{o.help}</span>
              </span>
            </label>
          ))}
        </div>
        <Button onClick={save} disabled={saving || value === current}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save policy
        </Button>
      </CardContent>
    </Card>
  );
}
