"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { absoluteTime } from "@/lib/format";
import type { Instance, TokenMode } from "@/lib/instances";
import { CheckCircle2, Loader2, Pencil, Plus, Server, Trash2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface Probe {
  ok: boolean;
  message: string;
  account?: string;
  organizations?: number;
}

export function InstancesManager({ instances }: { instances: Instance[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Instance | null>(null);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [tokenMode, setTokenMode] = useState<TokenMode>("shared");
  const [probe, setProbe] = useState<Probe | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  function openFor(instance: Instance | null) {
    setEditing(instance);
    setName(instance?.name ?? "");
    setBaseUrl(instance?.baseUrl ?? "");
    setToken("");
    setTokenMode(instance?.tokenMode ?? "shared");
    setProbe(null);
    setOpen(true);
  }

  async function test() {
    setTesting(true);
    setProbe(null);
    const res = await fetch("/api/admin/instances/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: baseUrl.trim() || undefined,
        token: token.trim() || undefined,
        instanceId: editing?.id,
        tokenMode,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Partial<Probe> & { error?: string };
    setProbe(res.ok ? (data as Probe) : { ok: false, message: data.error ?? "Test failed" });
    setTesting(false);
  }

  async function save() {
    setSaving(true);
    const body = {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      tokenMode,
      ...(tokenMode === "shared" && token.trim() ? { token: token.trim() } : {}),
    };
    const res = await fetch(editing ? `/api/admin/instances/${editing.id}` : "/api/admin/instances", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? "Could not save the instance.");
      return;
    }
    toast.success(editing ? "Instance updated." : "Instance connected.");
    setOpen(false);
    router.refresh();
  }

  async function remove(i: Instance) {
    if (!confirm(`Remove "${i.name}"? Users will lose access to it. Nothing is deleted in GlitchTip.`)) return;
    const res = await fetch(`/api/admin/instances/${i.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Could not remove the instance.");
    toast.success("Instance removed.");
    router.refresh();
  }

  // A shared instance needs a token unless we are only editing one that already has it.
  const needsToken = tokenMode === "shared" && (!editing || editing.tokenMode !== "shared");
  const canSave = name.trim() && baseUrl.trim() && (!needsToken || token.trim());

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => openFor(null)}>
          <Plus className="h-3.5 w-3.5" /> Add instance
        </Button>
      </div>

      {instances.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No instances yet"
          description="Add the URL of your GlitchTip server and an API token to get started."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {instances.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-3">
              <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{i.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {i.tokenMode === "shared" ? "Shared token" : "Token per user"}
                  </Badge>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {i.baseUrl} · added {absoluteTime(new Date(i.createdAt).toISOString())}
                </div>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Edit ${i.name}`} onClick={() => openFor(i)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Remove ${i.name}`} onClick={() => remove(i)}>
                <Trash2 className="h-4 w-4 text-red-400" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit instance" : "Add a GlitchTip instance"}</DialogTitle>
            <DialogDescription>
              Choose how GlitchLens authenticates against this GlitchTip. A shared token is one account every user
              acts through. With a token per user, each person adds their own and GlitchTip records their actions
              under their own account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="inst-name">Name</Label>
              <Input id="inst-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production" maxLength={80} className="bg-background" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inst-url">GlitchTip URL</Label>
              <Input id="inst-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://glitchtip.example.com" inputMode="url" className="bg-background" />
            </div>
            <div className="space-y-2">
              <Label>Authentication</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["shared", "One shared token"],
                  ["per_user", "One token per user"],
                ] as const).map(([value, label]) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      tokenMode === value ? "border-violet-500/60 bg-violet-500/10" : "border-border"
                    }`}
                  >
                    <input
                      type="radio"
                      name="token-mode"
                      value={value}
                      checked={tokenMode === value}
                      onChange={() => {
                        setTokenMode(value);
                        setProbe(null);
                      }}
                      className="accent-violet-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {tokenMode === "shared" && (
            <div className="space-y-2">
              <Label htmlFor="inst-token">API token</Label>
              <Input
                id="inst-token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={editing?.tokenMode === "shared" ? "Leave blank to keep the current token" : "Paste the token"}
                className="bg-background"
              />
              <p className="text-xs text-muted-foreground">
                In GlitchTip open your profile, go to Auth Tokens and create a token with all scopes. Everyone with
                access to this instance acts through it.
              </p>
            </div>
            )}
            {probe && (
              <div
                className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                  probe.ok ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200" : "border-red-500/20 bg-red-500/5 text-red-300"
                }`}
              >
                {probe.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>
                  {probe.ok && probe.account
                    ? `Connected as ${probe.account}. ${probe.organizations} organization${probe.organizations === 1 ? "" : "s"} visible.`
                    : probe.message}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="outline" onClick={test} disabled={testing || !baseUrl.trim() || (tokenMode === "shared" && needsToken && !token.trim())}>
              {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Test connection
            </Button>
            <Button onClick={save} disabled={saving || !canSave}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {editing ? "Save" : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
