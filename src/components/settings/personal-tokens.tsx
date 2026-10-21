"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export interface PersonalTokenRow {
  id: number;
  name: string;
  baseUrl: string;
  hasToken: boolean;
}

async function call(method: "POST" | "DELETE", body: unknown): Promise<string | null> {
  const res = await fetch("/api/account/tokens", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? "Request failed";
}

function Row({ row }: { row: PersonalTokenRow }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const err = await call("POST", { instanceId: row.id, token });
    setBusy(false);
    if (err) return toast.error(err);
    setToken("");
    toast.success(`Token saved for ${row.name}.`);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Remove your token for ${row.name}? You will lose access until you add one again.`)) return;
    setBusy(true);
    const err = await call("DELETE", { instanceId: row.id });
    setBusy(false);
    if (err) return toast.error(err);
    toast.success("Token removed.");
    router.refresh();
  }

  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-medium">{row.name}</span>
        <Badge variant="outline" className={`text-[10px] ${row.hasToken ? "text-emerald-400" : "text-amber-400"}`}>
          {row.hasToken ? "Token set" : "Token needed"}
        </Badge>
        <span className="ml-auto truncate text-xs text-muted-foreground">{row.baseUrl}</span>
      </div>
      <div className="flex gap-2">
        <Input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={row.hasToken ? "Paste a new token to replace it" : "Paste your GlitchTip token"}
          className="bg-background"
        />
        <Button onClick={save} disabled={busy || !token.trim()}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
        </Button>
        {row.hasToken && (
          <Button variant="ghost" size="icon" aria-label={`Remove token for ${row.name}`} onClick={remove} disabled={busy}>
            <Trash2 className="h-4 w-4 text-red-400" />
          </Button>
        )}
      </div>
    </li>
  );
}

export function PersonalTokens({ rows }: { rows: PersonalTokenRow[] }) {
  if (!rows.length) return null;
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-sm">Your GlitchTip tokens</CardTitle>
        <p className="text-xs text-muted-foreground">
          These instances use one token per person. In GlitchTip open your profile, go to Auth Tokens and create one;
          your actions are then recorded under your own GlitchTip account and follow its permissions.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <Row key={r.id} row={r} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
