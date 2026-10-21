"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeTime } from "@/lib/format";
import { Laptop, Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export interface SessionRow {
  id: string;
  createdAt: number;
  lastUsedAt: number;
  userAgent: string | null;
  current: boolean;
}

/** A readable label from the User-Agent. Good enough to recognise your own devices. */
function describe(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "unknown OS";
  return `${browser} on ${os}`;
}

export function SessionsList({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function revoke(body: { id: string } | { others: true }, key: string) {
    setBusy(key);
    const res = await fetch("/api/account/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (!res.ok) return toast.error("Could not sign out that session.");
    toast.success("Signed out.");
    router.refresh();
  }

  const others = sessions.filter((s) => !s.current).length;

  return (
    <Card className="mt-6">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm">Active sessions</CardTitle>
        {others > 0 && (
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => revoke({ others: true }, "others")}>
            {busy === "others" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Sign out everywhere else
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <Laptop className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="truncate">{describe(s.userAgent)}</span>
                  {s.current && <Badge variant="outline" className="text-[10px]">This device</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  Active {relativeTime(new Date(s.lastUsedAt).toISOString())} · signed in{" "}
                  {relativeTime(new Date(s.createdAt).toISOString())}
                </div>
              </div>
              {!s.current && (
                <Button variant="ghost" size="icon" aria-label="Sign out this session" disabled={busy !== null} onClick={() => revoke({ id: s.id }, s.id)}>
                  {busy === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
