"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const fieldClass =
  "h-11 border-white/10 bg-white/[0.03] focus-visible:border-violet-500/50 focus-visible:ring-violet-500/20";

export function SetupForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (fd.get("password") !== fd.get("confirm")) {
      setError("The passwords do not match.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: fd.get("code"),
        name: fd.get("name"),
        email: fd.get("email"),
        password: fd.get("password"),
      }),
    }).catch(() => null);
    setLoading(false);
    if (!res || !res.ok) {
      const data = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
      setError(data.error ?? "Could not reach the server.");
      return;
    }
    router.replace("/settings/instances");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="code" className="text-xs font-medium text-zinc-400">Setup code</Label>
        <Input id="code" name="code" required autoComplete="off" spellCheck={false} className={`${fieldClass} font-mono`} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="name" className="text-xs font-medium text-zinc-400">Name</Label>
        <Input id="name" name="name" required maxLength={100} autoComplete="name" className={fieldClass} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email" className="text-xs font-medium text-zinc-400">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" className={fieldClass} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-xs font-medium text-zinc-400">Password</Label>
        <Input id="password" name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" className={fieldClass} />
        <p className="text-xs text-zinc-500">At least 10 characters.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm" className="text-xs font-medium text-zinc-400">Confirm password</Label>
        <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" className={fieldClass} />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="h-11 w-full bg-violet-600 text-white shadow-lg shadow-violet-900/30 hover:bg-violet-500 focus-visible:ring-violet-500/40"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create superadmin"}
      </Button>
    </form>
  );
}
