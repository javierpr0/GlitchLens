"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: String(fd.get("email") ?? ""),
        password: String(fd.get("password") ?? ""),
      }),
    }).catch(() => null);
    setLoading(false);
    if (!res || !res.ok) {
      const data = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
      setError(data.error ?? "Could not reach the server.");
      return;
    }
    const raw = params.get("from") || "/";
    // Only allow internal paths — block //evil.com, https://evil.com, /\evil.com
    const from =
      raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/";
    router.replace(from);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-xs font-medium text-zinc-400">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          className="h-11 border-white/10 bg-white/[0.03] focus-visible:border-violet-500/50 focus-visible:ring-violet-500/20"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-xs font-medium text-zinc-400">
          Password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className="h-11 border-white/10 bg-white/[0.03] focus-visible:border-violet-500/50 focus-visible:ring-violet-500/20"
        />
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
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
      </Button>
    </form>
  );
}
