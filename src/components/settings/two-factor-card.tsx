"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface Setup {
  secret: string;
  qr: string;
}

async function call(url: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: res.ok, data: res.status === 204 ? {} : await res.json().catch(() => ({})) };
}

const field = "bg-background";

export function TwoFactorCard({ enabled, recoveryLeft }: { enabled: boolean; recoveryLeft: number }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [manage, setManage] = useState<"disable" | "recovery" | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const start = () =>
    run(async () => {
      const { ok, data } = await call("/api/account/2fa/setup");
      if (!ok) return toast.error(String(data.error ?? "Could not start setup."));
      setSetup(data as unknown as Setup);
    });

  const enable = () =>
    run(async () => {
      const { ok, data } = await call("/api/account/2fa/enable", { password, code });
      if (!ok) return toast.error(String(data.error ?? "Invalid code."));
      setCodes(data.recoveryCodes as string[]);
      setSetup(null);
      setCode("");
      setPassword("");
      toast.success("Two-factor authentication enabled. Other devices were signed out.");
      router.refresh();
    });

  const confirmManage = () =>
    run(async () => {
      const { ok, data } = await call(`/api/account/2fa/${manage}`, { password, code });
      if (!ok) return toast.error(String(data.error ?? "Could not complete that."));
      setPassword("");
      setCode("");
      if (manage === "recovery") setCodes(data.recoveryCodes as string[]);
      else toast.success("Two-factor authentication disabled.");
      setManage(null);
      router.refresh();
    });

  return (
    <Card className="mt-6">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-emerald-400" /> Two-factor authentication
        </CardTitle>
        <Badge variant="outline" className={`text-[10px] ${enabled ? "text-emerald-400" : "text-amber-400"}`}>
          {enabled ? "On" : "Off"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {codes && (
          <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-xs text-amber-200">
              Save these recovery codes now. Each works once if you lose your authenticator, and they will not be shown again.
            </p>
            <div className="grid grid-cols-2 gap-1 font-mono text-sm">
              {codes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => navigator.clipboard.writeText(codes.join("\n")).then(() => toast.success("Copied."))}
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCodes(null)}>
                I saved them
              </Button>
            </div>
          </div>
        )}

        {!enabled && !setup && (
          <>
            <p className="text-muted-foreground">
              Ask for a code from an authenticator app (Google Authenticator, 1Password, Authy and others) when you sign in.
            </p>
            <Button onClick={start} disabled={busy}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Set up two-factor
            </Button>
          </>
        )}

        {!enabled && setup && (
          <div className="space-y-3">
            <p className="text-muted-foreground">Scan the QR code with your authenticator app, then enter the 6-digit code it shows.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="QR code to add GlitchLens to your authenticator app" className="h-44 w-44 rounded-lg bg-white p-2" />
            <p className="text-xs text-muted-foreground">
              Cannot scan it? Enter this key manually: <span className="select-all font-mono text-foreground">{setup.secret}</span>
            </p>
            <div className="max-w-xs space-y-3">
              <div className="space-y-2">
                <Label htmlFor="tf-enable-password">Current password</Label>
                <Input id="tf-enable-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tf-enable-code">Code from your app</Label>
                <Input id="tf-enable-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" className={`${field} font-mono`} />
              </div>
              <Button onClick={enable} disabled={busy || !code.trim() || !password}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Enable
              </Button>
            </div>
          </div>
        )}

        {enabled && (
          <>
            <p className="text-muted-foreground">
              Sign-in asks for a code from your authenticator app. {recoveryLeft} recovery code{recoveryLeft === 1 ? "" : "s"} left.
            </p>
            {manage ? (
              <div className="max-w-sm space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="tf-password">Current password</Label>
                  <Input id="tf-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tf-code">Authentication or recovery code</Label>
                  <Input id="tf-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" className={`${field} font-mono`} />
                </div>
                <div className="flex gap-2">
                  <Button variant={manage === "disable" ? "destructive" : "default"} onClick={confirmManage} disabled={busy || !password || !code.trim()}>
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {manage === "disable" ? "Turn off two-factor" : "Generate new codes"}
                  </Button>
                  <Button variant="ghost" onClick={() => { setManage(null); setPassword(""); setCode(""); }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setManage("recovery")}>New recovery codes</Button>
                <Button variant="outline" size="sm" onClick={() => setManage("disable")}>Turn off</Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
